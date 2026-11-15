import { useEffect, useRef, useState } from 'react';
import {
  Assist, BATT_MAX, FLARE, FLARE_WARN, ICE_GOAL, LUNA, LUNA_OBJECTIVES, Luna, LunaAction, PROP0, R_MOON, SAFE_VV, SHADOW,
  SHADOW_WARN, SITE_ANGLE, SURVIVE_H, brakingDistance, canAssist, createLuna, describeLuna, dvLeft, endLuna, flareActive,
  localFrame, lunaAction, lunaObjectives, lunaReport, mass, maxWarpLuna, o2Hours, powerBalance, predictPath, setThrottle,
  siteDistance, stepDescent, stepSurface, sunlit, G_MOON, THRUST, DOSE_LIMIT,
  ASSIST_ALT, hoverTime, ignitionCountdown, redesignate, rough, targetDistance,
} from '../sim/luna';
import { Report } from '../sim/report';
import { LanderView, drawDescent, drawSurface } from './landerDraw';
import { setFlightContext } from './missionControlContext';
import Term from './Term';
import { isMuted, playClick, playCrash, playCue, playTouchdown, setEngine, setMuted, unlockAudio } from './audio';
import { lunarEnvironment, LUNAR_SHADOWS } from '../sim/lunarEnvironment';
import { lunarCoordinates, terrainElevation } from '../sim/lunarTerrain';

const DESCENT_WARPS = [1, 2, 5, 10, 50, 100];
/** En la superficie el reloj avanza en horas por segundo real. */
const SURFACE_WARPS = [0.25, 1, 3, 8];
const ASSIST_LABEL: Record<Assist, string> = { manual: 'Manual', frenado: 'Braking', vertical: 'Vertical' };

const n = (x: number, d = 0) => (isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—');
const dist = (m: number) => (Math.abs(m) < 10e3 ? `${n(m)} m` : `${n(m / 1000, Math.abs(m) < 1000e3 ? 1 : 0)} km`);
const clock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), ss = t % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
};
const dayClock = (hours: number) => `Day ${Math.floor(hours / 24) + 1} · ${String(Math.floor(hours % 24)).padStart(2, '0')}:${String(Math.floor((hours * 60) % 60)).padStart(2, '0')}`;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface Hud {
  phase: Luna['phase']; t: number; hours: number; alt: number; vv: number; vh: number; pitch: number;
  throttle: number; prop: number; dv: number; twr: number; site: number; braking: number; impactMiss: number | null;
  assist: Assist; landingAssist: boolean; canAssist: boolean; warp: number; maxWarp: number;
  battery: number; gen: number; load: number; o2: number; o2h: number; water: number; waterTotal: number; temp: number; dose: number;
  lit: boolean; flare: boolean; panels: boolean; drill: boolean; electro: boolean; shelter: boolean;
  objectives: boolean[]; ended: Luna['ended']; events: Luna['events'];
  ignition: number | null; hover: number; targetRough: boolean; targetDist: number;
}

function snapshot(s: Luna, warp: number, impact: number | null): Hud {
  const fr = localFrame(s);
  const pb = powerBalance(s);
  return {
    phase: s.phase, t: s.t, hours: s.hours, alt: Math.max(0, fr.alt), vv: fr.vv, vh: fr.vh, pitch: (s.pitch * 180) / Math.PI,
    throttle: s.throttle, prop: s.prop, dv: dvLeft(s), twr: (THRUST * s.throttle) / (mass(s) * G_MOON),
    site: siteDistance(s), braking: brakingDistance(s), impactMiss: impact === null ? null : wrap(SITE_ANGLE - impact) * R_MOON,
    assist: s.assist, landingAssist: s.landingAssist, canAssist: canAssist(s), warp, maxWarp: maxWarpLuna(s),
    battery: s.battery, gen: pb.gen, load: pb.load, o2: s.o2, o2h: o2Hours(s), water: s.water, waterTotal: s.waterTotal,
    temp: s.temp, dose: s.dose, lit: sunlit(s.hours), flare: flareActive(s.hours),
    panels: s.panels, drill: s.drill, electro: s.electro, shelter: s.shelter,
    objectives: lunaObjectives(s), ended: s.ended, events: s.events.slice(-5),
    ignition: ignitionCountdown(s), hover: hoverTime(s), targetRough: rough(s.target), targetDist: targetDistance(s),
  };
}

