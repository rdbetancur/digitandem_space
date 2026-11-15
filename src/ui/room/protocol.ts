// Mission room protocol. Pure functions, no network: what travels between the pilot's
// browser (the host, which runs the simulation) and the guests, and how each side checks it.
// Everything received from another browser is untrusted and validated here.

import { INSTRUMENTS, InstrumentId, ENGINES, TANKS } from '../../sim/catalog';
import {
  Flight, Sas, canDeploy, deploy, maxWarp, measure, retract, transmitBlocker,
} from '../../sim/flight';
import { CONTEXTS } from '../../sim/science';
import { sanitizeDesign } from '../../sim/share';
import { Design } from '../../sim/vehicle';

export type Station = 'navigator' | 'engineer' | 'scientist';
export type Seat = Station | 'pilot';

export const STATIONS: { id: Station; name: string; does: string }[] = [
  { id: 'navigator', name: 'Navigator', does: 'Sets the attitude hold (prograde, retrograde) and the time warp, and calls the burns.' },
  { id: 'engineer', name: 'Engineer', does: 'Deploys and stows panels and antenna, and watches loads, power and propellant.' },
  { id: 'scientist', name: 'Scientist', does: 'Runs the instruments and decides when to downlink the data.' },
];
export const seatName = (s: Seat | null) => (s === 'pilot' ? 'Pilot' : STATIONS.find((x) => x.id === s)?.name ?? 'Observer');

export interface Member { id: string; name: string; seat: Seat | null }

export const MAX_GUESTS = 3;
export const NAME_MAX = 20;
export const NOTE_MAX = 160;
export const WARPS = [1, 2, 5, 10, 50, 100, 1000];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

const SAS: Sas[] = ['mantener', 'prograda', 'retrograda'];
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const has = (table: object, key: unknown): key is string => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);

export function cleanText(x: unknown, max: number): string {
  if (typeof x !== 'string') return '';
  return x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
export const cleanName = (x: unknown) => cleanText(x, NAME_MAX);

export function makeCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return s;
}

