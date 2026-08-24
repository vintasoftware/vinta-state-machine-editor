import { describe, expect, it } from 'vitest';
import { boxAround, findFreeLabelSpot, rectsOverlap } from '../src/geometry/placement.js';
import type { Rect, Size } from '../src/types.js';

const CARD: Size = { width: 100, height: 40 };

describe('boxAround', () => {
  it('centres the box on the point', () => {
    expect(boxAround({ x: 50, y: 20 }, CARD)).toEqual({ x: 0, y: 0, width: 100, height: 40 });
  });
});

describe('rectsOverlap', () => {
  const base: Rect = { x: 0, y: 0, width: 10, height: 10 };

  it('detects a real overlap', () => {
    expect(rectsOverlap(base, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });

  it('treats touching edges as clear', () => {
    expect(rectsOverlap(base, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
    expect(rectsOverlap(base, { x: 0, y: 10, width: 10, height: 10 })).toBe(false);
  });

  it('detects nothing when they are apart on either axis', () => {
    expect(rectsOverlap(base, { x: 40, y: 0, width: 10, height: 10 })).toBe(false);
    expect(rectsOverlap(base, { x: 0, y: 40, width: 10, height: 10 })).toBe(false);
  });
});

describe('findFreeLabelSpot', () => {
  it('leaves a free spot exactly where it was asked for', () => {
    const desired = { x: 500, y: 500 };
    expect(findFreeLabelSpot(desired, CARD, [])).toBe(desired);
    expect(findFreeLabelSpot(desired, CARD, [{ x: 0, y: 0, width: 10, height: 10 }])).toBe(desired);
  });

  it('steps out of an occupied spot', () => {
    const desired = { x: 0, y: 0 };
    const taken = boxAround(desired, CARD);
    const spot = findFreeLabelSpot(desired, CARD, [taken]);
    expect(rectsOverlap(boxAround(spot, CARD), taken)).toBe(false);
  });

  it('moves vertically first, since a card is wider than it is tall', () => {
    // Down clears the neighbour in the shortest distance, so it is tried first.
    expect(findFreeLabelSpot({ x: 0, y: 0 }, CARD, [boxAround({ x: 0, y: 0 }, CARD)])).toEqual({
      x: 0,
      y: 52,
    });
  });

  it('keeps stepping until it finds room', () => {
    const desired = { x: 0, y: 0 };
    // Everything within one ring vertically is taken, so it has to go further.
    const taken = [-52, 0, 52].map((y) => boxAround({ x: 0, y }, CARD));
    const spot = findFreeLabelSpot(desired, CARD, taken);
    expect(taken.every((rect) => !rectsOverlap(boxAround(spot, CARD), rect))).toBe(true);
  });

  it('gives up rather than flinging the card into the distance', () => {
    const desired = { x: 0, y: 0 };
    // A wall big enough to swallow every ring: the card would stop reading as
    // belonging to its own edge long before a free spot turned up.
    const wall: Rect = { x: -5000, y: -5000, width: 10000, height: 10000 };
    expect(findFreeLabelSpot(desired, CARD, [wall])).toBe(desired);
  });

  it('honours a tighter ring budget', () => {
    const taken = [0, 52, 104, 156].map((y) => boxAround({ x: 0, y }, CARD));
    expect(findFreeLabelSpot({ x: 0, y: 0 }, CARD, taken, 1)).not.toEqual({ x: 0, y: 0 });
  });
});
