import type {
  JsonObject,
  MachineChange,
  Point,
  SideEffect,
  SideEffectDefinition,
  SideEffectHooks,
  SideEffectListRef,
  SideEffectPhase,
  StateColor,
  StateMachine,
  StateNode,
  Transition,
  TransitionTrigger,
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
  return { states: [], transitions: [], initialStateIds: [], finalStateIds: [], data: {} };
}

export function createState(options: {
  readonly name: string;
  readonly position: Point;
  readonly id?: string;
  readonly color?: StateColor;
  readonly description?: string;
  readonly data?: JsonObject;
}): StateNode {
  return {
    id: options.id ?? createId('state'),
    name: options.name,
    position: options.position,
    onEnter: emptyHooks(),
    onLeave: emptyHooks(),
    color: options.color ?? 'neutral',
    description: options.description ?? '',
    data: options.data ?? {},
  };
}

export function createTransition(options: {
  readonly name: string;
  /** `null` makes it a creation transition, drawn from the start pseudo-node. */
  readonly from: string | null;
  readonly to: string;
  readonly id?: string;
  readonly labelOffset?: Point;
  readonly trigger?: TransitionTrigger | null;
  readonly guard?: string;
  readonly requiredPermission?: string;
  readonly description?: string;
  readonly data?: JsonObject;
}): Transition {
  return {
    id: options.id ?? createId('transition'),
    name: options.name,
    from: options.from,
    to: options.to,
    trigger: options.trigger ?? null,
    guard: options.guard ?? '',
    requiredPermission: options.requiredPermission ?? '',
    description: options.description ?? '',
    labelOffset: options.labelOffset ?? { x: 0, y: 0 },
    effects: emptyHooks(),
    data: options.data ?? {},
  };
}

/**
 * Attaches a catalog definition. The catalog has no say over `enabled`: a fresh
 * attachment always runs, and turning it off is an edit the user makes.
 */
