import type { Point, Rect, Size } from '../types.js';

/** Pan/zoom state of the canvas. Screen = world * scale + offset. */
export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;

export function createViewport(): Viewport {
  return { x: 0, y: 0, scale: 1 };
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return 1;
  }
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function toWorld(viewport: Viewport, screen: Point): Point {
  return {
    x: (screen.x - viewport.x) / viewport.scale,
    y: (screen.y - viewport.y) / viewport.scale,
  };
}

export function toScreen(viewport: Viewport, world: Point): Point {
  return { x: world.x * viewport.scale + viewport.x, y: world.y * viewport.scale + viewport.y };
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

/** Zooms by `factor`, keeping the world point currently under `anchor` in place. */
export function zoomBy(viewport: Viewport, factor: number, anchor: Point): Viewport {
  return zoomTo(viewport, viewport.scale * factor, anchor);
}

/** Zooms to an absolute scale, keeping the world point currently under `anchor` in place. */
export function zoomTo(viewport: Viewport, scale: number, anchor: Point): Viewport {
  const nextScale = clampScale(scale);
  const world = toWorld(viewport, anchor);
  return {
    scale: nextScale,
    x: anchor.x - world.x * nextScale,
    y: anchor.y - world.y * nextScale,
  };
}

/** Smallest rect containing every input rect, or `undefined` when there is nothing to fit. */
export function boundsOf(rects: readonly Rect[]): Rect | undefined {
  const first = rects[0];
  if (first === undefined) {
    return undefined;
  }
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Viewport that centers `content` inside a `size` viewport, with `padding` screen pixels. */
export function fitViewport(content: Rect, size: Size, padding = 48): Viewport {
  const availableWidth = Math.max(size.width - padding * 2, 1);
  const availableHeight = Math.max(size.height - padding * 2, 1);
  const scale = clampScale(
    Math.min(
      availableWidth / Math.max(content.width, 1),
      availableHeight / Math.max(content.height, 1),
    ),
  );
  return {
    scale,
    x: (size.width - content.width * scale) / 2 - content.x * scale,
    y: (size.height - content.height * scale) / 2 - content.y * scale,
  };
}
