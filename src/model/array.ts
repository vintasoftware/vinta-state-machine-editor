/** Returns a copy of `items` with the element at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (from === to) {
    return items;
  }
  if (from < 0 || from >= items.length) {
    throw new RangeError(`Cannot move index ${from}: out of bounds (length ${items.length}).`);
  }
  if (to < 0 || to >= items.length) {
    throw new RangeError(`Cannot move to index ${to}: out of bounds (length ${items.length}).`);
  }
  const next = [...items];
  const [moved, ...rest] = next.splice(from, 1);
  if (moved === undefined || rest.length > 0) {
    throw new RangeError(`Cannot move index ${from}: out of bounds (length ${items.length}).`);
  }
  next.splice(to, 0, moved);
  return next;
}

/** Returns a copy of `items` with `item` inserted at `index` (clamped to the bounds). */
export function insertItem<T>(items: readonly T[], item: T, index: number): readonly T[] {
  const next = [...items];
  next.splice(Math.min(Math.max(index, 0), items.length), 0, item);
  return next;
}