function hint(h: Hud): string {
  if (h.phase === 'descenso') {
    if (h.prop <= 0) return 'No propellant left: the engine can no longer brake. With no air on the Moon, nothing else will slow you down.';
    if (h.alt < 2000 && !h.landingAssist) return 'Below 2 km the radar sees the ground: press L for the landing assist, or fly it yourself with Vertical. Red ground is boulders: land on green.';
    if (h.landingAssist && h.targetRough) return 'The computer is flying you into a boulder field, as it did on Apollo 11. Press ← or → to move the landing point onto green ground. Hovering burns propellant, so decide fast.';
    if (h.landingAssist) return 'The landing point is clear. The assist flies there and sets you down. You can still move it with ← →, but every second in the air costs propellant.';
    if (h.ignition !== null && h.ignition > 0) return 'Coast to the ignition point (speed up time with ▶). When the countdown reaches zero, go to full throttle (Z): braking any later overshoots the ice site.';
    if (h.throttle > 0) return 'Keep braking. The Braking assist aims to stop the horizontal speed just as you reach about 1.5 km. If it runs out higher up, lower the throttle.';
    if (h.site > h.braking * 1.3) return 'Coast toward the site (speed up time with ▶). Start braking when Distance to site gets close to Braking distance.';
    return 'Now: full throttle (Z) with the Braking assist. There is no air to slow you down, only the engine.';
  }
  if (!h.panels) return 'Deploy the solar panels (G): the battery alone lasts about a day.';
  if (h.hours >= FLARE_WARN && h.hours < FLARE[1] && !h.shelter) return 'Solar flare! Move the crew into the shelter (B) now.';
  if (LUNAR_SHADOWS.some(([start, end]) => h.hours >= start - SHADOW_WARN && h.hours < end) && (h.drill || h.electro)) return 'Terrain shadow forecast: in the dark only the battery powers the base. Stop the drill and the electrolyzer.';
  if (h.waterTotal < ICE_GOAL && !h.drill && h.lit && !h.shelter) return 'Send the rover to drill for ice in the shadowed crater (I).';
  if (h.water > 0.3 && !h.electro && h.lit) return 'Split the water into oxygen with the electrolyzer (O).';
  return `Keep the base running until day ${SURVIVE_H / 24}. Watch power, oxygen and heat.`;
}

interface Props {
  onEnd: (r: Report) => void;
  onHome: () => void;
}

