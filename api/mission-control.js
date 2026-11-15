// Función de Vercel: POST /api/mission-control
import { missionControl } from '../server/missionControl.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'metodo', message: 'Usa POST.' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'desconocida';
  const out = await missionControl(body, process.env.GEMINI_API_KEY, ip);
  res.status(out.status).json(out.json);
}
