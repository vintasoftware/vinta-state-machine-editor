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
  countsAs: 'counts_as',
  countsAsPartial: 'counts_as_partial',
} as const;

/** How a child state reports back to the batch its parent is waiting on. */
export type CountsAs = 'success' | 'failure';

export const COUNTS_AS: readonly CountsAs[] = ['success', 'failure'];

export function isCountsAs(value: unknown): value is CountsAs {
  return COUNTS_AS.some((outcome) => outcome === value);
}

/** Which half of the report pair a document arrived carrying on its own. */
export type CountsAsHalf = 'enter' | 'leave';

export function isCountsAsHalf(value: unknown): value is CountsAsHalf {
  return value === 'enter' || value === 'leave';
}

export interface WaitingConfig {
  /** Whether the state waits for a batch of child jobs to finish. */
  readonly isWaiting: boolean;
  /** Key of the action fired once the batch completes. Empty when unset. */
  readonly joinAction: string;
  /** The machine the children are governed by. Display and linking only. */
  readonly childMachine: string;
  /** ISO 8601 duration the wait gives up after. Empty when unset. */
  readonly timeout: string;
  /**
   * What entering this state reports to the batch its parent waits on. Empty
   * when the state counts towards nothing.
   *
   * It is stored as one key and rendered as one control, though the engine runs
   * it as a *pair* of hooks — one on enter, one on leave. The editor never
   * matches on those hook rows: the key is the truth, and the host translates
   * it into whatever rows it needs.
   */
  readonly countsAs: CountsAs | '';
}

export function emptyWaitingConfig(): WaitingConfig {
  return { isWaiting: false, joinAction: '', childMachine: '', timeout: '', countsAs: '' };
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
    countsAs: readCountsAs(state),
  };
}

/** The outcome this state reports, or `''` when it reports nothing. */
export function readCountsAs(state: StateNode): CountsAs | '' {
  const value = state.data[WAITING_KEYS.countsAs];
  return isCountsAs(value) ? value : '';
}

/**
 * The half of the pair the document arrived with, when the host found only one.
 *
 * Whether that is a problem depends on the state: a final state can never be
 * left, so its leave hook could never fire and `enter` is the whole of the pair
 * it is allowed to have. See {@link countsAsStatus}.
 */
export function readCountsAsPartial(state: StateNode): CountsAsHalf | '' {
  const value = state.data[WAITING_KEYS.countsAsPartial];
  return isCountsAsHalf(value) ? value : '';
}

/** What the report pair on a state adds up to. */
export type CountsAsStatus =
  | { readonly kind: 'none' }
  /** Both halves, which is what a state that can be left needs. */
  | { readonly kind: 'pair'; readonly countsAs: CountsAs }
  /** The enter half alone — correct, and the only thing a final state can have. */
  | { readonly kind: 'enter-only'; readonly countsAs: CountsAs }
  /** One half where two were needed: an invalid graph the backend will refuse. */
  | { readonly kind: 'broken'; readonly countsAs: CountsAs; readonly half: CountsAsHalf };

/**
 * Reads the pair, given whether the state ends the machine.
 *
 * A state listed in `finalStateIds` can never be left — the engine refuses the
 * move — so its leave-side hook could never fire, and the pair is deliberately
 * short by one. On any other state a half is a half-configured pair, which is
 * an invalid graph rather than a shorthand.
 */
export function countsAsStatus(state: StateNode, isFinal: boolean): CountsAsStatus {
  const countsAs = readCountsAs(state);
  if (countsAs === '') {
    return { kind: 'none' };
  }
  const half = readCountsAsPartial(state);
  if (half === '') {
    return isFinal ? { kind: 'enter-only', countsAs } : { kind: 'pair', countsAs };
  }
  if (half === 'enter' && isFinal) {
    return { kind: 'enter-only', countsAs };
  }
  return { kind: 'broken', countsAs, half };
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
 *
 * `false` is a value like any other and is written out. That matters: see
 * {@link waitingFlagFor}.
 */
function withKey(data: JsonObject, key: string, value: string | boolean | undefined): JsonObject {
  const next: Record<string, JsonObject[string]> = { ...data };
  if (value === undefined || value === '') {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

/**
 * What to write for `is_waiting`, given what the state said before.
 *
 * The flag is a **tri-state**, and it has to say which of the three it is,
 * because absence already means something: it is what a document written before
 * fan-outs existed looks like. A host reading such a document should leave the
 * state alone. A host reading a state whose wait was *switched off* should stop
 * waiting. Deleting the key on the way off made those two indistinguishable, and
 * a host taking the safe reading — say nothing — never persisted the change.
 *
 * So an off wait writes `false` wherever there is a decision to record: the flag
 * was already there, or the state carries a setting that only a fan-out puts
 * there. The key is left out only for a state that has never been configured,
 * which is the one case where silence is the truth.
 */
function waitingFlagFor(
  before: JsonObject,
  isWaiting: boolean,
  configured: boolean,
): boolean | undefined {
  if (isWaiting) {
    return true;
  }
  return Object.hasOwn(before, WAITING_KEYS.isWaiting) || configured ? false : undefined;
}

/**
 * Puts a fan-out configuration on a state.
 *
 * Turning the wait **off** writes `is_waiting: false` and leaves the other three
 * keys where they are, so a toggle pressed by mistake costs nobody their join
 * action — and a host can tell the decision apart from a document that has never
 * heard of fan-outs. The keys that are set are written verbatim: the component
 * neither validates the action against a catalog nor parses the timeout to
 * store it.
 */
export function setWaiting(
  machine: StateMachine,
  stateId: string,
  config: WaitingConfig,
): StateMachine {
  const state = requireState(machine, stateId);
  // A wait that is off but configured is still an answer, so the flag is
  // written out rather than dropped — see `waitingFlagFor`.
  const configured =
    config.joinAction.length > 0 || config.childMachine.length > 0 || config.timeout.length > 0;
  let data = withKey(
    state.data,
    WAITING_KEYS.isWaiting,
    waitingFlagFor(state.data, config.isWaiting, configured),
  );
  data = withKey(data, WAITING_KEYS.joinAction, config.joinAction);
  data = withKey(data, WAITING_KEYS.childMachine, config.childMachine);
  data = withKey(data, WAITING_KEYS.timeout, config.timeout);
  data = withKey(data, WAITING_KEYS.countsAs, config.countsAs);
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
  const found = DURATION.exec(text.trim());
  if (found === null) {
    return undefined;
  }
  const [, weeks, days, hours, minutes, seconds] = found;
  // `P` and `PT` match the pattern and name no unit at all, which is no more a
  // duration than a word would be. A duration that names a unit and sets it to
  // zero — `PT0S`, `P0D` — is one, and a silly one: see `isZeroDuration`.
  if ([weeks, days, hours, minutes, seconds].every((value) => value === undefined)) {
    return undefined;
  }
  return {
    days: unit(weeks) * 7 + unit(days),
    hours: unit(hours),
    minutes: unit(minutes),
    seconds: unit(seconds),
  };
}

/**
 * A duration of no time at all.
 *
 * Almost certainly a mistake rather than a setting — a wait that gives the batch
 * zero seconds to finish has already timed out — so the editor flags it rather
 * than drawing `0s` as though it meant something.
 */
export function isZeroDuration(parts: DurationParts): boolean {
  return parts.days === 0 && parts.hours === 0 && parts.minutes === 0 && parts.seconds === 0;
}
