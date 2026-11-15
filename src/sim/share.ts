// Sharing designs and flights through a link. Everything travels inside the URL:
// there is no server, account or database. Whatever arrives in a link is untrusted,
// so it is validated field by field against the parts catalog before it is used.

import { ANTENNAS, CORES, ENGINES, INSTRUMENTS, InstrumentId, MATERIALS, TANKS } from './catalog';
import { Design, StageDesign, computeStats } from './vehicle';

export type ShareOutcome = 'exito' | 'parcial' | 'fallo' | 'libre';

/** Summary of a flight that travels with a shared design. */
export interface SharedResult {
  titulo: string;
  resultado: ShareOutcome;
  puntaje: number;
  maxAltKm?: number;
  dvUsed?: number;
  timeMin?: number;
  cost?: number;
  orbit?: boolean;
}

export interface SharePayload {
  /** Mission the design was built for. */
  mission: string;
  design: Design;
  /** Who shares it. */
  by: string;
  crew: string[];
  /** Advice for whoever opens the link. */
  tip: string;
  /** Indexes into TIP_TAGS. */
  tags: number[];
  result: SharedResult | null;
  /** Identifies a flight so the same link is not counted twice on a board. */
  id: string;
}

/** What a shared design is good at. Only these fixed labels travel in a link. */
export const TIP_TAGS = [
  'Smooth liftoff', 'Efficient ascent', 'Low cost', 'More science', 'Survives reentry', 'Beginner friendly',
  'Needs a careful pilot', 'Reaches orbit',
];

export const LIMITS = { name: 40, by: 24, tip: 280, crew: 4, title: 70, link: 4000 };

const OUTCOMES: ShareOutcome[] = ['exito', 'parcial', 'fallo', 'libre'];

function text(x: unknown, max: number): string {
  if (typeof x !== 'string') return '';
  // Control characters are dropped; React escapes the rest when it renders.
  return x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function int(x: unknown, min: number, max: number): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  const v = Math.round(x);
  return v < min || v > max ? null : v;
}

function num(x: unknown, min: number, max: number): number | undefined {
  if (typeof x !== 'number' || !Number.isFinite(x)) return undefined;
  return Math.max(min, Math.min(max, x));
}

const has = (table: object, key: unknown): key is string => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);

/** Returns a clean design, or null if anything in it is not a valid part or count. */
export function sanitizeDesign(x: unknown): Design | null {
  if (!x || typeof x !== 'object') return null;
  const d = x as Record<string, unknown>;
  if (!has(MATERIALS, d.material) || !has(CORES, d.core) || !has(ANTENNAS, d.antenna)) return null;
  if (!Array.isArray(d.stages) || d.stages.length > 3) return null;
  const stages: StageDesign[] = [];
  for (const raw of d.stages) {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Record<string, unknown>;
    const engines = int(s.engines, 1, 9), tanks = int(s.tanks, 1, 12);
    if (!has(ENGINES, s.engine) || !has(TANKS, s.tank) || engines === null || tanks === null) return null;
    stages.push({ engine: s.engine as StageDesign['engine'], engines, tank: s.tank as StageDesign['tank'], tanks });
  }
  if (!Array.isArray(d.instruments)) return null;
  const core = CORES[d.core as keyof typeof CORES];
  const instruments: InstrumentId[] = [];
  for (const i of d.instruments) {
    if (!has(INSTRUMENTS, i)) return null;
    if (!instruments.includes(i as InstrumentId)) instruments.push(i as InstrumentId);
  }
  if (instruments.length > core.maxInstruments) return null;
  const panels = int(d.panels, 0, 6), batteries = int(d.batteries, 0, 6);
  if (panels === null || batteries === null) return null;
  return {
    nombre: text(d.nombre, LIMITS.name) || 'Shared craft',
    material: d.material as Design['material'],
    stages,
    core: d.core as Design['core'],
    instruments,
    panels,
    batteries,
    antenna: d.antenna as Design['antenna'],
    shield: d.shield === true,
    chute: d.chute === true,
    fairing: d.fairing === true,
    // Tests reveal limits to whoever runs them: the receiver starts untested.
    tested: { vibracion: false, tunel: false },
  };
}

function sanitizeResult(x: unknown): SharedResult | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (!OUTCOMES.includes(r.resultado as ShareOutcome)) return null;
  const titulo = text(r.titulo, LIMITS.title);
  const puntaje = num(r.puntaje, 0, 1e7);
  if (!titulo || puntaje === undefined) return null;
  return {
    titulo,
    resultado: r.resultado as ShareOutcome,
    puntaje: Math.round(puntaje),
    maxAltKm: num(r.maxAltKm, 0, 1e9),
    dvUsed: num(r.dvUsed, 0, 1e6),
    timeMin: num(r.timeMin, 0, 1e7),
    cost: num(r.cost, 0, 1e6),
    orbit: r.orbit === true,
  };
}

