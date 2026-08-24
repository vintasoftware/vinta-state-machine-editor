import type { Point, Rect, Size } from '../types.js';

/** Gap left between a card and whatever it was moved clear of. */
const GUTTER = 12;

/**
 * Directions tried around a taken spot, nearest-first within a ring.
 *
 * Vertical comes first on purpose: a transition card is far wider than it is
 * tall, so moving it up or down escapes its neighbour in the shortest distance
 * and keeps the edge's bend gentle.
 */
const DIRECTIONS: readonly Point[] = [
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 1, y: 1 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
];

/** The box a card of `size` occupies when centred on `center`. */
export function boxAround(center: Point, size: Size): Rect {
  return {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Nearest spot to `desired` where a card of `size` covers nothing in `occupied`.
 *
 * Used when a transition is created: its card would otherwise land wherever the
 * edge's midpoint happens to be, which is regularly on top of a card that is
 * already there. The search steps out in whole card widths, so one ring is
 * always enough to clear one neighbour, and gives up after `rings` rather than
 * flinging the card somewhere it no longer reads as belonging to its edge.
 *
 * Returns `desired` untouched when it is already free — the common case, and
 * the one where the editor should not be inventing an offset.
 */
export function findFreeLabelSpot(
  desired: Point,
  size: Size,
  occupied: readonly Rect[],
  rings = 4,
): Point {
  const isFree = (center: Point): boolean => {
    const box = boxAround(center, size);
    return !occupied.some((rect) => rectsOverlap(box, rect));
  };
  if (isFree(desired)) {
    return desired;
  }
  for (let ring = 1; ring <= rings; ring += 1) {
    for (const direction of DIRECTIONS) {
      const candidate = {
        x: desired.x + direction.x * (size.width + GUTTER) * ring,
        y: desired.y + direction.y * (size.height + GUTTER) * ring,
      };
      if (isFree(candidate)) {
        return candidate;
      }
    }
  }
  return desired;
}
