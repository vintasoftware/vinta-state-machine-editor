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
import { isZeroDuration, parseDuration, readWaiting } from './waiting.js';

/** What is wrong with one state. */
export type StateIssue =
  /** It waits for a batch, but no edge leaving it answers the action that closes the wait. */
  | 'no-join-edge'
  /** Its wait is given no time at all, so the batch has timed out before it starts. */
  | 'zero-timeout'
  /** It ends the machine, and the engine refuses to leave it — so its edges are dead. */
  | 'terminal-has-exit';

/** Every kind of state issue, so a host can switch over them exhaustively. */
export const STATE_ISSUES: readonly StateIssue[] = [
  'no-join-edge',
  'zero-timeout',
  'terminal-has-exit',
];

/** What is wrong with one decision card. */
export type DecisionIssue =
  /** Every outcome is guarded, so a record whose guards all fail has nowhere to go. */
  'no-fallback';

/** Every kind of decision issue, for the same reason. */
export const DECISION_ISSUES: readonly DecisionIssue[] = ['no-fallback'];

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
    const timeout = parseDuration(waiting.timeout);
    if (timeout !== undefined && isZeroDuration(timeout)) {
      issues.push('zero-timeout');
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
