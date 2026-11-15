import { useEffect, useRef, useState } from 'react';
import { ATM_TOP, RE } from '../sim/constants';
import { ANTENNAS, CORES, INSTRUMENTS, InstrumentId, MATERIALS } from '../sim/catalog';
import {
  Flight as FlightState, Sas, altitude, canDeploy, createFlight, currentMass, deploy, endFlight, groundVelocity,
  linkStatus, maxWarp, measure, orbitOf, payloadOnly, pitchOf, recommendedDt, remainingDv, retract, scienceTotals,
  setThrottle, stageAction, stepFlight, storageUsed, timeToApsides, transmitBlocker,
} from '../sim/flight';
import { Mission, objectivesDone } from '../sim/missions';
import { CONTEXTS, REPEAT_FACTOR, SCIENCE_VALUE, contextOf } from '../sim/science';
import { Design } from '../sim/vehicle';
import { Camera, Particle, fitZoom, render } from './renderer';
import { FireCapture } from './FireTarget';
import FlightGuide from './FlightGuide';
import { describeFlight, setFlightContext } from './missionControlContext';
import Term from './Term';
import { isMapView, updateCamera, zoomCamera } from './flightCamera';
import { circularizationEstimate } from './circularization';
import { isMuted, playCrash, playCue, playTouchdown, setEngine, setMuted, unlockAudio } from './audio';

const WARPS = [1, 2, 5, 10, 50, 100, 1000];
const SAS_LABEL: Record<Sas, string> = { mantener: 'Hold', prograda: 'Prograde', retrograda: 'Retrograde' };

const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const dist = (m: number) => (Math.abs(m) < 10e3 ? `${n(m)} m` : `${n(m / 1000, Math.abs(m) < 1000e3 ? 1 : 0)} km`);
const clock = (s: number) => {
  if (!isFinite(s)) return '—';
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), ss = t % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
};

interface Hud {
  circularization: ReturnType<typeof circularizationEstimate>;
  t: number; alt: number; speed: number; speedSurf: number; vr: number; ap: number; pe: number; toAp: number;
  throttle: number; pitch: number; q: number; load: number; g: number; mass: number; twr: number; dv: number;
  stages: { fill: number; active: boolean; gone: boolean }[]; stageIdx: number; free: boolean;
  battery: number; batteryMax: number; sunlit: boolean; link: boolean; delay: number | null;
  storage: number; storageMax: number; context: string; sas: Sas; autopilot: boolean; warp: number; maxWarp: number;
  deployed: boolean; canDeploy: boolean; transmitting: boolean; txBlock: string | null; fairing: boolean;
  sciO: number; sciE: number; pendMB: number; objectives: boolean[]; ended: string | null; landed: boolean;
  launched: boolean; events: { t: number; text: string; kind: string }[]; orbiting: boolean;
  instValues: Record<string, number>;
  shots: { id: number; gsd: number }[];
  panel: { k: string; v: string; tone?: 'ok' | 'bad' }[];
  accion: string | null;
}

