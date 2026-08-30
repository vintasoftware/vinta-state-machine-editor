import type {
  ActionDefinition,
  JsonObject,
  Point,
  SideEffect,
  SideEffectDefinition,
  SideEffectHooks,
  StateColor,
  StateMachine,
  StateNode,
  Transition,
  TransitionTrigger,
} from '../types.js';
import { isStateColor, STATE_COLORS } from '../types.js';
import { StateMachineError } from './errors.js';
import { toJsonObject } from './json.js';

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

type Issues = string[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string, path: string, issues: Issues) {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(`${path}.${key} must be a non-empty string.`);
    return '';
  }
  return value;
}

/** Free text: absent means empty, anything that is not a string is an error. */
function readText(source: Record<string, unknown>, key: string, path: string, issues: Issues) {
  const value = source[key];
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    issues.push(`${path}.${key} must be a string.`);
    return '';
  }
  return value;
}

function readBoolean(
  source: Record<string, unknown>,
  key: string,
  path: string,
  fallback: boolean,
  issues: Issues,
) {
  const value = source[key];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    issues.push(`${path}.${key} must be a boolean.`);
    return fallback;
  }
  return value;
}

function readOptionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(source: Record<string, unknown>, key: string, path: string, issues: Issues) {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(`${path}.${key} must be a finite number.`);
    return 0;
  }
  return value;
}

function readArray(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issues,
): readonly unknown[] {
  const value = source[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push(`${path}.${key} must be an array.`);
    return [];
  }
  return value;
}

function parsePoint(value: unknown, path: string, issues: Issues): Point {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object with x and y.`);
    return { x: 0, y: 0 };
  }
  return { x: readNumber(value, 'x', path, issues), y: readNumber(value, 'y', path, issues) };
}

/**
 * A state's position, defaulting to the origin when the host never stored one.
 *
 * An absent position is not a broken machine: a backend that only models states
 * and transitions has nothing to store, and the editor lays such a graph out
 * itself the first time it is assigned. A *malformed* position is still an
 * error — that is a host writing coordinates it got wrong, not one abstaining.
 */
function parseOptionalPoint(value: unknown, path: string, issues: Issues): Point {
  return value === undefined ? { x: 0, y: 0 } : parsePoint(value, path, issues);
}

function parseParams(value: unknown, path: string, issues: Issues): JsonObject {
  if (value === undefined) {
    return {};
  }
  const params = toJsonObject(value);
  if (params === undefined) {
    issues.push(`${path} must be a JSON object of parameters.`);
    return {};
  }
  return params;
}

/**
 * The host-owned `data` blob. Whitelisting keys would drop whatever a host
 * attached, so this one field is carried through verbatim — the component never
 * looks inside it.
 */
function parseData(value: unknown, path: string, issues: Issues): JsonObject {
  if (value === undefined) {
    return {};
  }
  const data = toJsonObject(value);
  if (data === undefined) {
    issues.push(`${path} must be a JSON object.`);
    return {};
  }
  return data;
}

function parseSideEffect(value: unknown, path: string, issues: Issues): SideEffect {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object.`);
    return {
      id: '',
      definitionId: '',
      name: '',
      params: {},
      enabled: true,
      description: '',
      data: {},
    };
  }
  return {
    id: readString(value, 'id', path, issues),
    definitionId: readString(value, 'definitionId', path, issues),
    name: readString(value, 'name', path, issues),
    params: parseParams(value['params'], `${path}.params`, issues),
    // Absent means enabled, so documents written before the flag existed still run.
    enabled: readBoolean(value, 'enabled', path, true, issues),
    description: readText(value, 'description', path, issues),
    data: parseData(value['data'], `${path}.data`, issues),
  };
}

