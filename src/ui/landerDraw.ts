// Dibujo de la misión lunar en Canvas 2D: descenso (vista cercana y mapa) y base en la superficie.

import { Luna, R_MOON, SITE_ANGLE, FLARE, flareActive, localFrame, sunlit } from '../sim/luna';

type Pt = { x: number; y: number };

const STARS: { x: number; y: number; r: number }[] = [];
for (let i = 0, seed = 7; i < 220; i++) {
  seed = (seed * 16807) % 2147483647; const x = seed / 2147483647;
  seed = (seed * 16807) % 2147483647; const y = seed / 2147483647;
  seed = (seed * 16807) % 2147483647;
  STARS.push({ x, y, r: 0.4 + (seed / 2147483647) * 1.1 });
}

function sky(ctx: CanvasRenderingContext2D, w: number, h: number, alpha = 1) {
  ctx.fillStyle = '#04060c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `rgba(220, 230, 255, ${0.75 * alpha})`;
  for (const s of STARS) { ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); ctx.fill(); }
}

/** Dibuja la nave en su sistema local: arriba = −y. size en píxeles de alto. */
function drawLander(ctx: CanvasRenderingContext2D, size: number, throttle: number, time: number, panels = false) {
  const k = size / 40;
  ctx.save();
  ctx.scale(k, k);
  if (throttle > 0.01) {
    const len = 14 + 26 * throttle + Math.sin(time * 40) * 3;
    const g = ctx.createLinearGradient(0, 8, 0, 8 + len);
    g.addColorStop(0, 'rgba(255, 240, 200, 0.95)');
    g.addColorStop(1, 'rgba(255, 140, 60, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(4, 8); ctx.lineTo(0, 8 + len); ctx.closePath(); ctx.fill();
  }
  // Patas
  ctx.strokeStyle = '#b9c2d3'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-15, 14); ctx.moveTo(8, 2); ctx.lineTo(15, 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-18, 14); ctx.lineTo(-12, 14); ctx.moveTo(12, 14); ctx.lineTo(18, 14); ctx.stroke();
  // Etapa de descenso (dorada) y cabina
  ctx.fillStyle = '#c99a3c';
  ctx.fillRect(-10, -4, 20, 10);
  ctx.fillStyle = '#8b6a2a'; ctx.fillRect(-3, 6, 6, 3);
  ctx.fillStyle = '#d6dbe4';
  ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-7, -16); ctx.lineTo(7, -16); ctx.lineTo(8, -4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#26364f'; ctx.fillRect(-3.5, -13, 7, 4);
  if (panels) {
    ctx.fillStyle = '#2b5c9e'; ctx.strokeStyle = '#8fb6ec'; ctx.lineWidth = 0.6;
    for (const sx of [-1, 1]) {
      ctx.fillRect(sx > 0 ? 9 : -33, -30, 24, 18); ctx.strokeRect(sx > 0 ? 9 : -33, -30, 24, 18);
      ctx.strokeStyle = '#b9c2d3'; ctx.beginPath(); ctx.moveTo(sx * 7, -12); ctx.lineTo(sx * 12, -16); ctx.stroke(); ctx.strokeStyle = '#8fb6ec';
    }
  }
  ctx.restore();
}

export interface LanderView { map: boolean; path: Pt[]; impact: number | null }