function snapshot(f: FlightState, mission: Mission, warp: number): Hud {
  const rm = Math.hypot(f.r.x, f.r.y);
  const o = orbitOf(f.r, f.v);
  const air = groundVelocity(f.r);
  const alt = rm - RE;
  const core = CORES[f.design.core];
  const sci = scienceTotals(f);
  const link = linkStatus(f);
  const ctx = contextOf(alt, f.landed);
  const instValues: Record<string, number> = {};
  for (const i of f.design.instruments) {
    const rep = f.measurements.filter((m) => m.instrument === i && m.context === ctx).length;
    instValues[i] = SCIENCE_VALUE[i][ctx] * REPEAT_FACTOR ** rep;
  }
  const g = 3.986004418e14 / (rm * rm);
  const st = payloadOnly(f) ? null : f.stages[f.stageIdx];
  return {
    circularization: circularizationEstimate(f),
    t: f.t, alt, speed: Math.hypot(f.v.x, f.v.y), speedSurf: Math.hypot(f.v.x - air.x, f.v.y - air.y),
    vr: (f.v.x * f.r.x + f.v.y * f.r.y) / rm,
    ap: o.e < 1 ? o.ap - RE : Infinity, pe: o.pe - RE, toAp: f.landed ? Infinity : timeToApsides(f.r, f.v, o).toAp,
    throttle: f.throttle, pitch: (pitchOf(f) * 180) / Math.PI, q: f.now.q, load: f.now.load, g: f.now.g,
    mass: currentMass(f), twr: st ? (st.thrustVac * Math.max(f.throttle, 0)) / (currentMass(f) * g) : 0,
    dv: remainingDv(f),
    stages: f.stages.map((s, i) => ({ fill: s.propMax ? s.prop / s.propMax : 0, active: i === f.stageIdx, gone: i < f.stageIdx })),
    stageIdx: f.stageIdx, free: payloadOnly(f),
    battery: f.battery, batteryMax: core.battery + f.design.batteries * 150, sunlit: f.now.sunlit,
    link: link !== null, delay: link ? link.delay : null,
    storage: storageUsed(f), storageMax: core.storage, context: CONTEXTS[ctx], sas: f.sas, autopilot: f.autopilot,
    warp, maxWarp: maxWarp(f), deployed: f.deployed, canDeploy: canDeploy(f), transmitting: f.transmitting,
    txBlock: transmitBlocker(f), fairing: f.fairingOn, sciO: sci.obtenida, sciE: sci.entregada, pendMB: sci.pendientesMB,
    objectives: objectivesDone(mission, f), ended: f.ended, landed: f.landed, launched: f.stats.liftoffT !== null,
    events: f.events.slice(-5), orbiting: !f.landed && o.e < 1 && o.pe - RE > ATM_TOP,
    instValues,
    shots: mission.capturas ? mission.capturas(f) : [],
    panel: mission.panel ? mission.panel(f) : [],
    accion: mission.accion ? mission.accion.texto(f) : null,
  };
}

interface Props {
  design: Design;
  mission: Mission;
  onEnd: (f: FlightState) => void;
  onBack: () => void;
}

