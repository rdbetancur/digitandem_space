// Dibujo de la misión lunar en Canvas 2D: descenso (vista cercana y mapa) y base en la superficie.

import { Luna, R_MOON, SITE_ANGLE, FLARE, flareActive, localFrame, siteDistance, sunlit } from '../sim/luna';
import { terrainRadius, terrainElevation } from '../sim/lunarTerrain';
import { drawLunarMap } from './lunarMap';
import { lunarEnvironment } from '../sim/lunarEnvironment';

type Pt = { x: number; y: number };

/** El suelo se dibuja a esta fracción de la altura de la pantalla. */
export const GROUND_FRAC = 0.8;
/** Altura de la nave en el dibujo (m) y posición de las patas en el sprite (fracción). */
const LANDER_H = 9;
const FOOT = 14 / 40;
/** Altura que cubre la escala logarítmica de la cámara (m). */
const CAM_TOP = 20000;
const CAM_K = 5;

/**
 * Escala de la cámara de descenso. La distancia en pantalla entre la nave y el suelo (gap)
 * crece con el logaritmo de la altura: así el suelo se acerca de forma visible durante todo
 * el descenso y la escala (píxeles por metro) cambia sin saltos. Antes la escala era
 * proporcional a 1 / altura y el suelo quedaba siempre a la misma distancia en pantalla.
 */
export function landerScale(alt: number, h: number): { ppm: number; gap: number } {
  const span = h * (GROUND_FRAC - 0.24);
  const L = Math.log10(1 + CAM_TOP / CAM_K);
  const a = Math.max(0, alt);
  const gap = Math.min(1, Math.log10(1 + a / CAM_K) / L) * span;
  const ppm0 = span / (CAM_K * Math.LN10 * L);
  const ppm = a > 0.5 ? Math.min(ppm0, gap / a) : ppm0;
  return { ppm, gap: a > 0.5 ? gap : a * ppm0 };
}

const hash = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const fmtKm = (m: number) => `${Math.abs(m) < 10e3 ? (Math.abs(m) / 1000).toFixed(1) : Math.round(Math.abs(m) / 1000)} km`;

