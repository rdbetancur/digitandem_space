import { CORES, MATERIALS, TANKS } from '../sim/catalog';
import { Design, StageDesign, hasShield, stageProp } from '../sim/vehicle';

export function tankHeight(s: StageDesign): number {
  const d = TANKS[s.tank].diameter;
  return Math.max(1, stageProp(s) / (900 * Math.PI * (d / 2) ** 2));
}

export function engineHeight(s: StageDesign): number {
  return Math.max(0.4, Math.min(1.6, TANKS[s.tank].diameter * 0.45));
}

function fairingSize(d: Design, fromStage: number): { w: number; h: number } {
  const core = CORES[d.core];
  const top = d.stages.length > fromStage ? TANKS[d.stages[d.stages.length - 1].tank].diameter : core.width;
  const w = Math.max(core.width * 1.3, top);
  return { w, h: core.height + w * 1.3 };
}

/** Altura total del vehículo en metros con la configuración dada. */
export function vehicleHeight(d: Design, fromStage: number, fairingOn: boolean): number {
  let h = 0;
  for (let i = fromStage; i < d.stages.length; i++) h += tankHeight(d.stages[i]) + engineHeight(d.stages[i]);
  h += fairingOn ? fairingSize(d, fromStage).h : CORES[d.core].height;
  return h;
}

export interface DrawOpts {
  fromStage: number;
  fairingOn: boolean;
  deployed: boolean;
  chute: boolean;
  /** Potencia del motor activo, 0 a 1. */
  flame: number;
  /** 0 a nivel del mar, 1 en vacío: la pluma se expande al bajar la presión. */
  vac: number;
  time: number;
  /** Fracción de propelente por etapa, para dibujar el nivel. */
  fill?: number[];
}

function drawStage(
  ctx: CanvasRenderingContext2D, s: StageDesign, color: string, yBottom: number, fill: number,
  flame: number, vac: number, time: number, dark: boolean,
): number {
  const d = TANKS[s.tank].diameter;
  const eh = engineHeight(s);
  const th = tankHeight(s);
  const bells = Math.min(s.engines, 5);
  const bw = Math.min(d / bells, d * 0.55) * 0.82;
  // Llama
  if (flame > 0) {
    const flick = 0.9 + 0.1 * Math.sin(time * 47) + 0.05 * Math.sin(time * 113);
    const len = d * (2.2 + 3.2 * flame) * (1 + vac * 0.9) * flick;
    const wide = d * (0.45 + vac * 1.1);
    const g = ctx.createLinearGradient(0, yBottom, 0, yBottom + len);
    g.addColorStop(0, `rgba(255,255,240,${0.95 - vac * 0.35})`);
    g.addColorStop(0.18, `rgba(255,214,110,${0.85 - vac * 0.4})`);
    g.addColorStop(0.55, `rgba(255,120,40,${0.5 - vac * 0.3})`);
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-d * 0.32, yBottom);
    ctx.quadraticCurveTo(-wide, yBottom + len * 0.45, 0, yBottom + len);
    ctx.quadraticCurveTo(wide, yBottom + len * 0.45, d * 0.32, yBottom);
    ctx.closePath();
    ctx.fill();
  }
  // Toberas
  ctx.fillStyle = '#3a3f48';
  for (let i = 0; i < bells; i++) {
    const cx = (i - (bells - 1) / 2) * (d / bells);
    ctx.beginPath();
    ctx.moveTo(cx - bw * 0.28, yBottom - eh);
    ctx.lineTo(cx + bw * 0.28, yBottom - eh);
    ctx.lineTo(cx + bw * 0.5, yBottom);
    ctx.lineTo(cx - bw * 0.5, yBottom);
    ctx.closePath();
    ctx.fill();
  }
  // Depósito
  const y0 = yBottom - eh - th;
  ctx.fillStyle = color;
  ctx.fillRect(-d / 2, y0, d, th);
  // Sombra lateral para dar volumen
  const sh = ctx.createLinearGradient(-d / 2, 0, d / 2, 0);
  sh.addColorStop(0, 'rgba(0,0,0,0.28)');
  sh.addColorStop(0.35, 'rgba(255,255,255,0.10)');
  sh.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = sh;
  ctx.fillRect(-d / 2, y0, d, th);
  // Nivel de propelente
  if (fill < 1) {
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(10,20,40,0.16)';
    ctx.fillRect(-d / 2, y0, d, th * (1 - fill));
  }
  // Franjas
  ctx.fillStyle = dark ? '#aab2bf' : '#222831';
  ctx.fillRect(-d / 2, y0, d, Math.min(0.18, th * 0.05));
  ctx.fillRect(-d / 2, yBottom - eh - Math.min(0.25, th * 0.06), d, Math.min(0.25, th * 0.06));
  return y0;
}

/**
 * Dibuja el vehículo centrado en el origen, con el morro hacia -y.
 * Las unidades del contexto deben ser metros.
 */