export default function Flight({ design, mission, onEnd, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flightRef = useRef<FlightState>(createFlight(design));
  const camRef = useRef<Camera>({ zoom: 0.16, targetZoom: 0.16 });
  const warpRef = useRef(1);
  const keys = useRef<Set<string>>(new Set());
  const particles = useRef<Particle[]>([]);
  const [hud, setHud] = useState<Hud>(() => snapshot(flightRef.current, mission, 1));
  const [help, setHelp] = useState(mission.id !== 'cubesat');
  const [guideOpen, setGuideOpen] = useState(mission.id === 'cubesat');
  const [toast, setToast] = useState<string | null>(null);
  const [sciOpen, setSciOpen] = useState(false);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  // En teléfonos empieza cerrado para no tapar la navegación.
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth > 640);
  const mat = MATERIALS[design.material];
  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };
  const [muted, setMutedState] = useState(isMuted);
  const toggleMute = () => { unlockAudio(); setMuted(!isMuted()); setMutedState(isMuted()); };
  const toggleDeploy = () => {
    const f = flightRef.current;
    if (f.deployed) retract(f);
    else if (canDeploy(f)) deploy(f);
    else say(f.panelsLost ? 'The panels and antenna were lost.' : 'You can only deploy in flight, with no fairing, no thrust and out of dense air.');
  };

  const say = (msg: string | null) => {
    if (!msg) return;
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  };
  const setWarp = (w: number) => { warpRef.current = Math.min(w, maxWarp(flightRef.current)); };
  const stepWarp = (dir: number) => {
    const i = WARPS.indexOf(warpRef.current);
    const next = WARPS[Math.max(0, Math.min(WARPS.length - 1, (i < 0 ? 0 : i) + dir))];
    if (next > maxWarp(flightRef.current)) say('Time warp limited: engines running or inside the atmosphere.');
    setWarp(next);
  };
  const toggleMap = () => {
    const c = canvasRef.current;
    if (!c) return;
    camRef.current.targetZoom = isMapView(camRef.current) ? 0.16 : fitZoom(flightRef.current, c.clientWidth, c.clientHeight);
  };
  const cycleSas = () => {
    const f = flightRef.current;
    const order: Sas[] = ['mantener', 'prograda', 'retrograda'];
    f.sas = order[(order.indexOf(f.sas) + 1) % order.length];
    f.autopilot = false;
  };
  const doMeasure = (i: InstrumentId) => say(measure(flightRef.current, i));
  const toggleTx = () => {
    const f = flightRef.current;
    if (f.transmitting) { f.transmitting = false; return; }
    const b = transmitBlocker(f);
    // Sin línea de vista la transmisión queda armada y empieza sola al pasar sobre una estación.
    if (b && !b.startsWith('No line of sight')) { say(b); return; }
    f.transmitting = true;
    if (b) say('Transmission armed: it will start once a station is in line of sight.');
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Escribir en un campo de texto (el chat de Control de Misión) no pilota la nave.
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      unlockAudio();
      keys.current.add(k);
      const f = flightRef.current;
      if (k === 'Escape') { togglePause(); return; }
      if (k === 'n') { toggleMute(); return; }
      if (pausedRef.current) return;
      if (k === ' ') { f.autopilot = false; stageAction(f); setHelp(false); }
      else if (k === 'z') { f.autopilot = false; setThrottle(f, 1); }
      else if (k === 'x') { f.autopilot = false; setThrottle(f, 0); }
      else if (k === 't') cycleSas();
      else if (k === 'm') toggleMap();
      else if (k === '.') stepWarp(1);
      else if (k === ',') stepWarp(-1);
      else if (k === 'p') { f.autopilot = !f.autopilot; if (f.autopilot) setHelp(false); }
      else if (k === 'g') toggleDeploy();
      else if (k === 'h') setHelp((v) => !v);
      else if (k === 'c') setSciOpen((v) => !v);
      else if (/^[1-4]$/.test(k)) { const i = f.design.instruments[Number(k) - 1]; if (i) doMeasure(i); }
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); };
    // Si la ventana pierde el foco no llega el keyup: se sueltan todas las teclas.
    const blur = () => keys.current.clear();
    setFlightContext(() => describeFlight(flightRef.current, mission));
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('pointerdown', unlockAudio);
    return () => { setFlightContext(null); setEngine(0); window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0, last = performance.now(), hudAt = 0, time = 0;
    let heard = flightRef.current.events.length, endHeard = false;
    // Resolución adaptable: si el equipo no alcanza 30 cuadros por segundo, se dibuja con menos píxeles.
    let scale = Math.min(1.5, window.devicePixelRatio || 1);
    let slow = 0, frames = 0, acc = 0;
    const resize = () => {
      canvas.width = Math.round(canvas.clientWidth * scale);
      canvas.height = Math.round(canvas.clientHeight * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = camRef.current;
      zoomCamera(c, e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1));
    };
    canvas.addEventListener('wheel', wheel, { passive: false });

    const frame = (now: number) => {
      const elapsed = (now - last) / 1000;
      const real = Math.min(0.1, elapsed);
      last = now;
      time += real;
      acc += elapsed; frames += 1;
      if (frames >= 20) {
        if (acc / frames > 0.042 && scale > 0.75) { slow += 1; if (slow >= 3) { scale = Math.max(0.75, scale * 0.8); resize(); slow = 0; } }
        else slow = 0;
        frames = 0; acc = 0;
      }
      const f = flightRef.current;
      const k = keys.current;
      if (!f.ended && !pausedRef.current) {
        // Entradas continuas
        const up = k.has('w') || k.has('ArrowUp') || k.has('Shift');
        const dn = k.has('s') || k.has('ArrowDown') || k.has('Control');
        if (up || dn) { f.autopilot = false; setThrottle(f, f.throttle + (up ? 0.7 : -0.7) * real); }
        let rot = 0;
        if (k.has('a') || k.has('ArrowLeft')) rot -= 1;
        if (k.has('d') || k.has('ArrowRight')) rot += 1;
        if (rot !== 0) f.autopilot = false;
        if (warpRef.current > maxWarp(f)) warpRef.current = maxWarp(f);
        const warp = warpRef.current;
        // El reloj de la misión no corre en la plataforma hasta que el jugador enciende.
        const waiting = f.landed && f.stats.liftoffT === null && f.throttle === 0 && !f.autopilot;
        const simT = waiting ? 0 : real * warp;
        if (!waiting) {
          const dtMax = recommendedDt(f);
          const steps = Math.min(6000, Math.max(1, Math.ceil(simT / dtMax)));
          const dt = simT / steps;
          for (let i = 0; i < steps && !f.ended; i++) {
            stepFlight(f, dt, rot / warp);
            mission.onStep?.(f);
            if (warp > maxWarp(f)) { warpRef.current = maxWarp(f); break; }
          }
          // Registra los objetivos en cada cuadro: con aceleración temporal alta el tablero se refresca poco.
          objectivesDone(mission, f);
        }
        for (const p of particles.current) {
          p.x += p.vx * simT; p.y += p.vy * simT; p.life -= real;
          // El humo no atraviesa el suelo: se aplasta y se abre hacia los lados.
          const pr = Math.hypot(p.x, p.y);
          if (pr < RE + 0.6) {
            const k = (RE + 0.6) / pr;
            p.x *= k; p.y *= k;
            const g = groundVelocity(p);
            const side = Math.random() < 0.5 ? -1 : 1;
            p.vx = g.x + (p.y / pr) * side * (6 + Math.random() * 10);
            p.vy = g.y - (p.x / pr) * side * (6 + Math.random() * 10);
          }
        }
        // Humo del motor dentro de la atmósfera
        const alt = altitude(f);
        if (f.now.thrust > 0 && alt < 55e3 && camRef.current.zoom < 30) {
          const air = groundVelocity(f.r);
          const back = 12;
          for (let i = 0; i < 2; i++) {
            particles.current.push({
              x: f.r.x - Math.cos(f.heading) * back + (Math.random() - 0.5) * 4,
              y: f.r.y - Math.sin(f.heading) * back + (Math.random() - 0.5) * 4,
              vx: air.x - Math.cos(f.heading) * 14 + (Math.random() - 0.5) * 8,
              vy: air.y - Math.sin(f.heading) * 14 + (Math.random() - 0.5) * 8,
              life: 2.6, max: 2.6, size: 2.5 + Math.random() * 3,
            });
          }
        }
        particles.current = particles.current.filter((p) => p.life > 0).slice(-260);
      }
      // Sonido: el motor sigue al empuje; cada aviso nuevo tiene su tono (el más grave, si hay varios).
      setEngine(!f.ended && !pausedRef.current && f.now.thrust > 0 ? Math.max(0.15, f.throttle) : 0);
      if (f.ended && !endHeard) {
        endHeard = true;
        if (f.ended === 'aterrizaje') { playTouchdown(); playCue('ok'); } else if (f.ended !== 'usuario') playCrash();
        heard = f.events.length;
      } else if (f.events.length > heard) {
        const kinds = f.events.slice(heard).map((e) => e.kind);
        heard = f.events.length;
        playCue(kinds.includes('bad') ? 'bad' : kinds.includes('warn') ? 'warn' : kinds.includes('ok') ? 'ok' : 'info');
      }
      const cam = camRef.current;
      updateCamera(cam, real, Math.atan2(f.r.y, f.r.x));
      render(ctx, canvas.clientWidth, canvas.clientHeight, f, cam, time, particles.current, mission.target?.pos(f.t));
      if (now - hudAt > 90) { hudAt = now; setHud(snapshot(f, mission, warpRef.current)); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); canvas.removeEventListener('wheel', wheel); };
  }, [mission]);

  const f = flightRef.current;
  const tested = design.tested;
  const loadPct = Math.min(100, (hud.load / mat.qLimit) * 100);
  const gPct = Math.min(100, (hud.g / mat.gLimit) * 100);
  const failed = hud.ended && !['aterrizaje', 'usuario'].includes(hud.ended);
  const allDone = mission.objetivos.length > 0 && hud.objectives.every(Boolean);
  const finish = () => { endFlight(f, 'usuario'); onEnd(f); };

  return (
    <div className={`flight ${guideOpen && !help ? 'guide-enabled' : ''}`}>
      <canvas ref={canvasRef} className="flight-canvas" />

      <div className="hud hud-top">
        <button className="btn ghost" onClick={onBack} title="Back to the lab">← Lab</button>
        <div className="clock"><span className="lbl">T+</span>{clock(hud.t)}</div>
        <div className="warp">
          <button className="btn tiny" onClick={() => stepWarp(-1)} title="Key ,">◀</button>
          <span className={`warp-x ${hud.warp > 1 ? 'on' : ''}`}>{hud.warp}×</span>
          <button className="btn tiny" onClick={() => stepWarp(1)} title="Key .">▶</button>
        </div>
        <div className="chip">{hud.context}</div>
        <button className="btn tiny" onClick={toggleMap} title="Key M">{isMapView(camRef.current) ? 'Craft view' : 'Map'}</button>
        <button className={`btn tiny ${paused ? 'on' : ''}`} onClick={togglePause} title="Key Esc">{paused ? 'Resume' : 'Pause'}</button>
        <button className="btn tiny" onClick={() => setHelp((v) => !v)} title="Key H">Controls</button>
        <button className="btn tiny" onClick={toggleMute} title="Key N" aria-pressed={!muted}>{muted ? 'Sound off' : 'Sound on'}</button>
        <button className={`btn tiny ${guideOpen ? 'on' : ''}`} onClick={() => { setGuideOpen((v) => !v); setHelp(false); }} aria-pressed={guideOpen}>Guide</button>
        <button className="btn warn" onClick={finish}>End flight</button>
      </div>

      <div className="hud panel hud-left">
        <h4>Navigation</h4>
        <Row k="Altitude" v={dist(hud.alt)} />
        <Row k={hud.alt < 45e3 ? 'Speed (ground)' : 'Orbital speed'} v={`${n(hud.alt < 45e3 ? hud.speedSurf : hud.speed)} m/s`} />
        <Row k="Vertical speed" v={`${n(hud.vr)} m/s`} />
        <Row k="Pitch" v={`${n(hud.pitch)}°`} />
        <Row k="Apoapsis" v={hud.launched ? dist(hud.ap) : '—'} tone={hud.ap > ATM_TOP ? 'ok' : undefined} />
        <Row k="Periapsis" v={hud.launched ? (hud.pe > -RE * 0.5 ? dist(hud.pe) : 'underground') : '—'} tone={hud.pe > ATM_TOP ? 'ok' : undefined} />
        <Row k="Time to apoapsis" v={clock(hud.toAp)} />
        <h4>Loads</h4>
        <Gauge label="Aerodynamic load" value={`${n(hud.load / 1000, 1)} kPa`} pct={loadPct} limit={tested.vibracion ? `limit ${n(mat.qLimit / 1000)}` : 'limit untested'} hideLimit={!tested.vibracion} />
        <Gauge label="Acceleration" value={`${n(hud.g, 1)} g`} pct={gPct} limit={tested.vibracion ? `limit ${n(mat.gLimit)}` : 'limit untested'} hideLimit={!tested.vibracion} />
      </div>

      <div className={`hud panel hud-right ${rightOpen ? '' : 'plegado'}`}>
        <button className="btn tiny wide hud-right-toggle" onClick={() => setRightOpen((v) => !v)} aria-expanded={rightOpen}>
          {rightOpen ? 'Hide panel ▴' : 'Mission and propulsion ▾'}
        </button>
        {mission.objetivos.length > 0 && (
          <>
            <h4>{mission.nombre}</h4>
            <ul className="objectives">
              {mission.objetivos.map((ob, i) => (
                <li key={ob.id} className={hud.objectives[i] ? 'done' : ''} title={ob.ayuda}>
                  <span className="tick">{hud.objectives[i] ? '✓' : '○'}</span>{ob.texto}
                </li>
              ))}
            </ul>
            {hud.panel.map((r) => <Row key={r.k} k={r.k} v={r.v} tone={r.tone} />)}
            {hud.accion && (
              <button className="btn tiny wide" onClick={() => say(mission.accion!.run(f))}>{hud.accion}</button>
            )}
          </>
        )}
        <h4>Propulsion</h4>
        <Gauge label="Throttle" value={`${n(hud.throttle * 100)} %`} pct={hud.throttle * 100} plain />
        <Row k="Thrust/weight" v={n(hud.twr, 2)} tone={hud.throttle > 0 && hud.twr < 1 && hud.landed ? 'bad' : undefined} />
        <Row k="Delta-v left" v={`${n(hud.dv)} m/s`} />
        <Row k="Mass" v={`${n(hud.mass)} kg`} />
        <div className="stages">
          {hud.stages.map((s, i) => (
            <div key={i} className={`stage ${s.active ? 'active' : ''} ${s.gone ? 'gone' : ''}`}>
              <span>E{i + 1}</span>
              <div className="bar"><i style={{ width: `${s.fill * 100}%` }} /></div>
              <span className="num">{n(s.fill * 100)}%</span>
            </div>
          )).reverse()}
        </div>
        <h4>Assistance</h4>
        <div className="seg">
          {(['mantener', 'prograda', 'retrograda'] as Sas[]).map((m) => (
            <button key={m} className={`btn tiny ${hud.sas === m && !hud.autopilot ? 'on' : ''}`} onClick={() => { f.sas = m; f.autopilot = false; }}>{SAS_LABEL[m]}</button>
          ))}
        </div>
        <button className={`btn tiny wide ${hud.autopilot ? 'on' : ''}`} onClick={() => { f.autopilot = !f.autopilot; setHelp(false); }} title="Key P">
          {hud.autopilot ? 'Autopilot active' : 'Ascent autopilot'}
        </button>
      </div>

      <div className="hud panel hud-bottom-left">
        <h4>Systems</h4>
        <Gauge label={`Battery ${hud.sunlit ? '· in sunlight' : '· in shadow'}`} value={`${n(hud.battery)} Wh`} pct={(hud.battery / Math.max(1, hud.batteryMax)) * 100} plain invert />
        <Gauge label="Data on board" value={`${n(hud.storage, 1)} / ${n(hud.storageMax)} MB`} pct={(hud.storage / hud.storageMax) * 100} plain />
        <Row k="Link" v={hud.link ? `station · ${n((hud.delay ?? 0) * 1000, 1)} ms` : 'no line of sight'} tone={hud.link ? 'ok' : 'bad'} />
        <Row k="Science" v={`${n(hud.sciE, 1)} delivered / ${n(hud.sciO, 1)}`} />
        <div className="seg">
          <button className={`btn tiny ${hud.deployed ? 'on' : ''}`} disabled={!hud.deployed && !hud.canDeploy} onClick={toggleDeploy} title="Key G">{hud.deployed ? 'Stow' : 'Deploy'}</button>
          <button className={`btn tiny ${hud.transmitting ? 'on' : ''}`} onClick={toggleTx} disabled={ANTENNAS[design.antenna].rate === 0}>
            {hud.transmitting ? (hud.txBlock ? 'Waiting for link…' : 'Transmitting') : 'Transmit'}
          </button>
          <button className={`btn tiny ${sciOpen ? 'on' : ''}`} onClick={() => setSciOpen((v) => !v)} title="Key C">Science</button>
        </div>
      </div>

      {sciOpen && (
        <div className="hud panel science">
          <h4>Instruments · {hud.context}</h4>
          {design.instruments.length === 0 && <p className="muted">This craft carries no instruments.</p>}
          {design.instruments.map((i, idx) => (
            <button key={i} className="inst" onClick={() => doMeasure(i)}>
              <span className="keycap">{idx + 1}</span>
              <span className="inst-name">{INSTRUMENTS[i].nombre}</span>
              <span className="inst-val">+{n(hud.instValues[i] ?? 0, 1)} science</span>
            </button>
          ))}
          <div className="readings">
            {f.measurements.slice(-4).reverse().map((m) => (
              <div key={m.id} className="reading">
                <b>{INSTRUMENTS[m.instrument].nombre}</b> · {CONTEXTS[m.context]}
                <span className={m.sent >= m.mb ? 'ok' : 'muted'}> · {m.sent >= m.mb ? 'received on Earth' : `on board ${n((m.sent / m.mb) * 100)} %`}</span>
                <div>{m.reading}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="hud events">
        {hud.events.map((e, i) => (
          <div key={`${e.t}-${i}`} className={`event ${e.kind}`}><span>{clock(e.t)}</span>{e.text}</div>
        ))}
      </div>

      {mission.id === 'ojo' && <FireCapture shots={hud.shots} />}

      {toast && <div className="hud toast">{toast}</div>}

      {paused && !hud.ended && (
        <div className="hud prompt">Paused · press <span className="keycap">Esc</span> to resume</div>
      )}

      {guideOpen && !help && <FlightGuide hud={hud} paused={paused} autopilot={hud.autopilot} onClose={() => setGuideOpen(false)} />}

      {!paused && !hud.launched && !hud.ended && !help && !guideOpen && (
        <div className="hud prompt">Press <span className="keycap">Space</span> to ignite the engines</div>
      )}

      {help && (
        <div className="hud help" onClick={() => setHelp(false)}>
          <h3>Flight controls</h3>
          <div className="help-grid">
            <span className="keycap">Space</span><span>Ignite · separate stage</span>
            <span className="keycap">W / S</span><span>Throttle up · down</span>
            <span className="keycap">Z / X</span><span>Full throttle · cut engine</span>
            <span className="keycap">A / D</span><span>Tilt west · east</span>
            <span className="keycap">T</span><span>Assistance: hold, prograde, retrograde</span>
            <span className="keycap">P</span><span>Ascent autopilot</span>
            <span className="keycap">, / .</span><span>Time warp</span>
            <span className="keycap">M</span><span>Orbital map · the mouse wheel zooms</span>
            <span className="keycap">G</span><span>Deploy · stow panels and antenna</span>
            <span className="keycap">N</span><span>Sound on · off</span>
            <span className="keycap">Esc</span><span>Pause</span>
            <span className="keycap">C · 1–4</span><span>Science panel · use instrument</span>
          </div>
          <p className="muted">To reach orbit: climb vertically for a few seconds, tilt east little by little and build horizontal speed. When the apoapsis passes 150 km, cut the engine, wait until you reach the top and thrust prograde again.</p>
          <button className="btn primary">Got it</button>
        </div>
      )}

      {(hud.ended || allDone) && (
        <div className={`hud endcard ${failed ? 'bad' : 'ok'}`}>
          <h3>{failed ? 'Flight lost' : allDone ? 'Objectives complete' : 'Flight ended'}</h3>
          <p>{failed ? f.events[f.events.length - 1]?.text : allDone ? 'You can keep exploring or close the mission.' : 'The craft is on the ground.'}</p>
          <button className="btn primary" onClick={() => onEnd(f)}>View mission report</button>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'ok' | 'bad' }) {
  return <div className={`row ${tone ?? ''}`}><Term text={k} /><b>{v}</b></div>;
}

function Gauge({ label, value, pct, limit, plain, invert, hideLimit }: {
  label: string; value: string; pct: number; limit?: string; plain?: boolean; invert?: boolean; hideLimit?: boolean;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const tone = plain ? (invert && p < 15 ? 'bad' : '') : hideLimit ? '' : p > 85 ? 'bad' : p > 65 ? 'warn' : '';
  return (
    <div className="gauge">
      <div className="gauge-head"><Term text={label} /><b>{value}</b></div>
      <div className={`bar ${tone}`}><i style={{ width: `${hideLimit ? Math.min(p, 100) * 0.6 : p}%` }} /></div>
      {limit && <div className="gauge-limit">{limit}</div>}
    </div>
  );
}
