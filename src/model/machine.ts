import type {
  JsonObject,
  MachineChange,
  Point,
  SideEffect,
  SideEffectDefinition,
  SideEffectHooks,
  SideEffectListRef,
  SideEffectPhase,
  StateMachine,
  StateNode,
  Transition,
} from '../types.js';
import { insertItem, moveItem } from './array.js';
import { StateMachineError } from './errors.js';
import { createId } from './id.js';
import { emptyParams } from './json.js';

type SideEffectListUpdater = (effects: readonly SideEffect[]) => readonly SideEffect[];

export function emptyHooks(): SideEffectHooks {
  return { before: [], after: [] };
}

export function createEmptyMachine(): StateMachine {
  return { states: [], transitions: [], initialStateIds: [], finalStateIds: [] };
}

export function createState(options: {
  readonly name: string;
  readonly position: Point;
  readonly id?: string;
}): StateNode {
  return {
    id: options.id ?? createId('state'),
    name: options.name,
    position: options.position,
    onEnter: emptyHooks(),
    onLeave: emptyHooks(),
  };
}

export function createTransition(options: {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly id?: string;
  readonly labelOffset?: Point;
}): Transition {
  return {
    id: options.id ?? createId('transition'),
    name: options.name,
    from: options.from,
    to: options.to,
    labelOffset: options.labelOffset ?? { x: 0, y: 0 },
    effects: emptyHooks(),
  };
}

export function createSideEffect(definition: SideEffectDefinition, id?: string): SideEffect {
  return {
    id: id ?? createId('effect'),
    definitionId: definition.id,
    name: definition.name,
    params: definition.defaultParams ?? emptyParams(),
  };
}

export function findState(machine: StateMachine, stateId: string): StateNode | undefined {
  return machine.states.find((state) => state.id === stateId);
}

export function findTransition(machine: StateMachine, id: string): Transition | undefined {
  return machine.transitions.find((transition) => transition.id === id);
}

function requireState(machine: StateMachine, stateId: string): StateNode {
  const state = findState(machine, stateId);
  if (state === undefined) {
    throw new StateMachineError(`Unknown state "${stateId}".`);
  }
  return state;
}

function requireTransition(machine: StateMachine, id: string): Transition {
  const transition = findTransition(machine, id);
  if (transition === undefined) {
    throw new StateMachineError(`Unknown transition "${id}".`);
  }
  return transition;
}

export function addState(machine: StateMachine, state: StateNode): StateMachine {
  if (findState(machine, state.id) !== undefined) {
    throw new StateMachineError(`Duplicated state id "${state.id}".`);
  }
  return { ...machine, states: [...machine.states, state] };
}

export function updateState(
  machine: StateMachine,
  stateId: string,
  patch: { readonly name?: string; readonly position?: Point },
): StateMachine {
  const current = requireState(machine, stateId);
  const next: StateNode = {
    ...current,
    name: patch.name ?? current.name,
    position: patch.position ?? current.position,
  };
  return {
    ...machine,
    states: machine.states.map((state) => (state.id === stateId ? next : state)),
  };
}

/** Removes a state along with every transition touching it, and any role it held. */
export function removeState(machine: StateMachine, stateId: string): StateMachine {
  requireState(machine, stateId);
  return {
    states: machine.states.filter((state) => state.id !== stateId),
    transitions: machine.transitions.filter(
      (transition) => transition.from !== stateId && transition.to !== stateId,
    ),
    initialStateIds: machine.initialStateIds.filter((id) => id !== stateId),
    finalStateIds: machine.finalStateIds.filter((id) => id !== stateId),
  };
}

export function isInitialState(machine: StateMachine, stateId: string): boolean {
  return machine.initialStateIds.includes(stateId);
}

export function isFinalState(machine: StateMachine, stateId: string): boolean {
  return machine.finalStateIds.includes(stateId);
}

function uniqueKnownStates(machine: StateMachine, stateIds: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const stateId of stateIds) {
    requireState(machine, stateId);
    seen.add(stateId);
  }
  // Keep the caller's order, minus duplicates.
  return stateIds.filter(
    (stateId, index) => stateIds.indexOf(stateId) === index && seen.has(stateId),
  );
}

/** Replaces the list of states the machine may start in. */
export function setInitialStates(machine: StateMachine, stateIds: readonly string[]): StateMachine {
  return { ...machine, initialStateIds: uniqueKnownStates(machine, stateIds) };
}

/** Replaces the list of states that end the machine. */
export function setFinalStates(machine: StateMachine, stateIds: readonly string[]): StateMachine {
  return { ...machine, finalStateIds: uniqueKnownStates(machine, stateIds) };
}

export function toggleInitialState(machine: StateMachine, stateId: string): StateMachine {
  requireState(machine, stateId);
  return setInitialStates(
    machine,
    isInitialState(machine, stateId)
      ? machine.initialStateIds.filter((id) => id !== stateId)
      : [...machine.initialStateIds, stateId],
  );
}

export function toggleFinalState(machine: StateMachine, stateId: string): StateMachine {
  requireState(machine, stateId);
  return setFinalStates(
    machine,
    isFinalState(machine, stateId)
      ? machine.finalStateIds.filter((id) => id !== stateId)
      : [...machine.finalStateIds, stateId],
  );
}

export function addTransition(machine: StateMachine, transition: Transition): StateMachine {
  if (findTransition(machine, transition.id) !== undefined) {
    throw new StateMachineError(`Duplicated transition id "${transition.id}".`);
  }
  requireState(machine, transition.from);
  requireState(machine, transition.to);
  return { ...machine, transitions: [...machine.transitions, transition] };
}