/** Descenso: vista que sigue a la nave con la superficie abajo, o mapa de toda la Luna. */
export function drawDescent(ctx: CanvasRenderingContext2D, w: number, h: number, s: Luna, view: LanderView, time: number) {
  sky(ctx, w, h);
  const fr = localFrame(s);
  if (view.map) {
    const ppm = (Math.min(w, h) * 0.42) / (R_MOON + 30e3);
    const P = (p: Pt) => ({ x: w / 2 + p.x * ppm, y: h / 2 - p.y * ppm });
    ctx.fillStyle = '#6b6f78';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, R_MOON * ppm, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a5e67';
    for (const [a, d, r] of [[0.6, 0.5, 0.16], [2.2, 0.3, 0.1], [3.7, 0.62, 0.2], [5.1, 0.4, 0.12]]) {
      ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * d * R_MOON * ppm, h / 2 - Math.sin(a) * d * R_MOON * ppm, r * R_MOON * ppm, 0, Math.PI * 2); ctx.fill();
    }
    drawPath(ctx, view.path, P);
    const site = P({ x: Math.cos(SITE_ANGLE) * R_MOON, y: Math.sin(SITE_ANGLE) * R_MOON });
    marker(ctx, site.x, site.y, '#5adca0', 'Site');
    if (view.impact !== null) {
      const ip = P({ x: Math.cos(view.impact) * R_MOON, y: Math.sin(view.impact) * R_MOON });
      cross(ctx, ip.x, ip.y);
    }
    const lp = P(s.r);
    ctx.fillStyle = '#ffb347';
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 4, 0, Math.PI * 2); ctx.fill();
    return;
  }

  // Vista cercana: la vertical local de la nave apunta hacia arriba en pantalla.
  const alt = Math.max(0, fr.alt);
  const shipY = h * 0.34;
  const ppm = Math.min(14, (h * 0.5) / Math.max(alt, 25));
  const P = (p: Pt) => {
    const d = { x: p.x - s.r.x, y: p.y - s.r.y };
    return { x: w / 2 + (d.x * fr.fwd.x + d.y * fr.fwd.y) * ppm, y: shipY - (d.x * fr.up.x + d.y * fr.up.y) * ppm };
  };
  const theta = Math.atan2(s.r.y, s.r.x);
  const span = Math.min(Math.PI, ((w / ppm) / R_MOON) * 1.2 + 1e-5);
  ctx.fillStyle = '#5f636b';
  ctx.beginPath();
  const N = 160;
  for (let i = 0; i <= N; i++) {
    const a = theta + span * (i / N - 0.5) * 2;
    const p = P({ x: Math.cos(a) * R_MOON, y: Math.sin(a) * R_MOON });
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.lineTo(w + 2000, h + 2000); ctx.lineTo(-2000, h + 2000); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#9aa0aa'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = theta + span * (i / N - 0.5) * 2;
    const p = P({ x: Math.cos(a) * R_MOON, y: Math.sin(a) * R_MOON });
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  // Cráter en sombra junto al sitio (solo dibujo: el terreno de la simulación es liso).
  const craterA = SITE_ANGLE + 3e3 / R_MOON;
  const cp = P({ x: Math.cos(craterA) * R_MOON, y: Math.sin(craterA) * R_MOON });
  const cw = Math.max(6, 4000 * ppm);
  if (cp.x > -cw && cp.x < w + cw) {
    ctx.fillStyle = '#15171c';
    ctx.beginPath(); ctx.ellipse(cp.x, cp.y + 1, cw / 2, Math.max(2, cw / 10), 0, 0, Math.PI * 2); ctx.fill();
  }
  drawPath(ctx, view.path, P);
  const site = P({ x: Math.cos(SITE_ANGLE) * R_MOON, y: Math.sin(SITE_ANGLE) * R_MOON });
  if (site.x > -50 && site.x < w + 50) marker(ctx, site.x, site.y, '#5adca0', 'Site');
  else {
    // Flecha al borde que indica hacia dónde queda el sitio.
    const right = site.x > w / 2;
    ctx.fillStyle = '#5adca0'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = right ? 'right' : 'left';
    ctx.fillText(right ? 'Site →' : '← Site', right ? w - 14 : 14, Math.min(h - 20, Math.max(20, site.y)));
  }
  if (view.impact !== null) {
    const ip = P({ x: Math.cos(view.impact) * R_MOON, y: Math.sin(view.impact) * R_MOON });
    if (ip.x > 0 && ip.x < w) cross(ctx, ip.x, ip.y);
  }
  ctx.save();
  ctx.translate(w / 2, shipY);
  ctx.rotate(s.pitch);
  drawLander(ctx, Math.max(26, Math.min(90, 7 * ppm)), s.prop > 0 ? s.throttle : 0, time);
  ctx.restore();
}

function drawPath(ctx: CanvasRenderingContext2D, path: Pt[], P: (p: Pt) => Pt) {
  if (path.length < 2) return;
  ctx.strokeStyle = 'rgba(90, 184, 255, 0.7)'; ctx.lineWidth = 1.4; ctx.setLineDash([6, 6]);
  ctx.beginPath();
  path.forEach((p, i) => { const q = P(p); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); });
  ctx.stroke(); ctx.setLineDash([]);
}

