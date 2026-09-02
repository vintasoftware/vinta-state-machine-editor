/**
 * The fan-out a state waits on, read off and written back to `state.data`.
 *
 * A state can start many child jobs, wait for all of them, and move the record
 * on by itself when they finish. That is structure — it changes what the state
 * *is* — but it is not something this component models in a field of its own,
 * so it rides in the host-owned `data` blob under keys this module owns and
 * nothing else in the component looks at.
 *
 * Everything here is total: a document with none of these keys reads as a state
 * that does not wait, which is exactly what every document written before this
 * existed is.
 */

import type { JsonObject, StateMachine, StateNode } from '../types.js';
import { StateMachineError } from './errors.js';
import { findState, updateState } from './machine.js';

/** The keys this module owns inside `state.data`. Nothing else is touched. */
export const WAITING_KEYS = {
  isWaiting: 'is_waiting',
  joinAction: 'join_action',
  childMachine: 'child_machine',
  timeout: 'timeout',
} as const;

export interface WaitingConfig {
  /** Whether the state waits for a batch of child jobs to finish. */
  readonly isWaiting: boolean;
  /** Key of the action fired once the batch completes. Empty when unset. */
  readonly joinAction: string;
  /** The machine the children are governed by. Display and linking only. */
  readonly childMachine: string;
  /** ISO 8601 duration the wait gives up after. Empty when unset. */
  readonly timeout: string;
}

export function emptyWaitingConfig(): WaitingConfig {
  return { isWaiting: false, joinAction: '', childMachine: '', timeout: '' };
}

function readFlag(data: JsonObject, key: string): boolean {
  return data[key] === true;
}

function readKey(data: JsonObject, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : '';
}

/** What `state.data` says about the fan-out this state waits on. */
export function readWaiting(state: StateNode): WaitingConfig {
  const data = state.data;
  return {
    isWaiting: readFlag(data, WAITING_KEYS.isWaiting),
    joinAction: readKey(data, WAITING_KEYS.joinAction),
    childMachine: readKey(data, WAITING_KEYS.childMachine),
    timeout: readKey(data, WAITING_KEYS.timeout),
  };
}

export function isWaitingState(state: StateNode): boolean {
  return readFlag(state.data, WAITING_KEYS.isWaiting);
}

function requireState(machine: StateMachine, stateId: string): StateNode {
  const state = findState(machine, stateId);
  if (state === undefined) {
    throw new StateMachineError(`Unknown state "${stateId}".`);
  }
  return state;
}

/**
 * Writes one key of the blob, dropping it when the value is empty rather than
 * storing a blank — a state that does not use a key should read back exactly as
 * a state that never heard of it.
 */
function withKey(data: JsonObject, key: string, value: string | true | undefined): JsonObject {
  const next: Record<string, JsonObject[string]> = { ...data };
  if (value === undefined || value === '') {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

/**
 * Puts a fan-out configuration on a state.
 *
 * Turning the wait **off** drops `is_waiting` and leaves the other three keys
 * where they are, so a toggle pressed by mistake costs nobody their join action.
 * The keys that are set are written verbatim: the component neither validates
 * the action against a catalog nor parses the timeout to store it.
 */
export function setWaiting(
  machine: StateMachine,
  stateId: string,
  config: WaitingConfig,
): StateMachine {
  const state = requireState(machine, stateId);
  let data = withKey(state.data, WAITING_KEYS.isWaiting, config.isWaiting ? true : undefined);
  data = withKey(data, WAITING_KEYS.joinAction, config.joinAction);
  data = withKey(data, WAITING_KEYS.childMachine, config.childMachine);
  data = withKey(data, WAITING_KEYS.timeout, config.timeout);
  return updateState(machine, stateId, { data });
}

/** Flips `is_waiting`, keeping whatever else the state was configured with. */
export function toggleWaiting(machine: StateMachine, stateId: string): StateMachine {
  const config = readWaiting(requireState(machine, stateId));
  return setWaiting(machine, stateId, { ...config, isWaiting: !config.isWaiting });
}

/** A duration broken into the units a sentence can be built from. */
export interface DurationParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

/*
 * Days down to seconds, which is the whole of what a timeout is ever spelled in.
 * Years and months are deliberately out: their length depends on when you start
 * counting, and a timeout that means something different in February is not a
 * timeout. A duration using them is handed back unparsed and shown verbatim.
 */
const DURATION = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

function unit(value: string | undefined): number {
  return value === undefined ? 0 : Number(value);
}

/**
 * Reads an ISO 8601 duration into its parts, or `undefined` when it is not one —
 * in which case the host's own text is shown as it was written.
 */
export function parseDuration(text: string): DurationParts | undefined {
  const trimmed = text.trim();
  const found = DURATION.exec(trimmed);
  // `P` alone matches the pattern and means nothing, so a match with no unit in
  // it is no more a duration than a word would be.
  if (found === null || trimmed === 'P' || trimmed === 'PT') {
    return undefined;
  }
  const [, weeks, days, hours, minutes, seconds] = found;
  const parts = {
    days: unit(weeks) * 7 + unit(days),
    hours: unit(hours),
    minutes: unit(minutes),
    seconds: unit(seconds),
  };
  const total = parts.days + parts.hours + parts.minutes + parts.seconds;
  return total === 0 && trimmed !== 'PT0S' ? undefined : parts;
}
