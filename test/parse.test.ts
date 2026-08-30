import { describe, expect, it } from 'vitest';
import { StateMachineError } from '../src/model/errors.js';
import {
  assertStateMachine,
  parseActionDefinitions,
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

  it('takes a state with no position at all, for the layout to place', () => {
    const result = parseStateMachine({ states: [{ id: 's', name: 'S' }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.states[0]?.position).toEqual({ x: 0, y: 0 });
    }
  });

  it('still rejects a position that is there and wrong', () => {
    const result = parseStateMachine({ states: [{ id: 's', name: 'S', position: 'middle' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('machine.states[0].position must be an object with x and y.');
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

describe('initial and final state lists', () => {
  it('defaults to empty lists', () => {
    const result = parseStateMachine({ states: [], transitions: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.initialStateIds).toEqual([]);
      expect(result.value.finalStateIds).toEqual([]);
    }
  });

  it('keeps valid lists', () => {
    const result = parseStateMachine({ ...VALID, initialStateIds: ['s1'], finalStateIds: ['s1'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.initialStateIds).toEqual(['s1']);
      expect(result.value.finalStateIds).toEqual(['s1']);
    }
  });

  it('rejects unknown ids, duplicates and non-strings', () => {
    const result = parseStateMachine({ ...VALID, initialStateIds: ['ghost', 's1', 's1', 7] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('machine.initialStateIds refers to unknown state "ghost".');
      expect(result.errors).toContain('machine.initialStateIds lists "s1" more than once.');
      expect(result.errors).toContain('machine.initialStateIds[3] must be a state id.');
    }
  });

  it('rejects a list that is not an array', () => {
    expect(parseStateMachine({ ...VALID, finalStateIds: 's1' }).ok).toBe(false);
  });
});

describe('side effect parameters', () => {
  it('defaults to an empty object', () => {
    const result = parseStateMachine(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.states[0]?.onEnter.before[0]?.params).toEqual({});
    }
  });

  it('keeps nested JSON parameters', () => {
    const params = { to: 'user', retries: 3, tags: ['a', 'b'], meta: { deep: true, none: null } };
    const result = parseStateMachine({
      ...VALID,
      states: [
        {
          ...VALID.states[0],
          onEnter: { before: [{ id: 'e1', definitionId: 'd1', name: 'log', params }], after: [] },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.states[0]?.onEnter.before[0]?.params).toEqual(params);
    }
  });

  it('rejects parameters that are not a JSON object', () => {
    const result = parseStateMachine({
      ...VALID,
      states: [
        {
          ...VALID.states[0],
          onEnter: {
            before: [{ id: 'e1', definitionId: 'd1', name: 'log', params: [1, 2] }],
            after: [],
          },
          onLeave: { before: [], after: [] },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('must be a JSON object of parameters');
    }
  });

  it('reads defaultParams from the catalog', () => {
    const result = parseSideEffectDefinitions([
      { id: 'a', name: 'alpha', defaultParams: { retries: 3 } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.defaultParams).toEqual({ retries: 3 });
    }
  });

  it('rejects a malformed defaultParams', () => {
    expect(parseSideEffectDefinitions([{ id: 'a', name: 'alpha', defaultParams: 5 }]).ok).toBe(
      false,
    );
  });
});

describe('state colour parsing', () => {
  it('defaults to neutral when absent', () => {
    const result = parseStateMachine(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.states[0]?.color).toBe('neutral');
    }
  });

  it('keeps a valid colour', () => {
    const result = parseStateMachine({
      ...VALID,
      states: [{ ...VALID.states[0], color: 'success' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.states[0]?.color).toBe('success');
    }
  });

  it('rejects a colour outside the palette', () => {
    const result = parseStateMachine({
      ...VALID,
      states: [{ ...VALID.states[0], color: 'chartreuse' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('must be one of neutral, info, success');
    }
  });
});

describe('host-owned data', () => {
  it('defaults to an empty object at every level', () => {
    const result = parseStateMachine(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toEqual({});
      expect(result.value.states[0]?.data).toEqual({});
      expect(result.value.states[0]?.onEnter.before[0]?.data).toEqual({});
      expect(result.value.transitions[0]?.data).toEqual({});
    }
  });

  it('carries whatever the host attached, untouched', () => {
    const result = parseStateMachine({
      data: { version: 7 },
      states: [
        {
          ...VALID.states[0],
          data: { table: 'orders' },
          onEnter: {
            before: [
              {
                id: 'e1',
                definitionId: 'd1',
                name: 'log',
                data: { onCommit: true, nested: { deep: [1, null] } },
              },
            ],
            after: [],
          },
        },
      ],
      transitions: [{ ...VALID.transitions[0], data: { audited: true } }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toEqual({ version: 7 });
      expect(result.value.states[0]?.data).toEqual({ table: 'orders' });
      expect(result.value.states[0]?.onEnter.before[0]?.data).toEqual({
        onCommit: true,
        nested: { deep: [1, null] },
      });
      expect(result.value.transitions[0]?.data).toEqual({ audited: true });
    }
  });

  it('rejects a non-object with a useful path', () => {
    const result = parseStateMachine({
      ...VALID,
      states: [{ ...VALID.states[0], data: [1, 2] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('machine.states[0].data must be a JSON object.');
    }
    expect(parseStateMachine({ ...VALID, data: 'nope' }).ok).toBe(false);
  });
});

describe('side effect metadata', () => {
  function withEffect(effect: Record<string, unknown>): unknown {
    return {
      ...VALID,
      states: [{ ...VALID.states[0], onEnter: { before: [effect], after: [] } }],
    };
  }

  const BASE = { id: 'e1', definitionId: 'd1', name: 'log' };

  it('defaults to enabled with no description', () => {
    const result = parseStateMachine(withEffect(BASE));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.states[0]?.onEnter.before[0]?.enabled).toBe(true);
      expect(result.value.states[0]?.onEnter.before[0]?.description).toBe('');
    }
  });

  it('keeps an explicit false and a description', () => {
    const result = parseStateMachine(
      withEffect({ ...BASE, enabled: false, description: 'off for now' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.states[0]?.onEnter.before[0]?.enabled).toBe(false);
      expect(result.value.states[0]?.onEnter.before[0]?.description).toBe('off for now');
    }
  });

  it('rejects a non-boolean enabled and a non-string description', () => {
    const result = parseStateMachine(withEffect({ ...BASE, enabled: 'yes', description: 3 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('enabled must be a boolean');
      expect(result.errors.join(' ')).toContain('description must be a string');
    }
  });
});

describe('transition attributes', () => {
  function withTransition(patch: Record<string, unknown>): unknown {
    return { ...VALID, transitions: [{ ...VALID.transitions[0], ...patch }] };
  }

  it('defaults every attribute to empty', () => {
    const result = parseStateMachine(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const transition = result.value.transitions[0];
      expect(transition?.trigger).toBeNull();
      expect(transition?.guard).toBe('');
      expect(transition?.requiredPermission).toBe('');
      expect(transition?.description).toBe('');
    }
  });

  it('keeps a trigger, a guard, a permission and a description', () => {
    const result = parseStateMachine(
      withTransition({
        trigger: { id: 'pay-action', name: 'pay' },
        guard: 'order.total > 0',
        requiredPermission: 'orders.pay',
        description: 'Captures the payment.',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const transition = result.value.transitions[0];
      expect(transition?.trigger).toEqual({ id: 'pay-action', name: 'pay' });
      expect(transition?.guard).toBe('order.total > 0');
      expect(transition?.requiredPermission).toBe('orders.pay');
      expect(transition?.description).toBe('Captures the payment.');
    }
  });

  it('reads an explicit null trigger as "not chosen yet"', () => {
    const result = parseStateMachine(withTransition({ trigger: null }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transitions[0]?.trigger).toBeNull();
    }
  });

  it('rejects a malformed trigger', () => {
    expect(parseStateMachine(withTransition({ trigger: 'pay' })).ok).toBe(false);
    expect(parseStateMachine(withTransition({ trigger: { id: 'a' } })).ok).toBe(false);
  });

  it('rejects attributes that are not strings', () => {
    expect(parseStateMachine(withTransition({ guard: 12 })).ok).toBe(false);
    expect(parseStateMachine(withTransition({ requiredPermission: [] })).ok).toBe(false);
  });
});

describe('creation transitions', () => {
  function withSource(from: unknown): unknown {
    return { ...VALID, transitions: [{ id: 't1', name: 'create', from, to: 's1' }] };
  }

  it('accepts a null source and skips the unknown-state check', () => {
    const result = parseStateMachine(withSource(null));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transitions[0]?.from).toBeNull();
    }
  });

  it('rejects an empty string and a missing key', () => {
    expect(parseStateMachine(withSource('')).ok).toBe(false);
    const missing = parseStateMachine({
      ...VALID,
      transitions: [{ id: 't1', name: 'create', to: 's1' }],
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errors).toContain('machine.transitions[0].from must be a non-empty string.');
    }
  });

  it('still requires a target that exists', () => {
    const result = parseStateMachine({
      ...VALID,
      transitions: [{ id: 't1', name: 'create', from: null, to: 'ghost' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Transition "t1" points to unknown state "ghost".');
    }
  });
});

describe('parseActionDefinitions', () => {
  it('accepts a catalog with optional descriptions', () => {
    const result = parseActionDefinitions([
      { id: 'pay', name: 'pay' },
      { id: 'cancel', name: 'cancel', description: 'Voids the order' },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.description).toBeUndefined();
      expect(result.value[1]?.description).toBe('Voids the order');
    }
  });

  it('rejects malformed payloads', () => {
    expect(parseActionDefinitions({ items: [] }).ok).toBe(false);
    const result = parseActionDefinitions([{ id: 'a' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('actions[0].name must be a non-empty string.');
    }
  });
});

describe('state descriptions', () => {
  it('defaults to empty and keeps what it is given', () => {
    const empty = parseStateMachine(VALID);
    expect(empty.ok && empty.value.states[0]?.description).toBe('');
    const filled = parseStateMachine({
      ...VALID,
      states: [{ ...VALID.states[0], description: 'Not submitted yet.' }],
    });
    expect(filled.ok && filled.value.states[0]?.description).toBe('Not submitted yet.');
  });

  it('rejects a non-string description', () => {
    expect(
      parseStateMachine({ ...VALID, states: [{ ...VALID.states[0], description: 1 }] }).ok,
    ).toBe(false);
  });
});
