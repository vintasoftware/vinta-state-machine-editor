import { formatJsonInline, hasParams } from '../model/json.js';
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

/** Whether any side effect in the list carries parameters. */
export function listHasParams(effects: readonly SideEffect[]): boolean {
  return effects.some((effect) => hasParams(effect.params));
}

/** How many side effects in the list carry parameters. */
export function countWithParams(effects: readonly SideEffect[]): number {
  return effects.filter((effect) => hasParams(effect.params)).length;
}

/**
 * Accessible label describing the whole list, used as the chip's `title`.
 * Parameters are appended inline so the tooltip shows what each one receives.
 */
export function formatSideEffectTitle(effects: readonly SideEffect[]): string {
  if (effects.length === 0) {
    return EMPTY_SIDE_EFFECTS_LABEL;
  }
  return effects
    .map((effect, index) => {
      const params = hasParams(effect.params) ? ` ${formatJsonInline(effect.params)}` : '';
      return `${index + 1}. ${effect.name}${params}`;
    })
    .join('\n');
}
