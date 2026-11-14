import { useEffect, useRef, useState } from 'react';
import { ATM_TOP, RE } from '../sim/constants';
import { ANTENNAS, CORES, INSTRUMENTS, InstrumentId, MATERIALS } from '../sim/catalog';
import {
  Flight as FlightState, Sas, altitude, canDeploy, createFlight, currentMass, deploy, endFlight, groundVelocity,
  linkStatus, maxWarp, measure, orbitOf, payloadOnly, pitchOf, recommendedDt, remainingDv, scienceTotals,
  setThrottle, stageAction, stepFlight, storageUsed, timeToApsides, transmitBlocker,
} from '../sim/flight';
import { Mission, objectivesDone } from '../sim/missions';
import { CONTEXTS, REPEAT_FACTOR, SCIENCE_VALUE, contextOf } from '../sim/science';
import { Design } from '../sim/vehicle';
import { Camera, Particle, fitZoom, render } from './renderer';

const WARPS = [1, 2, 5, 10, 50, 100, 1000];
const SAS_LABEL: Record<Sas, string> = { mantener: 'Mantener', prograda: 'Prograda', retrograda: 'Retrógrada' };

const n = (x: number, d = 0) => x.toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: d });
const dist = (m: number) => (Math.abs(m) < 10e3 ? `${n(m)} m` : `${n(m / 1000, Math.abs(m) < 1000e3 ? 1 : 0)} km`);
const clock = (s: number) => {
  if (!isFinite(s)) return '—';
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), ss = t % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
};

interface Hud {
  t: number; alt: number; speed: number; speedSurf: number; vr: number; ap: number; pe: number; toAp: number;
  throttle: number; pitch: number; q: number; load: number; g: number; mass: number; twr: number; dv: number;
  stages: { fill: number; active: boolean; gone: boolean }[]; stageIdx: number; free: boolean;
  battery: number; batteryMax: number; sunlit: boolean; link: boolean; delay: number | null;
  storage: number; storageMax: number; context: string; sas: Sas; autopilot: boolean; warp: number; maxWarp: number;
  deployed: boolean; canDeploy: boolean; transmitting: boolean; txBlock: string | null; fairing: boolean;
  sciO: number; sciE: number; pendMB: number; objectives: boolean[]; ended: string | null; landed: boolean;
  launched: boolean; events: { t: number; text: string; kind: string }[]; orbiting: boolean;
  instValues: Record<string, number>;
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
  const mapMode = useRef(false);
  const [hud, setHud] = useState<Hud>(() => snapshot(flightRef.current, mission, 1));
  const [help, setHelp] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [sciOpen, setSciOpen] = useState(false);
  const mat = MATERIALS[design.material];

