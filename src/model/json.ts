import type { JsonArray, JsonObject, JsonValue } from '../types.js';

export type JsonType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

export const JSON_TYPES: readonly JsonType[] = [
  'string',
  'number',
  'boolean',
  'null',
  'object',
  'array',
];

/** Steps into a JSON value: object keys as strings, array indexes as numbers. */
export type JsonPath = readonly (string | number)[];

export function isJsonArray(value: JsonValue): value is JsonArray {
  return Array.isArray(value);
}

export function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function jsonTypeOf(value: JsonValue): JsonType {
  if (value === null) {
    return 'null';
  }
  if (isJsonArray(value)) {
    return 'array';
  }
  if (isJsonObject(value)) {
    return 'object';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  return 'string';
}

export function emptyParams(): JsonObject {
  return {};
}

/** The value a freshly switched-to type starts with. */
export function defaultValueFor(type: JsonType): JsonValue {
  switch (type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'object':
      return {};
    case 'array':
      return [];
  }
}

/** Best effort conversion when the user switches a field's type. */
export function coerceTo(value: JsonValue, type: JsonType): JsonValue {
  switch (type) {
    case 'string':
      return isJsonObject(value) || isJsonArray(value) || value === null ? '' : String(value);
    case 'number': {
      const parsed = typeof value === 'boolean' ? Number(value) : Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    case 'boolean':
      return value === true || value === 'true' || value === 1;
    default:
      return defaultValueFor(type);
  }
}

function childAt(value: JsonValue, step: string | number): JsonValue {
  if (typeof step === 'number') {
    return isJsonArray(value) ? (value[step] ?? null) : null;
  }
  return isJsonObject(value) ? (value[step] ?? null) : null;
}

/** Returns a copy of `root` with `value` written at `path`. Missing branches are left alone. */
export function setAtPath(root: JsonValue, path: JsonPath, value: JsonValue): JsonValue {
  const [step, ...rest] = path;
  if (step === undefined) {
    return value;
  }
  const next = setAtPath(childAt(root, step), rest, value);
  if (typeof step === 'number') {
    if (!isJsonArray(root)) {
      return root;
    }
    const items = [...root];
    items[step] = next;
    return items;
  }
  if (!isJsonObject(root)) {
    return root;
  }
  return { ...root, [step]: next };
}

/** Returns a copy of `root` without the entry at `path`. */
export function removeAtPath(root: JsonValue, path: JsonPath): JsonValue {
  const parentPath = path.slice(0, -1);
  const step = path[path.length - 1];
  if (step === undefined) {
    return root;
  }
  const parent = getAtPath(root, parentPath);
  if (typeof step === 'number') {
    if (!isJsonArray(parent)) {
      return root;
    }
    return setAtPath(
      root,
      parentPath,
      parent.filter((_, index) => index !== step),
    );
  }
  if (!isJsonObject(parent)) {
    return root;
  }
  const entries = Object.entries(parent).filter(([key]) => key !== step);
  return setAtPath(root, parentPath, Object.fromEntries(entries));
}

export function getAtPath(root: JsonValue, path: JsonPath): JsonValue {
  let current: JsonValue = root;
  for (const step of path) {
    current = childAt(current, step);
  }
  return current;
}

/** Renames a key while keeping its position, so the form does not jump around. */
export function renameKeyAtPath(
  root: JsonValue,
  parentPath: JsonPath,
  from: string,
  to: string,
): JsonValue {
  const parent = getAtPath(root, parentPath);
  if (!isJsonObject(parent) || from === to || to.length === 0) {
    return root;
  }
  const entries = Object.entries(parent).map((entry): readonly [string, JsonValue] =>
    entry[0] === from ? [to, entry[1]] : entry,
  );
  return setAtPath(root, parentPath, Object.fromEntries(entries));
}

/** Adds an entry to the object or array at `path`, picking a free key when needed. */
export function appendEntry(root: JsonValue, path: JsonPath, type: JsonType = 'string'): JsonValue {
  const target = getAtPath(root, path);
  if (isJsonArray(target)) {
    return setAtPath(root, path, [...target, defaultValueFor(type)]);
  }
  if (!isJsonObject(target)) {
    return root;
  }
  let key = 'key';
  let suffix = 1;
  while (key in target) {
    suffix += 1;
    key = `key${suffix}`;
  }
  return setAtPath(root, path, { ...target, [key]: defaultValueFor(type) });
}

/** How many top-level parameters an effect carries. */
export function countParams(params: JsonObject): number {
  return Object.keys(params).length;
}

export function hasParams(params: JsonObject): boolean {
  return countParams(params) > 0;
}

export function formatJson(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

/** Compact one-line rendering, for tooltips. */
export function formatJsonInline(value: JsonValue): string {
  return JSON.stringify(value);
}

export type JsonTextResult =
  | { readonly ok: true; readonly value: JsonObject }
  | { readonly ok: false; readonly error: string };

/**
 * What {@link parseParamsText} says when the text does not parse.
 *
 * Passed in rather than looked up, so this module stays free of the UI: the
 * side effects dialog hands down whatever the host's string set holds.
 */
export interface JsonTextMessages {
  /** Fallback for a parser error that carried no message of its own. */
  readonly invalid: string;
  readonly notJsonValues: string;
  readonly notObject: string;
}

/** English, used when the caller names nothing. */
export const DEFAULT_JSON_TEXT_MESSAGES: JsonTextMessages = {
  invalid: 'Invalid JSON.',
  notJsonValues: 'Parameters must contain only JSON values.',
  notObject: 'Parameters must be a JSON object, for example {"to": "user"}.',
};

/**
 * Parses text the user typed in the JSON tab. Parameters must be a JSON object.
 *
 * A syntax error keeps the message `JSON.parse` produced: it names the position
 * the text broke at, which is the useful part, and it is the runtime's to
 * translate rather than ours.
 */
export function parseParamsText(
  text: string,
  messages: JsonTextMessages = DEFAULT_JSON_TEXT_MESSAGES,
): JsonTextResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : messages.invalid };
  }
  const value = toJsonValue(parsed);
  if (value === undefined) {
    return { ok: false, error: messages.notJsonValues };
  }
  if (!isJsonObject(value)) {
    return { ok: false, error: messages.notObject };
  }
  return { ok: true, value };
}

/** Narrows unknown input to a {@link JsonValue}, or `undefined` when it is not JSON. */
export function toJsonValue(input: unknown): JsonValue | undefined {
  if (input === null || typeof input === 'string' || typeof input === 'boolean') {
    return input;
  }
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : undefined;
  }
  if (Array.isArray(input)) {
    const items: JsonValue[] = [];
    for (const item of input) {
      const value = toJsonValue(item);
      if (value === undefined) {
        return undefined;
      }
      items.push(value);
    }
    return items;
  }
  if (typeof input === 'object') {
    const entries: [string, JsonValue][] = [];
    for (const [key, raw] of Object.entries(input)) {
      const value = toJsonValue(raw);
      if (value === undefined) {
        return undefined;
      }
      entries.push([key, value]);
    }
    return Object.fromEntries(entries);
  }
  return undefined;
}

/** Narrows unknown input to a JSON object, or `undefined`. */
export function toJsonObject(input: unknown): JsonObject | undefined {
  const value = toJsonValue(input);
  return value !== undefined && isJsonObject(value) ? value : undefined;
}
