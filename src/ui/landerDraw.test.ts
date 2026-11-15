import { describe, expect, it } from 'vitest';
import { landerScale } from './landerDraw';

describe('lunar descent camera', () => {
  const H = 700;
  it('the ground gets visibly closer during the whole descent', () => {
    // Antes la escala era proporcional a 1 / altura: el suelo quedaba siempre a la misma
    // distancia en pantalla y parecía que la nave no bajaba.
    const alts = [15000, 8000, 3000, 1000, 300, 100, 30, 10, 3, 1, 0];
    const gaps = alts.map((a) => landerScale(a, H).gap);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThan(gaps[i - 1]);
    expect(gaps[0] - landerScale(3000, H).gap).toBeGreaterThan(H * 0.08);
    expect(gaps[gaps.length - 1]).toBe(0);
  });

  it('the scale changes smoothly and stays finite at touchdown', () => {
    let prev = landerScale(15000, H).ppm;
    for (let a = 14990; a >= 0; a -= 10) {
      const { ppm, gap } = landerScale(a, H);
      expect(Number.isFinite(ppm)).toBe(true);
      expect(ppm).toBeGreaterThanOrEqual(prev * 0.999);
      expect(Math.abs(gap - a * ppm)).toBeLessThan(1e-6 + gap * 1e-9 + 1);
      prev = ppm;
    }
    expect(landerScale(0, H).ppm).toBeGreaterThan(5);
  });
});
