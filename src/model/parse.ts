import type {
  Point,
  SideEffect,
  SideEffectDefinition,
  SideEffectHooks,
  StateMachine,
  StateNode,
  Transition,
} from '../types.js';
import { StateMachineError } from './errors.js';

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

function parseSideEffect(value: unknown, path: string, issues: Issues): SideEffect {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object.`);
    return { id: '', definitionId: '', name: '' };
  }
  return {
    id: readString(value, 'id', path, issues),
    definitionId: readString(value, 'definitionId', path, issues),
    name: readString(value, 'name', path, issues),
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

function parseState(value: unknown, path: string, issues: Issues): StateNode {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object.`);
    return {
      id: '',
      name: '',
      position: { x: 0, y: 0 },
      onEnter: { before: [], after: [] },
      onLeave: { before: [], after: [] },
    };
  }
  return {
    id: readString(value, 'id', path, issues),
    name: readString(value, 'name', path, issues),
    position: parsePoint(value['position'], `${path}.position`, issues),
    onEnter: parseHooks(value['onEnter'], `${path}.onEnter`, issues),
    onLeave: parseHooks(value['onLeave'], `${path}.onLeave`, issues),
  };
}

function parseTransition(value: unknown, path: string, issues: Issues): Transition {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object.`);
    return {
      id: '',
      name: '',
      from: '',
      to: '',
      labelOffset: { x: 0, y: 0 },
      effects: { before: [], after: [] },
    };
  }
  return {
    id: readString(value, 'id', path, issues),
    name: readString(value, 'name', path, issues),
    from: readString(value, 'from', path, issues),
    to: readString(value, 'to', path, issues),
    // Absent means "sit on the edge", so older documents keep working.
    labelOffset:
      value['labelOffset'] === undefined
        ? { x: 0, y: 0 }
        : parsePoint(value['labelOffset'], `${path}.labelOffset`, issues),
    effects: parseHooks(value['effects'], `${path}.effects`, issues),
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
  for (const transition of transitions) {
    if (!stateIds.has(transition.from)) {
      issues.push(`Transition "${transition.id}" points from unknown state "${transition.from}".`);
    }
    if (!stateIds.has(transition.to)) {
      issues.push(`Transition "${transition.id}" points to unknown state "${transition.to}".`);
    }
  }

  if (issues.length > 0) {
    return { ok: false, errors: issues };
  }
  return { ok: true, value: { states, transitions, initialStateIds, finalStateIds } };
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
    const definition: SideEffectDefinition = {
      id: readString(item, 'id', path, issues),
      name: readString(item, 'name', path, issues),
      description,
    };
    return definition;
  });
  if (issues.length > 0) {
    return { ok: false, errors: issues };
  }
  return { ok: true, value: definitions };
}