export function createSideEffect(
  definition: SideEffectDefinition,
  id?: string,
  data?: JsonObject,
): SideEffect {
  return {
    id: id ?? createId('effect'),
    definitionId: definition.id,
    name: definition.name,
    params: definition.defaultParams ?? emptyParams(),
    enabled: true,
    description: '',
    data: data ?? {},
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

/** Same as {@link requireState}, but `null` (the start pseudo-node) is allowed. */
function requireSource(machine: StateMachine, stateId: string | null): void {
  if (stateId !== null) {
    requireState(machine, stateId);
  }
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
  patch: {
    readonly name?: string;
    readonly position?: Point;
    readonly color?: StateColor;
    readonly description?: string;
  },
): StateMachine {
  const current = requireState(machine, stateId);
  const next: StateNode = {
    ...current,
    name: patch.name ?? current.name,
    position: patch.position ?? current.position,
    color: patch.color ?? current.color,
    description: patch.description ?? current.description,
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
    ...machine,
    states: machine.states.filter((state) => state.id !== stateId),
    // Creation edges into this state go with it: their `from` is null, their `to` is not.
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
  requireSource(machine, transition.from);
  requireState(machine, transition.to);
  return { ...machine, transitions: [...machine.transitions, transition] };
}

export function updateTransition(
  machine: StateMachine,
  transitionId: string,
  patch: {
    readonly name?: string;
    readonly from?: string | null;
    readonly to?: string;
    readonly labelOffset?: Point;
  },
): StateMachine {
  const current = requireTransition(machine, transitionId);
  // `null` is a meaningful source, so `??` would silently reinstate the old one.
  const from = patch.from === undefined ? current.from : patch.from;
  const to = patch.to ?? current.to;
  requireSource(machine, from);
  requireState(machine, to);
  const next: Transition = {
    ...current,
    name: patch.name ?? current.name,
    from,
    to,
    labelOffset: patch.labelOffset ?? current.labelOffset,
  };
  return replaceTransition(machine, next);
}

function replaceTransition(machine: StateMachine, next: Transition): StateMachine {
  return {
    ...machine,
    transitions: machine.transitions.map((transition) =>
      transition.id === next.id ? next : transition,
    ),
  };
}

/** Sets the event that fires a transition, or clears it with `null`. */
export function setTransitionTrigger(
  machine: StateMachine,
  transitionId: string,
  trigger: TransitionTrigger | null,
): StateMachine {
  return replaceTransition(machine, { ...requireTransition(machine, transitionId), trigger });
}

/** Stores a guard expression verbatim. The component never evaluates it. */
export function setTransitionGuard(
  machine: StateMachine,
  transitionId: string,
  guard: string,
): StateMachine {
  return replaceTransition(machine, { ...requireTransition(machine, transitionId), guard });
}

/** Stores a required permission verbatim. The component never interprets it. */
export function setTransitionPermission(
  machine: StateMachine,
  transitionId: string,
  requiredPermission: string,
): StateMachine {
  return replaceTransition(machine, {
    ...requireTransition(machine, transitionId),
    requiredPermission,
  });
}

export function setTransitionDescription(
  machine: StateMachine,
  transitionId: string,
  description: string,
): StateMachine {
  return replaceTransition(machine, { ...requireTransition(machine, transitionId), description });
}

export function setStateDescription(
  machine: StateMachine,
  stateId: string,
  description: string,
): StateMachine {
  return updateState(machine, stateId, { description });
}

export function removeTransition(machine: StateMachine, transitionId: string): StateMachine {
  requireTransition(machine, transitionId);
  return {
    ...machine,
    transitions: machine.transitions.filter((transition) => transition.id !== transitionId),
  };
}

/**
 * Every edge leaving `from`, in the order they are evaluated — which is simply
 * their order in `machine.transitions`. `null` collects the creation edges.
 */
export function outgoingTransitions(
  machine: StateMachine,
  from: string | null,
): readonly Transition[] {
  return machine.transitions.filter((transition) => transition.from === from);
}

/** The edges that take a brand new record into an initial state. */
export function creationTransitions(machine: StateMachine): readonly Transition[] {
  return outgoingTransitions(machine, null);
}

/**
 * Moves a transition to `index` among the edges leaving the same state. The
 * slots the siblings occupy in `machine.transitions` are kept, so nothing else
 * in the array shifts and every other relative order survives.
 */
export function moveTransition(
  machine: StateMachine,
  transitionId: string,
  index: number,
): StateMachine {
  const transition = requireTransition(machine, transitionId);
  const siblings = outgoingTransitions(machine, transition.from);
  if (index < 0 || index >= siblings.length) {
    throw new StateMachineError(
      `Cannot move transition "${transitionId}" to position ${index}: it has ${siblings.length} sibling(s).`,
    );
  }
  const current = siblings.findIndex((candidate) => candidate.id === transitionId);
  const reordered = moveItem(siblings, current, index);
  let cursor = 0;
  const transitions = machine.transitions.map((candidate) => {
    if (candidate.from !== transition.from) {
      return candidate;
    }
    const next = reordered[cursor];
    cursor += 1;
    return next ?? candidate;
  });
  return { ...machine, transitions };
}

/** `base`, or `base 2`, `base 3`… — the first spelling `taken` does not hold. */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base} ${suffix}`)) {
    suffix += 1;
  }
  return `${base} ${suffix}`;
}

/**
 * A transition name not yet used anywhere in the machine. Creation edges are
 * namespaced version-wide rather than per source state, so the check spans the
 * whole machine instead of just the siblings.
 */
export function uniqueTransitionName(machine: StateMachine, base: string): string {
  return uniqueName(base, new Set(machine.transitions.map((transition) => transition.name)));
}

/**
 * A state name not yet used in the machine. Nothing enforces unique state
 * names — two states may legitimately share one — but a copy that reads
 * exactly like its original tells the user nothing about which is which.
 */
export function uniqueStateName(machine: StateMachine, base: string): string {
  return uniqueName(base, new Set(machine.states.map((state) => state.name)));
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
  return replaceTransition(machine, next);
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

/** Rewrites one attached side effect in place, keeping every other field. */
function patchSideEffect(
  machine: StateMachine,
  ref: SideEffectListRef,
  effectId: string,
  patch: (effect: SideEffect) => SideEffect,
): StateMachine {
  return updateSideEffects(machine, ref, (effects) => {
    if (!effects.some((effect) => effect.id === effectId)) {
      throw new StateMachineError(`Unknown side effect "${effectId}".`);
    }
    return effects.map((effect) => (effect.id === effectId ? patch(effect) : effect));
  });
}

/** Replaces the JSON parameters of one attached side effect. */
export function setSideEffectParams(
  machine: StateMachine,
  ref: SideEffectListRef,
  effectId: string,
  params: JsonObject,
): StateMachine {
  return patchSideEffect(machine, ref, effectId, (effect) => ({ ...effect, params }));
}

/** Turns one attached side effect on or off without detaching it. */
export function setSideEffectEnabled(
  machine: StateMachine,
  ref: SideEffectListRef,
  effectId: string,
  enabled: boolean,
): StateMachine {
  return patchSideEffect(machine, ref, effectId, (effect) => ({ ...effect, enabled }));
}

export function setSideEffectDescription(
  machine: StateMachine,
  ref: SideEffectListRef,
  effectId: string,
  description: string,
): StateMachine {
  return patchSideEffect(machine, ref, effectId, (effect) => ({ ...effect, description }));
}

export function moveSideEffect(
  machine: StateMachine,
  ref: SideEffectListRef,
  from: number,
  to: number,
): StateMachine {
  return updateSideEffects(machine, ref, (effects) => moveItem(effects, from, to));
}

/** Paints a state's colour bar. */
export function setStateColor(
  machine: StateMachine,
  stateId: string,
  color: StateColor,
): StateMachine {
  return updateState(machine, stateId, { color });
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
    case 'state-color':
      return 'Change state colour';
    case 'transition-add':
      return 'Add transition';
    case 'transition-remove':
      return 'Remove transition';
    case 'transition-rename':
      return 'Rename transition';
    case 'transition-move':
      return 'Move transition';
    case 'transition-trigger':
      return 'Change transition trigger';
    case 'transition-guard':
      return 'Change transition guard';
    case 'transition-permission':
      return 'Change required permission';
    case 'transition-reorder':
      return 'Reorder transitions';
    case 'description':
      return 'Change description';
    case 'side-effects-change':
      return 'Change side effects';
    case 'layout':
      return 'Organize layout';
    case 'initial-states-change':
      return 'Change initial states';
    case 'final-states-change':
      return 'Change final states';
    case 'replace':
      return 'Replace machine';
  }
}
