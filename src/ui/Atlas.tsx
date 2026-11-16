import { useEffect, useMemo, useRef, useState } from 'react';
import { AU, BODIES, BODY, BodyId, P2, distance, lightTime, orbitPoint, position, solarFactor, trip } from '../sim/atlas';
import { Journey, journeyPoint, outlook, planJourney } from '../sim/atlasPlan';
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
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });

function duration(s: number): string {
  if (s < 120) return `${n(s, 1)} s`;
  if (s < 2 * 3600) return `${n(s / 60, 1)} min`;
  if (s < 3 * 86400) return `${n(s / 3600, 1)} h`;
  const d = s / 86400;
  if (d < 90) return `${n(d)} days`;
  if (d < 730) return `${n(d / 30.44, 1)} months`;
  return `${n(d / 365.25, 1)} years`;
}

/** Generador determinista: el cielo y el cinturón son iguales en cada visita. */
const rnd = (i: number, k: number) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
const STARS = Array.from({ length: 240 }, (_, i) => ({ x: rnd(i, 1), y: rnd(i, 2), s: 0.6 + rnd(i, 3) * 1.1, a: (0.15 + rnd(i, 4) * 0.5).toFixed(2) }));
const BELT = Array.from({ length: 520 }, (_, i) => ({ r: 2.15 + rnd(i, 5) * 1.15, a0: rnd(i, 6) * 2 * Math.PI }));

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
  // Live: the date follows the real clock, so the planets sit where they are right now.
  const liveRef = useRef(true);
  const [live, setLive] = useState(true);
  // focus: cuerpo al que la cámara vuela y sigue. home: la cámara vuelve a la vista general.
  // homeR: radio (UA) que debe caber en la vista general; 30,1 es todo el sistema.
  const view = useRef({ zoom: 0, panX: 0, panY: 0, focus: null as BodyId | null, home: false, homeR: 30.1 });
  const visualRef = useRef(true);
  const selRef = useRef<BodyId>('marte');
  // Viaje en curso: from es la fecha en que se pidió, para acelerar la espera hasta la ventana.
  const tripRef = useRef<{ j: Journey; from: number; arrived: boolean } | null>(null);
  const [tripInfo, setTripInfo] = useState<string | null>(null);
  const [date, setDate] = useState(dateRef.current);
  const [speed, setSpeed] = useState(0);
  const [visual, setVisual] = useState(true);
  const [sel, setSel] = useState<BodyId>('marte');
  const stats = useMemo(() => computeStats(design), [design]);

  const clearTrip = () => { tripRef.current = null; setTripInfo(null); };
  const pick = (id: BodyId) => {
    if (id !== selRef.current) clearTrip();
    selRef.current = id; setSel(id);
    // Elegir el Sol devuelve a la vista general; cualquier otro cuerpo acerca la cámara a él.
    view.current.focus = id === 'sol' ? null : id;
    view.current.home = id === 'sol';
    view.current.homeR = 30.1;
  };
  const overview = () => { view.current.focus = null; view.current.home = true; view.current.homeR = 30.1; };
  const setScale = (v: boolean) => { visualRef.current = v; view.current = { zoom: 0, panX: 0, panY: 0, focus: null, home: false, homeR: 30.1 }; setVisual(v); };
  const stopLive = () => { liveRef.current = false; setLive(false); };
  const setRate = (i: number) => { clearTrip(); stopLive(); speedRef.current = SPEEDS[i].days; setSpeed(i); setDate(dateRef.current); };
  const today = () => { clearTrip(); stopLive(); dateRef.current = Date.now(); setDate(dateRef.current); };
  const goLive = () => {
    clearTrip(); speedRef.current = 0; setSpeed(0);
    liveRef.current = true; setLive(true);
    dateRef.current = Date.now(); setDate(dateRef.current);
  };
  /** Sale en la próxima ventana: el tiempo corre solo hasta la salida y luego durante el viaje. */
  const launchTrip = () => {
    const j = planJourney(selRef.current, dateRef.current);
    if (!j) return;
    tripRef.current = { j, from: dateRef.current, arrived: false };
    speedRef.current = 0; setSpeed(0); stopLive();
    if (j.id === 'luna') { view.current.focus = 'luna'; view.current.home = false; return; }
    // Encuadra las dos órbitas del viaje: la de la Tierra y la del destino.
    view.current.focus = null; view.current.home = true;
    view.current.homeR = Math.max(1.15, BODY[j.id].el!.a * 1.15);
  };

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
      let target = (area().r * 0.94) / (visualRef.current ? Math.pow(v.homeR, 0.45) : v.homeR);
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
      // Estrellas de fondo: fijas, con un leve desplazamiento al mover la vista.
      for (const s of STARS) {
        const x = (((s.x * w + view.current.panX * 0.03) % w) + w) % w, y = (((s.y * h + view.current.panY * 0.03) % h) + h) % h;
        ctx.fillStyle = `rgba(200,215,255,${s.a})`;
        ctx.fillRect(x, y, s.s, s.s);
      }
      // Cinturón de asteroides, entre Marte y Júpiter. Cada punto gira según su distancia al Sol.
      const years = (t - Date.UTC(2000, 0, 1)) / (365.25 * DAY);
      ctx.fillStyle = 'rgba(190,175,150,0.4)';
      for (const a of BELT) {
        const ang = a.a0 + (2 * Math.PI * years) / Math.pow(a.r, 1.5);
        const [x, y] = screen({ x: a.r * Math.cos(ang), y: a.r * Math.sin(ang) });
        if (x < 0 || y < 0 || x > w || y > h) continue;
        ctx.fillRect(x, y, 1.2, 1.2);
      }
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
      // Viaje planeado: el camino completo punteado, el tramo ya recorrido sólido y la nave.
      const trip = tripRef.current;
      let craft: [number, number] | null = null;
      if (trip) {
        const { j } = trip;
        const f = Math.max(0, Math.min(1, (t - j.depart) / (j.arrive - j.depart)));
        const at = (k: number): [number, number] => {
          if (j.id !== 'luna') return screen(journeyPoint(j, k));
          // La Luna se dibuja separada de la Tierra: el camino une los dos puntos en pantalla.
          const [ex, ey] = bodyScreen('tierra', t), [mx, my] = bodyScreen('luna', t);
          return [ex + (mx - ex) * k, ey + (my - ey) * k];
        };
        const path = (to: number) => {
          ctx.beginPath();
          const steps = Math.max(2, Math.ceil(90 * to));
          for (let i = 0; i <= steps; i++) { const [x, y] = at((i / steps) * to); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.stroke();
        };
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,179,71,0.55)';
        ctx.setLineDash([5, 6]); path(1); ctx.setLineDash([]);
        if (f > 0) { ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2.5; path(f); }
        ctx.lineWidth = 1;
        if (t >= j.depart) craft = at(f);
      }
      ctx.font = '12px Inter, system-ui, sans-serif';
      for (const b of BODIES) {
        const [x, y] = bodyScreen(b.id, t);
        const r = dotRadius(b.id);
        if (b.id === 'saturno' && r > 4) {
          // Mitad trasera de los anillos, detrás del planeta.
          ctx.strokeStyle = 'rgba(214,196,150,0.75)'; ctx.lineWidth = Math.max(1.5, r * 0.22);
          ctx.beginPath(); ctx.ellipse(x, y, r * 2.1, r * 0.62, -0.38, Math.PI, 2 * Math.PI); ctx.stroke();
          ctx.lineWidth = 1;
        }
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
        if (b.id === 'saturno' && r > 4) {
          // Mitad delantera de los anillos, por encima del planeta.
          ctx.strokeStyle = 'rgba(232,216,170,0.9)'; ctx.lineWidth = Math.max(1.5, r * 0.22);
          ctx.beginPath(); ctx.ellipse(x, y, r * 2.1, r * 0.62, -0.38, 0, Math.PI); ctx.stroke();
          ctx.lineWidth = 1;
        }
        if (b.id === selRef.current) {
          ctx.strokeStyle = '#ffb347';
          ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
        }
        if (b.id !== 'luna' || b.id === selRef.current || !visualRef.current) {
          ctx.fillStyle = b.id === selRef.current ? '#ffd9a0' : 'rgba(200,215,240,0.85)';
          ctx.fillText(b.nombre, x + (b.id === 'saturno' ? r * 2.1 : r) + 6, y + 4);
        }
      }
      if (craft) {
        // La nave: un punto brillante con un halo que late.
        const [x, y] = craft;
        const pulse = 9 + 3 * Math.sin(performance.now() / 180);
        const g = ctx.createRadialGradient(x, y, 0, x, y, pulse);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(255,200,120,0.6)'); g.addColorStop(1, 'rgba(255,179,71,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const trip = tripRef.current;
      if (trip && !trip.arrived) {
        const { j } = trip;
        if (dateRef.current < j.depart) {
          // La espera hasta la ventana pasa en unos tres segundos.
          dateRef.current = Math.min(j.depart, dateRef.current + Math.max(DAY, (j.depart - trip.from) / 3) * dt);
        } else {
          // El viaje entero dura unos ocho segundos, sea de días o de años.
          dateRef.current = Math.min(j.arrive, dateRef.current + ((j.arrive - j.depart) / 8) * dt);
          if (dateRef.current >= j.arrive) {
            trip.arrived = true;
            view.current.focus = j.id; view.current.home = false;
          }
        }
      } else if (liveRef.current) dateRef.current = Date.now();
      else if (speedRef.current > 0) dateRef.current += speedRef.current * DAY * dt;
      if (view.current.zoom > 0) glide(dateRef.current, dt);
      draw(dateRef.current);
      if (now - hudAt > (liveRef.current ? 500 : 120) && (speedRef.current > 0 || trip || liveRef.current)) {
        hudAt = now;
        setDate(dateRef.current);
        if (trip) {
          const { j } = trip, name = BODY[j.id].nombre, total = (j.arrive - j.depart) / 1000;
          setTripInfo(dateRef.current < j.depart
            ? `Waiting for the launch window: ${fmtDate(j.depart)}`
            : trip.arrived
              ? `Arrived at ${name} on ${fmtDate(j.arrive)}, after ${duration(total)}`
              : `In flight to ${name} · ${duration((dateRef.current - j.depart) / 1000)} of ${duration(total)}`);
        }
      }
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
        if (best !== selRef.current) { tripRef.current = null; setTripInfo(null); }
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
  const out = outlook(sel, date, { solarAtEarthW: stats.solarW, baseW: stats.baseW, rateLeo: stats.rateMBs });
  const far = sel === 'saturno' || sel === 'urano' || sel === 'neptuno';

  return (
    <div className="flight atlas">
      <canvas ref={canvasRef} className="flight-canvas" />

      <div className="hud hud-top">
        <button className="btn ghost" onClick={onHome}>← Home</button>
        <div className="clock">{fmtDate(date)}{live && <span className="atlas-live-time"> · {fmtTime(date)} UTC</span>}</div>
        <div className="seg">
          {SPEEDS.map((s, i) => (
            <button key={s.label} className={`btn tiny ${speed === i && !live ? 'on' : ''}`} onClick={() => setRate(i)}>{s.label}</button>
          ))}
        </div>
        <button className={`btn tiny atlas-live ${live ? 'on' : ''}`} onClick={goLive} aria-pressed={live} title="Show the planets where they are right now, following the real clock">
          <i aria-hidden="true" />Live
        </button>
        <button className="btn tiny" onClick={today}>Today</button>
        <button className="btn tiny" onClick={overview} title="Fly back to the whole solar system">Overview</button>
        <button className={`btn tiny ${visual ? '' : 'on'}`} onClick={() => setScale(!visual)} title="Switch between visual scale and physical scale">
          {visual ? 'Visual scale' : 'Physical scale'}
        </button>
      </div>

      {tripInfo && (
        <div className="hud atlas-trip" role="status">
          <span>{tripInfo}</span>
          <button className="btn tiny ghost" onClick={clearTrip} aria-label="Clear the trip">✕</button>
        </div>
      )}

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
            <button className="btn primary wide" onClick={launchTrip} disabled={!tr.window && sel !== 'luna'}>
              {sel === 'luna' ? 'Fly the trip now' : 'Launch at the next window'}
            </button>
            <p className="note">Watch the trip: time runs to the launch window, then the craft follows the transfer path and meets {b.nombre} where it will be on arrival. Minimum-energy estimate with circular orbits; it does not include braking or landing.</p>

            <h4>Could your craft work there?</h4>
            <div className="kv">
              <span>Solar power there</span>
              <b className={out.panelsShort > 0 ? 'bad' : 'ok'}>{n(out.solarW, out.solarW < 10 ? 1 : 0)} W of the {n(stats.solarW)} W it makes near Earth</b>
              <span>Power it needs</span><b>{n(out.baseW)} W</b>
              <span>Data link to Earth</span>
              <b className={out.kbps === 0 ? 'bad' : ''}>{out.kbps === 0 ? 'no antenna' : out.kbps >= 100 ? `${n(out.kbps / 1000, 1)} Mbit/s` : `${n(out.kbps, out.kbps < 10 ? 2 : 0)} kbit/s`}</b>
              <span>One 40 MB photo takes</span><b>{isFinite(out.photoTime) ? duration(out.photoTime) : 'never arrives'}</b>
              <span>A command arrives in</span><b>{duration(out.delay)}</b>
            </div>
            <p className={`issue ${out.panelsShort > 0 || out.kbps === 0 ? 'warn' : 'ok-line'}`}>
              {out.panelsShort > 0
                ? `Not enough sunlight: it would need ${n(out.panelsShort)} more solar panel${out.panelsShort === 1 ? '' : 's'}${out.panelsShort > 6 ? ', more than it can carry' : ''}.${far ? ' This far out, real missions usually carry a nuclear power source instead.' : ''}`
                : out.kbps === 0
                  ? 'It has power, but without an antenna no data would ever come back.'
                  : `It has enough power, and its antenna still reaches Earth${out.photoTime > 86400 ? ', though each photo takes more than a day to send' : ''}.`}
              {out.delay > 5 && ' Nobody can steer it live at that distance: it has to act on its own.'}
            </p>
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