function marker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x + 11, y - 18); ctx.lineTo(x, y - 14); ctx.fill();
  ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(label, x, y - 27);
}

function cross(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = '#ff6b5e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
}

/** Superficie: la base junto al cráter, el Sol rasante del polo y la tormenta solar. */
export function drawSurface(ctx: CanvasRenderingContext2D, w: number, h: number, s: Luna, time: number) {
  const lit = sunlit(s.hours);
  sky(ctx, w, h);
  const ground = h * 0.66;
  // El Sol a menos de 2° sobre el horizonte, girando alrededor del polo una vez por mes lunar.
  const az = ((s.hours / (29.5 * 24)) * Math.PI * 2) % (Math.PI * 2);
  const sx = w * (0.5 + 0.45 * Math.cos(az));
  if (lit) {
    const g = ctx.createRadialGradient(sx, ground - 30, 2, sx, ground - 30, 60);
    g.addColorStop(0, 'rgba(255, 250, 235, 1)'); g.addColorStop(0.2, 'rgba(255, 240, 200, 0.6)'); g.addColorStop(1, 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, ground - 30, 60, 0, Math.PI * 2); ctx.fill();
  }
  // Cresta lejana que tapa el Sol durante la sombra.
  ctx.fillStyle = '#3a3d44';
  ctx.beginPath(); ctx.moveTo(0, ground);
  for (let x = 0; x <= w; x += 20) ctx.lineTo(x, ground - 18 - 14 * Math.sin(x * 0.013) - 10 * Math.sin(x * 0.041 + 1));
  ctx.lineTo(w, ground); ctx.closePath(); ctx.fill();
  // Suelo: iluminado de costado o en penumbra.
  ctx.fillStyle = lit ? '#7c8089' : '#33363c';
  ctx.fillRect(0, ground, w, h - ground);
  // Cráter en sombra permanente
  const cx = w * 0.75, cw = w * 0.34;
  ctx.fillStyle = '#0c0d10';
  ctx.beginPath(); ctx.ellipse(cx, ground + 34, cw / 2, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = lit ? '#a2a7b0' : '#4a4e56'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, ground + 34, cw / 2, 26, 0, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#9fc6ff'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Permanently shadowed crater · water ice', cx, ground + 78);
  // Rover que perfora en el cráter
  if (s.drill) {
    const rx = cx - 30 + Math.sin(time * 0.6) * 4;
    ctx.fillStyle = '#d6dbe4'; ctx.fillRect(rx - 10, ground + 26, 20, 8);
    ctx.fillStyle = '#ffb347'; ctx.fillRect(rx - 1, ground + 34, 2, 6 + Math.abs(Math.sin(time * 8)) * 4);
    ctx.strokeStyle = 'rgba(214, 219, 228, 0.5)'; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(w * 0.36, ground + 4); ctx.lineTo(rx, ground + 26); ctx.stroke(); ctx.setLineDash([]);
  }
  // Base
  ctx.save();
  ctx.translate(w * 0.32, ground - 14 * (Math.min(w, 900) / 300));
  drawLander(ctx, 40 * (Math.min(w, 900) / 300), 0, time, s.panels);
  ctx.restore();
  // Refugio
  const shx = w * 0.14;
  ctx.fillStyle = '#5b5f68';
  ctx.beginPath(); ctx.ellipse(shx, ground, 40, 22, 0, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = s.shelter ? '#ffc857' : '#22252b'; ctx.fillRect(shx - 6, ground - 12, 12, 12);
  ctx.fillStyle = '#c6d2e6'; ctx.fillText('Shelter', shx, ground + 16);
  // Tormenta solar: destellos de protones.
  if (flareActive(s.hours)) {
    ctx.fillStyle = `rgba(255, 90, 70, ${0.08 + 0.05 * Math.sin(time * 6)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 180, 160, 0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const x = ((i * 97 + time * 400) % (w + 200)) - 100;
      const y = ((i * 53 + time * 260) % h);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 18, y - 12); ctx.stroke();
    }
  } else if (s.hours >= FLARE[0] - 2 && s.hours < FLARE[0]) {
    ctx.fillStyle = 'rgba(255, 200, 87, 0.05)'; ctx.fillRect(0, 0, w, h);
  }
}
