import { formatJsonInline, hasParams } from '../model/json.js';
import type { SideEffect } from '../types.js';
import { DEFAULT_STRINGS, type EditorStrings } from './strings.js';

/** What an empty list reads as, in English. Translated hosts override `chip.empty`. */
export const EMPTY_SIDE_EFFECTS_LABEL = 'No side effects';

/** Suffix marking a side effect that stays attached but does not run, in English. */
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
  emptyLabel?: string,
  strings: EditorStrings = DEFAULT_STRINGS,
): string {
  const [first] = effects;
  if (first === undefined) {
    return emptyLabel ?? strings.chip.empty;
  }
  return first.enabled ? first.name : strings.sideEffect.disabled({ name: first.name });
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
  emptyLabel?: string,
  strings: EditorStrings = DEFAULT_STRINGS,
): string {
  const head = formatSideEffectHead(effects, emptyLabel, strings);
  if (effects.length <= 1) {
    return head;
  }
  return strings.sideEffect.summary({ head, count: effects.length - 1 });
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
export function formatSideEffectTitle(
  effects: readonly SideEffect[],
  strings: EditorStrings = DEFAULT_STRINGS,
): string {
  if (effects.length === 0) {
    return strings.chip.empty;
  }
  return effects
    .map((effect, index) =>
      strings.sideEffect.titleEntry({
        index: index + 1,
        name: effect.name,
        params: hasParams(effect.params) ? ` ${formatJsonInline(effect.params)}` : '',
        disabled: !effect.enabled,
      }),
    )
    .join('\n');
}
