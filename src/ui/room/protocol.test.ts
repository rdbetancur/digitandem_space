import { describe, expect, it } from 'vitest';
import { createFlight, stageAction, stepFlight } from '../../sim/flight';
import { PRESETS, cloneDesign } from '../../sim/vehicle';
import {
  applyCommand, applySnapshot, buildSnapshot, guestName, makeCode, normalizeCode, parseGuestMsg, parseHostMsg,
} from './protocol';

const warp = () => { let w = 1; return { get: () => w, set: (x: number) => { w = x; } }; };

function inSpace() {
  const f = createFlight(PRESETS.pequeno);
  f.landed = false; f.stats.liftoffT = 0; f.fairingOn = false; f.stageIdx = f.stages.length;
  f.r = { x: 0, y: 6.371e6 + 300e3 }; f.v = { x: 7730, y: 0 };
  stepFlight(f, 0.5);
  return f;
}

describe('room codes and names', () => {
  it('codes are 6 unambiguous characters and survive being typed or pasted', () => {
    const code = makeCode();
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
    expect(normalizeCode(code.toLowerCase())).toBe(code);
    expect(normalizeCode(`${code.slice(0, 3)}-${code.slice(3)} `)).toBe(code);
    expect(normalizeCode(`https://example.org/#room=${code}`)).toBe(code);
    expect(normalizeCode('abc')).toBeNull();
    expect(normalizeCode('O0O0O0')).toBeNull(); // O and 0 are not in the alphabet
    expect(normalizeCode(42)).toBeNull();
  });
  it('guests get a name without an account', () => {
    expect(guestName()).toMatch(/^Guest-\d{4}$/);
  });
});

describe('messages from a guest are untrusted', () => {
  it('accepts only known commands with valid values', () => {
    expect(parseGuestMsg({ k: 'cmd', c: { a: 'measure', i: 'termo' } })).toEqual({ k: 'cmd', c: { a: 'measure', i: 'termo' } });
    expect(parseGuestMsg({ k: 'cmd', c: { a: 'measure', i: 'laser' } })).toBeNull();
    expect(parseGuestMsg({ k: 'cmd', c: { a: 'warp', d: 50 } })).toBeNull();
    expect(parseGuestMsg({ k: 'cmd', c: { a: 'sas', m: 'sideways' } })).toBeNull();
    expect(parseGuestMsg({ k: 'cmd', c: { a: 'throttle', x: 1 } })).toBeNull();
    expect(parseGuestMsg({ k: 'cmd', c: { a: 'stage' } })).toBeNull();
    expect(parseGuestMsg({ k: 'seat', seat: 'pilot' })).toBeNull(); // nobody can take the pilot's seat
    expect(parseGuestMsg({ k: 'seat', seat: 'scientist' })).toEqual({ k: 'seat', seat: 'scientist' });
    expect(parseGuestMsg('hello')).toBeNull();
    expect(parseGuestMsg(null)).toBeNull();
    expect(parseGuestMsg({ k: 'hello', name: '   ' })).toBeNull();
    expect((parseGuestMsg({ k: 'hello', name: 'x'.repeat(500) }) as { name: string }).name.length).toBe(20);
    expect((parseGuestMsg({ k: 'note', text: 'y'.repeat(999) }) as { text: string }).text.length).toBe(160);
  });

  it('a guest can only act from their own station', () => {
    const f = inSpace();
    expect(applyCommand(f, { a: 'deploy' }, 'scientist', 'Ana', warp()).say).toMatch(/engineer/);
    expect(f.deployed).toBe(false);
    expect(applyCommand(f, { a: 'deploy' }, null, 'Ana', warp()).say).toBeTruthy();
    expect(applyCommand(f, { a: 'deploy' }, 'engineer', 'Ana', warp()).feed).toMatch(/Ana deployed/);
    expect(f.deployed).toBe(true);
  });

  it('station commands change the real flight with the same rules as the pilot', () => {
    const f = inSpace();
    const before = f.measurements.length;
    expect(applyCommand(f, { a: 'measure', i: 'termo' }, 'scientist', 'Bo', warp()).feed).toMatch(/Bo took a reading/);
    expect(f.measurements.length).toBe(before + 1);
    // An instrument that is not on board is refused with the simulation's own message.
    expect(applyCommand(f, { a: 'measure', i: 'magneto' }, 'scientist', 'Bo', warp()).say).toBeTruthy();
    applyCommand(f, { a: 'sas', m: 'retrograda' }, 'navigator', 'Cy', warp());
    expect(f.sas).toBe('retrograda');
    const w = warp();
    applyCommand(f, { a: 'warp', d: 1 }, 'navigator', 'Cy', w);
    expect(w.get()).toBe(2);
    applyCommand(f, { a: 'warp', d: -1 }, 'navigator', 'Cy', w);
    applyCommand(f, { a: 'warp', d: -1 }, 'navigator', 'Cy', w);
    expect(w.get()).toBe(1);
  });

  it('time warp stays limited while the engines run', () => {
    const f = createFlight(PRESETS.pequeno);
    stageAction(f);
    for (let i = 0; i < 100; i++) stepFlight(f, 0.02);
    const w = warp();
    for (let i = 0; i < 6; i++) applyCommand(f, { a: 'warp', d: 1 }, 'navigator', 'Cy', w);
    expect(w.get()).toBeLessThanOrEqual(5);
  });

  it('nothing can be done once the flight is over', () => {
    const f = inSpace();
    f.ended = 'usuario';
    expect(applyCommand(f, { a: 'measure', i: 'termo' }, 'scientist', 'Bo', warp()).say).toMatch(/over/);
  });
});

