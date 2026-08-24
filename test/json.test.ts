import { describe, expect, it } from 'vitest';
import {
  appendEntry,
  coerceTo,
  countParams,
  defaultValueFor,
  formatJson,
  formatJsonInline,
  getAtPath,
  hasParams,
  isJsonArray,
  isJsonObject,
  jsonTypeOf,
  parseParamsText,
  removeAtPath,
  renameKeyAtPath,
  setAtPath,
  toJsonObject,
  toJsonValue,
} from '../src/model/json.js';

const NESTED = {
  to: 'user@example.com',
  retries: 3,
  urgent: false,
  fallback: null,
  tags: ['billing', 'email'],
  meta: { locale: 'pt-BR', flags: { beta: true } },
};

describe('json guards', () => {
  it('recognises objects and arrays', () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonArray([])).toBe(true);
    expect(isJsonArray({})).toBe(false);
  });

  it('names every JSON type', () => {
    expect(jsonTypeOf('a')).toBe('string');
    expect(jsonTypeOf(1)).toBe('number');
    expect(jsonTypeOf(true)).toBe('boolean');
    expect(jsonTypeOf(null)).toBe('null');
    expect(jsonTypeOf([])).toBe('array');
    expect(jsonTypeOf({})).toBe('object');
  });

  it('has a starting value for each type', () => {
    expect(defaultValueFor('string')).toBe('');
    expect(defaultValueFor('number')).toBe(0);
    expect(defaultValueFor('boolean')).toBe(false);
    expect(defaultValueFor('null')).toBeNull();
    expect(defaultValueFor('object')).toEqual({});
    expect(defaultValueFor('array')).toEqual([]);
  });

  it('converts between types as well as it can', () => {
    expect(coerceTo(42, 'string')).toBe('42');
    expect(coerceTo('7', 'number')).toBe(7);
    expect(coerceTo('nope', 'number')).toBe(0);
    expect(coerceTo('true', 'boolean')).toBe(true);
    expect(coerceTo({ a: 1 }, 'string')).toBe('');
    expect(coerceTo('anything', 'object')).toEqual({});
  });
});

describe('reading and writing paths', () => {
  it('reads nested values', () => {
    expect(getAtPath(NESTED, ['to'])).toBe('user@example.com');
    expect(getAtPath(NESTED, ['tags', 1])).toBe('email');
    expect(getAtPath(NESTED, ['meta', 'flags', 'beta'])).toBe(true);
  });

  it('returns null for paths that do not exist', () => {
    expect(getAtPath(NESTED, ['nope'])).toBeNull();
    expect(getAtPath(NESTED, ['tags', 9])).toBeNull();
    expect(getAtPath(NESTED, ['to', 'deeper'])).toBeNull();
  });

  it('writes without touching the original', () => {
    const next = setAtPath(NESTED, ['meta', 'flags', 'beta'], false);
    expect(getAtPath(next, ['meta', 'flags', 'beta'])).toBe(false);
    expect(NESTED.meta.flags.beta).toBe(true);
  });

  it('writes into arrays', () => {
    const next = setAtPath(NESTED, ['tags', 0], 'invoicing');
    expect(getAtPath(next, ['tags', 0])).toBe('invoicing');
    expect(getAtPath(next, ['tags', 1])).toBe('email');
  });

  it('replaces the root for an empty path', () => {
    expect(setAtPath(NESTED, [], { fresh: true })).toEqual({ fresh: true });
  });

  it('removes object keys and array items', () => {
    expect(getAtPath(removeAtPath(NESTED, ['retries']), ['retries'])).toBeNull();
    const withoutTag = removeAtPath(NESTED, ['tags', 0]);
    expect(getAtPath(withoutTag, ['tags'])).toEqual(['email']);
  });

  it('renames a key in place', () => {
    const renamed = renameKeyAtPath(NESTED, [], 'to', 'recipient');
    expect(isJsonObject(renamed) && Object.keys(renamed)).toEqual([
      'recipient',
      'retries',
      'urgent',
      'fallback',
      'tags',
      'meta',
    ]);
    expect(getAtPath(renamed, ['recipient'])).toBe('user@example.com');
  });

  it('ignores renames to an empty or identical key', () => {
    expect(renameKeyAtPath(NESTED, [], 'to', '')).toBe(NESTED);
    expect(renameKeyAtPath(NESTED, [], 'to', 'to')).toBe(NESTED);
  });

  it('appends entries, avoiding key collisions', () => {
    const once = appendEntry({}, [], 'string');
    expect(once).toEqual({ key: '' });
    const twice = appendEntry(once, [], 'number');
    expect(twice).toEqual({ key: '', key2: 0 });
  });

  it('appends into a nested array', () => {
    const next = appendEntry(NESTED, ['tags'], 'string');
    expect(getAtPath(next, ['tags'])).toEqual(['billing', 'email', '']);
  });
});

describe('counting and formatting', () => {
  it('counts top level parameters', () => {
    expect(countParams({})).toBe(0);
    expect(hasParams({})).toBe(false);
    expect(countParams(NESTED)).toBe(6);
    expect(hasParams(NESTED)).toBe(true);
  });

  it('formats for the editor and for tooltips', () => {
    expect(formatJson({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatJsonInline({ a: 1 })).toBe('{"a":1}');
  });
});

describe('parseParamsText', () => {
  it('accepts an object', () => {
    const result = parseParamsText('{"to": "user", "n": 2}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ to: 'user', n: 2 });
    }
  });

  it('treats empty text as no parameters', () => {
    const result = parseParamsText('   ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({});
    }
  });

  it('reports a syntax error', () => {
    const result = parseParamsText('{"to": }');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('insists on an object at the top level', () => {
    const result = parseParamsText('[1, 2]');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('must be a JSON object');
    }
  });
});

describe('narrowing unknown input', () => {
  it('accepts JSON values', () => {
    expect(toJsonValue({ a: [1, 'two', null, { b: false }] })).toEqual({
      a: [1, 'two', null, { b: false }],
    });
  });

  it('rejects values JSON cannot express', () => {
    expect(toJsonValue(undefined)).toBeUndefined();
    expect(toJsonValue(Number.NaN)).toBeUndefined();
    expect(toJsonValue(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(toJsonValue(() => 1)).toBeUndefined();
    expect(toJsonValue({ nested: { bad: undefined } })).toBeUndefined();
    expect(toJsonValue([1, Symbol('x')])).toBeUndefined();
  });

  it('narrows to objects only', () => {
    expect(toJsonObject({ a: 1 })).toEqual({ a: 1 });
    expect(toJsonObject([1])).toBeUndefined();
    expect(toJsonObject('a')).toBeUndefined();
  });
});