function parseSideEffectList(value: unknown, path: string, issues: Issues): readonly SideEffect[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array.`);
    return [];
  }
  return value.map((item, index) => parseSideEffect(item, `${path}[${index}]`, issues));
}

function parseHooks(value: unknown, path: string, issues: Issues): SideEffectHooks {
  if (value === undefined) {
    return { before: [], after: [] };
  }
  if (!isRecord(value)) {
    issues.push(`${path} must be an object with before and after.`);
    return { before: [], after: [] };
  }
  return {
    before: parseSideEffectList(value['before'], `${path}.before`, issues),
    after: parseSideEffectList(value['after'], `${path}.after`, issues),
  };
}

function parseColor(value: unknown, path: string, issues: Issues): StateColor {
  if (value === undefined) {
    return 'neutral';
  }
  if (!isStateColor(value)) {
    issues.push(`${path} must be one of ${STATE_COLORS.join(', ')}.`);
    return 'neutral';
  }
  return value;
}

function parseState(value: unknown, path: string, issues: Issues): StateNode {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object.`);
    return {
      id: '',
      name: '',
      position: { x: 0, y: 0 },
      onEnter: { before: [], after: [] },
      onLeave: { before: [], after: [] },
      color: 'neutral',
      description: '',
      data: {},
    };
  }
  return {
    id: readString(value, 'id', path, issues),
    name: readString(value, 'name', path, issues),
    position: parseOptionalPoint(value['position'], `${path}.position`, issues),
    onEnter: parseHooks(value['onEnter'], `${path}.onEnter`, issues),
    onLeave: parseHooks(value['onLeave'], `${path}.onLeave`, issues),
    color: parseColor(value['color'], `${path}.color`, issues),
    description: readText(value, 'description', path, issues),
    data: parseData(value['data'], `${path}.data`, issues),
  };
}

/** Absent means "no trigger chosen yet", so `null` and a missing key both parse. */
function parseTrigger(value: unknown, path: string, issues: Issues): TransitionTrigger | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    issues.push(`${path} must be an object with id and name, or null.`);
    return null;
  }
  return {
    id: readString(value, 'id', path, issues),
    name: readString(value, 'name', path, issues),
  };
}

/**
 * A transition's source. `null` is the creation edge — the one that takes a
 * brand new record into an initial state. Only `null` means that: an empty
 * string or a missing key is still a malformed document.
 */
function parseFrom(source: Record<string, unknown>, path: string, issues: Issues): string | null {
  return source['from'] === null ? null : readString(source, 'from', path, issues);
}

