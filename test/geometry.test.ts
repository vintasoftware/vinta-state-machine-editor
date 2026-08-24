import { describe, expect, it } from 'vitest';
import {
  borderPoint,
  computeEdgeGeometry,
  computeSelfEdgeGeometry,
  curvatureFor,
} from '../src/geometry/edge.js';
import {
  boundsOf,
  clampScale,
  createViewport,
  distanceBetween,
  fitViewport,
  MAX_SCALE,
  MIN_SCALE,
  midpointOf,
  normalizeWheelDelta,
  panBy,
  pinchScale,
  toScreen,
  toWorld,
  wheelZoomFactor,
  zoomBy,
  zoomTo,
} from '../src/geometry/viewport.js';

describe('viewport', () => {
  it('round-trips between world and screen coordinates', () => {
    const viewport = { x: 30, y: -10, scale: 1.5 };
    const world = { x: 12, y: 44 };
    expect(toWorld(viewport, toScreen(viewport, world))).toEqual(world);
  });

  it('pans by screen deltas', () => {
    expect(panBy(createViewport(), 10, -5)).toEqual({ x: 10, y: -5, scale: 1 });
  });

  it('keeps the anchor point fixed while zooming', () => {
    const viewport = { x: 20, y: 20, scale: 1 };
    const anchor = { x: 150, y: 90 };
    const before = toWorld(viewport, anchor);
    const after = toWorld(zoomBy(viewport, 2, anchor), anchor);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('clamps the scale to the supported range', () => {
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(0.0001)).toBe(MIN_SCALE);
    expect(clampScale(Number.NaN)).toBe(1);
    expect(zoomTo(createViewport(), 100, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
  });

  it('computes bounds of several rects', () => {
    expect(boundsOf([])).toBeUndefined();
    expect(
      boundsOf([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 40, y: -20, width: 10, height: 5 },
      ]),
    ).toEqual({ x: 0, y: -20, width: 50, height: 30 });
  });

  it('fits content in the middle of the viewport', () => {
    const content = { x: 0, y: 0, width: 200, height: 100 };
    const viewport = fitViewport(content, { width: 400, height: 300 }, 0);
    expect(viewport.scale).toBe(2);
    const center = toScreen(viewport, { x: 100, y: 50 });
    expect(center).toEqual({ x: 200, y: 150 });
  });
});

describe('edge geometry', () => {
  const left = { x: 0, y: 0, width: 100, height: 60 };
  const right = { x: 300, y: 0, width: 100, height: 60 };

  it('anchors on the rect border towards the other node', () => {
    expect(borderPoint(left, { x: 500, y: 30 })).toEqual({ x: 100, y: 30 });
    expect(borderPoint(left, { x: 50, y: -100 })).toEqual({ x: 50, y: 0 });
    expect(borderPoint(left, { x: 50, y: 30 })).toEqual({ x: 50, y: 30 });
  });

  it('produces a straight path with no curvature', () => {
    const geometry = computeEdgeGeometry(left, right, 0);
    expect(geometry.source).toEqual({ x: 100, y: 30 });
    expect(geometry.target).toEqual({ x: 300, y: 30 });
    expect(geometry.label).toEqual({ x: 200, y: 30 });
    expect(geometry.arrowAngle).toBe(0);
    expect(geometry.path).toBe('M 100 30 Q 200 30 300 30');
  });

  it('bends parallel edges to opposite sides', () => {
    expect(curvatureFor(0)).toBe(0);
    expect(curvatureFor(1)).toBeGreaterThan(0);
    expect(curvatureFor(2)).toBe(-curvatureFor(1));
    const bent = computeEdgeGeometry(left, right, 60);
    expect(bent.label.y).toBeGreaterThan(30);
  });

  it('draws a loop for self transitions, growing with the index', () => {
    const first = computeSelfEdgeGeometry(left, 0);
    const second = computeSelfEdgeGeometry(left, 1);
    expect(first.path.startsWith('M ')).toBe(true);
    expect(first.path).toContain('C ');
    expect(second.label.y).toBeLessThan(first.label.y);
  });
});

describe('gesture math', () => {
  it('measures distance and midpoint between two pointers', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpointOf({ x: 0, y: 10 }, { x: 10, y: 30 })).toEqual({ x: 5, y: 20 });
  });

  it('scales a pinch by how much the fingers spread', () => {
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(1, 200, 100)).toBe(0.5);
    expect(pinchScale(2, 100, 100)).toBe(2);
  });

  it('clamps pinch scale and survives degenerate distances', () => {
    expect(pinchScale(1, 100, 100_000)).toBe(MAX_SCALE);
    expect(pinchScale(1, 100, 1)).toBe(MIN_SCALE);
    expect(pinchScale(1.5, 0, 100)).toBe(1.5);
    expect(pinchScale(1.5, 100, 0)).toBe(1.5);
  });

  it('normalizes wheel deltas across delta modes', () => {
    expect(normalizeWheelDelta(100, 0)).toBe(100);
    expect(normalizeWheelDelta(3, 1)).toBe(48);
    expect(normalizeWheelDelta(1, 2)).toBe(400);
    expect(normalizeWheelDelta(Number.NaN, 0)).toBe(0);
  });

  it('turns wheel deltas into a continuous zoom factor', () => {
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(-10)).toBeGreaterThan(1);
    expect(wheelZoomFactor(10)).toBeLessThan(1);
    // Small trackpad pinch steps stay small.
    expect(wheelZoomFactor(-4)).toBeLessThan(1.02);
    // One notch of a mouse wheel is a visible step.
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1.4);
  });

  it('never lets a single wheel event jump more than 2x', () => {
    expect(wheelZoomFactor(-100_000)).toBe(2);
    expect(wheelZoomFactor(100_000)).toBe(0.5);
    expect(wheelZoomFactor(-100, 2)).toBe(2);
  });
});
