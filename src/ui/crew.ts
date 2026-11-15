// Crew: up to four people share one craft, each owning a role. Stored on this device only.

export type Role = 'director' | 'engineer' | 'pilot' | 'scientist';

export const ROLES: { id: Role; name: string; does: string }[] = [
  { id: 'director', name: 'Mission director', does: 'Picks the mission, watches the budget and the objectives.' },
  { id: 'engineer', name: 'Engineer', does: 'Builds the craft in the Lab, runs the tests and watches the systems.' },
  { id: 'pilot', name: 'Pilot', does: 'Flies, stages and circularizes.' },
  { id: 'scientist', name: 'Scientist', does: 'Runs the instruments and decides when to downlink.' },
];

const CREW_KEY = 'ascenso.crew.v1';
export const CREW_MAX = 4;
export const NAME_MAX = 24;

/** Which seat (index into the crew) owns each role, for crews of 1 to 4. */
const SEATS: Record<number, Record<Role, number>> = {
  1: { director: 0, engineer: 0, pilot: 0, scientist: 0 },
  2: { director: 0, pilot: 0, engineer: 1, scientist: 1 },
  3: { director: 0, pilot: 0, engineer: 1, scientist: 2 },
  4: { director: 0, engineer: 1, pilot: 2, scientist: 3 },
};

export function cleanCrew(names: unknown): string[] {
  if (!Array.isArray(names)) return [];
  return names
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, NAME_MAX))
    .filter(Boolean)
    .slice(0, CREW_MAX);
}

export function loadCrew(): string[] {
  try {
    return cleanCrew(JSON.parse(localStorage.getItem(CREW_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function saveCrew(names: string[]) {
  try { localStorage.setItem(CREW_KEY, JSON.stringify(cleanCrew(names))); } catch { /* storage unavailable */ }
}

/** Name of whoever owns a role, or null when no crew is set. */
export function crewFor(crew: string[], role: Role): string | null {
  const names = cleanCrew(crew);
  if (names.length === 0) return null;
  return names[SEATS[names.length][role]] ?? null;
}

/** Roles each crew member owns, in seat order. */
export function rolesBySeat(crew: string[]): { name: string; roles: Role[] }[] {
  const names = cleanCrew(crew);
  if (names.length === 0) return [];
  const seats = SEATS[names.length];
  return names.map((name, i) => ({ name, roles: ROLES.map((r) => r.id).filter((r) => seats[r] === i) }));
}

export const roleName = (role: Role) => ROLES.find((r) => r.id === role)!.name;