export function updateTransition(
  machine: StateMachine,
  transitionId: string,
  patch: {
    readonly name?: string;
    readonly from?: string;
    readonly to?: string;
    readonly labelOffset?: Point;
  },
): StateMachine {
  const current = requireTransition(machine, transitionId);
  const from = patch.from ?? current.from;
  const to = patch.to ?? current.to;
  requireState(machine, from);
  requireState(machine, to);
  const next: Transition = {
    ...current,
    name: patch.name ?? current.name,
    from,
    to,
    labelOffset: patch.labelOffset ?? current.labelOffset,
  };
  return {
    ...machine,
    transitions: machine.transitions.map((transition) =>
      transition.id === transitionId ? next : transition,
    ),
  };
}

export function removeTransition(machine: StateMachine, transitionId: string): StateMachine {
  requireTransition(machine, transitionId);
  return {
    ...machine,
    transitions: machine.transitions.filter((transition) => transition.id !== transitionId),
  };
}

function readPhase(hooks: SideEffectHooks, phase: SideEffectPhase): readonly SideEffect[] {
  return phase === 'before' ? hooks.before : hooks.after;
}

function writePhase(
  hooks: SideEffectHooks,
  phase: SideEffectPhase,
  update: SideEffectListUpdater,
): SideEffectHooks {
  return phase === 'before'
    ? { ...hooks, before: update(hooks.before) }
    : { ...hooks, after: update(hooks.after) };
}

/** Reads the ordered side effect list addressed by `ref`. */
export function getSideEffects(
  machine: StateMachine,
  ref: SideEffectListRef,
): readonly SideEffect[] {
  if (ref.kind === 'state') {
    const state = requireState(machine, ref.stateId);
    return readPhase(ref.trigger === 'enter' ? state.onEnter : state.onLeave, ref.phase);
  }
  return readPhase(requireTransition(machine, ref.transitionId).effects, ref.phase);
}

/** Applies `update` to the ordered side effect list addressed by `ref`. */
export function updateSideEffects(
  machine: StateMachine,
  ref: SideEffectListRef,
  update: SideEffectListUpdater,
): StateMachine {
  if (ref.kind === 'state') {
    const state = requireState(machine, ref.stateId);
    const next: StateNode =
      ref.trigger === 'enter'
        ? { ...state, onEnter: writePhase(state.onEnter, ref.phase, update) }
        : { ...state, onLeave: writePhase(state.onLeave, ref.phase, update) };
    return {
      ...machine,
      states: machine.states.map((item) => (item.id === state.id ? next : item)),
    };
  }
  const transition = requireTransition(machine, ref.transitionId);
  const next: Transition = {
    ...transition,
    effects: writePhase(transition.effects, ref.phase, update),
  };
  return {
    ...machine,
    transitions: machine.transitions.map((item) => (item.id === transition.id ? next : item)),
  };
}

export function setSideEffects(
  machine: StateMachine,
  ref: SideEffectListRef,
  effects: readonly SideEffect[],
): StateMachine {
  return updateSideEffects(machine, ref, () => [...effects]);
}

export function addSideEffect(
  machine: StateMachine,
  ref: SideEffectListRef,
  effect: SideEffect,
  index?: number,
): StateMachine {
  return updateSideEffects(machine, ref, (effects) =>
    insertItem(effects, effect, index ?? effects.length),
  );
}

export function removeSideEffect(
  machine: StateMachine,
  ref: SideEffectListRef,
  effectId: string,
): StateMachine {
  return updateSideEffects(machine, ref, (effects) => {
    const next = effects.filter((effect) => effect.id !== effectId);
    if (next.length === effects.length) {
      throw new StateMachineError(`Unknown side effect "${effectId}".`);
    }
    return next;
  });
}

/** Replaces the JSON parameters of one attached side effect. */
export function setSideEffectParams(
  machine: StateMachine,
  ref: SideEffectListRef,
  effectId: string,
  params: JsonObject,
): StateMachine {
  return updateSideEffects(machine, ref, (effects) => {
    if (!effects.some((effect) => effect.id === effectId)) {
      throw new StateMachineError(`Unknown side effect "${effectId}".`);
    }
    return effects.map((effect) => (effect.id === effectId ? { ...effect, params } : effect));
  });
}

export function moveSideEffect(
  machine: StateMachine,
  ref: SideEffectListRef,
  from: number,
  to: number,
): StateMachine {
  return updateSideEffects(machine, ref, (effects) => moveItem(effects, from, to));
}

/** Transitions sharing the same unordered endpoint pair, used to fan out parallel edges. */
export function siblingTransitions(
  machine: StateMachine,
  transition: Transition,
): readonly Transition[] {
  return machine.transitions.filter(
    (candidate) =>
      (candidate.from === transition.from && candidate.to === transition.to) ||
      (candidate.from === transition.to && candidate.to === transition.from),
  );
}

/** Human readable description of a change, handy for undo stacks and logs. */
export function describeChange(change: MachineChange): string {
  switch (change.kind) {
    case 'state-add':
      return 'Add state';
    case 'state-remove':
      return 'Remove state';
    case 'state-rename':
      return 'Rename state';
    case 'state-move':
      return 'Move state';
    case 'transition-add':
      return 'Add transition';
    case 'transition-remove':
      return 'Remove transition';
    case 'transition-rename':
      return 'Rename transition';
    case 'transition-move':
      return 'Move transition';
    case 'side-effects-change':
      return 'Change side effects';
    case 'initial-states-change':
      return 'Change initial states';
    case 'final-states-change':
      return 'Change final states';
    case 'replace':
      return 'Replace machine';
  }
}
