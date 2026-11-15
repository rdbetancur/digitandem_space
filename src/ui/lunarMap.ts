// Mapa del descenso lunar: carta del polo sur (proyección ortográfica de la imagen LROC),
// globo de contexto y perfil del descenso sobre el relieve LOLA.

import { ALT0, HIGH_GATE, Luna, R_MOON, SITE_ANGLE, START_ANGLE, alongTrack, brakingDistance, localFrame, siteDistance } from '../sim/luna';
import { lunarCoordinates, terrainElevation } from '../sim/lunarTerrain';
import { LUNAR_DATA } from '../sim/lunarData';

type Pt = { x: number; y: number };
const RAD = Math.PI / 180;

let image: HTMLImageElement | undefined;
let pixels: ImageData | null = null;
let failed = false;

function source(): ImageData | null {
  if (pixels || failed || typeof Image === 'undefined') return pixels;
  if (!image) {
    image = new Image();
    image.onerror = () => { failed = true; };
    image.src = '/nasa/moon-lroc-2025.jpg';
  }
  if (!image.complete || !image.naturalWidth) return null;
  const c = document.createElement('canvas');
  c.width = image.naturalWidth; c.height = image.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) { failed = true; return null; }
  g.drawImage(image, 0, 0);
  pixels = g.getImageData(0, 0, c.width, c.height);
  return pixels;
}

/** Vista ortográfica centrada en (lat0, 0°E), norte arriba. radius: píxeles del radio lunar. */
interface View { lat0: number; radius: number; cx: number; cy: number }

function project(v: View, lat: number, lon: number): Pt & { visible: boolean } {
  const p = lat * RAD, l = lon * RAD, p0 = v.lat0 * RAD;
  const x = Math.cos(p) * Math.sin(l);
  const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l);
  return { x: v.cx + v.radius * x, y: v.cy - v.radius * y, visible: Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l) >= 0 };
}
const onMap = (v: View, theta: number) => { const g = lunarCoordinates(theta); return project(v, g.lat, g.lon); };

const cache = new Map<string, HTMLCanvasElement>();
/** Reproyecta la imagen equirectangular a un recorte cuadrado de la vista ortográfica. */
function render(key: string, size: number, lat0: number, radius: number, src: ImageData): HTMLCanvasElement {
  const id = `${key}:${size}:${Math.round(radius)}`;
  const hit = cache.get(id);
  if (hit) return hit;
  for (const k of cache.keys()) if (k.startsWith(`${key}:`)) cache.delete(k);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d')!;
  const out = g.createImageData(size, size);
  const p0 = lat0 * RAD, s0 = Math.sin(p0), c0 = Math.cos(p0);
  const W = src.width, H = src.height, D = src.data;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5 - size / 2) / radius, y = (size / 2 - j - 0.5) / radius;
      const rho2 = x * x + y * y;
      if (rho2 >= 1) continue;
      const z = Math.sqrt(1 - rho2);
      const lat = Math.asin(z * s0 + y * c0);
      const lon = Math.atan2(x, z * c0 - y * s0);
      const fx = ((lon / (2 * Math.PI) + 0.5) * W - 0.5 + W) % W, fy = Math.max(0, Math.min(H - 1.001, (0.5 - lat / Math.PI) * H - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
      const a = (y0 * W + x0) * 4, b = (y0 * W + ((x0 + 1) % W)) * 4, cc = a + W * 4, d = b + W * 4;
      // Luz suave desde arriba a la izquierda para que se lea como una esfera.
      const lightK = (0.5 + 0.62 * Math.max(0, -0.42 * x + 0.42 * y + 0.8 * z)) * Math.min(1, (1 - Math.sqrt(rho2)) * radius * 0.5 + 0.35);
      const o = (j * size + i) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const val = (D[a + ch] * (1 - ax) + D[b + ch] * ax) * (1 - ay) + (D[cc + ch] * (1 - ax) + D[d + ch] * ax) * ay;
        // La imagen polar tiene poco contraste: se estira para que los cráteres se lean.
        out.data[o + ch] = Math.max(0, Math.min(255, ((val - 150) * 1.9 + 135) * lightK));
      }
      out.data[o + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  cache.set(id, c);
  return c;
}

function graticule(ctx: CanvasRenderingContext2D, v: View) {
  ctx.strokeStyle = 'rgba(170, 205, 240, 0.22)'; ctx.lineWidth = 1;
  const line = (pt: (t: number) => [number, number], n: number) => {
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= n; i++) {
      const [lat, lon] = pt(i / n);
      const p = project(v, lat, lon);
      if (!p.visible) { pen = false; continue; }
      if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      pen = true;
    }
    ctx.stroke();
  };
  for (let lat = -80; lat <= 80; lat += 10) line((t) => [lat, t * 360 - 180], 180);
  for (let lon = -180; lon < 180; lon += 30) line((t) => [t * 178 - 89, lon], 90);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign) {
  ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = align;
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2, 4, 10, 0.85)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

