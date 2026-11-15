// Paisaje del descenso lunar en Canvas 2D: cielo, Tierra, Sol rasante, cordones lejanos,
// suelo sombreado con el relieve LOLA, cráteres, rocas y efectos del motor.
// El perfil bajo la nave es el relieve medido (el mismo del radar y del contacto). Los
// cordones del fondo, los cráteres pequeños y las rocas son ilustrativos: ver docs/FUENTES.md.

import { ASSIST_ALT, Luna, PAD, R_MOON, SITE_ANGLE, rough } from '../sim/luna';
import { terrainElevation } from '../sim/lunarTerrain';

/** Sol rasante del polo, algo más alto que el real para que el relieve se lea (7°). */
const TAN_SUN = Math.tan((7 * Math.PI) / 180);
/** Separación de las muestras LOLA sobre el terreno (m). */
const LOLA_STEP = 1900;

const hash = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
/** Relieve medido en el punto u (metros más allá del sitio, a lo largo de la órbita). */
const elev = (u: number) => terrainElevation(SITE_ANGLE + u / R_MOON);

/** Luz en un punto del relieve hf: pendiente hacia el Sol y sombra de las crestas a la izquierda. */
function light(hf: (u: number) => number, u: number): number {
  const h0 = hf(u);
  const slope = (hf(u + 1000) - hf(u - 1000)) / 2000;
  let m = -1e9;
  for (let k = 1; k <= 14; k++) {
    const d = k * LOLA_STEP;
    const v = hf(u - d) - h0 - (d * d) / (2 * R_MOON) - d * TAN_SUN;
    if (v > m) m = v;
  }
  const sh = Math.max(0, Math.min(1, 0.5 + m / 160));
  const lit = Math.max(0.12, Math.min(1, 0.42 + slope * 2.6));
  return lit * (1 - sh) + 0.035 * sh;
}

const shade = (L: number, dim = 1) => {
  const k = L * dim;
  return `rgb(${Math.round(9 + 196 * k)},${Math.round(11 + 187 * k)},${Math.round(17 + 169 * k)})`;
};

// --- Cielo ---

