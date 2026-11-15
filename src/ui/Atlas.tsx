import { useEffect, useMemo, useRef, useState } from 'react';
import { AU, BODIES, BODY, BodyId, P2, distance, lightTime, orbitPoint, position, solarFactor, trip } from '../sim/atlas';
import { Design, computeStats } from '../sim/vehicle';
import { BODY_IMAGES, bodyImageUrl } from './nasaLive';

const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const DAY = 86400e3;
/** Delta-v de referencia para llegar a la órbita baja, igual que en el laboratorio. */
const DV_LEO = 9400;
const SPEEDS = [
  { label: 'Pause', days: 0 },
  { label: '1 day/s', days: 1 },
  { label: '1 month/s', days: 30 },
  { label: '1 year/s', days: 365 },
];

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function duration(s: number): string {
  if (s < 120) return `${n(s, 1)} s`;
  if (s < 2 * 3600) return `${n(s / 60, 1)} min`;
  if (s < 3 * 86400) return `${n(s / 3600, 1)} h`;
  const d = s / 86400;
  if (d < 90) return `${n(d)} days`;
  if (d < 730) return `${n(d / 30.44, 1)} months`;
  return `${n(d / 365.25, 1)} years`;
}

/** Duración de una rotación sobre su eje (NASA Planetary Fact Sheet). */
const ROTATION: Record<BodyId, string> = {
  sol: 'about 25 days at its equator', mercurio: '58.6 days', venus: '243 days, spinning backwards', tierra: '23.9 hours',
  luna: '27.3 days', marte: '24.6 hours', jupiter: '9.9 hours', saturno: '10.7 hours', urano: '17.2 hours', neptuno: '16.1 hours',
};

/** Periodo orbital por la tercera ley de Kepler, a partir del semieje mayor en UA. */
function yearLength(a: number): string {
  const years = Math.pow(a, 1.5);
  return years < 2 ? `${n(years * 365.25)} days` : `${n(years, 1)} Earth years`;
}

interface Props {
  design: Design;
  onHome: () => void;
  onLab: () => void;
}

