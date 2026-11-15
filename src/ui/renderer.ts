import { ATM_TOP, OMEGA, RE, SITE_ANGLE0, SUN_ANGLE } from '../sim/constants';
import { MATERIALS } from '../sim/catalog';
import {
  Flight, Vec, altitude, groundVelocity, linkStatus, orbitOf, payloadOnly, stationPositions,
} from '../sim/flight';
import { drawLooseStage, drawVehicle, vehicleHeight } from './vehicleDraw';

import { Camera, centerBlend } from './flightCamera';
export type { Camera } from './flightCamera';

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number }

const STARS = Array.from({ length: 520 }, (_, i) => {
  // Generador determinista: el cielo es el mismo en cada partida.
  const a = Math.sin(i * 127.1) * 43758.5453, b = Math.sin(i * 311.7) * 12543.123, c = Math.sin(i * 74.7) * 9154.77;
  return { a: (a - Math.floor(a)) * Math.PI * 2, d: Math.sqrt(b - Math.floor(b)), s: 0.4 + (c - Math.floor(c)) * 1.4 };
});

const LAND = [
  { a: 0.0, w: 0.5, r: 0.62, s: 0.3 }, { a: 1.3, w: 0.7, r: 0.5, s: 0.36 }, { a: 2.6, w: 0.4, r: 0.72, s: 0.22 },
  { a: 3.7, w: 0.6, r: 0.55, s: 0.33 }, { a: 4.9, w: 0.45, r: 0.7, s: 0.24 }, { a: 5.6, w: 0.3, r: 0.35, s: 0.2 },
];