let starTile: HTMLCanvasElement | null = null;
function stars(): HTMLCanvasElement | null {
  if (starTile || typeof document === 'undefined') return starTile;
  const c = document.createElement('canvas');
  c.width = 1400; c.height = 800;
  const g = c.getContext('2d');
  if (!g) return null;
  // Vía Láctea: una banda tenue de estrellas débiles.
  for (let i = 0; i < 2600; i++) {
    const t = hash(i, 1), spread = (hash(i, 2) + hash(i, 3) + hash(i, 4) - 1.5) * 150;
    const x = t * c.width, y = 260 + Math.sin(t * Math.PI * 2) * 110 + spread;
    g.fillStyle = `rgba(190, 205, 255, ${0.05 + hash(i, 5) * 0.16})`;
    g.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 520; i++) {
    const x = hash(i, 11) * c.width, y = hash(i, 12) * c.height, m = hash(i, 13);
    const r = m > 0.985 ? 1.6 : m > 0.9 ? 1.1 : 0.6;
    const tint = hash(i, 14);
    g.fillStyle = tint > 0.85 ? `rgba(255, 214, 180, ${0.4 + m * 0.5})` : tint < 0.2 ? `rgba(170, 200, 255, ${0.4 + m * 0.5})` : `rgba(235, 240, 255, ${0.3 + m * 0.6})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (m > 0.985) { g.fillStyle = 'rgba(200, 220, 255, 0.12)'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  }
  starTile = c;
  return c;
}

/** Cielo negro con estrellas que giran a medida que la nave avanza alrededor de la Luna. */
export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, theta: number) {
  ctx.fillStyle = '#020308';
  ctx.fillRect(0, 0, w, h);
  const tile = stars();
  if (!tile) return;
  const ox = -(((theta * 2600) % tile.width) + tile.width) % tile.width;
  for (let x = ox; x < w; x += tile.width) for (let y = 0; y < h; y += tile.height) ctx.drawImage(tile, x, y);
}

/** La Tierra, baja sobre el horizonte del polo sur, iluminada desde la izquierda. Ilustrativa. */
export function drawEarth(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const halo = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 2.4);
  halo.addColorStop(0, 'rgba(110, 170, 255, 0.22)'); halo.addColorStop(1, 'rgba(110, 170, 255, 0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#050b18';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  // Fase: el lado izquierdo iluminado.
  ctx.beginPath(); ctx.arc(x, y, r, Math.PI / 2, Math.PI * 1.5); ctx.ellipse(x, y, r * 0.42, r, 0, -Math.PI / 2, Math.PI / 2); ctx.clip();
  const g = ctx.createRadialGradient(x - r * 0.45, y - r * 0.3, r * 0.1, x - r * 0.1, y, r * 1.1);
  g.addColorStop(0, '#9fd0ff'); g.addColorStop(0.45, '#2f7bdc'); g.addColorStop(1, '#0d2f6b');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse(x - r * 0.75 + hash(i, 61) * r * 1.1, y - r * 0.8 + hash(i, 62) * r * 1.6, r * (0.18 + hash(i, 63) * 0.3), r * (0.05 + hash(i, 64) * 0.07), -0.4 + hash(i, 65) * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- Terreno ---

export interface Moonscape {
  /** Altura en pantalla del suelo medido bajo la columna x. */
  groundAt: (x: number) => number;
  /** Luz (0 a 1) del suelo en la columna x. */
  lightAt: (x: number) => number;
  /** Posición a lo largo de la órbita (m más allá del sitio) de la columna x. */
  uAt: (x: number) => number;
  xOf: (u: number) => number;
}

function ridge(
  ctx: CanvasRenderingContext2D, w: number, h: number, hf: (u: number) => number,
  scale: number, u0: number, baseY: number, ref: number, n: number, dim: number, rim: string,
) {
  const g = ctx.createLinearGradient(-20, 0, w + 20, 0);
  ctx.beginPath();
  for (let j = 0; j <= n; j++) {
    const x = -20 + ((w + 40) * j) / n;
    const d = (x - w / 2) / scale;
    const y = baseY - (hf(u0 + d) - ref) * scale + ((d * d) / (2 * R_MOON)) * scale;
    if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    g.addColorStop(j / n, shade(light(hf, u0 + d), dim));
  }
  ctx.strokeStyle = rim; ctx.lineWidth = 1; ctx.stroke();
  ctx.lineTo(w + 20, h + 20); ctx.lineTo(-20, h + 20); ctx.closePath();
  ctx.fillStyle = g; ctx.fill();
}

function crater(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, a: number, lit: number) {
  const ry = Math.max(0.5, rx * 0.3);
  ctx.fillStyle = `rgba(236, 229, 214, ${0.2 * a * lit})`;
  ctx.beginPath(); ctx.ellipse(x - rx * 0.1, y - ry * 0.12, rx * 1.14, ry * 1.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(5, 7, 12, ${0.72 * a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  // El Sol entra por la izquierda: ilumina la pared interior derecha.
  ctx.fillStyle = `rgba(214, 206, 190, ${0.5 * a * lit})`;
  ctx.beginPath(); ctx.ellipse(x + rx * 0.34, y + ry * 0.1, rx * 0.6, ry * 0.72, 0, 0, Math.PI * 2); ctx.fill();
}

/** Tamaños de cráter (m) de cada nivel de detalle: aparecen a medida que la cámara se acerca. */
const OCTAVES = [1.5, 6, 25, 100, 400, 1600, 6000];

/**
 * Dibuja el paisaje. u0: posición de la nave (m más allá del sitio); ppm: píxeles por metro
 * del suelo cercano; groundY: altura en pantalla del suelo bajo la nave.
 */
export function drawMoonscape(ctx: CanvasRenderingContext2D, w: number, h: number, u0: number, ppm: number, groundY: number): Moonscape {
  const e0 = elev(u0);
  const k = h / 900;

  // Sol rasante: asoma detrás de los cordones, a la izquierda.
  const sx = w * 0.07, sy = groundY - 70 * k;
  const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, h * 0.75);
  glow.addColorStop(0, 'rgba(255, 252, 240, 1)'); glow.addColorStop(0.035, 'rgba(255, 244, 214, 0.85)');
  glow.addColorStop(0.12, 'rgba(255, 226, 170, 0.22)'); glow.addColorStop(0.45, 'rgba(255, 210, 150, 0.05)'); glow.addColorStop(1, 'rgba(255, 210, 150, 0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  const streak = ctx.createLinearGradient(0, 0, w * 0.8, 0);
  streak.addColorStop(0, 'rgba(255, 240, 210, 0.5)'); streak.addColorStop(1, 'rgba(255, 240, 210, 0)');
  ctx.fillStyle = streak; ctx.fillRect(0, sy - 1.2, w * 0.8, 2.4);

  // Cordones lejanos: se mueven más lento que el suelo cercano y dan profundidad.
  for (let i = 5; i >= 1; i--) {
    const b = Math.min(1, 0.3 * i);
    const shift = i * 19300;
    const hf = (u: number) => (1 - b) * elev(u) + b * elev(u + shift);
    ridge(ctx, w, h, hf, Math.min(ppm, 0.05 / (1 + 0.5 * i)), u0, groundY - (8 + 9 * i) * k, e0, 110, 1 - 0.09 * i, 'rgba(255, 246, 228, 0.16)');
  }

  // Suelo cercano: el perfil medido que usan el radar y el contacto.
  const n = 240;
  const xs: number[] = [], ys: number[] = [], ls: number[] = [];
  const g = ctx.createLinearGradient(-20, 0, w + 20, 0);
  for (let j = 0; j <= n; j++) {
    const x = -20 + ((w + 40) * j) / n;
    const d = (x - w / 2) / ppm;
    const L = light(elev, u0 + d);
    xs.push(x); ys.push(groundY - (elev(u0 + d) - e0) * ppm + ((d * d) / (2 * R_MOON)) * ppm); ls.push(L);
    g.addColorStop(j / n, shade(L));
  }
  const at = (arr: number[], x: number) => {
    const f = Math.max(0, Math.min(n - 1e-6, ((x + 20) / (w + 40)) * n));
    const i = Math.floor(f);
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  };
  const trace = () => { ctx.beginPath(); xs.forEach((x, j) => (j === 0 ? ctx.moveTo(x, ys[j]) : ctx.lineTo(x, ys[j]))); };
  trace(); ctx.lineTo(w + 20, h + 20); ctx.lineTo(-20, h + 20); ctx.closePath();
  ctx.fillStyle = g; ctx.fill();

  ctx.save();
  ctx.clip();
  // Hacia la cámara el suelo se oscurece.
  const depth = ctx.createLinearGradient(0, groundY - 30, 0, h);
  depth.addColorStop(0, 'rgba(0, 0, 0, 0)'); depth.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
  ctx.fillStyle = depth; ctx.fillRect(0, 0, w, h);
  // Cráteres en varios niveles de detalle, fijos al terreno.
  const band = h - groundY;
  for (let o = 0; o < OCTAVES.length; o++) {
    const S = OCTAVES[o], px = S * ppm;
    if (px < 2.5 || px > 520) continue;
    const a = Math.min(1, (px - 2.5) / 4) * Math.min(1, (520 - px) / 260);
    const cw = S * 2.6;
    const i0 = Math.floor((u0 - (w / 2 + px * 2) / ppm) / cw), i1 = Math.ceil((u0 + (w / 2 + px * 2) / ppm) / cw);
    for (let i = i0; i <= i1; i++) {
      if (hash(i, o * 7 + 1) > 0.72) continue;
      const u = (i + 0.2 + 0.6 * hash(i, o * 7 + 2)) * cw;
      const x = w / 2 + (u - u0) * ppm;
      const d = hash(i, o * 7 + 3);
      const rx = px * (0.25 + 0.5 * hash(i, o * 7 + 4)) * (0.6 + 0.8 * d);
      crater(ctx, x, at(ys, x) + rx * 0.4 + 4 + d * d * band * 0.95, rx, a, Math.min(1, at(ls, x) * 2));
    }
  }
  ctx.restore();
  trace(); ctx.strokeStyle = 'rgba(255, 248, 232, 0.5)'; ctx.lineWidth = 1.2; ctx.stroke();

  return { groundAt: (x) => at(ys, x), lightAt: (x) => at(ls, x), uAt: (x) => u0 + (x - w / 2) / ppm, xOf: (u) => w / 2 + (u - u0) * ppm };
}

/** Mapa de peligros del radar: suelo libre en verde, rocas en rojo, y las rocas mismas de cerca. */
export function drawHazards(ctx: CanvasRenderingContext2D, w: number, m: Moonscape, ppm: number, alt: number, time: number) {
  const cell = PAD * ppm;
  if (alt >= ASSIST_ALT || cell < 2) return;
  const a = Math.min(1, (ASSIST_ALT - alt) / 300) * (0.75 + 0.25 * Math.sin(time * 5));
  const i0 = Math.floor(m.uAt(-10) / PAD), i1 = Math.ceil(m.uAt(w + 10) / PAD);
  for (let i = i0; i <= i1; i++) {
    const bad = rough(i * PAD);
    const x0 = m.xOf((i - 0.5) * PAD), x1 = m.xOf((i + 0.5) * PAD);
    if (bad && cell > 14) {
      // Rocas: bloques oscuros con la cara izquierda iluminada.
      for (let r = 0; r < 5; r++) {
        const x = x0 + (0.1 + 0.8 * hash(i, 80 + r)) * (x1 - x0);
        const size = Math.max(2, (0.7 + 1.9 * hash(i, 90 + r)) * ppm);
        const y = m.groundAt(x) + 1 + hash(i, 100 + r) * size * 0.8;
        ctx.fillStyle = '#17191f';
        ctx.beginPath(); ctx.moveTo(x - size * 0.55, y); ctx.lineTo(x - size * 0.35, y - size * 0.62); ctx.lineTo(x + size * 0.2, y - size * 0.75); ctx.lineTo(x + size * 0.6, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(232, 224, 208, 0.85)';
        ctx.beginPath(); ctx.moveTo(x - size * 0.55, y); ctx.lineTo(x - size * 0.35, y - size * 0.62); ctx.lineTo(x - size * 0.05, y - size * 0.7); ctx.lineTo(x - size * 0.2, y); ctx.closePath(); ctx.fill();
      }
    }
    ctx.strokeStyle = bad ? `rgba(255, 96, 78, ${0.9 * a})` : `rgba(90, 220, 160, ${0.9 * a})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x0 + (cell > 6 ? 1 : 0), m.groundAt(x0) + 3); ctx.lineTo(x1 - (cell > 6 ? 1 : 0), m.groundAt(x1) + 3); ctx.stroke();
  }
}