/** Accepts what a person types or pastes ("k7p-2qx", a full link) and returns the code, or null. */
export function normalizeCode(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const tail = x.includes('room=') ? x.slice(x.lastIndexOf('room=') + 5) : x;
  const code = tail.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export function guestName(rand: () => number = Math.random): string {
  return `Guest-${String(1000 + Math.floor(rand() * 9000))}`;
}

// ---------- Guest → host ----------

export type GuestCmd =
  | { a: 'measure'; i: InstrumentId }
  | { a: 'tx' }
  | { a: 'deploy' }
  | { a: 'sas'; m: Sas }
  | { a: 'warp'; d: 1 | -1 };

export type GuestMsg =
  | { k: 'hello'; name: string }
  | { k: 'seat'; seat: Station | null }
  | { k: 'cmd'; c: GuestCmd }
  | { k: 'note'; text: string };

export function parseGuestMsg(x: unknown): GuestMsg | null {
  if (!isObj(x)) return null;
  switch (x.k) {
    case 'hello': { const name = cleanName(x.name); return name ? { k: 'hello', name } : null; }
    case 'seat': return x.seat === null || STATIONS.some((s) => s.id === x.seat) ? { k: 'seat', seat: x.seat as Station | null } : null;
    case 'note': { const text = cleanText(x.text, NOTE_MAX); return text ? { k: 'note', text } : null; }
    case 'cmd': {
      const c = x.c;
      if (!isObj(c)) return null;
      if (c.a === 'measure') return has(INSTRUMENTS, c.i) ? { k: 'cmd', c: { a: 'measure', i: c.i as InstrumentId } } : null;
      if (c.a === 'tx' || c.a === 'deploy') return { k: 'cmd', c: { a: c.a } };
      if (c.a === 'sas') return SAS.includes(c.m as Sas) ? { k: 'cmd', c: { a: 'sas', m: c.m as Sas } } : null;
      if (c.a === 'warp') return c.d === 1 || c.d === -1 ? { k: 'cmd', c: { a: 'warp', d: c.d } } : null;
      return null;
    }
    default: return null;
  }
}

/** Which station may send each command. */
export const CMD_STATION: Record<GuestCmd['a'], Station> = {
  measure: 'scientist', tx: 'scientist', deploy: 'engineer', sas: 'navigator', warp: 'navigator',
};

export interface CmdResult {
  /** Message only for the guest who sent it (why it could not be done). */
  say?: string;
  /** Line for everyone: what this crew member just did. */
  feed?: string;
}

/**
 * Applies a guest's command on the host's flight, with the same rules the pilot's own
 * buttons use. A guest can only act from their own station.
 */
export function applyCommand(
  f: Flight, cmd: GuestCmd, seat: Seat | null, who: string, warp: { get: () => number; set: (w: number) => void },
): CmdResult {
  if (seat !== CMD_STATION[cmd.a]) return { say: `Only the ${seatName(CMD_STATION[cmd.a]).toLowerCase()} can do that.` };
  if (f.ended) return { say: 'The flight is over.' };
  switch (cmd.a) {
    case 'measure': {
      const err = measure(f, cmd.i);
      return err ? { say: err } : { feed: `${who} took a reading with the ${INSTRUMENTS[cmd.i].nombre.toLowerCase()}.` };
    }
    case 'tx': {
      if (f.transmitting) { f.transmitting = false; return { feed: `${who} stopped the downlink.` }; }
      const b = transmitBlocker(f);
      if (b && !b.startsWith('No line of sight')) return { say: b };
      f.transmitting = true;
      return { feed: b ? `${who} armed the downlink: it starts when a station is in view.` : `${who} started the downlink.` };
    }
    case 'deploy': {
      if (f.deployed) { retract(f); return { feed: `${who} stowed the panels and antenna.` }; }
      if (canDeploy(f)) { deploy(f); return { feed: `${who} deployed the panels and antenna.` }; }
      return { say: f.panelsLost ? 'The panels and antenna were lost.' : 'You can only deploy in flight, with no fairing, no thrust and out of dense air.' };
    }
    case 'sas': {
      f.sas = cmd.m;
      f.autopilot = false;
      return { feed: `${who} set the attitude hold to ${cmd.m === 'mantener' ? 'hold' : cmd.m === 'prograda' ? 'prograde' : 'retrograde'}.` };
    }
    case 'warp': {
      const i = WARPS.indexOf(warp.get());
      const next = WARPS[Math.max(0, Math.min(WARPS.length - 1, (i < 0 ? 0 : i) + cmd.d))];
      const max = maxWarp(f);
      if (next > max) return { say: 'Time warp limited: engines running or inside the atmosphere.' };
      warp.set(next);
      return { feed: `${who} set time warp to ${next}×.` };
    }
  }
}

// ---------- Host → guest ----------

export interface IdleInfo {
  screen: 'home' | 'lab' | 'report' | 'other';
  missionName: string;
  design: Design | null;
  result: { titulo: string; puntaje: number; resultado: string } | null;
}

export type HostMsg =
  | { k: 'roster'; members: Member[]; you: string }
  | { k: 'snap'; missionId: string; warp: number; paused: boolean; design: Design; f: unknown }
  | { k: 'idle'; info: IdleInfo }
  | { k: 'note'; from: string; text: string }
  | { k: 'say'; text: string }
  | { k: 'feed'; text: string }
  | { k: 'full' };

const SEATS: (Seat | null)[] = ['pilot', 'navigator', 'engineer', 'scientist', null];

export function parseHostMsg(x: unknown): HostMsg | null {
  if (!isObj(x)) return null;
  switch (x.k) {
    case 'roster': {
      if (!Array.isArray(x.members)) return null;
      const members: Member[] = [];
      for (const m of x.members.slice(0, MAX_GUESTS + 1)) {
        if (!isObj(m) || !SEATS.includes(m.seat as Seat | null)) continue;
        const name = cleanName(m.name), id = cleanText(m.id, 80);
        if (name && id) members.push({ id, name, seat: m.seat as Seat | null });
      }
      return { k: 'roster', members, you: cleanText(x.you, 80) };
    }
    case 'snap': {
      const design = sanitizeDesign(x.design);
      if (!design || typeof x.missionId !== 'string' || !fin(x.warp) || !isObj(x.f)) return null;
      return { k: 'snap', missionId: cleanText(x.missionId, 24), warp: Math.max(1, Math.min(1000, x.warp)), paused: x.paused === true, design, f: x.f };
    }
    case 'idle': {
      const i = x.info;
      if (!isObj(i)) return null;
      const screen = (['home', 'lab', 'report', 'other'] as const).find((s) => s === i.screen) ?? 'other';
      const r = isObj(i.result) && fin(i.result.puntaje)
        ? { titulo: cleanText(i.result.titulo, 70), puntaje: Math.round(i.result.puntaje), resultado: cleanText(i.result.resultado, 12) }
        : null;
      return { k: 'idle', info: { screen, missionName: cleanText(i.missionName, 60), design: i.design ? sanitizeDesign(i.design) : null, result: r } };
    }
    case 'note': { const text = cleanText(x.text, NOTE_MAX); return text ? { k: 'note', from: cleanName(x.from) || 'Crew', text } : null; }
    case 'say': case 'feed': { const text = cleanText(x.text, 220); return text ? { k: x.k, text } : null; }
    case 'full': return { k: 'full' };
    default: return null;
  }
}

/** What the host sends about the flight, several times per second. */
export function buildSnapshot(f: Flight) {
  return { ...f, events: f.events.slice(-8), debris: f.debris.slice(-10), measurements: f.measurements.slice(-30) };
}

const ENDS = ['estructura', 'aceleracion', 'calor', 'impacto', 'aterrizaje', 'usuario'];
const KINDS = ['info', 'ok', 'warn', 'bad'];

function vec(x: unknown, into: { x: number; y: number }) {
  if (isObj(x) && fin(x.x) && fin(x.y)) { into.x = x.x; into.y = x.y; }
}

/**
 * Copies a received snapshot onto a flight the guest built from the (validated) design.
 * Only known fields with the right type are copied; anything else is ignored.
 */
export function applySnapshot(t: Flight, raw: unknown): boolean {
  if (!isObj(raw)) return false;
  const s = raw;
  vec(s.r, t.r); vec(s.v, t.v);
  for (const k of ['t', 'heading', 'throttle', 'groundAngle0', 'battery', 'chuteT', 'apTarget', 'nextId'] as const) {
    if (fin(s[k])) (t as unknown as Record<string, number>)[k] = s[k] as number;
  }
  t.throttle = Math.max(0, Math.min(1, t.throttle));
  for (const k of ['autopilot', 'landed', 'fairingOn', 'deployed', 'panelsLost', 'chuteOpen', 'transmitting'] as const) {
    if (typeof s[k] === 'boolean') t[k] = s[k] as boolean;
  }
  if (SAS.includes(s.sas as Sas)) t.sas = s.sas as Sas;
  t.ended = ENDS.includes(s.ended as string) ? (s.ended as Flight['ended']) : null;
  if (fin(s.stageIdx)) t.stageIdx = Math.max(0, Math.min(t.stages.length, Math.round(s.stageIdx)));
  if (Array.isArray(s.stages)) {
    t.stages.forEach((st, i) => {
      const r = (s.stages as unknown[])[i];
      if (isObj(r) && fin(r.prop)) st.prop = Math.max(0, Math.min(st.propMax, r.prop));
    });
  }
  if (isObj(s.stats)) {
    const dst = t.stats as unknown as Record<string, number | null>;
    for (const k of Object.keys(dst)) {
      const v = s.stats[k];
      if (fin(v)) dst[k] = v; else if (v === null && dst[k] === null) dst[k] = null;
    }
  }
  if (isObj(s.now)) {
    const dst = t.now as unknown as Record<string, number | boolean>;
    for (const k of Object.keys(dst)) {
      const v = s.now[k];
      if (typeof dst[k] === 'number' ? fin(v) : typeof v === 'boolean') dst[k] = v as number | boolean;
    }
  }
  if (isObj(s.flags)) {
    const flags: Record<string, boolean> = {};
    for (const k of Object.keys(s.flags).slice(0, 60)) if (typeof s.flags[k] === 'boolean' && k.length < 40) flags[k] = s.flags[k] as boolean;
    t.flags = flags;
  }
  if (Array.isArray(s.events)) {
    t.events = s.events.slice(-8).filter(isObj).filter((e) => fin(e.t) && KINDS.includes(e.kind as string))
      .map((e) => ({ t: e.t as number, text: cleanText(e.text, 240), kind: e.kind as Flight['events'][number]['kind'] }));
  }
  if (Array.isArray(s.measurements)) {
    t.measurements = s.measurements.slice(-30).filter(isObj)
      .filter((m) => has(INSTRUMENTS, m.instrument) && has(CONTEXTS, m.context) && fin(m.id) && fin(m.t) && fin(m.alt) && fin(m.mb) && fin(m.sent) && fin(m.points))
      .map((m) => ({
        id: m.id as number, instrument: m.instrument as InstrumentId, context: m.context as Flight['measurements'][number]['context'],
        t: m.t as number, alt: m.alt as number, reading: cleanText(m.reading, 300), mb: m.mb as number, sent: m.sent as number, points: m.points as number,
      }));
  }
  if (Array.isArray(s.debris)) {
    t.debris = s.debris.slice(-10).filter(isObj).filter((b) => {
      const st = b.stage;
      return isObj(b.r) && fin(b.r.x) && fin(b.r.y) && isObj(b.v) && fin(b.v.x) && fin(b.v.y) && fin(b.angle) && isObj(st)
        && has(ENGINES, st.engine) && has(TANKS, st.tank) && fin(st.engines) && fin(st.tanks) && st.engines >= 1 && st.engines <= 9 && st.tanks >= 1 && st.tanks <= 12;
    }).map((b) => {
      const r = b.r as { x: number; y: number }, v = b.v as { x: number; y: number }, st = b.stage as Record<string, unknown>;
      return {
        r: { x: r.x, y: r.y }, v: { x: v.x, y: v.y }, angle: b.angle as number, spin: fin(b.spin) ? b.spin : 0, age: fin(b.age) ? b.age : 0,
        stage: { engine: st.engine, engines: st.engines, tank: st.tank, tanks: st.tanks } as Flight['debris'][number]['stage'],
      };
    });
  }
  return true;
}
