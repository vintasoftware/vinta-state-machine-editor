import { findState, findTransition } from '../model/machine.js';
import type { SideEffectListRef, StateMachine } from '../types.js';

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

/** Short label used by the chips inside a node/edge card. */
export function shortHookLabel(ref: SideEffectListRef): string {
  if (ref.kind === 'state') {
    return `${ref.trigger} · ${ref.phase}`;
  }
  return ref.phase;
}
