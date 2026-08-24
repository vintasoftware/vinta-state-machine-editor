/**
 * Undo/redo over whole machine snapshots.
 *
 * Snapshots rather than inverse operations: every helper in
 * `src/model/machine.ts` already returns a brand new machine that shares
 * everything it did not touch, so remembering the previous one costs a single
 * reference — and no inverse has to be written, or kept correct, per change
 * kind.
 */

import type { MachineChange, StateMachine } from '../types.js';

/** A machine to go back (or forward) to, and the change that leads away from it. */
export interface HistoryEntry {
  readonly machine: StateMachine;
  readonly change: MachineChange;
}

export interface History {
  /** Oldest first, so the last entry is the one an undo puts back. */
  readonly past: readonly HistoryEntry[];
  /** Oldest first, so the last entry is the one a redo puts back. */
  readonly future: readonly HistoryEntry[];
}

/** How many steps back are remembered. Older ones fall off the far end. */
export const HISTORY_LIMIT = 100;

function lastOf(entries: readonly HistoryEntry[]): HistoryEntry | undefined {
  return entries[entries.length - 1];
}

export function createHistory(): History {
  return { past: [], future: [] };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}

/** The change an undo would take back, or `undefined` when there is none. */
export function pendingUndo(history: History): MachineChange | undefined {
  return lastOf(history.past)?.change;
}

/** The change a redo would put back, or `undefined` when there is none. */
export function pendingRedo(history: History): MachineChange | undefined {
  return lastOf(history.future)?.change;
}

/**
 * Records a step. The redo branch is dropped: once the timeline moves forward
 * again by another route, the abandoned one no longer applies to it.
 */
export function recordHistory(
  history: History,
  entry: HistoryEntry,
  limit: number = HISTORY_LIMIT,
): History {
  const past = [...history.past, entry];
  return { past: past.slice(Math.max(0, past.length - limit)), future: [] };
}

/** Where a step lands: the machine to show, and the history left behind it. */
export interface HistoryStep {
  readonly history: History;
  readonly machine: StateMachine;
  /** The change being taken back (undo) or put back (redo). */
  readonly change: MachineChange;
}

/** Steps back one change, or `undefined` when the past is empty. */
export function undoHistory(history: History, present: StateMachine): HistoryStep | undefined {
  const entry = lastOf(history.past);
  if (entry === undefined) {
    return undefined;
  }
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, { machine: present, change: entry.change }],
    },
    machine: entry.machine,
    change: entry.change,
  };
}

/** Steps forward one change, or `undefined` when nothing has been undone. */
export function redoHistory(history: History, present: StateMachine): HistoryStep | undefined {
  const entry = lastOf(history.future);
  if (entry === undefined) {
    return undefined;
  }
  return {
    history: {
      past: [...history.past, { machine: present, change: entry.change }],
      future: history.future.slice(0, -1),
    },
    machine: entry.machine,
    change: entry.change,
  };
}
