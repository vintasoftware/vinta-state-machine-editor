/**
 * Copying one element out of a machine and putting it back into one.
 *
 * The clipboard holds the element itself rather than a copy of it: everything
 * in the model is deeply readonly, so the entry cannot drift once it is taken,
 * however much the machine it came from changes afterwards. The copying proper
 * happens on paste, which is also the only moment that knows what to call the
 * result and where to put it.
 */

import type {
  ElementRef,
  Point,
  SideEffect,
  SideEffectHooks,
  StateMachine,
  StateNode,
  Transition,
} from '../types.js';
import { createId } from './id.js';
import { findState, findTransition } from './machine.js';

/** One element lifted out of a machine, ready to be put into one. */
export type ClipboardEntry =
  | { readonly kind: 'state'; readonly state: StateNode }
  | { readonly kind: 'transition'; readonly transition: Transition };

/** What a copy is called, before an existing `copy` suffix and numbering. */
const COPY_SUFFIX = 'copy';

/** A trailing ` copy`, with or without its number. */
const COPY_PATTERN = /\s+copy(\s+\d+)?$/;

/**
 * What to call a copy of `name`. A suffix already there is replaced rather than
 * stacked, so a copy of “Draft copy” is “Draft copy 2” and never
 * “Draft copy copy” — the number itself is left to `uniqueName`, which is the
 * part that knows what is taken.
 */
export function copyName(name: string): string {
  return `${name.replace(COPY_PATTERN, '')} ${COPY_SUFFIX}`;
}

/** Takes the element addressed by `ref`, or `undefined` when it is gone. */
export function copyElement(machine: StateMachine, ref: ElementRef): ClipboardEntry | undefined {
  if (ref.kind === 'state') {
    const state = findState(machine, ref.id);
    return state === undefined ? undefined : { kind: 'state', state };
  }
  const transition = findTransition(machine, ref.id);
  return transition === undefined ? undefined : { kind: 'transition', transition };
}

/**
 * Whether `entry` can be put into `machine`. A state is self-contained and
 * always can, even in a machine it did not come from; a transition needs both
 * of its endpoints to still be there.
 */
export function canPaste(machine: StateMachine, entry: ClipboardEntry | null): boolean {
  if (entry === null) {
    return false;
  }
  if (entry.kind === 'state') {
    return true;
  }
  const { from, to } = entry.transition;
  return (
    (from === null || findState(machine, from) !== undefined) &&
    findState(machine, to) !== undefined
  );
}

/**
 * A fresh id per attachment. The ids identify *this* attachment, not the
 * catalog definition behind it, so a copy sharing them would be two names for
 * one thing the moment either side is edited.
 */
function copySideEffect(effect: SideEffect): SideEffect {
  return { ...effect, id: createId('effect') };
}

function copyHooks(hooks: SideEffectHooks): SideEffectHooks {
  return { before: hooks.before.map(copySideEffect), after: hooks.after.map(copySideEffect) };
}

/**
 * A new state carrying everything about `state` except its identity: the
 * colour, the description, the host's `data` and both side effect lists come
 * along, under ids of their own.
 *
 * Being initial or final does not, because that is not a property of the card:
 * the machine holds those lists, and a copy quietly becoming a second entry
 * point would change what the machine does.
 */
export function duplicateState(
  state: StateNode,
  options: { readonly name: string; readonly position: Point },
): StateNode {
  return {
    ...state,
    id: createId('state'),
    name: options.name,
    position: options.position,
    onEnter: copyHooks(state.onEnter),
    onLeave: copyHooks(state.onLeave),
  };
}

/**
 * A new transition between the same endpoints as `transition`, carrying its
 * trigger, guard, permission, description, `data` and side effects.
 */
export function duplicateTransition(
  transition: Transition,
  options: { readonly name: string; readonly labelOffset: Point },
): Transition {
  return {
    ...transition,
    id: createId('transition'),
    name: options.name,
    labelOffset: options.labelOffset,
    effects: copyHooks(transition.effects),
  };
}