export function drawVehicle(ctx: CanvasRenderingContext2D, d: Design, o: DrawOpts) {
  const total = vehicleHeight(d, o.fromStage, o.fairingOn);
  const mat = MATERIALS[d.material];
  const dark = d.material === 'carbono';
  const core = CORES[d.core];
  let y = total / 2;
  for (let i = o.fromStage; i < d.stages.length; i++) {
    y = drawStage(ctx, d.stages[i], mat.color, y, o.fill ? o.fill[i] ?? 1 : 1, i === o.fromStage ? o.flame : 0, o.vac, o.time, dark);
  }
  const payloadOnly = o.fromStage >= d.stages.length;
  if (o.fairingOn) {
    const fz = fairingSize(d, o.fromStage);
    ctx.fillStyle = '#eef1f5';
    ctx.beginPath();
    ctx.moveTo(-fz.w / 2, y);
    ctx.lineTo(-fz.w / 2, y - fz.h * 0.45);
    ctx.quadraticCurveTo(-fz.w / 2, y - fz.h * 0.85, 0, y - fz.h);
    ctx.quadraticCurveTo(fz.w / 2, y - fz.h * 0.85, fz.w / 2, y - fz.h * 0.45);
    ctx.lineTo(fz.w / 2, y);
    ctx.closePath();
    ctx.fill();
    const sh = ctx.createLinearGradient(-fz.w / 2, 0, fz.w / 2, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0.25)');
    sh.addColorStop(0.4, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = sh;
    ctx.fill();
    ctx.fillStyle = '#e4572e';
    ctx.fillRect(-fz.w / 2, y - 0.14, fz.w, 0.14);
    return;
  }
  const w = core.width, h = core.height;
  // Paneles y antena desplegados
  if (o.deployed) {
    const pw = Math.max(1.2, w * 1.6) * (1 + d.panels * 0.35);
    ctx.fillStyle = '#1d3f8f';
    ctx.fillRect(-w / 2 - pw, y - h * 0.62, pw, h * 0.3);
    ctx.fillRect(w / 2, y - h * 0.62, pw, h * 0.3);
    ctx.strokeStyle = 'rgba(150,190,255,0.7)';
    ctx.lineWidth = 0.03;
    for (let k = 1; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 - (pw * k) / 4, y - h * 0.62); ctx.lineTo(-w / 2 - (pw * k) / 4, y - h * 0.32);
      ctx.moveTo(w / 2 + (pw * k) / 4, y - h * 0.62); ctx.lineTo(w / 2 + (pw * k) / 4, y - h * 0.32);
      ctx.stroke();
    }
    if (d.antenna !== 'ninguna') {
      ctx.strokeStyle = '#d9dee6';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(0, y - h); ctx.lineTo(0, y - h - h * 0.5);
      ctx.stroke();
      if (d.antenna === 'alta') {
        ctx.fillStyle = '#d9dee6';
        ctx.beginPath();
        ctx.ellipse(0, y - h - h * 0.5, w * 0.45, w * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (d.core === 'capsula') {
    ctx.fillStyle = '#cfd5dd';
    ctx.beginPath();
    ctx.moveTo(-w / 2, y);
    ctx.lineTo(-w * 0.2, y - h);
    ctx.lineTo(w * 0.2, y - h);
    ctx.lineTo(w / 2, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#16202e';
    ctx.fillRect(-w * 0.12, y - h * 0.62, w * 0.24, h * 0.2);
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(-w / 2, y - 0.16, w, 0.16);
  } else {
    ctx.fillStyle = d.core === 'cubesat' ? '#c9a227' : '#d0d4da';
    ctx.fillRect(-w / 2, y - h, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(w * 0.15, y - h, w * 0.35, h);
    ctx.fillStyle = '#1b2433';
    ctx.fillRect(-w * 0.3, y - h * 0.75, w * 0.35, h * 0.3);
    if (hasShield(d)) {
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(-w / 2 - 0.05, y - 0.1, w + 0.1, 0.12);
    }
  }
  if (o.chute && payloadOnly) {
    const cw = Math.max(6, w * 4), ch = cw * 1.1;
    ctx.strokeStyle = 'rgba(230,230,230,0.8)';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, y - h); ctx.lineTo(-cw / 2, y - h - ch);
    ctx.moveTo(w * 0.3, y - h); ctx.lineTo(cw / 2, y - h - ch);
    ctx.moveTo(0, y - h); ctx.lineTo(0, y - h - ch - cw * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#e4572e';
    ctx.beginPath();
    ctx.ellipse(0, y - h - ch, cw / 2, cw * 0.32, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4f4f4';
    ctx.beginPath();
    ctx.ellipse(0, y - h - ch, cw / 6, cw * 0.32, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  }
}

/** Dibuja una etapa suelta (para las etapas descartadas). */
export function drawLooseStage(ctx: CanvasRenderingContext2D, s: StageDesign, color: string) {
  const h = tankHeight(s) + engineHeight(s);
  drawStage(ctx, s, color, h / 2, 0, 0, 0, 0, false);
}
