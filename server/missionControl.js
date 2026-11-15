// Control de Misión: asistente de ASCENSO. Este archivo corre solo en el servidor
// (función de Vercel en producción, middleware de Vite en desarrollo). La clave de la
// API nunca llega al navegador.

const MODEL = 'gemini-3.8-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const MAX_MESSAGES = 12;
const MAX_TEXT = 1500;
const MAX_CONTEXT = 3000;

const SYSTEM = `You are "Mission Control", the assistant in ASCENSO, an educational space mission design simulator made for the NASA Space Apps Challenge 2026. You talk like a patient, enthusiastic flight director teaching students with no prior background.

HOW YOU ANSWER
- In the language the player writes to you in (English by default).
- Short and clear: 2 to 5 sentences, or a short list of steps. Only go longer if they ask for more detail.
- Plain text, no Markdown, no asterisks or headings.
- Explain the physical reason with an everyday comparison when it helps, and give numbers when you have them.
- Use the telemetry and design you receive under "Current game state" to give concrete advice about THIS craft and THIS flight. Do not make up data that is not there.
- If you do not know something or are not sure about a real-world fact, say so. Do not invent figures or NASA facts.
- Only cover the game, space, science and engineering. If asked about anything else, kindly steer back.
- Do not do the work for the player: give the hint and the reason, and let them decide.

HOW THE GAME WORKS
Screens: Home, Lab (design the craft), Flight, Report and Solar system atlas.

Lab: choose the payload (CubeSat 6U, science probe or crewed capsule), up to 4 instruments (thermometer and barometer, camera, radiation detector, magnetometer), solar panels, batteries, antenna (none, simple at 0.05 MB/s, high-gain at 1.2 MB/s), fairing, heat shield, parachute, up to 3 stages (engine, number of engines, tanks) and material (aluminum-lithium, carbon composite, stainless steel). It shows total delta-v, liftoff thrust/weight, cost, mass, power and data. Low orbit takes about 9,400 m/s of delta-v including losses, and a thrust/weight above 1 to lift off (ideally between 1.2 and 2.2). There are two tests: the vibration table reveals the structural limit (maximum aerodynamic load and acceleration) and the wind tunnel predicts the peak load during ascent. A test does not change the craft: it reveals limits that are already there.

Flight (equatorial plane, real-scale Earth): Space ignites the engines or separates the stage; W/S throttle up and down; Z is full throttle and X cuts the engine; A/D tilt west and east; T switches assistance (hold, prograde, retrograde); P turns on the ascent autopilot; comma and period change time warp (limited with engines running or inside the atmosphere); M opens the orbital map; G deploys or stows panels and antenna; C opens the science panel and 1 to 4 use the instruments; Esc pauses.
To reach orbit: climb vertically for a few seconds, tilt east little by little, build horizontal speed (about 7.8 km/s), cut the engine when the apoapsis passes 150 to 200 km, wait until you are near the apoapsis and thrust prograde until the periapsis is above 150 km.
Possible failures: structural failure from aerodynamic load (going too fast in dense air or flying sideways), failure from acceleration (lots of thrust with nearly empty tanks), destruction by heat on reentry without a shield, impact with the ground. The fairing comes off by itself at 110 km. Deployed panels are torn off if the craft enters dense air. The parachute only opens with the payload already released, below 7 km.

Science: each instrument yields differently depending on the context (surface, lower atmosphere, upper atmosphere, near space, high space). Repeating the same measurement in the same context yields less each time. Data takes up storage and only counts in full once it reaches Earth: transmitted with line of sight to one of the three ground stations, or recovered on landing.

Missions: "First CubeSat" (orbit, release the satellite, deploy, measure, transmit; budget 12 M USD). "Eye on Earth" (track a wildfire from orbit: camera detail is 6 m per pixel for every 100 km of altitude and an image is usable at 30 m or less, in daylight and with the fire in view; it has to be done on 3 passes and the 40 MB images downlinked; "Schedule a capture" fires the camera by itself on the next overpass; lower gives more detail but shorter link passes; budget 10 M USD). "Free play" has no budget or clock.

Atlas: shows where each planet is on a given date, the distance, the delay of a radio signal, the available solar power and an estimate of the delta-v, trip duration and next launch window to get there from low orbit. Interplanetary flight is not playable yet.

Report: after each flight it explains what happened and why, using numbers from the telemetry.`;

/** Límite simple por dirección: frena abusos de la clave. En serverless es aproximado. */
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 5 * 60e3);
  if (list.length >= 30) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function clean(s, max) {
  return typeof s === 'string' ? s.slice(0, max) : '';
}

function extractText(data) {
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  let text = '';
  for (const step of data?.steps ?? data?.outputs ?? []) {
    if (step?.type && step.type !== 'model_output' && step.type !== 'text') continue;
    if (typeof step?.text === 'string') text += step.text;
    for (const part of Array.isArray(step?.content) ? step.content : []) {
      if (part?.type === 'text' && typeof part.text === 'string') text += part.text;
    }
  }
  return text.trim();
}

/**
 * Atiende una pregunta. body: { messages: [{ role: 'user' | 'assistant', text }], context }.
 * Devuelve { status, json } listo para responder por HTTP.
 */
export async function missionControl(body, apiKey, ip = 'local') {
  if (!apiKey) {
    return { status: 503, json: { error: 'sin_clave', message: 'Mission Control is not set up: GEMINI_API_KEY is missing on the server.' } };
  }
  if (limited(ip)) {
    return { status: 429, json: { error: 'limite', message: 'Too many questions in a row. Wait a few minutes.' } };
  }
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const turns = messages
    .map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', text: clean(m?.text, MAX_TEXT).trim() }))
    .filter((m) => m.text);
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    return { status: 400, json: { error: 'sin_pregunta', message: 'The question is missing.' } };
  }
  const context = clean(body?.context, MAX_CONTEXT).trim();
  const talk = turns.map((m) => `${m.role === 'user' ? 'Player' : 'Mission Control'}: ${m.text}`).join('\n');
  const input = `Current game state:\n${context || '(no data)'}\n\nConversation so far:\n${talk}\n\nReply to the player's last message.`;

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, 'Api-Revision': '2026-05-20' },
      body: JSON.stringify({
        model: MODEL,
        input,
        system_instruction: SYSTEM,
        store: false,
        generation_config: { max_output_tokens: 900, thinking_level: 'low' },
      }),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return { status: 502, json: { error: 'red', message: 'The AI service did not respond. Try again.' } };
  }
  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin JSON */ }
  if (!res.ok) {
    const detail = typeof data?.error?.message === 'string' ? data.error.message.slice(0, 300) : `HTTP ${res.status}`;
    console.error('[mission-control] service error:', res.status, detail);
    const message = res.status === 429
      ? 'The AI service hit its usage limit. Try again later.'
      : res.status === 400 || res.status === 401 || res.status === 403
        ? 'The AI service rejected the request. Check the GEMINI_API_KEY key.'
        : 'The AI service failed. Try again.';
    return { status: 502, json: { error: 'servicio', message } };
  }
  const text = extractText(data);
  if (!text) return { status: 502, json: { error: 'vacio', message: 'The assistant returned no text. Try rephrasing the question.' } };
  return { status: 200, json: { text } };
}
