import { describe, expect, it } from 'vitest';
import { Camera, centerBlend, isMapView, updateCamera, zoomCamera } from './flightCamera';

describe('flight camera', () => {
  it('allows uninterrupted wheel zoom from map back to the craft and out again', () => {
    const cam: Camera = { zoom: 30000, targetZoom: 30000 };
    for (let i = 0; i < 100; i++) {
      zoomCamera(cam, -100);
      updateCamera(cam, 1 / 60, 1);
    }
    expect(isMapView(cam)).toBe(false);
    expect(cam.targetZoom).toBe(0.04);
    for (let i = 0; i < 100; i++) {
      zoomCamera(cam, 100);
      updateCamera(cam, 1 / 60, 1);
    }
    expect(isMapView(cam)).toBe(true);
  });

  it('smoothly reverses an unfinished map transition', () => {
    const cam: Camera = { zoom: 0.16, targetZoom: 30000 };
    for (let i = 0; i < 20; i++) updateCamera(cam, 1 / 60, 1);
    const before = cam.zoom;
    cam.targetZoom = 0.16;
    updateCamera(cam, 1 / 60, 1);
    expect(cam.zoom).toBeLessThan(before);
    expect(cam.zoom).toBeGreaterThan(0.16);
    for (let i = 0; i < 150; i++) updateCamera(cam, 1 / 60, 1);
    expect(cam.zoom).toBeCloseTo(0.16, 4);
  });

  it('does not snap rotation when crossing the angle branch cut', () => {
    const cam: Camera = { zoom: 0.16, targetZoom: 0.16 };
    updateCamera(cam, 1 / 60, -Math.PI / 2 + 0.0001);
    const before = cam.rotation!;
    updateCamera(cam, 1 / 60, -Math.PI / 2 - 0.0001);
    expect(Math.abs(cam.rotation! - before)).toBeLessThan(0.001);
  });

  it('keeps the craft within the viewport while recentering on Earth', () => {
    for (const [w, h] of [[390, 700], [1920, 1080]]) {
      for (let zoom = 100; zoom < 100000; zoom *= 1.03) {
        const displacement = 6571000 * centerBlend(zoom, 6571000, w, h) / zoom;
        expect(displacement).toBeLessThan(Math.min(w, h) / 2);
      }
    }
  });
});