/** Cráter visto de costado y en perspectiva. El Sol, bajo y a la izquierda, ilumina la pared derecha. */
function crater(ctx: CanvasRenderingContext2D, q: Pt, rx: number, seed: number, deep = false) {
  const ry = Math.max(0.6, rx * 0.22);
  const y = q.y + ry * 1.15 + (deep ? 0 : seed * Math.min(60, rx * 1.4));
  ctx.fillStyle = 'rgba(178, 182, 190, 0.35)';
  ctx.beginPath(); ctx.ellipse(q.x, y - ry * 0.12, rx * 1.12, ry * 1.25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = deep ? '#08090c' : '#3b3e44';
  ctx.beginPath(); ctx.ellipse(q.x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  if (deep) {
    // El fondo nunca ve el Sol: hielo apenas insinuado.
    ctx.fillStyle = 'rgba(140, 190, 255, 0.18)';
    ctx.beginPath(); ctx.ellipse(q.x, y + ry * 0.25, rx * 0.55, ry * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(200, 204, 212, 0.8)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(q.x, y, rx, ry, 0, -Math.PI * 0.45, Math.PI * 0.35); ctx.stroke();
    return;
  }
  ctx.fillStyle = 'rgba(120, 124, 132, 0.75)';
  ctx.beginPath(); ctx.ellipse(q.x + rx * 0.28, y + ry * 0.08, rx * 0.68, ry * 0.8, 0, 0, Math.PI * 2); ctx.fill();
}

/** La Tierra, siempre cerca del horizonte vista desde el polo sur lunar, iluminada desde la izquierda. */
function earth(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const r = 9;
  ctx.fillStyle = '#0d1a33';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x - 4, y - 3, 1, x - 2, y, r);
  g.addColorStop(0, '#cfe6ff'); g.addColorStop(0.5, '#3d86e0'); g.addColorStop(1, '#1d4d99');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, Math.PI / 2, Math.PI * 1.5); ctx.ellipse(x, y, r * 0.35, r, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
  ctx.fillStyle = 'rgba(160, 200, 255, 0.12)';
  ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fill();
}

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
    drawLunarMap(ctx, w, h, Math.atan2(s.r.y, s.r.x), SITE_ANGLE, view.path, view.impact);
    return;
  }

  // Vista cercana: la vertical local de la nave apunta hacia arriba en pantalla. El suelo
  // queda fijo abajo y la nave baja hacia él; la escala cambia en forma continua con la altura.
  const alt = Math.max(0, fr.alt);
  const groundY = h * GROUND_FRAC;
  const { ppm, gap } = landerScale(alt, h);
  const shipY = groundY - gap;
  const P = (p: Pt) => {
    const d = { x: p.x - s.r.x, y: p.y - s.r.y };
    return { x: w / 2 + (d.x * fr.fwd.x + d.y * fr.fwd.y) * ppm, y: shipY - (d.x * fr.up.x + d.y * fr.up.y) * ppm };
  };
  const theta = Math.atan2(s.r.y, s.r.x);
  const half = (w / 2 / ppm) * 1.15;
  const span = Math.min(Math.PI, half / R_MOON + 1e-6);
  const onSurface = (u: number) => P({ x: Math.cos(u / R_MOON) * terrainRadius(u / R_MOON), y: Math.sin(u / R_MOON) * terrainRadius(u / R_MOON) });
  const u0 = theta * R_MOON;

  earth(ctx, w * 0.8, Math.min(groundY - 70, h * 0.3));

  const N = 240;
  // Regolito: un arco de la esfera real, con el borde iluminado por el Sol rasante del polo.
  const surf: Pt[] = [];
  for (let i = 0; i <= N; i++) surf.push(onSurface(u0 + span * R_MOON * (i / N - 0.5) * 2));
  const grad = ctx.createLinearGradient(0, groundY - 10, 0, h);
  grad.addColorStop(0, '#8c8f96'); grad.addColorStop(0.15, '#6f727a'); grad.addColorStop(1, '#3d4046');
  ctx.fillStyle = grad;
  ctx.beginPath();
  surf.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.lineTo(w + 4000, h + 4000); ctx.lineTo(-4000, h + 4000); ctx.closePath(); ctx.fill();

  // Borde del suelo iluminado.
  ctx.strokeStyle = '#b4b8bf'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  surf.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();

  drawPath(ctx, view.path, P);
  const site = P({ x: Math.cos(SITE_ANGLE) * terrainRadius(SITE_ANGLE), y: Math.sin(SITE_ANGLE) * terrainRadius(SITE_ANGLE) });
  if (site.x > -50 && site.x < w + 50) marker(ctx, site.x, site.y, '#5adca0', 'Site');
  else {
    // Flecha al borde que indica hacia dónde queda el sitio.
    const right = site.x > w / 2;
    ctx.fillStyle = '#5adca0'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = right ? 'right' : 'left';
    ctx.fillText(right ? `Site ${fmtKm(siteDistance(s))} →` : `← Site ${fmtKm(siteDistance(s))}`, right ? w - 14 : 14, groundY - 30);
  }
  if (view.impact !== null) {
    const ip = P({ x: Math.cos(view.impact) * terrainRadius(view.impact), y: Math.sin(view.impact) * terrainRadius(view.impact) });
    if (ip.x > 0 && ip.x < w) cross(ctx, ip.x, ip.y);
  }
  // Sombra de la nave en el suelo, del lado opuesto al Sol (que está bajo, a la izquierda).
  const size = Math.max(22, Math.min(80, LANDER_H * ppm));
  if (gap < h * 0.25) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.45 * (1 - gap / (h * 0.25))})`;
    ctx.beginPath(); ctx.ellipse(w / 2 + gap * 0.6, groundY + 2, size * 0.5, size * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  }
  // La posición de la nave es la de sus patas: se dibuja con los pies sobre ese punto.
  ctx.save();
  ctx.translate(w / 2, shipY);
  ctx.rotate(s.pitch);
  ctx.translate(0, -size * FOOT);
  drawLander(ctx, size, s.prop > 0 ? s.throttle : 0, time);
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
  ctx.fillStyle = '#d6dbe4'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('Base operations schematic · background profile from LOLA (vertical scale exaggerated)', w / 2, h * 0.16);
  // El Sol a menos de 2° sobre el horizonte, girando alrededor del polo una vez por mes lunar.
  const az = lunarEnvironment(s.hours).solarAzimuth * Math.PI / 180;
  const sx = w * (0.5 + 0.45 * Math.cos(az));
  if (lit) {
    const g = ctx.createRadialGradient(sx, ground - 30, 2, sx, ground - 30, 60);
    g.addColorStop(0, 'rgba(255, 250, 235, 1)'); g.addColorStop(0.2, 'rgba(255, 240, 200, 0.6)'); g.addColorStop(1, 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, ground - 30, 60, 0, Math.PI * 2); ctx.fill();
  }
  // Cresta lejana que tapa el Sol durante la sombra.
  ctx.fillStyle = '#3a3d44';
  ctx.beginPath(); ctx.moveTo(0, ground);
  for (let x = 0; x <= w; x += 5) { const a = SITE_ANGLE + ((x / w - 0.5) * 60000) / R_MOON; ctx.lineTo(x, ground - 18 - (terrainElevation(a) - terrainElevation(SITE_ANGLE)) * 0.025); }
  ctx.lineTo(w, ground); ctx.closePath(); ctx.fill();
  // Suelo: iluminado de costado o en penumbra.
  const soil = ctx.createLinearGradient(0, ground, 0, h);
  soil.addColorStop(0, lit ? '#8a8d94' : '#3a3d43'); soil.addColorStop(1, lit ? '#4a4d54' : '#1d1f23');
  ctx.fillStyle = soil;
  ctx.fillRect(0, ground, w, h - ground);
  ctx.strokeStyle = lit ? '#b4b8bf' : '#4a4e56'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(w, ground); ctx.stroke();
  // Cráteres pequeños del regolito alrededor de la base.
  for (let i = 0; i < 14; i++) {
    const x = hash(i, 41) * w;
    if (Math.abs(x - w * 0.75) < w * 0.2) continue;
    crater(ctx, { x, y: ground }, 6 + hash(i, 43) * 22, hash(i, 47));
  }
  // Cráter en sombra permanente
  const cx = w * 0.75, cw = w * 0.34;
  ctx.fillStyle = '#0c0d10';
  ctx.beginPath(); ctx.ellipse(cx, ground + 34, cw / 2, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = lit ? '#a2a7b0' : '#4a4e56'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, ground + 34, cw / 2, 26, 0, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#9fc6ff'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Ice extraction area · mission scenario', cx, ground + 78);
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
