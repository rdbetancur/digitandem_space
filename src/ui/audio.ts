// Sonido del juego, sintetizado con la Web Audio API: sin archivos de audio ni dependencias.
// En el vacío no hay sonido: esto es lo que la tripulación oye dentro de la cabina
// (el motor a través de la estructura) y en la radio. Ver docs/FUENTES.md.

const MUTE_KEY = 'ascenso.muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let engine: { gain: GainNode; filter: BiquadFilterNode; rumble: GainNode } | null = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* sin almacenamiento */ }

export const isMuted = () => muted;

export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* sin almacenamiento */ }
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.03);
}

/** Los navegadores solo dejan sonar después de un gesto del usuario: llamar en teclas y clics. */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { return; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function noise(seconds: number, brown: boolean): AudioBuffer {
  const buffer = ctx!.createBuffer(1, Math.floor(ctx!.sampleRate * seconds), ctx!.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = brown ? (last + 0.02 * white) / 1.02 : white;
    data[i] = brown ? last * 3.5 : white;
  }
  return buffer;
}

/** Motor: ruido grave filtrado más un zumbido. level de 0 a 1 (el empuje). */
export function setEngine(level: number) {
  if (!ctx || !master) return;
  if (!engine) {
    if (level <= 0) return;
    const src = ctx.createBufferSource();
    src.buffer = noise(2, true); src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 120;
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = 41;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass'; low.frequency.value = 110;
    const rumble = ctx.createGain(); rumble.gain.value = 0;
    osc.connect(low).connect(rumble).connect(master);
    src.start(); osc.start();
    engine = { gain, filter, rumble };
  }
  const x = Math.max(0, Math.min(1, level));
  const t = ctx.currentTime;
  engine.gain.gain.setTargetAtTime(x > 0 ? 0.25 + 0.75 * x : 0, t, 0.08);
  engine.filter.frequency.setTargetAtTime(140 + 1100 * x, t, 0.1);
  engine.rumble.gain.setTargetAtTime(0.22 * x, t, 0.08);
}

function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine', slideTo?: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  osc.type = type; osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.03));
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g).connect(master);
  osc.start(t); osc.stop(t + dur + 0.02);
}

function burst(start: number, dur: number, vol: number, cutoff: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + start;
  const src = ctx.createBufferSource();
  src.buffer = noise(dur, false);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(60, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export type Cue = 'info' | 'ok' | 'warn' | 'bad';

/** Avisos de la sala de control: tono de radio, confirmación, alerta o alarma. */
export function playCue(kind: Cue) {
  if (kind === 'info') {
    // Tonos Quindar de las transmisiones de la NASA: 2525 Hz al abrir y 2475 Hz al cerrar.
    tone(2525, 0, 0.25, 0.07); tone(2475, 0.5, 0.25, 0.07);
  } else if (kind === 'ok') {
    tone(660, 0, 0.12, 0.12); tone(880, 0.12, 0.12, 0.12); tone(1320, 0.24, 0.22, 0.12);
  } else if (kind === 'warn') {
    for (let i = 0; i < 2; i++) { tone(880, i * 0.36, 0.16, 0.14, 'square'); tone(660, i * 0.36 + 0.16, 0.16, 0.14, 'square'); }
  } else {
    for (let i = 0; i < 4; i++) tone(1040, i * 0.22, 0.13, 0.16, 'square', 780);
  }
}

/** Clic corto de un interruptor: mover el punto de alunizaje, encender equipos. */
export function playClick() { tone(1500, 0, 0.035, 0.09, 'square'); tone(900, 0.03, 0.03, 0.06, 'square'); }

/** Contacto con el suelo: un golpe sordo que llega por la estructura. */
export function playTouchdown() { tone(95, 0, 0.35, 0.5, 'sine', 40); burst(0, 0.25, 0.25, 500); }

/** Choque. */
export function playCrash() { tone(120, 0, 0.9, 0.6, 'sine', 28); burst(0, 1.6, 0.8, 2400); burst(0.12, 1.1, 0.4, 700); }
