import type { Point, Rect } from '../types.js';

export interface EdgeGeometry {
  /** SVG path data for the edge. */
  readonly path: string;
  readonly source: Point;
  readonly target: Point;
  /** Point where the transition card should be anchored. */
  readonly label: Point;
  /** Direction of the arrow head at the target, in degrees. */
  readonly arrowAngle: number;
}

function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Point where the segment from the rect center towards `towards` crosses the rect border. */
export function borderPoint(rect: Rect, towards: Point): Point {
  const origin = center(rect);
  const dx = towards.x - origin.x;
  const dy = towards.y - origin.y;
  if (dx === 0 && dy === 0) {
    return origin;
  }
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : rect.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : rect.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: origin.x + dx * scale, y: origin.y + dy * scale };
}

function quadraticAt(from: Point, control: Point, to: Point, t: number): Point {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  };
}

function cubicAt(from: Point, c1: Point, c2: Point, to: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
    y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
  };
}

function angleBetween(from: Point, to: Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

/**
 * Offset applied to the nth parallel edge between the same pair of states so they
 * do not overlap. Index 0 stays straight; the others alternate sides.
 */
export function curvatureFor(index: number, spacing = 46): number {
  if (index === 0) {
    return 0;
  }
  const step = Math.ceil(index / 2) * spacing;
  return index % 2 === 1 ? step : -step;
}

/** Geometry for an edge between two distinct node rects. */
export function computeEdgeGeometry(source: Rect, target: Rect, curvature = 0): EdgeGeometry {
  const sourceCenter = center(source);
  const targetCenter = center(target);
  const midpoint = {
    x: (sourceCenter.x + targetCenter.x) / 2,
    y: (sourceCenter.y + targetCenter.y) / 2,
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const length = Math.hypot(dx, dy) || 1;
  const control: Point = {
    x: midpoint.x + (-dy / length) * curvature,
    y: midpoint.y + (dx / length) * curvature,
  };

  const start = borderPoint(source, control);
  const end = borderPoint(target, control);
  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    source: start,
    target: end,
    label: quadraticAt(start, control, end, 0.5),
    arrowAngle: angleBetween(control, end),
  };
}

/** Geometry for a transition whose source and target are the same state. */
export function computeSelfEdgeGeometry(rect: Rect, index = 0): EdgeGeometry {
  const reach = 56 + index * 22;
  const start: Point = { x: rect.x + rect.width * 0.65, y: rect.y };
  const end: Point = { x: rect.x + rect.width, y: rect.y + rect.height * 0.4 };
  const control1: Point = { x: start.x, y: start.y - reach };
  const control2: Point = { x: end.x + reach, y: end.y - reach };
  return {
    path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${end.x} ${end.y}`,
    source: start,
    target: end,
    label: cubicAt(start, control1, control2, end, 0.5),
    arrowAngle: angleBetween(control2, end),
  };
}