/** Punto de alunizaje designado: una mira sobre el suelo. */
export function drawDesignator(ctx: CanvasRenderingContext2D, x: number, y: number, bad: boolean, time: number) {
  const c = bad ? `rgba(255, 110, 90, ${0.65 + 0.35 * Math.sin(time * 9)})` : '#5adca0';
  const bob = Math.sin(time * 4) * 2;
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 16, y - 12); ctx.lineTo(x - 16, y - 2); ctx.lineTo(x - 9, y - 2); ctx.moveTo(x + 16, y - 12); ctx.lineTo(x + 16, y - 2); ctx.lineTo(x + 9, y - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 14 + bob); ctx.lineTo(x - 6, y - 24 + bob); ctx.lineTo(x + 6, y - 24 + bob); ctx.closePath(); ctx.fill();
  ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(bad ? 'BOULDERS · ← → to move' : 'Landing point', x, y - 32 + bob);
}

/** Polvo que el motor barre a ras del suelo y resplandor del chorro sobre el regolito. */
export function drawDust(ctx: CanvasRenderingContext2D, x: number, y: number, alt: number, throttle: number, time: number) {
  const k = throttle * Math.max(0, 1 - alt / 70);
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, 150);
  g.addColorStop(0, `rgba(255, 214, 160, ${0.5 * k})`); g.addColorStop(1, 'rgba(255, 214, 160, 0)');
  ctx.fillStyle = g;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.16); ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const p = (hash(i, 31) + time * (0.9 + hash(i, 32) * 1.6)) % 1;
    const side = i % 2 ? 1 : -1;
    const reach = (90 + 420 * k) * (0.4 + 0.6 * hash(i, 33));
    const px = x + side * (10 + p * reach);
    const py = y - 1 - hash(i, 34) * 26 * p;
    ctx.strokeStyle = `rgba(226, 220, 206, ${(1 - p) * 0.5 * k})`;
    ctx.lineWidth = 1 + hash(i, 35) * 2.5;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + side * (10 + 34 * p), py - 1.5 * p); ctx.stroke();
  }
  ctx.restore();
}

