import { describe, expect, it } from 'vitest';
import { StateMachineError } from '../src/model/errors.js';
import {
  assertStateMachine,
  parseSideEffectDefinitions,
  parseStateMachine,
} from '../src/model/parse.js';

const VALID = {
  states: [
    {
      id: 's1',
      name: 'Draft',
      position: { x: 0, y: 0 },
      onEnter: { before: [{ id: 'e1', definitionId: 'd1', name: 'log' }], after: [] },
      onLeave: { before: [], after: [] },
    },
  ],
  transitions: [{ id: 't1', name: 'go', from: 's1', to: 's1', effects: { before: [], after: [] } }],
};

describe('parseStateMachine', () => {
  it('accepts a valid machine', () => {
    const result = parseStateMachine(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.states[0]?.onEnter.before[0]?.name).toBe('log');
    }
  });

  it('fills in missing optional collections', () => {
    const result = parseStateMachine({
      states: [{ id: 's', name: 'S', position: { x: 1, y: 2 } }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.states[0]?.onEnter).toEqual({ before: [], after: [] });
      expect(result.value.transitions).toEqual([]);
    }
  });

  it('rejects non objects', () => {
    expect(parseStateMachine(null).ok).toBe(false);
    expect(parseStateMachine([]).ok).toBe(false);
    expect(parseStateMachine('nope').ok).toBe(false);
  });

  it('reports every problem it finds', () => {
    const result = parseStateMachine({
      states: [
        { id: 's1', name: 'A', position: { x: 'left', y: 0 } },
        { id: 's1', name: 'B', position: { x: 0, y: 0 } },
      ],
      transitions: [{ id: 't1', name: 'go', from: 's1', to: 'ghost' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('machine.states[0].position.x must be a finite number.');
      expect(result.errors).toContain('Duplicated state id "s1".');
      expect(result.errors).toContain('Transition "t1" points to unknown state "ghost".');
    }
  });

  it('throws a descriptive error through assertStateMachine', () => {
    expect(() => assertStateMachine({ states: 'nope' })).toThrow(StateMachineError);
    expect(assertStateMachine(VALID).states).toHaveLength(1);
  });
});

describe('parseSideEffectDefinitions', () => {
  it('accepts a catalog with optional descriptions', () => {
    const result = parseSideEffectDefinitions([
      { id: 'a', name: 'alpha' },
      { id: 'b', name: 'beta', description: 'second' },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.description).toBeUndefined();
      expect(result.value[1]?.description).toBe('second');
    }
  });

  it('rejects malformed payloads', () => {
    expect(parseSideEffectDefinitions({ items: [] }).ok).toBe(false);
    expect(parseSideEffectDefinitions([{ id: 'a' }]).ok).toBe(false);
  });
});
