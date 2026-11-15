import { describe, expect, it } from 'vitest';
import { PRESETS, cloneDesign } from './vehicle';
import {
  LIMITS, SharePayload, TIP_TAGS, compareDesigns, decodeShare, encodeShare, readShareHash, sanitizeDesign, shareUrl,
} from './share';

const MISSIONS = ['sandbox', 'cubesat', 'ojo'];

function payload(over: Partial<SharePayload> = {}): SharePayload {
  return {
    mission: 'cubesat', design: cloneDesign(PRESETS.pequeno), by: 'Ana', crew: ['Ana', 'Luis'],
    tip: 'Throttle down to 60 % between 8 and 15 km.', tags: [0, 1], result: null, id: 'abc123', ...over,
  };
}

describe('sharing designs by link', () => {
  it('a design survives the round trip through a link', () => {
    for (const key of Object.keys(PRESETS)) {
      const p = payload({ design: cloneDesign(PRESETS[key]) });
      const back = decodeShare(encodeShare(p), MISSIONS);
      expect(back).not.toBeNull();
      expect(back!.design).toEqual({ ...p.design, tested: { vibracion: false, tunel: false } });
      expect(back!.by).toBe('Ana');
      expect(back!.crew).toEqual(['Ana', 'Luis']);
      expect(back!.tip).toBe(p.tip);
      expect(back!.tags).toEqual([0, 1]);
      expect(back!.mission).toBe('cubesat');
    }
  });

  it('keeps accents, emoji and other non-ASCII text', () => {
    const p = payload({ by: 'Zoë 🚀', tip: 'Órbita lograda: ¡sí!', design: { ...cloneDesign(PRESETS.pequeno), nombre: 'Cóndor Ñ' } });
    const back = decodeShare(encodeShare(p), MISSIONS)!;
    expect(back.by).toBe('Zoë 🚀');
    expect(back.tip).toBe('Órbita lograda: ¡sí!');
    expect(back.design.nombre).toBe('Cóndor Ñ');
  });

  it('carries a flight result', () => {
    const result = { titulo: 'Mission accomplished', resultado: 'exito' as const, puntaje: 1234, maxAltKm: 201.5, dvUsed: 9350, timeMin: 42, cost: 6.9, orbit: true };
    const back = decodeShare(encodeShare(payload({ result })), MISSIONS)!;
    expect(back.result).toEqual(result);
  });

  it('tests are never inherited from the sender', () => {
    const d = cloneDesign(PRESETS.pequeno);
    d.tested = { vibracion: true, tunel: true };
    expect(decodeShare(encodeShare(payload({ design: d })), MISSIONS)!.design.tested).toEqual({ vibracion: false, tunel: false });
  });

  it('builds and reads a full URL', () => {
    const url = shareUrl('https://example.org/game/#old', payload());
    expect(url.startsWith('https://example.org/game/#s=')).toBe(true);
    expect(readShareHash(url.slice(url.indexOf('#')), MISSIONS)!.design.nombre).toBe(PRESETS.pequeno.nombre);
    expect(readShareHash('', MISSIONS)).toBeNull();
    expect(readShareHash('#other=1', MISSIONS)).toBeNull();
  });

  it('a typical link stays short enough to paste anywhere', () => {
    expect(shareUrl('https://digitandem-space.vercel.app/', payload()).length).toBeLessThan(700);
  });
});

describe('links are untrusted', () => {
  it('rejects damaged, empty or oversized text', () => {
    const code = encodeShare(payload());
    expect(decodeShare('', MISSIONS)).toBeNull();
    expect(decodeShare('not base64 !!', MISSIONS)).toBeNull();
    expect(decodeShare(code.slice(0, 20), MISSIONS)).toBeNull();
    expect(decodeShare('A'.repeat(LIMITS.link + 1), MISSIONS)).toBeNull();
    expect(decodeShare(btoa('{"v":2}'), MISSIONS)).toBeNull();
    expect(decodeShare(btoa('[1,2,3]'), MISSIONS)).toBeNull();
    expect(decodeShare(btoa('null'), MISSIONS)).toBeNull();
  });

  it('rejects parts that are not in the catalog and counts out of range', () => {
    const base = cloneDesign(PRESETS.pequeno);
    expect(sanitizeDesign({ ...base, material: 'unobtainium' })).toBeNull();
    expect(sanitizeDesign({ ...base, core: '__proto__' })).toBeNull();
    expect(sanitizeDesign({ ...base, antenna: 'toString' })).toBeNull();
    expect(sanitizeDesign({ ...base, panels: 99 })).toBeNull();
    expect(sanitizeDesign({ ...base, panels: Number.NaN })).toBeNull();
    expect(sanitizeDesign({ ...base, stages: [{ engine: 'colibri', engines: 500, tank: 't1000', tanks: 1 }] })).toBeNull();
    expect(sanitizeDesign({ ...base, stages: [{ engine: 'warp', engines: 1, tank: 't1000', tanks: 1 }] })).toBeNull();
    expect(sanitizeDesign({ ...base, stages: new Array(4).fill(base.stages[0]) })).toBeNull();
    expect(sanitizeDesign({ ...base, instruments: ['termo', 'camara', 'radiacion'] })).toBeNull(); // a CubeSat carries two
    expect(sanitizeDesign({ ...base, instruments: ['laser'] })).toBeNull();
    expect(sanitizeDesign(null)).toBeNull();
    expect(sanitizeDesign('craft')).toBeNull();
  });

  it('trims long text, drops unknown tags and falls back to a mission with a Lab', () => {
    const p = payload({ mission: 'luna', by: 'x'.repeat(200), tip: 'y'.repeat(2000), tags: [1, 1, 999, -3], crew: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const back = decodeShare(encodeShare(p), MISSIONS)!;
    expect(back.mission).toBe('sandbox');
    expect(back.by.length).toBe(LIMITS.by);
    expect(back.tip.length).toBe(LIMITS.tip);
    expect(back.tags).toEqual([1]);
    expect(back.crew.length).toBe(LIMITS.crew);
    expect(TIP_TAGS[back.tags[0]]).toBeTruthy();
  });

  it('a decoded design can always be flown: its numbers are finite', () => {
    const back = decodeShare(encodeShare(payload()), MISSIONS)!;
    for (const row of compareDesigns(back.design, PRESETS.mediano)) {
      expect(Number.isFinite(row.shared)).toBe(true);
      expect(Number.isFinite(row.mine)).toBe(true);
    }
  });
});
