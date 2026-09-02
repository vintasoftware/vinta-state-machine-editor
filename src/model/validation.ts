/**
 * What is wrong with a graph, where it is wrong.
 *
 * The backend checks all of this again when a version is published — it has to,
 * since nothing stops a document arriving by another route. Surfacing it here is
 * about *where*: a stripe on the card that has the problem, while the person who
 * caused it is still looking at it.
 *
 * Every issue below is **advisory**. Nothing here blocks an edit, refuses a
 * document or rewrites anything: a graph is allowed to be halfway built.
 */

import type { StateMachine, StateNode } from '../types.js';
import { isDecision, type TransitionGroup } from './groups.js';
import { isFinalState, outgoingTransitions } from './machine.js';
import { readWaiting } from './waiting.js';

/** What is wrong with one state. */
export type StateIssue =
  /** It waits for a batch, but no edge leaving it answers the action that closes the wait. */
  | 'no-join-edge'
  /** It ends the machine, and the engine refuses to leave it — so its edges are dead. */
  | 'terminal-has-exit';

/** What is wrong with one decision card. */
export type DecisionIssue =
  /** Every outcome is guarded, so a record whose guards all fail has nowhere to go. */
  'no-fallback';

/**
 * Everything wrong with one state, in the order it is worth reading.
 *
 * A state that is not waiting and is not terminal can hold neither, so the usual
 * card costs one array allocation and no walk of the transitions.
 */
export function stateIssues(machine: StateMachine, state: StateNode): readonly StateIssue[] {
  const issues: StateIssue[] = [];
  const waiting = readWaiting(state);
  if (waiting.isWaiting) {
    const closes = outgoingTransitions(machine, state.id).some(
      (transition) =>
        waiting.joinAction.length > 0 && transition.trigger?.id === waiting.joinAction,
    );
    if (!closes) {
      issues.push('no-join-edge');
    }
  }
  if (isFinalState(machine, state.id) && outgoingTransitions(machine, state.id).length > 0) {
    issues.push('terminal-has-exit');
  }
  return issues;
}

/**
 * Everything wrong with one decision. A group of one is never a decision, and
 * an edge on its own is entitled to a guard nothing falls back from — the
 * record simply does not move, which is what a guard is for.
 */
export function decisionIssues(group: TransitionGroup): readonly DecisionIssue[] {
  if (!isDecision(group)) {
    return [];
  }
  const fallback = group.transitions.some((transition) => transition.guard.trim().length === 0);
  return fallback ? [] : ['no-fallback'];
}
