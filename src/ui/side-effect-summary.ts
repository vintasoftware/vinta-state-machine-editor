import { formatJsonInline, hasParams } from '../model/json.js';
import type { SideEffect } from '../types.js';

export const EMPTY_SIDE_EFFECTS_LABEL = 'No side effects';

/** Suffix marking a side effect that stays attached but does not run. */
export const DISABLED_MARKER = '(off)';

/**
 * The first side effect's name, marked when it is switched off — what the
 * canvas chips show, with how many follow it left to the count badge beside
 * them.
 *
 * A disabled side effect is *marked*, never dropped: hiding one would make the
 * chip disagree with the dialog.
 */
export function formatSideEffectHead(
  effects: readonly SideEffect[],
  emptyLabel: string = EMPTY_SIDE_EFFECTS_LABEL,
): string {
  const [first] = effects;
  if (first === undefined) {
    return emptyLabel;
  }
  return first.enabled ? first.name : `${first.name} ${DISABLED_MARKER}`;
}

/**
 * Collapsed label for a side effect list: the first one, plus a counter for the
 * remaining ones, e.g. `"sendEmail and 2 more"`.
 *
 * For hosts rendering their own summary in prose, where there is room for the
 * whole sentence. The chips on the canvas have a fixed width that elides it, so
 * they pair {@link formatSideEffectHead} with a count badge instead.
 */
export function formatSideEffectSummary(
  effects: readonly SideEffect[],
  emptyLabel: string = EMPTY_SIDE_EFFECTS_LABEL,
): string {
  const head = formatSideEffectHead(effects, emptyLabel);
  if (effects.length <= 1) {
    return head;
  }
  return `${head} and ${effects.length - 1} more`;
}

/** Whether any side effect in the list carries parameters. */
export function listHasParams(effects: readonly SideEffect[]): boolean {
  return effects.some((effect) => hasParams(effect.params));
}

/** How many side effects in the list carry parameters. */
export function countWithParams(effects: readonly SideEffect[]): number {
  return effects.filter((effect) => hasParams(effect.params)).length;
}

/** How many side effects in the list are attached but switched off. */
export function countDisabled(effects: readonly SideEffect[]): number {
  return effects.filter((effect) => !effect.enabled).length;
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
      const disabled = effect.enabled ? '' : ' — disabled';
      return `${index + 1}. ${effect.name}${params}${disabled}`;
    })
    .join('\n');
}