function parseTransition(value: unknown, path: string, issues: Issues): Transition {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object.`);
    return {
      id: '',
      name: '',
      from: '',
      to: '',
      trigger: null,
      guard: '',
      requiredPermission: '',
      description: '',
      labelOffset: { x: 0, y: 0 },
      effects: { before: [], after: [] },
      data: {},
    };
  }
  return {
    id: readString(value, 'id', path, issues),
    name: readString(value, 'name', path, issues),
    from: parseFrom(value, path, issues),
    to: readString(value, 'to', path, issues),
    trigger: parseTrigger(value['trigger'], `${path}.trigger`, issues),
    guard: readText(value, 'guard', path, issues),
    requiredPermission: readText(value, 'requiredPermission', path, issues),
    description: readText(value, 'description', path, issues),
    // Absent means "sit on the edge", so older documents keep working.
    labelOffset:
      value['labelOffset'] === undefined
        ? { x: 0, y: 0 }
        : parsePoint(value['labelOffset'], `${path}.labelOffset`, issues),
    effects: parseHooks(value['effects'], `${path}.effects`, issues),
    data: parseData(value['data'], `${path}.data`, issues),
  };
}

function checkUniqueIds(ids: readonly string[], label: string, issues: Issues): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push(`Duplicated ${label} id "${id}".`);
    }
    seen.add(id);
  }
}

/** Reads a list of state ids, checking each one points at a state that exists. */
function parseStateIdList(
  source: Record<string, unknown>,
  key: string,
  knownStateIds: ReadonlySet<string>,
  issues: Issues,
): readonly string[] {
  const raw = readArray(source, key, 'machine', issues);
  const stateIds: string[] = [];
  raw.forEach((value, index) => {
    if (typeof value !== 'string') {
      issues.push(`machine.${key}[${index}] must be a state id.`);
      return;
    }
    if (!knownStateIds.has(value)) {
      issues.push(`machine.${key} refers to unknown state "${value}".`);
      return;
    }
    if (stateIds.includes(value)) {
      issues.push(`machine.${key} lists "${value}" more than once.`);
      return;
    }
    stateIds.push(value);
  });
  return stateIds;
}

/** Validates untrusted input (e.g. parsed JSON) into a {@link StateMachine}. */
export function parseStateMachine(input: unknown): ParseResult<StateMachine> {
  const issues: Issues = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ['Machine must be an object with states and transitions.'] };
  }

  const states = readArray(input, 'states', 'machine', issues).map((state, index) =>
    parseState(state, `machine.states[${index}]`, issues),
  );
  const transitions = readArray(input, 'transitions', 'machine', issues).map((transition, index) =>
    parseTransition(transition, `machine.transitions[${index}]`, issues),
  );

  checkUniqueIds(
    states.map((state) => state.id),
    'state',
    issues,
  );
  checkUniqueIds(
    transitions.map((transition) => transition.id),
    'transition',
    issues,
  );

  const stateIds = new Set(states.map((state) => state.id));
  const initialStateIds = parseStateIdList(input, 'initialStateIds', stateIds, issues);
  const finalStateIds = parseStateIdList(input, 'finalStateIds', stateIds, issues);
  const data = parseData(input['data'], 'machine.data', issues);
  for (const transition of transitions) {
    // A creation edge has no source to check; it hangs off the start pseudo-node.
    if (transition.from !== null && !stateIds.has(transition.from)) {
      issues.push(`Transition "${transition.id}" points from unknown state "${transition.from}".`);
    }
    if (!stateIds.has(transition.to)) {
      issues.push(`Transition "${transition.id}" points to unknown state "${transition.to}".`);
    }
  }

  if (issues.length > 0) {
    return { ok: false, errors: issues };
  }
  return { ok: true, value: { states, transitions, initialStateIds, finalStateIds, data } };
}

/** Same as {@link parseStateMachine} but throws a {@link StateMachineError} on invalid input. */
export function assertStateMachine(input: unknown): StateMachine {
  const result = parseStateMachine(input);
  if (!result.ok) {
    throw new StateMachineError(`Invalid state machine:\n- ${result.errors.join('\n- ')}`);
  }
  return result.value;
}

/** Validates the payload returned by a {@link SideEffectProvider}. */
export function parseSideEffectDefinitions(
  input: unknown,
): ParseResult<readonly SideEffectDefinition[]> {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ['Side effect catalog must be an array.'] };
  }
  const issues: Issues = [];
  const definitions = input.map((item, index) => {
    const path = `catalog[${index}]`;
    if (!isRecord(item)) {
      issues.push(`${path} must be an object.`);
      return { id: '', name: '' };
    }
    const description = readOptionalString(item, 'description');
    const defaults = item['defaultParams'];
    const defaultParams = defaults === undefined ? undefined : toJsonObject(defaults);
    if (defaults !== undefined && defaultParams === undefined) {
      issues.push(`${path}.defaultParams must be a JSON object.`);
    }
    const definition: SideEffectDefinition = {
      id: readString(item, 'id', path, issues),
      name: readString(item, 'name', path, issues),
      description,
      defaultParams,
    };
    return definition;
  });
  if (issues.length > 0) {
    return { ok: false, errors: issues };
  }
  return { ok: true, value: definitions };
}

/** Validates the payload returned by an {@link ActionProvider}. */
export function parseActionDefinitions(input: unknown): ParseResult<readonly ActionDefinition[]> {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ['Action catalog must be an array.'] };
  }
  const issues: Issues = [];
  const definitions = input.map((item, index) => {
    const path = `actions[${index}]`;
    if (!isRecord(item)) {
      issues.push(`${path} must be an object.`);
      return { id: '', name: '' };
    }
    const definition: ActionDefinition = {
      id: readString(item, 'id', path, issues),
      name: readString(item, 'name', path, issues),
      description: readOptionalString(item, 'description'),
    };
    return definition;
  });
  if (issues.length > 0) {
    return { ok: false, errors: issues };
  }
  return { ok: true, value: definitions };
}