/** Cleans a whole payload. `missions` is the list of mission ids that have a Lab. */
export function sanitizePayload(x: unknown, missions: string[]): SharePayload | null {
  if (!x || typeof x !== 'object') return null;
  const p = x as Record<string, unknown>;
  const design = sanitizeDesign(p.design);
  if (!design) return null;
  const crew = Array.isArray(p.crew) ? p.crew.map((c) => text(c, LIMITS.by)).filter(Boolean).slice(0, LIMITS.crew) : [];
  const tags = Array.isArray(p.tags)
    ? [...new Set(p.tags.map((t) => int(t, 0, TIP_TAGS.length - 1)).filter((t): t is number => t !== null))]
    : [];
  return {
    mission: typeof p.mission === 'string' && missions.includes(p.mission) ? p.mission : missions[0],
    design,
    by: text(p.by, LIMITS.by),
    crew,
    tip: text(p.tip, LIMITS.tip),
    tags,
    result: sanitizeResult(p.result),
    id: text(p.id, 24).replace(/[^a-zA-Z0-9]/g, ''),
  };
}

// ---------- Encoding ----------

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Encodes a payload as the text that goes after `#s=` in the link. */
export function encodeShare(p: SharePayload): string {
  const d = p.design;
  const compact = {
    v: 1,
    m: p.mission,
    d: [
      d.nombre, d.material, d.core, d.instruments, d.panels, d.batteries, d.antenna,
      (d.shield ? 1 : 0) | (d.chute ? 2 : 0) | (d.fairing ? 4 : 0),
      d.stages.map((s) => [s.engine, s.engines, s.tank, s.tanks]),
    ],
    b: p.by || undefined,
    c: p.crew.length ? p.crew : undefined,
    t: p.tip || undefined,
    g: p.tags.length ? p.tags : undefined,
    r: p.result
      ? [p.result.titulo, p.result.resultado, p.result.puntaje, p.result.maxAltKm ?? null, p.result.dvUsed ?? null,
        p.result.timeMin ?? null, p.result.cost ?? null, p.result.orbit ? 1 : 0]
      : undefined,
    i: p.id || undefined,
  };
  return toBase64Url(JSON.stringify(compact));
}

/** Decodes link text. Returns null for anything damaged, oversized or invalid. */
export function decodeShare(code: string, missions: string[]): SharePayload | null {
  if (typeof code !== 'string' || code.length === 0 || code.length > LIMITS.link) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const raw = JSON.parse(fromBase64Url(code)) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || raw.v !== 1 || !Array.isArray(raw.d)) return null;
    const a = raw.d as unknown[];
    const flags = typeof a[7] === 'number' ? a[7] : 0;
    const stages = Array.isArray(a[8])
      ? a[8].map((s) => (Array.isArray(s) ? { engine: s[0], engines: s[1], tank: s[2], tanks: s[3] } : null))
      : null;
    const r = Array.isArray(raw.r) ? raw.r as unknown[] : null;
    const opt = (x: unknown) => (x === null ? undefined : x);
    return sanitizePayload({
      mission: raw.m,
      design: {
        nombre: a[0], material: a[1], core: a[2], instruments: a[3], panels: a[4], batteries: a[5], antenna: a[6],
        shield: (flags & 1) !== 0, chute: (flags & 2) !== 0, fairing: (flags & 4) !== 0, stages,
      },
      by: raw.b, crew: raw.c, tip: raw.t, tags: raw.g,
      result: r
        ? { titulo: r[0], resultado: r[1], puntaje: r[2], maxAltKm: opt(r[3]), dvUsed: opt(r[4]), timeMin: opt(r[5]), cost: opt(r[6]), orbit: r[7] === 1 }
        : null,
      id: raw.i,
    }, missions);
  } catch {
    return null;
  }
}

const HASH_KEY = '#s=';

export function shareUrl(base: string, p: SharePayload): string {
  return `${base.split('#')[0]}${HASH_KEY}${encodeShare(p)}`;
}

/** Reads a shared payload from `location.hash`, or null if there is none. */
export function readShareHash(hash: string, missions: string[]): SharePayload | null {
  if (typeof hash !== 'string' || !hash.startsWith(HASH_KEY)) return null;
  return decodeShare(hash.slice(HASH_KEY.length), missions);
}

// ---------- Comparing two designs ----------

export interface DesignDiff {
  label: string;
  unit: string;
  digits: number;
  shared: number;
  mine: number;
  /** True when a higher value is the better one. */
  higherIsBetter: boolean | null;
}

/** Side-by-side numbers of two designs, computed with the same rules as the Lab. */
export function compareDesigns(shared: Design, mine: Design): DesignDiff[] {
  const a = computeStats(shared), b = computeStats(mine);
  return [
    { label: 'Delta-v (vacuum)', unit: 'm/s', digits: 0, shared: a.dvVacTotal, mine: b.dvVacTotal, higherIsBetter: true },
    { label: 'Thrust/weight at liftoff', unit: '', digits: 2, shared: a.twrLiftoff, mine: b.twrLiftoff, higherIsBetter: null },
    { label: 'Liftoff mass', unit: 'kg', digits: 0, shared: a.liftoffMass, mine: b.liftoffMass, higherIsBetter: false },
    { label: 'Payload', unit: 'kg', digits: 1, shared: a.payload, mine: b.payload, higherIsBetter: null },
    { label: 'Cost', unit: 'M USD', digits: 1, shared: a.cost, mine: b.cost, higherIsBetter: false },
    { label: 'Solar power', unit: 'W', digits: 0, shared: a.solarW, mine: b.solarW, higherIsBetter: true },
    { label: 'Battery', unit: 'Wh', digits: 0, shared: a.batteryWh, mine: b.batteryWh, higherIsBetter: true },
  ];
}
