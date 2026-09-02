import { findState, findTransition } from '../model/machine.js';
import type { ElementRef, MachineChange, SideEffectListRef, StateMachine } from '../types.js';
import { DEFAULT_STRINGS, type EditorStrings } from './strings.js';

/**
 * Name of a transition's source, or of the start pseudo-node for a creation
 * edge, in English. Translated hosts read `source.start` off their own set.
 */
export const START_NODE_LABEL = 'the start';

export interface SideEffectListLabels {
  readonly title: string;
  readonly description: string;
}

/** Human readable description of the list addressed by `ref`. */
export function describeSideEffectList(
  machine: StateMachine,
  ref: SideEffectListRef,
  strings: EditorStrings = DEFAULT_STRINGS,
): SideEffectListLabels {
  const phase = strings.phase[ref.phase];
  if (ref.kind === 'state') {
    const name = findState(machine, ref.stateId)?.name ?? ref.stateId;
    const verb = strings.triggerVerb[ref.trigger];
    return {
      title: strings.sideEffects.stateTitle({ phase, verb }),
      description: strings.sideEffects.stateDescription({ phase, verb, name }),
    };
  }
  const name = findTransition(machine, ref.transitionId)?.name ?? ref.transitionId;
  return {
    title: strings.sideEffects.transitionTitle({ phase }),
    description: strings.sideEffects.transitionDescription({ phase, name }),
  };
}

/** Short label used by the chips inside a node/edge card, phase first. */
export function shortHookLabel(
  ref: SideEffectListRef,
  strings: EditorStrings = DEFAULT_STRINGS,
): string {
  const phase = strings.phase[ref.phase];
  if (ref.kind === 'state') {
    return strings.chip.hookLabel({ phase, trigger: strings.trigger[ref.trigger] });
  }
  return phase;
}

/** Human readable title and subtitle for the properties dialog of one element. */
export function describeElement(
  machine: StateMachine,
  ref: ElementRef,
  strings: EditorStrings = DEFAULT_STRINGS,
): SideEffectListLabels {
  if (ref.kind === 'state') {
    const name = findState(machine, ref.id)?.name ?? ref.id;
    return {
      title: strings.properties.title({ name }),
      description: strings.properties.stateDescription({ name }),
    };
  }
  const transition = findTransition(machine, ref.id);
  const name = transition?.name ?? ref.id;
  const source =
    transition === undefined || transition.from === null
      ? strings.source.start
      : strings.source.state({
          name: findState(machine, transition.from)?.name ?? transition.from,
        });
  const target = strings.source.state({
    name: findState(machine, transition?.to ?? '')?.name ?? transition?.to ?? '',
  });
  return {
    title: strings.properties.title({ name }),
    description: strings.properties.transitionDescription({ source, target }),
  };
}

/** What to call a transition's source in prose. */
export function describeSource(
  machine: StateMachine,
  from: string | null,
  strings: EditorStrings = DEFAULT_STRINGS,
): string {
  return from === null ? strings.source.start : (findState(machine, from)?.name ?? from);
}

/**
 * Label for an undo or redo control, e.g. `Undo add state`. Without a change to
 * name — nothing left to take back — it is the bare verb.
 *
 * The change is handed to a function rather than appended, because where the
 * verb goes is the sentence's business: English puts it first, Japanese last.
 */
export function historyLabel(
  command: 'undo' | 'redo',
  change: MachineChange | undefined,
  strings: EditorStrings = DEFAULT_STRINGS,
): string {
  if (change === undefined) {
    return command === 'undo' ? strings.toolbar.undo : strings.toolbar.redo;
  }
  const named = { change: strings.change[change.kind] };
  return command === 'undo' ? strings.toolbar.undoChange(named) : strings.toolbar.redoChange(named);
}