const fmtKm = (m: number) => `${Math.round(Math.abs(m) / 1000).toLocaleString('en-US')} km`;

export function drawLunarMap(ctx: CanvasRenderingContext2D, w: number, h: number, s: Luna, path: Pt[] = [], impact: number | null = null, time = 0) {
  const theta = Math.atan2(s.r.y, s.r.x);
  const fr = localFrame(s);
  const wide = w > 900;
  const left = wide ? 290 : 12, right = wide ? w - 290 : w - 12, top = wide ? 96 : 150, bottom = h - (wide ? 176 : 150);
  const availW = right - left, availH = bottom - top;
  const side = availW > availH * 1.4;
  const size = Math.max(140, Math.round(side ? Math.min(availH, availW * 0.52) : Math.min(availW, availH - 150)));
  const profile = side
    ? { x: left + size + 28, y: top + size * 0.2, w: Math.min(availW - size - 28, 680), h: size * 0.56 }
    : { x: left, y: top + size + 46, w: availW, h: Math.max(70, availH - size - 62) };
  const mx = side ? left : left + (availW - size) / 2, my = top;

  // --- Carta del polo sur ---
  const view: View = { lat0: -78, radius: size * 0.95, cx: mx + size / 2, cy: my + size / 2 };
  const src = source();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(mx, my, size, size, 12); ctx.clip();
  ctx.fillStyle = '#0b0e15'; ctx.fillRect(mx, my, size, size);
  if (src) ctx.drawImage(render('chart', size, view.lat0, view.radius, src), mx, my);
  else label(ctx, failed ? 'LROC map unavailable' : 'Loading NASA LROC map…', view.cx, view.cy, '#d6dbe4', 'center');
  graticule(ctx, view);

  // Órbita polar completa, tenue, y la trayectoria prevista sin motor.
  const track = (pts: number[], style: string, width: number, dash: number[]) => {
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
    let pen = false;
    for (const a of pts) {
      const p = onMap(view, a);
      if (!p.visible) { pen = false; continue; }
      if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      pen = true;
    }
    ctx.stroke(); ctx.setLineDash([]);
  };
  track(Array.from({ length: 361 }, (_, i) => i * RAD), 'rgba(120, 190, 255, 0.3)', 1, [3, 6]);
  track(Array.from({ length: 41 }, (_, i) => START_ANGLE + ((theta - START_ANGLE) * i) / 40), 'rgba(255, 179, 71, 0.85)', 2, []);
  track(path.map((p) => Math.atan2(p.y, p.x)), '#5ab8ff', 2, [6, 5]);

  const site = onMap(view, SITE_ANGLE);
  const pulse = (time * 0.8) % 1;
  ctx.strokeStyle = `rgba(90, 220, 160, ${1 - pulse})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(site.x, site.y, 6 + pulse * 22, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#5adca0'; ctx.beginPath(); ctx.arc(site.x, site.y, 5, 0, Math.PI * 2); ctx.fill();
  label(ctx, `Ice site · ${Math.abs(LUNAR_DATA.site.lat)}°S`, site.x + 12, site.y + 4, '#5adca0', 'left');

  const b = brakingDistance(s);
  if (isFinite(b) && s.throttle === 0 && siteDistance(s) > b) {
    const p = onMap(view, SITE_ANGLE - b / R_MOON);
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x - 9, p.y); ctx.lineTo(p.x + 9, p.y); ctx.stroke();
    label(ctx, 'Ignition point', p.x + 14, p.y + 4, '#ffb347', 'left');
  }
  if (impact !== null) {
    const p = onMap(view, impact);
    ctx.strokeStyle = '#ff6b5e'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(p.x - 6, p.y - 6); ctx.lineTo(p.x + 6, p.y + 6); ctx.moveTo(p.x + 6, p.y - 6); ctx.lineTo(p.x - 6, p.y + 6); ctx.stroke();
    label(ctx, 'Impact if engine off', p.x - 12, p.y + 4, '#ff6b5e', 'right');
  }
  const ship = onMap(view, theta);
  const ahead = onMap(view, theta + 0.002);
  ctx.save();
  ctx.translate(ship.x, ship.y); ctx.rotate(Math.atan2(ahead.y - ship.y, ahead.x - ship.x));
  ctx.fillStyle = '#ffd08a'; ctx.strokeStyle = 'rgba(2, 4, 10, 0.9)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, 7); ctx.lineTo(-3, 0); ctx.lineTo(-7, -7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  label(ctx, `Lander · ${fmtKm(siteDistance(s))} to go`, ship.x - 14, ship.y + 4, '#ffd08a', 'right');
  ctx.restore();
  ctx.strokeStyle = 'rgba(150, 180, 220, 0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(mx + 0.5, my + 0.5, size - 1, size - 1, 12); ctx.stroke();

  // --- Globo de contexto ---
  const gr = Math.max(26, size * 0.11);
  const globe: View = { lat0: -35, radius: gr, cx: mx + gr + 12, cy: my + gr + 12 };
  ctx.fillStyle = 'rgba(2, 4, 10, 0.7)'; ctx.beginPath(); ctx.arc(globe.cx, globe.cy, gr + 5, 0, Math.PI * 2); ctx.fill();
  if (src) ctx.drawImage(render('globe', Math.ceil(gr * 2), globe.lat0, gr, src), globe.cx - gr, globe.cy - gr);
  const gs = project(globe, lunarCoordinates(theta).lat, 0), gt = project(globe, -89, 0);
  ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(gs.x, gs.y); ctx.lineTo(gt.x, gt.y); ctx.stroke();
  ctx.fillStyle = '#5adca0'; ctx.beginPath(); ctx.arc(gt.x, gt.y, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd08a'; ctx.beginPath(); ctx.arc(gs.x, gs.y, 2.5, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#c6d2e6'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('South polar chart · NASA LROC, orthographic · grid every 10° of latitude', mx + size / 2, my + size + 18);

  // --- Perfil del descenso: altura contra distancia al sitio, relieve LOLA ---
  const q = profile;
  const uMin = -(SITE_ANGLE - START_ANGLE) * R_MOON - 15e3, uMax = 25e3, zMin = -4000, zMax = ALT0 + 3000;
  const X = (u: number) => q.x + ((u - uMin) / (uMax - uMin)) * q.w;
  const Y = (z: number) => q.y + q.h - ((z - zMin) / (zMax - zMin)) * q.h;
  const elev = (u: number) => terrainElevation(SITE_ANGLE + u / R_MOON);
  ctx.save();
  ctx.beginPath(); ctx.roundRect(q.x, q.y, q.w, q.h, 10); ctx.clip();
  ctx.fillStyle = 'rgba(8, 12, 22, 0.88)'; ctx.fillRect(q.x, q.y, q.w, q.h);
  ctx.strokeStyle = 'rgba(170, 205, 240, 0.14)'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(198, 210, 230, 0.7)'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
  for (let z = 0; z <= 15000; z += 5000) {
    ctx.beginPath(); ctx.moveTo(q.x, Y(z)); ctx.lineTo(q.x + q.w, Y(z)); ctx.stroke();
    ctx.fillText(`${z / 1000} km`, q.x + 6, Y(z) - 3);
  }
  const soil = ctx.createLinearGradient(0, Y(6000), 0, q.y + q.h);
  soil.addColorStop(0, '#b9b4a8'); soil.addColorStop(1, '#4a4c52');
  ctx.fillStyle = soil; ctx.beginPath(); ctx.moveTo(q.x, q.y + q.h);
  for (let i = 0; i <= 300; i++) { const u = uMin + ((uMax - uMin) * i) / 300; ctx.lineTo(X(u), Y(elev(u))); }
  ctx.lineTo(q.x + q.w, q.y + q.h); ctx.closePath(); ctx.fill();
  const uOf = (p: Pt) => alongTrack({ r: p });
  if (path.length > 1) {
    ctx.strokeStyle = '#5ab8ff'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 5]); ctx.beginPath();
    path.forEach((p, i) => { const x = X(uOf(p)), y = Y(Math.hypot(p.x, p.y) - R_MOON); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.strokeStyle = '#5adca0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(0), Y(elev(0))); ctx.lineTo(X(0), Y(elev(0)) - 22); ctx.stroke();
  label(ctx, 'Ice site', X(0), Y(elev(0)) - 27, '#5adca0', 'center');
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(X(-30e3), Y(elev(0) + HIGH_GATE)); ctx.lineTo(X(8e3), Y(elev(0) + HIGH_GATE)); ctx.stroke(); ctx.setLineDash([]);
  if (isFinite(b) && s.throttle === 0 && siteDistance(s) > b) {
    ctx.strokeStyle = '#ffb347'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(-b), q.y + 20); ctx.lineTo(X(-b), q.y + q.h); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, 'Ignite here', X(-b), q.y + 15, '#ffb347', 'center');
  }
  const lx = X(alongTrack(s)), ly = Y(fr.rm - R_MOON);
  ctx.fillStyle = '#ffd08a'; ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(255, 208, 138, ${1 - pulse})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(lx, ly, 5 + pulse * 12, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(150, 180, 220, 0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(q.x + 0.5, q.y + 0.5, q.w - 1, q.h - 1, 10); ctx.stroke();
  ctx.fillStyle = '#c6d2e6'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Descent profile · measured LOLA relief, heights exaggerated', q.x + q.w / 2, q.y - 8);
}