const smooth = (x: number, a: number, b: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function fitZoom(f: Flight, w: number, h: number): number {
  const o = orbitOf(f.r, f.v);
  const rm = Math.hypot(f.r.x, f.r.y);
  const far = Math.min(Math.max(rm, o.e < 1 && isFinite(o.ap) ? o.ap : rm * 1.5, RE * 1.08), RE * 60);
  return (far * 2.5) / Math.min(w, h);
}

export function render(
  ctx: CanvasRenderingContext2D, w: number, h: number, f: Flight, cam: Camera, time: number, particles: Particle[],
  target?: Vec, clean = false,
) {
  const zoom = cam.zoom;
  const lz = Math.log10(zoom);
  const rm = Math.hypot(f.r.x, f.r.y);
  const alt = rm - RE;
  const phi = Math.atan2(f.r.y, f.r.x);
  const tRot = smooth(lz, 2.2, 3.6); // 0 = vista local, 1 = mapa
  const tCen = centerBlend(zoom, rm, w, h);
  const beta = cam.rotation ?? Math.PI / 2 - phi;
  const cb = Math.cos(beta), sb = Math.sin(beta);
  const camX = f.r.x * (1 - tCen), camY = f.r.y * (1 - tCen);
  const cx = w / 2, cy = h * (0.5 + 0.06 * (1 - tRot));
  const ws = (p: Vec): [number, number] => {
    const dx = p.x - camX, dy = p.y - camY;
    return [cx + (dx * cb - dy * sb) / zoom, cy - (dx * sb + dy * cb) / zoom];
  };
  const sunX = Math.cos(SUN_ANGLE), sunY = Math.sin(SUN_ANGLE);
  const day = Math.max(0.06, Math.min(1, ((f.r.x * sunX + f.r.y * sunY) / rm) * 2.5 + 0.35));

  // --- Espacio y estrellas ---
  ctx.fillStyle = '#03050b';
  ctx.fillRect(0, 0, w, h);
  const skyA = Math.exp(-Math.max(alt, 0) / 13000) * (1 - tRot) * day;
  const R = Math.hypot(w, h) / 2;
  ctx.fillStyle = '#fff';
  for (const s of STARS) {
    const x = cx + R * s.d * Math.cos(s.a - beta), y = h / 2 - R * s.d * Math.sin(s.a - beta);
    ctx.globalAlpha = Math.max(0, (0.35 + 0.5 * (s.s / 1.8)) * (1 - skyA * 1.6));
    ctx.fillRect(x, y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  // --- Cielo dentro de la atmósfera ---
  if (skyA > 0.01) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(24,70,150,${skyA})`);
    g.addColorStop(1, `rgba(150,200,255,${skyA})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // --- Órbita prevista (antes de la Tierra para que la tape) ---
  const o = orbitOf(f.r, f.v);
  const showOrbit = !clean && !f.landed && zoom > 40 && Math.hypot(f.v.x, f.v.y) > 300;
  if (showOrbit && o.p > 0) {
    ctx.beginPath();
    let pen = false;
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const nu = (i / N) * Math.PI * 2;
      const den = 1 + o.e * Math.cos(nu);
      if (den <= 0.02) { pen = false; continue; }
      const rad = o.p / den;
      if (rad > RE * 80) { pen = false; continue; }
      const [x, y] = ws({ x: rad * Math.cos(o.argPe + nu), y: rad * Math.sin(o.argPe + nu) });
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      pen = true;
    }
    const stable = o.e < 1 && o.pe - RE > ATM_TOP;
    ctx.strokeStyle = stable ? 'rgba(90,220,160,0.9)' : 'rgba(255,190,90,0.85)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash(stable ? [] : [7, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- Tierra ---
  const Rpx = RE / zoom;
  const [ex, ey] = ws({ x: 0, y: 0 });
  if (Rpx < 9000) {
    // Disco completo
    const halo = ctx.createRadialGradient(ex, ey, Rpx * 0.985, ex, ey, Rpx + Math.max(6, (ATM_TOP * 0.9) / zoom));
    halo.addColorStop(0, 'rgba(110,180,255,0.55)');
    halo.addColorStop(1, 'rgba(110,180,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(ex, ey, Rpx + Math.max(6, (ATM_TOP * 0.9) / zoom), 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, ey, Rpx, 0, Math.PI * 2);
    ctx.clip();
    const oc = ctx.createRadialGradient(ex - Rpx * 0.2, ey - Rpx * 0.2, Rpx * 0.1, ex, ey, Rpx);
    oc.addColorStop(0, '#2c6fb5');
    oc.addColorStop(1, '#123a6b');
    ctx.fillStyle = oc;
    ctx.fillRect(ex - Rpx, ey - Rpx, Rpx * 2, Rpx * 2);
    ctx.fillStyle = '#3f7d4f';
    for (const l of LAND) {
      const a = SITE_ANGLE0 + l.a - OMEGA * f.t;
      const [lx, ly] = ws({ x: RE * l.r * Math.cos(a), y: RE * l.r * Math.sin(a) });
      ctx.beginPath();
      ctx.ellipse(lx, ly, Rpx * l.s, Rpx * l.s * l.w, -(a + beta), 0, Math.PI * 2);
      ctx.fill();
    }
    // Lado nocturno
    const sa = -(SUN_ANGLE + beta);
    ctx.translate(ex, ey);
    ctx.rotate(sa);
    const ng = ctx.createLinearGradient(-Rpx * 0.18, 0, Rpx * 0.18, 0);
    ng.addColorStop(0, 'rgba(2,6,18,0.78)');
    ng.addColorStop(1, 'rgba(2,6,18,0)');
    ctx.fillStyle = ng;
    ctx.fillRect(-Rpx, -Rpx, Rpx * 2, Rpx * 2);
    ctx.restore();
  } else {
    // Cerca: solo se dibuja el arco de superficie visible.
    const diag = Math.hypot(w, h) * zoom;
    const span = Math.max(0.0004, Math.min(Math.PI, (diag * 1.6 + Math.sqrt(Math.max(0, 2 * RE * alt))) / RE));
    const camPhi = Math.atan2(camY, camX);
    const N = 96;
    const ring = (radius: number, inner: number, fill: string | CanvasGradient) => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = camPhi - span + (2 * span * i) / N;
        const [x, y] = ws({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let i = N; i >= 0; i--) {
        const a = camPhi - span + (2 * span * i) / N;
        const [x, y] = ws({ x: inner * Math.cos(a), y: inner * Math.sin(a) });
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    // Capas de atmósfera vistas desde fuera
    if (alt > 8000) {
      const layers = [[ATM_TOP * 0.75, 0.1], [60e3, 0.14], [30e3, 0.2], [12e3, 0.28]] as const;
      for (const [top, a] of layers) ring(RE + top, RE, `rgba(120,185,255,${a * day * (1 - skyA)})`);
    }
    const depth = Math.min(RE * 0.98, diag * 2.2);
    const k = 0.35 + 0.65 * day;
    ring(RE, RE - depth, `rgb(${Math.round(46 * k)},${Math.round(92 * k)},${Math.round(60 * k)})`);
    ring(RE, RE - Math.min(depth, Math.max(3 * zoom, 1.2)), `rgb(${Math.round(88 * k)},${Math.round(140 * k)},${Math.round(84 * k)})`);
  }

  // --- Plataforma de lanzamiento ---
  const siteA = SITE_ANGLE0 - OMEGA * f.t;
  const site = { x: RE * Math.cos(siteA), y: RE * Math.sin(siteA) };
  if (zoom < 60) {
    const [px, py] = ws(site);
    if (px > -400 && px < w + 400 && py > -400 && py < h + 400) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI / 2 - (siteA + beta));
      ctx.scale(1 / zoom, 1 / zoom);
      const vh = vehicleHeight(f.design, 0, f.design.fairing && f.design.core !== 'capsula');
      ctx.fillStyle = '#5c626c';
      ctx.fillRect(-14, -1.2, 28, 1.2);
      ctx.fillStyle = '#7a818c';
      ctx.fillRect(-9, -vh - 4, 1.6, vh + 4);
      ctx.fillStyle = '#b8402a';
      for (let y = 4; y < vh + 4; y += 8) ctx.fillRect(-9, -y - 1.2, 1.6, 1.2);
      ctx.fillStyle = '#7a818c';
      ctx.fillRect(-9, -vh * 0.7, 6.5, 0.5);
      ctx.restore();
    }
  }

  // --- Estaciones terrestres y enlace ---
  if (Rpx < 9000) {
    const link = linkStatus(f);
    stationPositions(f.t).forEach((s, i) => {
      const [x, y] = ws(s);
      ctx.fillStyle = link && link.index === i ? '#5adca0' : '#9aa7b8';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (link && link.index === i && f.transmitting) {
        const [vx, vy] = ws(f.r);
        ctx.strokeStyle = 'rgba(90,220,160,0.8)';
        ctx.setLineDash([3, 5]);
        ctx.lineDashOffset = -time * 30;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(vx, vy); ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    // Objetivo de observación de la misión: un punto naranja con un anillo que late.
    if (target) {
      const [x, y] = ws(target);
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,154,60,0.7)';
      ctx.beginPath(); ctx.arc(x, y, 8 + 3 * Math.sin(time * 3), 0, Math.PI * 2); ctx.stroke();
    }
  }

  // --- Humo ---
  for (const p of particles) {
    const [x, y] = ws(p);
    const a = p.life / p.max;
    ctx.fillStyle = `rgba(225,225,230,${0.32 * a})`;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, (p.size * (1.6 - a)) / zoom), 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Etapas descartadas ---
  const matColor = MATERIALS[f.design.material].color;
  for (const b of f.debris) {
    const [x, y] = ws(b.r);
    if (x < -200 || x > w + 200 || y < -200 || y > h + 200) continue;
    if (zoom < 3) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 2 - (b.angle + beta));
      ctx.scale(1 / zoom, 1 / zoom);
      drawLooseStage(ctx, b.stage, matColor);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(200,205,215,0.8)';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  // --- Nave ---
  const [vx, vy] = ws(f.r);
  const vHeight = vehicleHeight(f.design, f.stageIdx, f.fairingOn);
  const destroyed = f.ended && f.ended !== 'aterrizaje' && f.ended !== 'usuario';
  if (destroyed) {
    const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, 46);
    g.addColorStop(0, 'rgba(255,240,200,0.95)');
    g.addColorStop(0.4, 'rgba(255,140,50,0.7)');
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(vx, vy, 46, 0, Math.PI * 2); ctx.fill();
  } else if (vHeight / zoom > 14) {
    ctx.save();
    ctx.translate(vx, vy);
    ctx.rotate(Math.PI / 2 - (f.heading + beta));
    ctx.scale(1 / zoom, 1 / zoom);
    // En tierra la base del cohete descansa sobre la plataforma.
    ctx.translate(0, -vHeight / 2 - (f.landed && f.stats.liftoffT === null ? 1.2 : 0));
    const vac = Math.min(1, Math.max(0, alt / 45e3));
    drawVehicle(ctx, f.design, {
      fromStage: f.stageIdx, fairingOn: f.fairingOn, deployed: f.deployed, chute: f.chuteOpen,
      flame: f.now.thrust > 0 ? f.throttle : 0, vac, time,
      fill: f.stages.map((s) => (s.propMax > 0 ? s.prop / s.propMax : 0)),
    });
    ctx.restore();
  } else {
    // Icono cuando la nave es demasiado pequeña para verse.
    const ang = -(f.heading + beta);
    ctx.save();
    ctx.translate(vx, vy);
    if (f.now.thrust > 0) {
      ctx.fillStyle = 'rgba(255,170,60,0.9)';
      ctx.beginPath();
      ctx.arc(-Math.cos(ang) * 9, -Math.sin(ang) * 9, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(ang);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(-6, 5); ctx.lineTo(-3, 0); ctx.lineTo(-6, -5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // --- Marcadores de apoapsis y periapsis ---
  if (showOrbit && o.e < 1 && o.p > 0) {
    // Path ahead of the craft, densely sampled and drawn over the Earth: on a low hop the whole
    // arc above ground is too short for the full-orbit line above, which then hides underground.
    // Before apoapsis it runs to the apoapsis; after it, down to the ground (or to periapsis).
    {
      ctx.beginPath();
      pathAhead(f.r, f.v, o).forEach((pt, i) => {
        const [x, y] = ws(pt);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      const stable = o.pe - RE > ATM_TOP;
      ctx.strokeStyle = stable ? 'rgba(90,220,160,0.9)' : 'rgba(255,190,90,0.85)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash(stable ? [] : [7, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.font = '600 12px ui-monospace, Menlo, monospace';
    const mark = (rad: number, ang: number, label: string, color: string) => {
      if (rad < RE) return;
      const [x, y] = ws({ x: rad * Math.cos(ang), y: rad * Math.sin(ang) });
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(3,5,11,0.75)';
      const tw = ctx.measureText(label).width;
      ctx.fillRect(x + 8, y - 9, tw + 8, 18);
      ctx.fillStyle = color;
      ctx.fillText(label, x + 12, y + 4);
    };
    mark(o.ap, o.argPe + Math.PI, `Ap ${apsisAlt(o.ap - RE)}`, '#7fc8ff');
    mark(o.pe, o.argPe, `Pe ${apsisAlt(o.pe - RE)}`, '#ffd27f');
  }

  if (!clean) drawNavball(ctx, w, h, f);
}

/**
 * Points of the predicted path ahead of the craft, in world coordinates: to the apoapsis while
 * rising, then down to the ground (or to periapsis if it never reaches the ground).
 */
export function pathAhead(
  r: { x: number; y: number }, v: { x: number; y: number }, o: { p: number; e: number; argPe: number }, K = 160,
): { x: number; y: number }[] {
  const thC = Math.atan2(r.y, r.x);
  const dir = r.x * v.y - r.y * v.x >= 0 ? 1 : -1;
  const rising = r.x * v.x + r.y * v.y > 0;
  const thEnd = rising ? o.argPe + Math.PI : o.argPe;
  const TAU = Math.PI * 2;
  let span = (((dir * (thEnd - thC)) % TAU) + TAU) % TAU;
  const radAt = (s: number) => o.p / (1 + o.e * Math.cos(thC + dir * s - o.argPe));
  // Falling, the radius only shrinks on the way to periapsis: find where it meets the ground.
  if (!rising && radAt(span) < RE) {
    let lo = 0, hi = span;
    for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (radAt(mid) >= RE) lo = mid; else hi = mid; }
    span = lo;
  }
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= K; i++) {
    const s = span * (i / K), rad = radAt(s), th = thC + dir * s;
    if (!(rad > 0) || rad > RE * 80) break;
    pts.push({ x: rad * Math.cos(th), y: rad * Math.sin(th) });
  }
  return pts;
}

/** Apsis altitude for the map labels: meters below 1 km, one decimal below 10 km, whole km above. */
export function apsisAlt(m: number): string {
  if (m < 995) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  if (m < 10e3) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

/** Indicador de actitud: morro, prograda y retrógrada respecto al horizonte local. */
function drawNavball(ctx: CanvasRenderingContext2D, w: number, h: number, f: Flight) {
  const R = 58, x0 = w / 2, y0 = h - R - 18;
  const rm = Math.hypot(f.r.x, f.r.y);
  const ux = f.r.x / rm, uy = f.r.y / rm, exx = uy, exy = -ux;
  const surface = altitude(f) < 45e3;
  const air = groundVelocity(f.r);
  const vx = f.v.x - (surface ? air.x : 0), vy = f.v.y - (surface ? air.y : 0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#1d4f8f'; ctx.fillRect(-R, -R, 2 * R, R);
  ctx.fillStyle = '#6b4a2b'; ctx.fillRect(-R, 0, 2 * R, R);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
  for (const deg of [30, 60, 90, 120, 150]) {
    const a = (deg * Math.PI) / 180;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * (R - 8), -Math.sin(a) * (R - 8)); ctx.lineTo(Math.cos(a) * R, -Math.sin(a) * R); ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.translate(x0, y0);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  const speed = Math.hypot(vx, vy);
  if (speed > 2 && !f.landed) {
    const pa = Math.atan2(vx * ux + vy * uy, vx * exx + vy * exy);
    const marker = (a: number, color: string, cross: boolean) => {
      const mx = Math.cos(a) * (R - 13), my = -Math.sin(a) * (R - 13);
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      if (cross) { ctx.moveTo(mx - 4, my - 4); ctx.lineTo(mx + 4, my + 4); ctx.moveTo(mx + 4, my - 4); ctx.lineTo(mx - 4, my + 4); }
      else { ctx.moveTo(mx, my - 6); ctx.lineTo(mx, my - 11); ctx.moveTo(mx - 6, my); ctx.lineTo(mx - 11, my); ctx.moveTo(mx + 6, my); ctx.lineTo(mx + 11, my); }
      ctx.stroke();
    };
    marker(pa, '#b6f36a', false);
    marker(pa + Math.PI, '#ff7a6b', true);
  }
  const hx = Math.cos(f.heading), hy = Math.sin(f.heading);
  const ha = Math.atan2(hx * ux + hy * uy, hx * exx + hy * exy);
  ctx.rotate(-ha);
  ctx.fillStyle = '#ffb347'; ctx.strokeStyle = '#1a1206'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(R - 20, 0); ctx.lineTo(-14, 7); ctx.lineTo(-8, 0); ctx.lineTo(-14, -7); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.font = '600 10px ui-monospace, Menlo, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'center';
  ctx.fillText(surface ? 'REF. SURFACE' : 'REF. ORBIT', x0, y0 - R - 6);
  ctx.textAlign = 'left';
  void payloadOnly;
}