export default function Atlas({ design, onHome, onLab }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dateRef = useRef(Date.now());
  const speedRef = useRef(0);
  // focus: cuerpo al que la cámara vuela y sigue. home: la cámara vuelve a la vista general.
  const view = useRef({ zoom: 0, panX: 0, panY: 0, focus: null as BodyId | null, home: false });
  const visualRef = useRef(true);
  const selRef = useRef<BodyId>('marte');
  const [date, setDate] = useState(dateRef.current);
  const [speed, setSpeed] = useState(0);
  const [visual, setVisual] = useState(true);
  const [sel, setSel] = useState<BodyId>('marte');
  const stats = useMemo(() => computeStats(design), [design]);

  const pick = (id: BodyId) => {
    selRef.current = id; setSel(id);
    // Elegir el Sol devuelve a la vista general; cualquier otro cuerpo acerca la cámara a él.
    view.current.focus = id === 'sol' ? null : id;
    view.current.home = id === 'sol';
  };
  const overview = () => { view.current.focus = null; view.current.home = true; };
  const setScale = (v: boolean) => { visualRef.current = v; view.current = { zoom: 0, panX: 0, panY: 0, focus: null, home: false }; setVisual(v); };
  const setRate = (i: number) => { speedRef.current = SPEEDS[i].days; setSpeed(i); setDate(dateRef.current); };
  const today = () => { dateRef.current = Date.now(); setDate(dateRef.current); };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0, last = performance.now(), hudAt = 0;
    const resize = () => {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    /** En escala visual las distancias se comprimen para que quepan todos los planetas. */
    const squash = (p: P2): P2 => {
      if (!visualRef.current) return p;
      const r = Math.hypot(p.x, p.y);
      if (r === 0) return p;
      const k = Math.pow(r, 0.45) / r;
      return { x: p.x * k, y: p.y * k };
    };
    /** Centro y radio de la zona libre: el panel tapa la derecha, o la parte baja en pantallas angostas. */
    const area = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w <= 980) return { cx: w / 2, cy: 70 + (h * 0.54 - 70) / 2, r: Math.min(w, h * 0.54 - 70) / 2 };
      return { cx: (w - 340) / 2, cy: h / 2 + 20, r: Math.min(w - 340, h - 90) / 2 };
    };
    const fit = () => (area().r * 0.94) / (visualRef.current ? Math.pow(30.1, 0.45) : 30.1);
    const screen = (p: P2): [number, number] => {
      const v = view.current, q = squash(p), c = area();
      return [c.cx + v.panX + q.x * v.zoom, c.cy + v.panY - q.y * v.zoom];
    };
    const bodyScreen = (id: BodyId, t: number): [number, number] => {
      if (id === 'luna' && visualRef.current) {
        // La Luna estaría pegada a la Tierra: se dibuja separada, en su dirección real.
        const e = position('tierra', t), m = position('luna', t);
        const [ex, ey] = screen(e);
        const a = Math.atan2(m.y - e.y, m.x - e.x);
        const d = 15 * grow();
        return [ex + d * Math.cos(a), ey - d * Math.sin(a)];
      }
      return screen(position(id, t));
    };
    /** En escala visual los cuerpos crecen al acercar la cámara, para que el destino se vea grande. */
    const grow = () => Math.pow(Math.max(1, Math.min(8, view.current.zoom / fit())), 0.8);
    const dotRadius = (id: BodyId) => {
      const b = BODY[id];
      if (visualRef.current) return (id === 'sol' ? 9 : 2.6 + 1.7 * Math.log10(b.radio / 1000)) * grow();
      return Math.max(id === 'sol' ? 3 : 2, ((b.radio * 1000) / AU) * view.current.zoom);
    };
    /** Vuelo suave de la cámara hacia el cuerpo elegido, o de vuelta a la vista general. */
    const glide = (t: number, dt: number) => {
      const v = view.current;
      if (!v.focus && !v.home) return;
      const base = fit();
      let target = base;
      if (v.focus) {
        const near = v.focus === 'luna' || v.focus === 'tierra';
        target = base * (visualRef.current ? (v.focus === 'luna' ? 12 : 9) : near ? 2500 : 12);
      }
      const kz = 1 - Math.exp(-dt * 2.6), kp = 1 - Math.exp(-dt * 4.5);
      v.zoom = Math.exp(Math.log(v.zoom) + (Math.log(target) - Math.log(v.zoom)) * kz);
      if (v.focus) {
        const c = area();
        const [sx, sy] = bodyScreen(v.focus, t);
        v.panX += (c.cx - sx) * kp; v.panY += (c.cy - sy) * kp;
      } else {
        v.panX -= v.panX * kp; v.panY -= v.panY * kp;
        if (Math.abs(Math.log(v.zoom / target)) < 0.002 && Math.hypot(v.panX, v.panY) < 0.5) v.home = false;
      }
    };

    const draw = (t: number) => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (view.current.zoom === 0) view.current.zoom = fit();
      ctx.fillStyle = '#04060c';
      ctx.fillRect(0, 0, w, h);
      // Órbitas
      ctx.lineWidth = 1;
      for (const b of BODIES) {
        if (!b.el) continue;
        ctx.strokeStyle = b.id === selRef.current ? 'rgba(255,179,71,0.55)' : 'rgba(140,170,210,0.22)';
        ctx.beginPath();
        for (let i = 0; i <= 180; i++) {
          const [x, y] = screen(orbitPoint(b.el, (i / 180) * 2 * Math.PI, t));
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Línea Tierra–destino: el camino que recorre una señal de radio.
      if (selRef.current !== 'tierra') {
        const [ex, ey] = bodyScreen('tierra', t), [sx, sy] = bodyScreen(selRef.current, t);
        ctx.strokeStyle = 'rgba(90,184,255,0.5)';
        ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.font = '12px Inter, system-ui, sans-serif';
      for (const b of BODIES) {
        const [x, y] = bodyScreen(b.id, t);
        const r = dotRadius(b.id);
        if (b.id === 'sol') {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
          g.addColorStop(0, 'rgba(255,211,90,0.55)'); g.addColorStop(1, 'rgba(255,211,90,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        if (b.id !== 'sol' && r > 5) {
          // Día y noche: la cara que mira al Sol queda iluminada.
          const [sx, sy] = bodyScreen('sol', t);
          const a = Math.atan2(sy - y, sx - x);
          const g = ctx.createLinearGradient(x + Math.cos(a) * r, y + Math.sin(a) * r, x - Math.cos(a) * r, y - Math.sin(a) * r);
          g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.72)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        if (b.id === selRef.current) {
          ctx.strokeStyle = '#ffb347';
          ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
        }
        if (b.id !== 'luna' || b.id === selRef.current || !visualRef.current) {
          ctx.fillStyle = b.id === selRef.current ? '#ffd9a0' : 'rgba(200,215,240,0.85)';
          ctx.fillText(b.nombre, x + r + 6, y + 4);
        }
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (speedRef.current > 0) dateRef.current += speedRef.current * DAY * dt;
      if (view.current.zoom > 0) glide(dateRef.current, dt);
      draw(dateRef.current);
      if (now - hudAt > 120 && speedRef.current > 0) { hudAt = now; setDate(dateRef.current); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      v.focus = null; v.home = false;
      const k = Math.exp(-e.deltaY * 0.0015);
      const next = Math.max(fit() * 0.5, Math.min(fit() * 4000, v.zoom * k));
      const s = next / v.zoom;
      // El zoom se centra en el cursor.
      const c = area();
      const mx = e.offsetX - c.cx, my = e.offsetY - c.cy;
      v.panX = mx - (mx - v.panX) * s; v.panY = my - (my - v.panY) * s; v.zoom = next;
    };
    let drag: { x: number; y: number; moved: number } | null = null;
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved >= 5) { view.current.focus = null; view.current.home = false; }
      view.current.panX += dx; view.current.panY += dy;
      drag.x = e.clientX; drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      const wasClick = drag && drag.moved < 5;
      drag = null;
      if (!wasClick) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let best: BodyId | null = null, bestD = 22;
      for (const b of BODIES) {
        const [x, y] = bodyScreen(b.id, dateRef.current);
        const d = Math.hypot(x - mx, y - my) - dotRadius(b.id);
        if (d < bestD) { bestD = d; best = b.id; }
      }
      if (best) {
        selRef.current = best; setSel(best);
        view.current.focus = best === 'sol' ? null : best;
        view.current.home = best === 'sol';
      }
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
    };
  }, []);

  const b = BODY[sel];
  const p = position(sel, date);
  const rSun = Math.hypot(p.x, p.y);
  const dEarth = sel === 'tierra' ? 0 : distance('tierra', sel, date);
  const tr = trip(sel, date);
  const spare = stats.dvVacTotal - DV_LEO;

  return (
    <div className="flight atlas">
      <canvas ref={canvasRef} className="flight-canvas" />

      <div className="hud hud-top">
        <button className="btn ghost" onClick={onHome}>← Home</button>
        <div className="clock">{fmtDate(date)}</div>
        <div className="seg">
          {SPEEDS.map((s, i) => (
            <button key={s.label} className={`btn tiny ${speed === i ? 'on' : ''}`} onClick={() => setRate(i)}>{s.label}</button>
          ))}
        </div>
        <button className="btn tiny" onClick={today}>Today</button>
        <button className="btn tiny" onClick={overview} title="Fly back to the whole solar system">Overview</button>
        <button className={`btn tiny ${visual ? '' : 'on'}`} onClick={() => setScale(!visual)} title="Switch between visual scale and physical scale">
          {visual ? 'Visual scale' : 'Physical scale'}
        </button>
      </div>

      <div className="hud panel atlas-side">
        <div className="atlas-bodies">
          {BODIES.map((x) => (
            <button key={x.id} className={`btn tiny ${sel === x.id ? 'on' : ''}`} onClick={() => pick(x.id)}>{x.nombre}</button>
          ))}
        </div>
        <h3 className="atlas-name"><i style={{ background: b.color }} />{b.nombre}</h3>
        <figure className="atlas-photo" key={sel}>
          <img src={bodyImageUrl(sel)} alt={BODY_IMAGES[sel].caption} loading="lazy" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
          <figcaption>{BODY_IMAGES[sel].caption} <span>Image: {BODY_IMAGES[sel].credit}</span></figcaption>
        </figure>
        <p className="note">{b.tipo}. {b.interes}</p>
        <div className="kv">
          <span>One day lasts</span><b>{ROTATION[sel]}</b>
          {sel !== 'sol' && <><span>One year lasts</span><b>{sel === 'luna' ? '27.3 days around Earth' : yearLength(b.el!.a)}</b></>}
          <span>Escape velocity</span><b>{n(Math.sqrt(2 * b.gravedad * b.radio * 1000) / 1000, 1)} km/s</b>
          <span>Gravity</span><b>{n(b.gravedad, b.gravedad < 20 ? 2 : 0)} m/s² · {n(b.gravedad / 9.80665, 2)} g</b>
          <span>Radius</span><b>{n(b.radio)} km</b>
          <span>Mean temperature</span><b>{n(b.temperatura)} °C</b>
          {sel !== 'sol' && <><span>Distance to the Sun</span><b>{n(rSun, 2)} AU · {n((rSun * AU) / 1e9)} M km</b></>}
          {sel !== 'tierra' && <><span>Distance to Earth</span><b>{dEarth < 5e9 ? `${n(dEarth / 1000)} km` : `${n(dEarth / 1e9)} M km`}</b></>}
          {sel !== 'tierra' && <><span>Signal delay</span><b>{duration(lightTime(dEarth))}</b></>}
          {sel !== 'sol' && <><span>Solar power</span><b>{n(solarFactor(sel, date) * 100, solarFactor(sel, date) < 0.1 ? 1 : 0)} % of Earth's</b></>}
        </div>
        <p className="note">Atmosphere: {b.atmosfera}</p>
        <p className="note">{b.mision}</p>

        {tr && (
          <>
            <h4>Getting there from low orbit</h4>
            <div className="kv">
              <span>Departure delta-v</span><b>{n(tr.dv)} m/s</b>
              <span>Trip duration</span><b>{duration(tr.time)}</b>
              <span>Next window</span><b>{tr.window ? fmtDate(tr.window) : sel === 'luna' ? 'any day' : 'more than 2 years away'}</b>
            </div>
            <p className={`issue ${spare >= tr.dv ? 'ok-line' : 'warn'}`}>
              {spare < 0
                ? `Your craft "${design.nombre}" cannot reach low orbit yet: it is ${n(-spare)} m/s short.`
                : spare >= tr.dv
                  ? `Your craft "${design.nombre}" reaches low orbit with ${n(spare)} m/s to spare: enough to depart for ${b.nombre}.`
                  : `Your craft "${design.nombre}" reaches low orbit with ${n(spare)} m/s to spare: it needs ${n(tr.dv - spare)} m/s more to depart for ${b.nombre}.`}
            </p>
            <p className="note">Minimum-energy estimate with circular orbits. It does not include braking or landing on arrival. Interplanetary flight is not playable yet: the Atlas is for planning.</p>
            <button className="btn wide" onClick={onLab}>Redesign the craft in the lab</button>
          </>
        )}
      </div>

      <div className="hud atlas-foot">
        {visual
          ? 'Visual scale: distances compressed and planets enlarged so everything fits.'
          : 'Physical scale: real distances and sizes. Planets are dots; zoom in with the mouse wheel.'}
        {' '}Approximate positions from JPL orbital elements (valid from 1800 to 2050), on the plane of the ecliptic.
      </div>
    </div>
  );
}
