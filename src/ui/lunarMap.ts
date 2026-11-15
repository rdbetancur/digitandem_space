import { lunarCoordinates } from '../sim/lunarTerrain';
import { LUNAR_DATA } from '../sim/lunarData';

let image: HTMLImageElement | undefined;
let failed = false;
export function drawLunarMap(ctx: CanvasRenderingContext2D, w: number, h: number, theta: number, siteTheta: number, path: { x: number; y: number }[] = [], impact: number | null = null) {
  if (!image && typeof Image !== 'undefined') {
    image = new Image();
    image.onerror = () => { failed = true; };
    image.src = '/nasa/moon-lroc-2025.jpg';
  }
  const width = Math.min(w > 900 ? w - 580 : w * 0.92, Math.max(120, h - 300) * 2), height = width / 2;
  const left = (w - width) / 2, top = (h - height) / 2;
  ctx.fillStyle = '#24262c'; ctx.fillRect(left, top, width, height);
  if (image?.complete && image.naturalWidth) ctx.drawImage(image, left, top, width, height);
  else {
    ctx.fillStyle = '#d6dbe4'; ctx.font = '14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(failed ? 'LROC map unavailable' : 'Loading NASA LROC map…', w / 2, h / 2);
  }
  const project = (lat: number, lon: number) => ({ x: left + (lon + 180) / 360 * width, y: top + (90 - lat) / 180 * height });
  ctx.strokeStyle = '#5ab8ff'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.beginPath();
  let previous: { x: number; y: number } | undefined;
  for (const point of path) {
    const geo = lunarCoordinates(Math.atan2(point.y, point.x)), p = project(geo.lat, geo.lon);
    if (!previous || Math.abs(p.x - previous.x) > width / 3) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
    previous = p;
  }
  ctx.stroke(); ctx.setLineDash([]);
  if (impact !== null) {
    const geo = lunarCoordinates(impact), p = project(geo.lat, geo.lon);
    ctx.strokeStyle = '#ff6b5e'; ctx.beginPath(); ctx.moveTo(p.x - 5, p.y - 5); ctx.lineTo(p.x + 5, p.y + 5);
    ctx.moveTo(p.x + 5, p.y - 5); ctx.lineTo(p.x - 5, p.y + 5); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(190,210,230,0.3)'; ctx.lineWidth = 1;
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = project(lat, 0).y; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + width, y); ctx.stroke();
  }
  for (let lon = -180; lon <= 180; lon += 60) {
    const x = project(0, lon).x; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + height); ctx.stroke();
  }
  for (const [angle, label, color] of [[siteTheta, 'Target', '#5adca0'], [theta, 'Lander ground track', '#ffb347']] as const) {
    const geo = lunarCoordinates(angle), p = project(geo.lat, geo.lon);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = '12px system-ui'; ctx.textAlign = p.x < w / 2 ? 'left' : 'right';
    ctx.fillText(label, p.x < w / 2 ? p.x + 8 : p.x - 8, p.y - 8);
  }
  ctx.fillStyle = '#d6dbe4'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('NASA LROC / LOLA · longitude −180° to +180° · north up', w / 2, top - 12);
  ctx.fillText(`Target: ${Math.abs(LUNAR_DATA.site.lat)}°S, 0°E · elevation ${LUNAR_DATA.site.elevationM} m`, w / 2, top + height + 20);
  ctx.fillText('Equirectangular surface map · altitude is shown in the flight instruments', w / 2, top + height + 38);
}
