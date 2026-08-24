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

  return quadraticGeometry(borderPoint(source, control), control, borderPoint(target, control));
}

interface CubicControls {
  readonly start: Point;
  readonly control1: Point;
  readonly control2: Point;
  readonly end: Point;
}

function selfEdgeControls(rect: Rect, index: number): CubicControls {
  const reach = 56 + index * 22;
  const start: Point = { x: rect.x + rect.width * 0.65, y: rect.y };
  const end: Point = { x: rect.x + rect.width, y: rect.y + rect.height * 0.4 };
  return {
    start,
    end,
    control1: { x: start.x, y: start.y - reach },
    control2: { x: end.x + reach, y: end.y - reach },
  };
}

function cubicGeometry(controls: CubicControls): EdgeGeometry {
  const { start, control1, control2, end } = controls;
  return {
    path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${end.x} ${end.y}`,
    source: start,
    target: end,
    label: cubicAt(start, control1, control2, end, 0.5),
    arrowAngle: angleBetween(control2, end),
  };
}

/** Geometry for a transition whose source and target are the same state. */
export function computeSelfEdgeGeometry(rect: Rect, index = 0): EdgeGeometry {
  return cubicGeometry(selfEdgeControls(rect, index));
}

function quadraticGeometry(start: Point, control: Point, end: Point): EdgeGeometry {
  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    source: start,
    target: end,
    label: quadraticAt(start, control, end, 0.5),
    arrowAngle: angleBetween(control, end),
  };
}

/**
 * Reshapes an edge so that its midpoint — where the transition card sits — lands
 * exactly on `through`. Dragging a card therefore bends its line instead of
 * detaching the label from it.
 *
 * A quadratic through `M` at `t = 0.5` needs `C = 2M - (P0 + P2) / 2`. The border
 * anchors depend on `C`, so the control point is solved twice: once against a
 * rough aim at `through`, then again against the anchors that produced.
 */
export function bendEdgeThrough(source: Rect, target: Rect, through: Point): EdgeGeometry {
  const controlFor = (start: Point, end: Point): Point => ({
    x: 2 * through.x - (start.x + end.x) / 2,
    y: 2 * through.y - (start.y + end.y) / 2,
  });
  const rough = controlFor(borderPoint(source, through), borderPoint(target, through));
  const start = borderPoint(source, rough);
  const end = borderPoint(target, rough);
  return quadraticGeometry(start, controlFor(start, end), end);
}

/**
 * Same idea for a self transition: shifting both cubic control points by `k`
 * moves the curve's midpoint by `0.75k`, so aim for `4/3` of the gap.
 */
export function bendSelfEdgeThrough(rect: Rect, index: number, through: Point): EdgeGeometry {
  const controls = selfEdgeControls(rect, index);
  const base = cubicAt(controls.start, controls.control1, controls.control2, controls.end, 0.5);
  const pull = { x: ((through.x - base.x) * 4) / 3, y: ((through.y - base.y) * 4) / 3 };
  return cubicGeometry({
    ...controls,
    control1: { x: controls.control1.x + pull.x, y: controls.control1.y + pull.y },
    control2: { x: controls.control2.x + pull.x, y: controls.control2.y + pull.y },
  });
}

/** One creation edge competing for a slot on the start bar. */
export interface CreationAnchorInput {
  readonly id: string;
  /**
   * Height the edge heads for once it leaves the bar — the vertical position of
   * its own card, which is where the curve is bent through. Measured against a
   * neutral anchor so it does not depend on the slot being chosen here.
   */
  readonly labelY: number;
}

/**
 * Which creation edge leaves the start bar from which slot, top to bottom.
 *
 * Every one of these edges starts on the same vertical line, so two of them
 * cross exactly when one starts above the other and ends below it. Handing out
 * the slots in the order of where the edges are heading therefore removes every
 * crossing the layout is free to remove — what is left is edges heading for the
 * same place, which no ordering can separate and the fanning already handles.
 *
 * The key is the card's height rather than the target state's, because the edge
 * is bent through its card: dragging a card is what changes where the line goes,
 * so it has to be what changes which slot the line leaves from.
 *
 * Ties break on the id so the assignment is stable: two edges at the same height
 * must not swap slots between renders.
 */
export function orderCreationAnchors(edges: readonly CreationAnchorInput[]): readonly string[] {
  return [...edges]
    .sort((a, b) => a.labelY - b.labelY || (a.id < b.id ? -1 : Number(a.id > b.id)))
    .map((edge) => edge.id);
}

/** Point on the right edge of the start bar that slot `index` of `total` sits at. */
export function creationAnchorPoint(bar: Rect, index: number, total: number): Point {
  return {
    x: bar.x + bar.width,
    y: bar.y + (bar.height * (index + 0.5)) / Math.max(total, 1),
  };
}