describe('what the pilot sends to guests', () => {
  it('a flight snapshot rebuilds the same flight on the guest side', () => {
    const host = createFlight(PRESETS.pequeno);
    stageAction(host);
    for (let i = 0; i < 3000; i++) stepFlight(host, 0.02);
    const wire = JSON.parse(JSON.stringify({ k: 'snap', missionId: 'cubesat', warp: 2, paused: false, design: host.design, f: buildSnapshot(host) }));
    const msg = parseHostMsg(wire);
    expect(msg && msg.k).toBe('snap');
    if (!msg || msg.k !== 'snap') return;
    const guest = createFlight(msg.design);
    expect(applySnapshot(guest, msg.f)).toBe(true);
    expect(guest.r).toEqual(host.r);
    expect(guest.v).toEqual(host.v);
    expect(guest.t).toBeCloseTo(host.t, 9);
    expect(guest.stages.map((s) => s.prop)).toEqual(host.stages.map((s) => s.prop));
    expect(guest.stats.maxAlt).toBe(host.stats.maxAlt);
    expect(guest.landed).toBe(false);
    expect(guest.events.length).toBeGreaterThan(0);
  });

  it('a hostile snapshot cannot put bad values into the guest flight', () => {
    const guest = createFlight(PRESETS.pequeno);
    const r0 = { ...guest.r };
    applySnapshot(guest, {
      r: { x: 'NaN', y: null }, v: { x: Infinity, y: 1 }, throttle: 99, stageIdx: 500, sas: 'spin', ended: 'hacked',
      stages: [{ prop: -5 }, { prop: 1e99 }], stats: { maxAlt: 'high', __proto__: { polluted: true } }, flags: { a: 'yes', ok: true },
      events: [{ t: 1, text: 'x'.repeat(9999), kind: 'ok' }, { t: 'no', text: 'bad', kind: 'ok' }, 'junk'],
      measurements: [{ instrument: 'laser' }], debris: [{ r: { x: 1, y: 1 }, v: { x: 0, y: 0 }, angle: 0, stage: { engine: 'warp', tank: 't1000', engines: 1, tanks: 1 } }],
    });
    expect(guest.r).toEqual(r0);
    expect(Number.isFinite(guest.v.x)).toBe(true);
    expect(guest.throttle).toBe(1);
    expect(guest.stageIdx).toBe(guest.stages.length);
    expect(guest.sas).toBe('mantener');
    expect(guest.ended).toBeNull();
    expect(guest.stages[0].prop).toBe(0);
    expect(guest.stages[1].prop).toBe(guest.stages[1].propMax);
    expect(typeof guest.stats.maxAlt).toBe('number');
    expect(guest.flags).toEqual({ ok: true });
    expect(guest.events.length).toBe(1);
    expect(guest.events[0].text.length).toBe(240);
    expect(guest.measurements).toEqual([]);
    expect(guest.debris).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(applySnapshot(guest, 'nope')).toBe(false);
  });

  it('rejects snapshots with an invalid craft and cleans the roster', () => {
    const d = cloneDesign(PRESETS.pequeno);
    expect(parseHostMsg({ k: 'snap', missionId: 'x', warp: 1, design: { ...d, material: 'gold' }, f: {} })).toBeNull();
    const roster = parseHostMsg({ k: 'roster', you: 'a', members: [{ id: 'a', name: 'Ana', seat: 'pilot' }, { id: 'b', name: 'B', seat: 'captain' }, { id: '', name: 'C', seat: null }, 7] });
    expect(roster).toEqual({ k: 'roster', you: 'a', members: [{ id: 'a', name: 'Ana', seat: 'pilot' }] });
    expect(parseHostMsg({ k: 'unknown' })).toBeNull();
  });
});