/** Choque: destello, onda de polvo y escombros. age en segundos desde el impacto. */
export function drawCrash(ctx: CanvasRenderingContext2D, x: number, y: number, age: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const flash = Math.max(0, 1 - age / 0.5);
  if (flash > 0) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 260);
    g.addColorStop(0, `rgba(255, 244, 214, ${flash})`); g.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 260, 0, Math.PI * 2); ctx.fill();
  }
  const fade = Math.max(0, 1 - age / 6);
  for (let i = 0; i < 46; i++) {
    const ang = -Math.PI * (0.06 + 0.88 * hash(i, 51));
    const v = 60 + 220 * hash(i, 52);
    // Sin aire los escombros siguen parábolas limpias, con la gravedad lunar.
    const px = x + Math.cos(ang) * v * age, py = y + Math.sin(ang) * v * age + 0.5 * 1.62 * 12 * age * age;
    if (py > y + 4) continue;
    ctx.fillStyle = `rgba(232, 222, 204, ${0.8 * fade})`;
    ctx.fillRect(px, py, 2 + hash(i, 53) * 3, 2 + hash(i, 54) * 3);
  }
  ctx.fillStyle = `rgba(200, 194, 180, ${0.2 * fade})`;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.3); ctx.beginPath(); ctx.arc(0, 0, 40 + 150 * Math.min(age, 4), Math.PI, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.restore();
}
