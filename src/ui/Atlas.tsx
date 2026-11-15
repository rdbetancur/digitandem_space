import { useEffect, useMemo, useRef, useState } from 'react';
import { AU, BODIES, BODY, BodyId, P2, distance, lightTime, orbitPoint, position, solarFactor, trip } from '../sim/atlas';
import { Design, computeStats } from '../sim/vehicle';

const n = (x: number, d = 0) => x.toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: d });
const DAY = 86400e3;
/** Delta-v de referencia para llegar a la órbita baja, igual que en el laboratorio. */
const DV_LEO = 9400;
const SPEEDS = [
  { label: 'Pausa', days: 0 },
  { label: '1 día/s', days: 1 },
  { label: '1 mes/s', days: 30 },
  { label: '1 año/s', days: 365 },
];

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function duration(s: number): string {
  if (s < 120) return `${n(s, 1)} s`;
  if (s < 2 * 3600) return `${n(s / 60, 1)} min`;
  if (s < 3 * 86400) return `${n(s / 3600, 1)} h`;
  const d = s / 86400;
  if (d < 90) return `${n(d)} días`;
  if (d < 730) return `${n(d / 30.44, 1)} meses`;
  return `${n(d / 365.25, 1)} años`;
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
  const view = useRef({ zoom: 0, panX: 0, panY: 0 });
  const visualRef = useRef(true);
  const selRef = useRef<BodyId>('marte');
  const [date, setDate] = useState(dateRef.current);
  const [speed, setSpeed] = useState(0);
  const [visual, setVisual] = useState(true);
  const [sel, setSel] = useState<BodyId>('marte');
  const stats = useMemo(() => computeStats(design), [design]);

  const pick = (id: BodyId) => { selRef.current = id; setSel(id); };
  const setScale = (v: boolean) => { visualRef.current = v; view.current = { zoom: 0, panX: 0, panY: 0 }; setVisual(v); };
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
        return [ex + 15 * Math.cos(a), ey - 15 * Math.sin(a)];
      }
      return screen(position(id, t));
    };
    const dotRadius = (id: BodyId) => {
      const b = BODY[id];
      if (visualRef.current) return id === 'sol' ? 9 : 2.6 + 1.7 * Math.log10(b.radio / 1000);
      return Math.max(id === 'sol' ? 3 : 2, ((b.radio * 1000) / AU) * view.current.zoom);
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
      draw(dateRef.current);
      if (now - hudAt > 120 && speedRef.current > 0) { hudAt = now; setDate(dateRef.current); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
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
      if (best) { selRef.current = best; setSel(best); }
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
        <button className="btn ghost" onClick={onHome}>← Inicio</button>
        <div className="clock">{fmtDate(date)}</div>
        <div className="seg">
          {SPEEDS.map((s, i) => (
            <button key={s.label} className={`btn tiny ${speed === i ? 'on' : ''}`} onClick={() => setRate(i)}>{s.label}</button>
          ))}
        </div>
        <button className="btn tiny" onClick={today}>Hoy</button>
        <button className={`btn tiny ${visual ? '' : 'on'}`} onClick={() => setScale(!visual)} title="Cambiar entre escala visual y escala física">
          {visual ? 'Escala visual' : 'Escala física'}
        </button>
      </div>

      <div className="hud panel atlas-side">
        <div className="atlas-bodies">
          {BODIES.map((x) => (
            <button key={x.id} className={`btn tiny ${sel === x.id ? 'on' : ''}`} onClick={() => pick(x.id)}>{x.nombre}</button>
          ))}
        </div>
        <h3 className="atlas-name"><i style={{ background: b.color }} />{b.nombre}</h3>
        <p className="note">{b.tipo}. {b.interes}</p>
        <div className="kv">
          <span>Gravedad</span><b>{n(b.gravedad, b.gravedad < 20 ? 2 : 0)} m/s² · {n(b.gravedad / 9.80665, 2)} g</b>
          <span>Radio</span><b>{n(b.radio)} km</b>
          <span>Temperatura media</span><b>{n(b.temperatura)} °C</b>
          {sel !== 'sol' && <><span>Distancia al Sol</span><b>{n(rSun, 2)} UA · {n((rSun * AU) / 1e9)} M km</b></>}
          {sel !== 'tierra' && <><span>Distancia a la Tierra</span><b>{dEarth < 5e9 ? `${n(dEarth / 1000)} km` : `${n(dEarth / 1e9)} M km`}</b></>}
          {sel !== 'tierra' && <><span>Retraso de una señal</span><b>{duration(lightTime(dEarth))}</b></>}
          {sel !== 'sol' && <><span>Energía solar</span><b>{n(solarFactor(sel, date) * 100, solarFactor(sel, date) < 0.1 ? 1 : 0)} % de la de la Tierra</b></>}
        </div>
        <p className="note">Atmósfera: {b.atmosfera}</p>
        <p className="note">{b.mision}</p>

        {tr && (
          <>
            <h4>Llegar desde la órbita baja</h4>
            <div className="kv">
              <span>Impulso de salida</span><b>{n(tr.dv)} m/s</b>
              <span>Duración del viaje</span><b>{duration(tr.time)}</b>
              <span>Próxima ventana</span><b>{tr.window ? fmtDate(tr.window) : sel === 'luna' ? 'cualquier día' : 'en más de 2 años'}</b>
            </div>
            <p className={`issue ${spare >= tr.dv ? 'ok-line' : 'warn'}`}>
              {spare < 0
                ? `Tu nave «${design.nombre}» todavía no alcanza la órbita baja: le faltan ${n(-spare)} m/s.`
                : spare >= tr.dv
                  ? `Tu nave «${design.nombre}» llega a la órbita baja con ${n(spare)} m/s de sobra: alcanza para salir hacia ${b.nombre}.`
                  : `Tu nave «${design.nombre}» llega a la órbita baja con ${n(spare)} m/s de sobra: le faltan ${n(tr.dv - spare)} m/s para salir hacia ${b.nombre}.`}
            </p>
            <p className="note">Estimación de mínima energía con órbitas circulares. No incluye frenar ni aterrizar al llegar. El vuelo interplanetario todavía no es jugable: el Atlas sirve para planear.</p>
            <button className="btn wide" onClick={onLab}>Rediseñar la nave en el laboratorio</button>
          </>
        )}
      </div>

      <div className="hud atlas-foot">
        {visual
          ? 'Escala visual: distancias comprimidas y planetas agrandados para que todo quepa.'
          : 'Escala física: distancias y tamaños reales. Los planetas son puntos; acerca la vista con la rueda del ratón.'}
        {' '}Posiciones aproximadas con elementos orbitales del JPL (válidos de 1800 a 2050), sobre el plano de la eclíptica.
      </div>
    </div>
  );
}