  const say = (msg: string | null) => {
    if (!msg) return;
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  };
  const setWarp = (w: number) => { warpRef.current = Math.min(w, maxWarp(flightRef.current)); };
  const stepWarp = (dir: number) => {
    const i = WARPS.indexOf(warpRef.current);
    const next = WARPS[Math.max(0, Math.min(WARPS.length - 1, (i < 0 ? 0 : i) + dir))];
    if (next > maxWarp(flightRef.current)) say('Aceleración temporal limitada: motores encendidos o dentro de la atmósfera.');
    setWarp(next);
  };
  const toggleMap = () => {
    const c = canvasRef.current;
    if (!c) return;
    mapMode.current = !mapMode.current;
    camRef.current.targetZoom = mapMode.current ? fitZoom(flightRef.current, c.clientWidth, c.clientHeight) : 0.16;
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
    if (b && !b.startsWith('Sin línea')) { say(b); return; }
    f.transmitting = true;
    if (b) say('Transmisión armada: empezará al tener línea de vista con una estación.');
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      keys.current.add(k);
      const f = flightRef.current;
      if (k === ' ') { f.autopilot = false; stageAction(f); setHelp(false); }
      else if (k === 'z') { f.autopilot = false; setThrottle(f, 1); }
      else if (k === 'x') { f.autopilot = false; setThrottle(f, 0); }
      else if (k === 't') cycleSas();
      else if (k === 'm') toggleMap();
      else if (k === '.') stepWarp(1);
      else if (k === ',') stepWarp(-1);
      else if (k === 'p') { f.autopilot = !f.autopilot; if (f.autopilot) setHelp(false); }
      else if (k === 'g') { if (canDeploy(f)) deploy(f); else say('Solo se puede desplegar en vuelo, sin cofia, sin empuje y fuera del aire denso.'); }
      else if (k === 'h') setHelp((v) => !v);
      else if (k === 'c') setSciOpen((v) => !v);
      else if (/^[1-4]$/.test(k)) { const i = f.design.instruments[Number(k) - 1]; if (i) doMeasure(i); }
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0, last = performance.now(), hudAt = 0, time = 0;
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
      c.targetZoom = Math.max(0.04, Math.min(4e5, c.targetZoom * Math.exp(e.deltaY * 0.0016)));
      mapMode.current = c.targetZoom > 300;
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
      if (!f.ended) {
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
        const simT = real * warp;
        const dtMax = recommendedDt(f);
        const steps = Math.min(6000, Math.max(1, Math.ceil(simT / dtMax)));
        const dt = simT / steps;
        for (let i = 0; i < steps && !f.ended; i++) {
          stepFlight(f, dt, rot / warp);
          if (warp > maxWarp(f)) { warpRef.current = maxWarp(f); break; }
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
      const cam = camRef.current;
      if (mapMode.current && !k.has('wheel')) {
        // En mapa el encuadre sigue a la órbita mientras cambia.
        const fit = fitZoom(f, canvas.clientWidth, canvas.clientHeight);
        if (cam.targetZoom > fit * 3 || cam.targetZoom < fit / 3) cam.targetZoom = fit;
      }
      cam.zoom *= Math.exp((Math.log(cam.targetZoom) - Math.log(cam.zoom)) * Math.min(1, real * 6));
      render(ctx, canvas.clientWidth, canvas.clientHeight, f, cam, time, particles.current);
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
    <div className="flight">
      <canvas ref={canvasRef} className="flight-canvas" />

      <div className="hud hud-top">
        <button className="btn ghost" onClick={onBack} title="Volver al laboratorio">← Laboratorio</button>
        <div className="clock"><span className="lbl">T+</span>{clock(hud.t)}</div>
        <div className="warp">
          <button className="btn tiny" onClick={() => stepWarp(-1)} title="Tecla ,">◀</button>
          <span className={`warp-x ${hud.warp > 1 ? 'on' : ''}`}>{hud.warp}×</span>
          <button className="btn tiny" onClick={() => stepWarp(1)} title="Tecla .">▶</button>
        </div>
        <div className="chip">{hud.context}</div>
        <button className="btn tiny" onClick={toggleMap} title="Tecla M">{mapMode.current ? 'Vista nave' : 'Mapa'}</button>
        <button className="btn tiny" onClick={() => setHelp((v) => !v)} title="Tecla H">Controles</button>
        <button className="btn warn" onClick={finish}>Terminar vuelo</button>
      </div>

      <div className="hud panel hud-left">
        <h4>Navegación</h4>
        <Row k="Altitud" v={dist(hud.alt)} />
        <Row k={hud.alt < 45e3 ? 'Velocidad (suelo)' : 'Velocidad orbital'} v={`${n(hud.alt < 45e3 ? hud.speedSurf : hud.speed)} m/s`} />
        <Row k="Vel. vertical" v={`${n(hud.vr)} m/s`} />
        <Row k="Inclinación" v={`${n(hud.pitch)}°`} />
        <Row k="Apoapsis" v={hud.launched ? dist(hud.ap) : '—'} tone={hud.ap > ATM_TOP ? 'ok' : undefined} />
        <Row k="Periapsis" v={hud.launched ? (hud.pe > -RE * 0.5 ? dist(hud.pe) : 'bajo tierra') : '—'} tone={hud.pe > ATM_TOP ? 'ok' : undefined} />
        <Row k="T. al apoapsis" v={clock(hud.toAp)} />
        <h4>Cargas</h4>
        <Gauge label="Carga aerodinámica" value={`${n(hud.load / 1000, 1)} kPa`} pct={loadPct} limit={tested.vibracion ? `límite ${n(mat.qLimit / 1000)}` : 'límite sin ensayar'} hideLimit={!tested.vibracion} />
        <Gauge label="Aceleración" value={`${n(hud.g, 1)} g`} pct={gPct} limit={tested.vibracion ? `límite ${n(mat.gLimit)}` : 'límite sin ensayar'} hideLimit={!tested.vibracion} />
      </div>

      <div className="hud panel hud-right">
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
          </>
        )}
        <h4>Propulsión</h4>
        <Gauge label="Potencia" value={`${n(hud.throttle * 100)} %`} pct={hud.throttle * 100} plain />
        <Row k="Empuje/peso" v={n(hud.twr, 2)} tone={hud.throttle > 0 && hud.twr < 1 && hud.landed ? 'bad' : undefined} />
        <Row k="Delta-v restante" v={`${n(hud.dv)} m/s`} />
        <Row k="Masa" v={`${n(hud.mass)} kg`} />
        <div className="stages">
          {hud.stages.map((s, i) => (
            <div key={i} className={`stage ${s.active ? 'active' : ''} ${s.gone ? 'gone' : ''}`}>
              <span>E{i + 1}</span>
              <div className="bar"><i style={{ width: `${s.fill * 100}%` }} /></div>
              <span className="num">{n(s.fill * 100)}%</span>
            </div>
          )).reverse()}
        </div>
        <h4>Asistencia</h4>
        <div className="seg">
          {(['mantener', 'prograda', 'retrograda'] as Sas[]).map((m) => (
            <button key={m} className={`btn tiny ${hud.sas === m && !hud.autopilot ? 'on' : ''}`} onClick={() => { f.sas = m; f.autopilot = false; }}>{SAS_LABEL[m]}</button>
          ))}
        </div>
        <button className={`btn tiny wide ${hud.autopilot ? 'on' : ''}`} onClick={() => { f.autopilot = !f.autopilot; setHelp(false); }} title="Tecla P">
          {hud.autopilot ? 'Piloto automático activo' : 'Piloto automático de ascenso'}
        </button>
      </div>

      <div className="hud panel hud-bottom-left">
        <h4>Sistemas</h4>
        <Gauge label={`Batería ${hud.sunlit ? '· al sol' : '· en sombra'}`} value={`${n(hud.battery)} Wh`} pct={(hud.battery / Math.max(1, hud.batteryMax)) * 100} plain invert />
        <Gauge label="Datos a bordo" value={`${n(hud.storage, 1)} / ${n(hud.storageMax)} MB`} pct={(hud.storage / hud.storageMax) * 100} plain />
        <Row k="Enlace" v={hud.link ? `con estación · ${n((hud.delay ?? 0) * 1000, 1)} ms` : 'sin línea de vista'} tone={hud.link ? 'ok' : 'bad'} />
        <Row k="Ciencia" v={`${n(hud.sciE, 1)} entregada / ${n(hud.sciO, 1)}`} />
        <div className="seg">
          <button className="btn tiny" disabled={!hud.canDeploy} onClick={() => deploy(f)} title="Tecla G">{hud.deployed ? 'Desplegado' : 'Desplegar'}</button>
          <button className={`btn tiny ${hud.transmitting ? 'on' : ''}`} onClick={toggleTx} disabled={ANTENNAS[design.antenna].rate === 0}>
            {hud.transmitting ? (hud.txBlock ? 'Esperando enlace…' : 'Transmitiendo') : 'Transmitir'}
          </button>
          <button className={`btn tiny ${sciOpen ? 'on' : ''}`} onClick={() => setSciOpen((v) => !v)} title="Tecla C">Ciencia</button>
        </div>
      </div>

      {sciOpen && (
        <div className="hud panel science">
          <h4>Instrumentos · {hud.context}</h4>
          {design.instruments.length === 0 && <p className="muted">Esta nave no lleva instrumentos.</p>}
          {design.instruments.map((i, idx) => (
            <button key={i} className="inst" onClick={() => doMeasure(i)}>
              <span className="keycap">{idx + 1}</span>
              <span className="inst-name">{INSTRUMENTS[i].nombre}</span>
              <span className="inst-val">+{n(hud.instValues[i] ?? 0, 1)} ciencia</span>
            </button>
          ))}
          <div className="readings">
            {f.measurements.slice(-4).reverse().map((m) => (
              <div key={m.id} className="reading">
                <b>{INSTRUMENTS[m.instrument].nombre}</b> · {CONTEXTS[m.context]}
                <span className={m.sent >= m.mb ? 'ok' : 'muted'}> · {m.sent >= m.mb ? 'recibido en Tierra' : `a bordo ${n((m.sent / m.mb) * 100)} %`}</span>
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

      {toast && <div className="hud toast">{toast}</div>}

      {!hud.launched && !hud.ended && !help && (
        <div className="hud prompt">Pulsa <span className="keycap">Espacio</span> para encender motores</div>
      )}

      {help && (
        <div className="hud help" onClick={() => setHelp(false)}>
          <h3>Controles de vuelo</h3>
          <div className="help-grid">
            <span className="keycap">Espacio</span><span>Encender · separar etapa</span>
            <span className="keycap">W / S</span><span>Subir · bajar potencia</span>
            <span className="keycap">Z / X</span><span>Potencia máxima · cortar motor</span>
            <span className="keycap">A / D</span><span>Inclinar al oeste · al este</span>
            <span className="keycap">T</span><span>Asistencia: mantener, prograda, retrógrada</span>
            <span className="keycap">P</span><span>Piloto automático de ascenso</span>
            <span className="keycap">, / .</span><span>Aceleración temporal</span>
            <span className="keycap">M</span><span>Mapa orbital · la rueda del ratón hace zoom</span>
            <span className="keycap">G</span><span>Desplegar paneles y antena</span>
            <span className="keycap">C · 1–4</span><span>Panel de ciencia · usar instrumento</span>
          </div>
          <p className="muted">Para llegar a órbita: sube vertical unos segundos, inclina poco a poco hacia el este y gana velocidad horizontal. Cuando el apoapsis pase de 150 km, corta el motor, espera a llegar arriba y vuelve a acelerar en prograda.</p>
          <button className="btn primary">Entendido</button>
        </div>
      )}

      {(hud.ended || allDone) && (
        <div className={`hud endcard ${failed ? 'bad' : 'ok'}`}>
          <h3>{failed ? 'Vuelo perdido' : allDone ? 'Objetivos cumplidos' : 'Vuelo terminado'}</h3>
          <p>{failed ? f.events[f.events.length - 1]?.text : allDone ? 'Puedes seguir explorando o cerrar la misión.' : 'La nave está en tierra.'}</p>
          <button className="btn primary" onClick={() => onEnd(f)}>Ver informe de misión</button>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'ok' | 'bad' }) {
  return <div className={`row ${tone ?? ''}`}><span>{k}</span><b>{v}</b></div>;
}

function Gauge({ label, value, pct, limit, plain, invert, hideLimit }: {
  label: string; value: string; pct: number; limit?: string; plain?: boolean; invert?: boolean; hideLimit?: boolean;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const tone = plain ? (invert && p < 15 ? 'bad' : '') : hideLimit ? '' : p > 85 ? 'bad' : p > 65 ? 'warn' : '';
  return (
    <div className="gauge">
      <div className="gauge-head"><span>{label}</span><b>{value}</b></div>
      <div className={`bar ${tone}`}><i style={{ width: `${hideLimit ? Math.min(p, 100) * 0.6 : p}%` }} /></div>
      {limit && <div className="gauge-limit">{limit}</div>}
    </div>
  );
}
