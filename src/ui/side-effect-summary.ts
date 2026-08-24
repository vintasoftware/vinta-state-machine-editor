import type { SideEffect } from '../types.js';

export const EMPTY_SIDE_EFFECTS_LABEL = 'No side effects';

/**
 * Collapsed label for a side effect list: only the first one is shown, plus a
 * counter for the remaining ones, e.g. `"sendEmail and 2 more"`.
 */
export function formatSideEffectSummary(
  effects: readonly SideEffect[],
  emptyLabel: string = EMPTY_SIDE_EFFECTS_LABEL,
): string {
  const [first] = effects;
  if (first === undefined) {
    return emptyLabel;
  }
  if (effects.length === 1) {
    return first.name;
  }
  return `${first.name} and ${effects.length - 1} more`;
}

/** Accessible label describing the whole list, used as the chip's `title`. */
export function formatSideEffectTitle(effects: readonly SideEffect[]): string {
  if (effects.length === 0) {
    return EMPTY_SIDE_EFFECTS_LABEL;
  }
  return effects.map((effect, index) => `${index + 1}. ${effect.name}`).join('\n');
}
