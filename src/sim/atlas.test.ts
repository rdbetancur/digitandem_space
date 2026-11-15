import { describe, expect, it } from 'vitest';
import { AU, distance, lightTime, position, solarFactor, trip } from './atlas';

const day = 86400e3;

describe('atlas', () => {
  it('la Tierra está a 1 UA del Sol y da una vuelta en un año', () => {
    const t0 = Date.UTC(2026, 0, 1);
    const a = position('tierra', t0), b = position('tierra', t0 + 365.256 * day);
    expect(Math.hypot(a.x, a.y)).toBeGreaterThan(0.98);
    expect(Math.hypot(a.x, a.y)).toBeLessThan(1.02);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01);
  });

  it('reproduce el acercamiento récord de Marte de agosto de 2003 (0,373 UA)', () => {
    const d = distance('tierra', 'marte', Date.UTC(2003, 7, 27, 10)) / AU;
    expect(d).toBeGreaterThan(0.36);
    expect(d).toBeLessThan(0.385);
  });

  it('la luz tarda unos 8,3 minutos del Sol a la Tierra y 1,3 s a la Luna', () => {
    const t = Date.UTC(2026, 3, 1);
    expect(lightTime(distance('sol', 'tierra', t)) / 60).toBeCloseTo(8.3, 0);
    expect(lightTime(distance('tierra', 'luna', t))).toBeCloseTo(1.28, 1);
  });

  it('un panel solar junto a Júpiter rinde cerca del 4 %', () => {
    const f = solarFactor('jupiter', Date.UTC(2026, 0, 1));
    expect(f).toBeGreaterThan(0.03);
    expect(f).toBeLessThan(0.045);
  });

  it('el viaje a Marte cuesta unos 3,6 km/s desde órbita baja y dura unos 8,5 meses', () => {
    const t = trip('marte', Date.UTC(2026, 0, 1))!;
    expect(t.dv).toBeGreaterThan(3500);
    expect(t.dv).toBeLessThan(3700);
    expect(t.time / 86400).toBeGreaterThan(250);
    expect(t.time / 86400).toBeLessThan(265);
  });

  it('encuentra la ventana a Marte de 2020, la que usó Perseverance', () => {
    const w = trip('marte', Date.UTC(2020, 0, 1))!.window!;
    expect(w).toBeGreaterThan(Date.UTC(2020, 5, 1));
    expect(w).toBeLessThan(Date.UTC(2020, 8, 1));
  });

  it('el viaje a la Luna cuesta unos 3,1 km/s y dura unos 5 días', () => {
    const t = trip('luna', 0)!;
    expect(t.dv).toBeGreaterThan(3000);
    expect(t.dv).toBeLessThan(3250);
    expect(t.time / 86400).toBeGreaterThan(4);
    expect(t.time / 86400).toBeLessThan(6);
    expect(t.window).toBeNull();
  });
});
