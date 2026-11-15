// Flight board: flights flown on this device plus flights teammates shared by link.
// It lives in the browser's storage. There is no server, so it is not a global ranking.

import { ShareOutcome, SharePayload, sanitizeDesign } from '../sim/share';
import { Design } from '../sim/vehicle';

export interface RankEntry {
  id: string;
  /** True for flights flown on this device. */
  mine: boolean;
  by: string;
  crew: string[];
  mission: string;
  missionName: string;
  nave: string;
  titulo: string;
  resultado: ShareOutcome;
  puntaje: number;
  maxAltKm?: number;
  dvUsed?: number;
  timeMin?: number;
  cost?: number;
  orbit?: boolean;
  tip: string;
  tags: number[];
  design: Design | null;
  fecha: string;
}

const RANK_KEY = 'ascenso.ranking.v1';
const RANK_MAX = 80;

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function loadRanking(): RankEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RANK_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    // Stored entries are re-checked: storage can be edited by hand.
    return raw
      .filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && typeof e.puntaje === 'number')
      .map((e) => ({ ...e, design: e.design ? sanitizeDesign(e.design) : null, crew: Array.isArray(e.crew) ? e.crew : [], tags: Array.isArray(e.tags) ? e.tags : [] }))
      .slice(0, RANK_MAX) as RankEntry[];
  } catch {
    return [];
  }
}

export function saveRanking(list: RankEntry[]) {
  try { localStorage.setItem(RANK_KEY, JSON.stringify(list.slice(0, RANK_MAX))); } catch { /* storage unavailable */ }
}

/** Adds an entry, replacing any earlier one with the same id. Newest first. */
export function addEntry(list: RankEntry[], e: RankEntry): RankEntry[] {
  return [e, ...list.filter((x) => x.id !== e.id)].slice(0, RANK_MAX);
}

/** Turns a flight received by link into a board entry. Null if the link carries no result. */
export function entryFromShare(p: SharePayload, missionName: string): RankEntry | null {
  if (!p.result) return null;
  return {
    id: p.id || newId(), mine: false, by: p.by || 'A teammate', crew: p.crew, mission: p.mission, missionName,
    nave: p.design.nombre, titulo: p.result.titulo, resultado: p.result.resultado, puntaje: p.result.puntaje,
    maxAltKm: p.result.maxAltKm, dvUsed: p.result.dvUsed, timeMin: p.result.timeMin, cost: p.result.cost,
    orbit: p.result.orbit, tip: p.tip, tags: p.tags, design: p.design, fecha: new Date().toISOString(),
  };
}

export type SortKey = 'score' | 'altitude' | 'efficiency' | 'cost' | 'time';

export const SORTS: { id: SortKey; label: string; note: string }[] = [
  { id: 'score', label: 'Best score', note: 'Highest mission score.' },
  { id: 'altitude', label: 'Highest flight', note: 'Greatest altitude reached.' },
  { id: 'efficiency', label: 'Most efficient ascent', note: 'Least delta-v spent among flights that reached orbit.' },
  { id: 'cost', label: 'Cheapest orbit', note: 'Lowest vehicle cost among flights that reached orbit.' },
  { id: 'time', label: 'Fastest success', note: 'Shortest mission time among successful missions.' },
];

/** Entries that qualify for a category, best first. */
export function rank(list: RankEntry[], sort: SortKey, mission: string | null): RankEntry[] {
  let rows = mission ? list.filter((e) => e.mission === mission) : list.slice();
  const by = (f: (e: RankEntry) => number, dir: 1 | -1) => rows.sort((a, b) => dir * (f(a) - f(b)) || b.puntaje - a.puntaje);
  switch (sort) {
    case 'score': return by((e) => e.puntaje, -1);
    case 'altitude': rows = rows.filter((e) => e.maxAltKm !== undefined); return by((e) => e.maxAltKm!, -1);
    case 'efficiency': rows = rows.filter((e) => e.orbit && e.dvUsed !== undefined); return by((e) => e.dvUsed!, 1);
    case 'cost': rows = rows.filter((e) => e.orbit && e.cost !== undefined); return by((e) => e.cost!, 1);
    case 'time': rows = rows.filter((e) => e.resultado === 'exito' && e.timeMin !== undefined); return by((e) => e.timeMin!, 1);
  }
}
