import { describeChange, findState, findTransition } from '../model/machine.js';
import type { ElementRef, MachineChange, SideEffectListRef, StateMachine } from '../types.js';

/** Name of a transition's source, or of the start pseudo-node for a creation edge. */
export const START_NODE_LABEL = 'the start';

export interface SideEffectListLabels {
  readonly title: string;
  readonly description: string;
}

/** Human readable description of the list addressed by `ref`. */
export function describeSideEffectList(
  machine: StateMachine,
  ref: SideEffectListRef,
): SideEffectListLabels {
  if (ref.kind === 'state') {
    const name = findState(machine, ref.stateId)?.name ?? ref.stateId;
    const verb = ref.trigger === 'enter' ? 'entering' : 'leaving';
    return {
      title: `Side effects · ${ref.phase} ${verb}`,
      description: `Runs ${ref.phase} ${verb} the state “${name}”.`,
    };
  }
  const name = findTransition(machine, ref.transitionId)?.name ?? ref.transitionId;
  return {
    title: `Side effects · ${ref.phase} transition`,
    description: `Runs ${ref.phase} the transition “${name}”.`,
  };
}

/** Short label used by the chips inside a node/edge card, phase first. */
export function shortHookLabel(ref: SideEffectListRef): string {
  if (ref.kind === 'state') {
    return `${ref.phase} · ${ref.trigger}`;
  }
  return ref.phase;
}

/** Human readable title and subtitle for the properties dialog of one element. */
export function describeElement(machine: StateMachine, ref: ElementRef): SideEffectListLabels {
  if (ref.kind === 'state') {
    const name = findState(machine, ref.id)?.name ?? ref.id;
    return {
      title: `Properties · ${name}`,
      description: `Attributes of the state “${name}”.`,
    };
  }
  const transition = findTransition(machine, ref.id);
  const name = transition?.name ?? ref.id;
  const source =
    transition === undefined || transition.from === null
      ? START_NODE_LABEL
      : `“${findState(machine, transition.from)?.name ?? transition.from}”`;
  const target = `“${findState(machine, transition?.to ?? '')?.name ?? transition?.to ?? ''}”`;
  return {
    title: `Properties · ${name}`,
    description: `Attributes of the transition from ${source} to ${target}.`,
  };
}

/** What to call a transition's source in prose. */
export function describeSource(machine: StateMachine, from: string | null): string {
  return from === null ? START_NODE_LABEL : (findState(machine, from)?.name ?? from);
}

/**
 * Label for an undo or redo control, e.g. `Undo move state`. Without a change
 * to name — nothing left to take back — it is the bare verb.
 */
export function historyLabel(verb: 'Undo' | 'Redo', change: MachineChange | undefined): string {
  if (change === undefined) {
    return verb;
  }
  const described = describeChange(change);
  return `${verb} ${described.charAt(0).toLowerCase()}${described.slice(1)}`;
}