export default function Lander({ onEnd, onHome }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sRef = useRef<Luna>(createLuna());
  const keys = useRef<Set<string>>(new Set());
  const warpRef = useRef(1);
  const viewRef = useRef<LanderView>({ map: false, path: [], impact: null });
  // El reloj arranca en pausa: empieza cuando el jugador cierra la ayuda.
  const pausedRef = useRef(true);
  const [paused, setPaused] = useState(true);
  const [callout, setCallout] = useState<{ id: number; text: string; kind: string } | null>(null);
  const [help, setHelp] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth > 640);
  const [hud, setHud] = useState<Hud>(() => snapshot(sRef.current, 1, null));

  const say = (msg: string | null) => {
    if (!msg) return;
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3600);
  };
  const setPause = (p: boolean) => { pausedRef.current = p; setPaused(p); };
  const warps = () => (sRef.current.phase === 'descenso' ? DESCENT_WARPS : SURFACE_WARPS);
  const stepWarp = (dir: number) => {
    const list = warps();
    const i = list.indexOf(warpRef.current);
    let next = list[Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + dir))];
    const s = sRef.current;
    if (s.phase === 'descenso' && next > maxWarpLuna(s)) { next = maxWarpLuna(s); say('Time warp limited: engine running or close to the ground.'); }
    warpRef.current = next;
  };
  const cycleAssist = () => {
    const s = sRef.current;
    const order: Assist[] = ['manual', 'frenado', 'vertical'];
    s.assist = order[(order.indexOf(s.assist) + 1) % order.length];
    s.landingAssist = false;
  };
  const toggleLandingAssist = () => {
    const s = sRef.current;
    if (!s.landingAssist && !canAssist(s)) { say('The landing radar only locks on below 2 km.'); return; }
    s.landingAssist = !s.landingAssist;
    if (!s.landingAssist) s.assist = 'vertical';
  };
  const [muted, setMutedState] = useState(isMuted);
  const toggleMute = () => { unlockAudio(); setMuted(!isMuted()); setMutedState(isMuted()); };
  const move = (steps: number) => { redesignate(sRef.current, steps); playClick(); };
  const act = (a: LunaAction) => { const msg = lunaAction(sRef.current, a); if (!msg) playClick(); say(msg); };
  const closeHelp = () => { setHelp(false); if (sRef.current.t === 0) setPause(false); };
  const toggleMap = () => { viewRef.current.map = !viewRef.current.map; };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      unlockAudio();
      keys.current.add(k);
      const s = sRef.current;
      if (k === 'Escape') { setPause(!pausedRef.current); return; }
      if (k === 'h') { if (s.t === 0 && pausedRef.current) closeHelp(); else setHelp((v) => !v); return; }
      if (s.t === 0 && pausedRef.current && s.phase === 'descenso' && k !== 'Escape') closeHelp();
      // Las decisiones de la base se pueden tomar con el reloj en pausa.
      if (pausedRef.current && s.phase === 'descenso') return;
      if (k === '.') stepWarp(1);
      else if (k === ',') stepWarp(-1);
      else if (s.phase === 'descenso') {
        if (k === 'z') { s.landingAssist = false; setThrottle(s, 1); setHelp(false); }
        else if (k === 'x') { s.landingAssist = false; setThrottle(s, 0); }
        else if (k === 't') cycleAssist();
        else if (k === 'l') toggleLandingAssist();
        else if (k === 'm') toggleMap();
        // Con el asistente de alunizaje, las flechas mueven el punto designado (como el LPD de Apollo).
        else if (s.landingAssist && (k === 'ArrowLeft' || k === 'a')) move(-1);
        else if (s.landingAssist && (k === 'ArrowRight' || k === 'd')) move(1);
        else if (k === 'n') toggleMute();
      } else {
        if (k === 'n') toggleMute();
        else if (k === 'g') act('paneles');
        else if (k === 'i') act('perforar');
        else if (k === 'o') act('oxigeno');
        else if (k === 'b') act('refugio');
      }
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); };
    const blur = () => keys.current.clear();
    setFlightContext(() => describeLuna(sRef.current));
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
    let raf = 0, last = performance.now(), hudAt = 0, pathAt = 0, time = 0, seen = sRef.current.events.length, landed = false;
    const scale = Math.min(1.5, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = Math.round(canvas.clientWidth * scale);
      canvas.height = Math.round(canvas.clientHeight * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const real = Math.min(0.1, (now - last) / 1000);
      last = now;
      time += real;
      const s = sRef.current;
      const k = keys.current;
      if (!s.ended && !pausedRef.current) {
        if (s.phase === 'descenso') {
          const up = k.has('w') || k.has('ArrowUp') || k.has('Shift');
          const dn = k.has('s') || k.has('ArrowDown') || k.has('Control');
          if (up || dn) { s.landingAssist = false; setThrottle(s, s.throttle + (up ? 0.7 : -0.7) * real); }
          let turn = 0;
          if (k.has('a') || k.has('ArrowLeft')) turn -= 1;
          if (k.has('d') || k.has('ArrowRight')) turn += 1;
          if (s.landingAssist) turn = 0;
          if (warpRef.current > maxWarpLuna(s)) warpRef.current = maxWarpLuna(s);
          const simT = real * warpRef.current;
          const dtMax = s.throttle > 0 || localFrame(s).alt < 3000 ? 0.05 : 0.5;
          const steps = Math.max(1, Math.ceil(simT / dtMax));
          for (let i = 0; i < steps && s.phase === 'descenso' && !s.ended; i++) {
            stepDescent(s, simT / steps, turn / warpRef.current);
            if (warpRef.current > maxWarpLuna(s)) break;
          }
          if ((s.phase as Luna['phase']) === 'superficie') {
            // El reloj de la base empieza en pausa: el jugador decide qué hacer primero.
            warpRef.current = 1; viewRef.current.map = false;
            setPause(true); say('Touchdown! Now keep the crew alive: deploy the panels, then resume (Esc).');
          }
        } else {
          const before = s.events.length;
          const simH = real * warpRef.current;
          const steps = Math.max(1, Math.ceil(simH / 0.05));
          for (let i = 0; i < steps && !s.ended; i++) {
            stepSurface(s, simH / steps);
            const fresh = s.events.slice(before);
            // Un aviso nuevo pausa el reloj para que el jugador decida.
            if (fresh.some((e) => e.kind === 'warn' || e.kind === 'bad')) { setPause(true); say(fresh[fresh.length - 1].text); break; }
          }
        }
        lunaObjectives(s);
      }
      // Sonido: el motor sigue al empuje; cada aviso nuevo tiene su tono.
      setEngine(s.phase === 'descenso' && !s.ended && !pausedRef.current && s.prop > 0 ? s.throttle : 0);
      if (s.touchdown && !landed) {
        landed = true;
        if (s.touchdown.safe) { playTouchdown(); playCue('ok'); } else playCrash();
      } else if (s.events.length > seen && !(s.touchdown && s.events[s.events.length - 1].t <= s.touchdown.t)) {
        playCue(s.events[s.events.length - 1].kind);
      }
      if (s.events.length > seen) {
        const e = s.events[s.events.length - 1];
        seen = s.events.length;
        if (e.t <= (s.touchdown?.t ?? Infinity)) {
          const id = now;
          setCallout({ id, text: e.text, kind: e.kind });
          window.setTimeout(() => setCallout((c) => (c?.id === id ? null : c)), 5200);
        }
      }
      if (s.phase === 'descenso' && now - pathAt > 120) {
        pathAt = now;
        const p = predictPath(s);
        viewRef.current.path = p.points;
        viewRef.current.impact = p.impact;
      }
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (s.phase === 'descenso' || (s.ended && !s.touchdown?.safe)) drawDescent(ctx, w, h, s, viewRef.current, time);
      else drawSurface(ctx, w, h, s, time);
      if (now - hudAt > 100) { hudAt = now; setHud(snapshot(s, warpRef.current, viewRef.current.impact)); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  const s = sRef.current;
  const done = hud.objectives;
  const allDone = done.every(Boolean);
  const failed = !!hud.ended && hud.ended !== 'completada' && hud.ended !== 'usuario';
  const descent = hud.phase === 'descenso';
  const finish = () => { endLuna(s); onEnd(lunaReport(s)); };
  const net = hud.gen - hud.load;

  return (
    <div className={`flight lander ${descent && viewRef.current.map ? 'lunar-map' : ''}`}>
      <canvas ref={canvasRef} className="flight-canvas" />
      {descent && viewRef.current.map && <div className="hud lunar-map-readout">Height: {dist(hud.alt)} · Target: {dist(hud.site)}</div>}

      <div className="hud hud-top">
        <button className="btn ghost" onClick={onHome} title="Back to home">← Home</button>
        <div className="clock">{descent ? <><span className="lbl">T+</span>{clock(hud.t)}</> : dayClock(hud.hours)}</div>
        <div className="warp">
          <button className="btn tiny" onClick={() => stepWarp(-1)} title="Key ,">◀</button>
          <span className={`warp-x ${hud.warp > (descent ? 1 : 0.25) ? 'on' : ''}`}>{descent ? `${hud.warp}×` : `${hud.warp} h/s`}</span>
          <button className="btn tiny" onClick={() => stepWarp(1)} title="Key .">▶</button>
        </div>
        <div className="chip">{descent ? 'Lunar orbit · descent' : hud.lit ? 'South pole · sunlit' : 'South pole · in shadow'}</div>
        {descent && <button className="btn tiny" onClick={toggleMap} title="Key M">{viewRef.current.map ? 'Lander view' : 'Map'}</button>}
        <button className={`btn tiny ${paused ? 'on' : ''}`} onClick={() => setPause(!paused)} title="Key Esc">{paused ? 'Resume' : 'Pause'}</button>
        <button className="btn tiny" onClick={() => setHelp((v) => !v)} title="Key H">Controls</button>
        <button className="btn tiny" onClick={toggleMute} title="Key N" aria-pressed={!muted}>{muted ? 'Sound off' : 'Sound on'}</button>
        <button className="btn warn" onClick={finish}>End mission</button>
      </div>

      <div className="hud panel hud-left">
        {descent ? (
          <>
            <h4>Descent</h4>
            <Row k="Height above terrain" v={dist(hud.alt)} />
            <Row k="Vertical speed" v={`${n(hud.vv, 1)} m/s`} tone={hud.alt < 200 ? (-hud.vv <= SAFE_VV ? 'ok' : 'bad') : undefined} />
            <Row k="Horizontal speed" v={`${n(hud.vh, 1)} m/s`} />
            <Row k="Thrust angle" v={`${n(hud.pitch)}° from vertical`} />
            <h4>Targeting</h4>
            <Row k="Distance to site" v={dist(hud.site)} />
            {hud.ignition !== null && <Row k="Ignition in" v={hud.ignition > 0 ? clock(hud.ignition) : 'now'} tone={hud.ignition > 15 ? undefined : 'bad'} />}
            {hud.alt < ASSIST_ALT && <Row k="Landing point" v={`${dist(Math.abs(hud.targetDist))} ${hud.targetDist >= 0 ? 'ahead' : 'behind'} · ${hud.targetRough ? 'boulders' : 'clear'}`} tone={hud.targetRough ? 'bad' : 'ok'} />}
            <Row k="Braking distance" v={isFinite(hud.braking) ? dist(hud.braking) : hud.prop > 0 ? 'not enough propellant' : 'no propellant'} tone={!isFinite(hud.braking) || hud.braking > hud.site && hud.throttle === 0 && hud.vh > 100 ? 'bad' : undefined} />
            <Row k="Impact if engine off" v={hud.impactMiss === null ? 'stays in orbit' : `${dist(Math.abs(hud.impactMiss))} ${hud.impactMiss > 0 ? 'short' : 'long'}`} />
            <p className="note">{hint(hud)}</p>
          </>
        ) : (
          <>
            <h4>Base</h4>
            <Gauge label={`Battery · ${hud.lit ? 'in sunlight' : 'in shadow'}`} value={`${n(hud.battery / 1000, 1)} kWh`} pct={(hud.battery / BATT_MAX) * 100} low={15} />
            <Row k="Power balance" v={`${net >= 0 ? '+' : ''}${n(net)} W`} tone={net >= 0 ? 'ok' : 'bad'} />
            <Gauge label="Oxygen" value={`${n(hud.o2, 1)} kg · ${n(hud.o2h)} h`} pct={(hud.o2h / 72) * 100} low={25} />
            <Row k="Water" v={`${n(hud.water, 1)} kg (${n(hud.waterTotal, 1)} extracted)`} />
            <Row k="Cabin" v={`${n(hud.temp)} °C`} tone={hud.temp < 15 ? 'bad' : undefined} />
            <Row k="Radiation dose" v={`${n(hud.dose, 1)} / ${DOSE_LIMIT} mSv`} tone={hud.flare && !hud.shelter ? 'bad' : undefined} />
            <p className="note">{hint(hud)}</p>
          </>
        )}
        <details>
        <summary>Lunar environment · NASA data</summary>
        <Row k="Latitude" v={`${n(lunarCoordinates(Math.atan2(sRef.current.r.y, sRef.current.r.x)).lat, 2)}°`} />
        <Row k="Terrain elevation" v={`${n(terrainElevation(Math.atan2(sRef.current.r.y, sRef.current.r.x)))} m`} />
        <Row k="Target ground · model" v={`${n(lunarEnvironment(hud.hours).groundTemperatureC)} °C`} />
        <Row k="Target Sun elevation" v={`${n(lunarEnvironment(hud.hours).solarElevation, 2)}°`} />
        <Row k="Atmosphere" v="Exosphere · no wind or rain" />
        <p className="note">LOLA relief: ~1.9 km samples. LROC map: NASA/SVS. Target lighting uses a terrain horizon and a southern-summer model, not live weather. Base equipment, ice yield and solar storm are mission scenarios.</p>
        <a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer">NASA map and elevation sources</a>
        </details>
      </div>

      <div className={`hud panel hud-right ${rightOpen ? '' : 'plegado'}`}>
        <button className="btn tiny wide hud-right-toggle" onClick={() => setRightOpen((v) => !v)} aria-expanded={rightOpen}>
          {rightOpen ? 'Hide panel ▴' : 'Mission and controls ▾'}
        </button>
        <h4>{LUNA.nombre}</h4>
        <ul className="objectives">
          {LUNA_OBJECTIVES.map((ob, i) => (
            <li key={ob.id} className={done[i] ? 'done' : ''} title={ob.ayuda}>
              <span className="tick">{done[i] ? '✓' : '○'}</span>{ob.texto}
            </li>
          ))}
        </ul>
        {descent ? (
          <>
            <h4>Propulsion</h4>
            <Gauge label="Throttle" value={`${n(hud.throttle * 100)} %`} pct={hud.throttle * 100} />
            <Gauge label="Propellant" value={`${n(hud.prop)} kg`} pct={(hud.prop / PROP0) * 100} low={12} />
            <Row k="Delta-v left" v={`${n(hud.dv)} m/s`} />
            <Row k="Thrust/weight" v={n(hud.twr, 2)} />
            {hud.alt < ASSIST_ALT && <Row k="Hover time left" v={`${n(hud.hover)} s`} tone={hud.hover < 60 ? 'bad' : undefined} />}
            <h4>Assistance</h4>
            <div className="seg">
              {(['manual', 'frenado', 'vertical'] as Assist[]).map((m) => (
                <button key={m} className={`btn tiny ${hud.assist === m && !hud.landingAssist ? 'on' : ''}`} onClick={() => { s.assist = m; s.landingAssist = false; }}>{ASSIST_LABEL[m]}</button>
              ))}
            </div>
            <button className={`btn tiny wide ${hud.landingAssist ? 'on' : ''}`} disabled={!hud.canAssist && !hud.landingAssist} onClick={toggleLandingAssist} title="Key L">
              {hud.landingAssist ? 'Landing assist active' : hud.canAssist ? 'Landing assist' : 'Landing assist (below 2 km)'}
            </button>
            {hud.landingAssist && (
              <div className="seg">
                <button className="btn tiny" onClick={() => move(-1)} title="Key ←">← Move back</button>
                <button className="btn tiny" onClick={() => move(1)} title="Key →">Move ahead →</button>
              </div>
            )}
          </>
        ) : (
          <>
            <h4>Decisions</h4>
            <button className={`btn tiny wide ${hud.panels ? 'on' : ''}`} onClick={() => act('paneles')} title="Key G">{hud.panels ? 'Panels deployed' : 'Deploy solar panels'}</button>
            <button className={`btn tiny wide ${hud.drill ? 'on' : ''}`} onClick={() => act('perforar')} title="Key I">{hud.drill ? 'Drilling for ice…' : 'Drill for ice'}</button>
            <button className={`btn tiny wide ${hud.electro ? 'on' : ''}`} onClick={() => act('oxigeno')} title="Key O">{hud.electro ? 'Making oxygen…' : 'Make oxygen from water'}</button>
            <button className={`btn tiny wide ${hud.shelter ? 'on' : ''}`} onClick={() => act('refugio')} title="Key B">{hud.shelter ? 'Crew in the shelter' : 'Go to the shelter'}</button>
            <p className="note">Panels {n(hud.gen)} W · load {n(hud.load)} W. Drill 2,500 W, electrolyzer 3,000 W.</p>
          </>
        )}
      </div>

      <div className="hud events">
        {hud.events.map((e, i) => (
          <div key={`${e.t}-${i}`} className={`event ${e.kind}`}><span>{!s.touchdown || e.t <= s.touchdown.t ? clock(e.t) : dayClock((e.t - s.touchdown.t) / 3600)}</span>{e.text}</div>
        ))}
      </div>

      {toast && <div className="hud toast">{toast}</div>}
      {callout && descent && !help && <div key={callout.id} className={`hud lunar-callout ${callout.kind}`}>{callout.text}</div>}

      {paused && !hud.ended && !help && (
        <div className="hud prompt">Paused · press <span className="keycap">Esc</span> to resume</div>
      )}

      {help && (
        <div className="hud help" onClick={closeHelp}>
          <h3>Lunar landing controls</h3>
          <div className="help-grid">
            <span className="keycap">W / S</span><span>Throttle up · down</span>
            <span className="keycap">Z / X</span><span>Full throttle · cut engine</span>
            <span className="keycap">A / D</span><span>Tilt the thrust back · forward (manual)</span>
            <span className="keycap">T</span><span>Assistance: manual, braking, vertical</span>
            <span className="keycap">L</span><span>Landing assist (below 2 km)</span>
            <span className="keycap">← / →</span><span>With the landing assist: move the landing point off the boulders</span>
            <span className="keycap">, / .</span><span>Time warp</span>
            <span className="keycap">M</span><span>Map of the Moon</span>
            <span className="keycap">G · I · O · B</span><span>On the surface: panels, drill, oxygen, shelter</span>
            <span className="keycap">N</span><span>Sound on · off</span>
            <span className="keycap">Esc</span><span>Pause</span>
          </div>
          <p className="muted">The Moon has no air: no drag, no parachute, no heat shield. Your engine must cancel almost 1,700 m/s of orbital speed. Coast until the ignition countdown reaches zero, then fire at full throttle. Below 2 km the radar paints boulders red and clear ground green: the computer aims at the ice site, which is strewn with boulders, so move the landing point before the propellant runs out. Touch down below {SAFE_VV} m/s.</p>
          <button className="btn primary">{hud.t === 0 ? 'Start the descent' : 'Got it'}</button>
        </div>
      )}

      {(hud.ended || allDone) && (
        <div className={`hud endcard ${failed ? 'bad' : 'ok'}`}>
          <h3>{failed ? 'Mission lost' : allDone ? 'Mission accomplished' : 'Mission ended'}</h3>
          <p>{s.events[s.events.length - 1]?.text}</p>
          <button className="btn primary" onClick={() => onEnd(lunaReport(s))}>View mission report</button>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'ok' | 'bad' }) {
  return <div className={`row ${tone ?? ''}`}><Term text={k} /><b>{v}</b></div>;
}

function Gauge({ label, value, pct, low }: { label: string; value: string; pct: number; low?: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="gauge">
      <div className="gauge-head"><Term text={label} /><b>{value}</b></div>
      <div className={`bar ${low !== undefined && p < low ? 'bad' : ''}`}><i style={{ width: `${p}%` }} /></div>
    </div>
  );
}
