import { beforeEach, describe, expect, it } from 'vitest';
import { insertItem, moveItem } from '../src/model/array.js';
import { StateMachineError } from '../src/model/errors.js';
import {
  addSideEffect,
  addState,
  addTransition,
  createEmptyMachine,
  createSideEffect,
  createState,
  createTransition,
  getSideEffects,
  moveSideEffect,
  removeSideEffect,
  removeState,
  removeTransition,
  setSideEffects,
  siblingTransitions,
  updateState,
  updateTransition,
} from '../src/model/machine.js';
import type { SideEffectListRef, StateMachine } from '../src/types.js';

const CATALOG = [
  { id: 'a', name: 'alpha' },
  { id: 'b', name: 'beta' },
  { id: 'c', name: 'gamma' },
];

function machineWithTwoStates(): StateMachine {
  return {
    states: [
      createState({ id: 's1', name: 'One', position: { x: 0, y: 0 } }),
      createState({ id: 's2', name: 'Two', position: { x: 100, y: 0 } }),
    ],
    transitions: [createTransition({ id: 't1', name: 'go', from: 's1', to: 's2' })],
  };
}

describe('array helpers', () => {
  it('moves an item forward and backward', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
  });

  it('returns the same reference when nothing moves', () => {
    const items = [1, 2, 3];
    expect(moveItem(items, 1, 1)).toBe(items);
  });

  it('rejects out of bounds indexes', () => {
    expect(() => moveItem([1, 2], 5, 0)).toThrow(RangeError);
    expect(() => moveItem([1, 2], 0, 9)).toThrow(RangeError);
  });

  it('inserts clamping the index', () => {
    expect(insertItem([1, 2], 9, 0)).toEqual([9, 1, 2]);
    expect(insertItem([1, 2], 9, 99)).toEqual([1, 2, 9]);
  });
});

describe('states', () => {
  it('adds a state without touching the previous machine', () => {
    const machine = createEmptyMachine();
    const next = addState(machine, createState({ name: 'Draft', position: { x: 1, y: 2 } }));
    expect(machine.states).toHaveLength(0);
    expect(next.states).toHaveLength(1);
    expect(next.states[0]?.name).toBe('Draft');
  });

  it('rejects duplicated ids', () => {
    const machine = addState(
      createEmptyMachine(),
      createState({ id: 'x', name: 'X', position: { x: 0, y: 0 } }),
    );
    expect(() =>
      addState(machine, createState({ id: 'x', name: 'Y', position: { x: 0, y: 0 } })),
    ).toThrow(StateMachineError);
  });

  it('renames and moves', () => {
    const machine = machineWithTwoStates();
    const renamed = updateState(machine, 's1', { name: 'Renamed' });
    expect(renamed.states[0]?.name).toBe('Renamed');
    const moved = updateState(renamed, 's1', { position: { x: 42, y: 43 } });
    expect(moved.states[0]?.position).toEqual({ x: 42, y: 43 });
    expect(moved.states[0]?.name).toBe('Renamed');
  });

  it('removes attached transitions along with the state', () => {
    const next = removeState(machineWithTwoStates(), 's2');
    expect(next.states.map((state) => state.id)).toEqual(['s1']);
    expect(next.transitions).toHaveLength(0);
  });

  it('throws for unknown states', () => {
    expect(() => removeState(createEmptyMachine(), 'nope')).toThrow(StateMachineError);
  });
});

describe('transitions', () => {
  it('requires both endpoints to exist', () => {
    const machine = machineWithTwoStates();
    expect(() =>
      addTransition(machine, createTransition({ name: 'x', from: 's1', to: 'ghost' })),
    ).toThrow(StateMachineError);
  });

  it('supports self transitions', () => {
    const machine = addTransition(
      machineWithTwoStates(),
      createTransition({ id: 'self', name: 'retry', from: 's1', to: 's1' }),
    );
    expect(machine.transitions).toHaveLength(2);
  });

  it('renames and reconnects', () => {
    const machine = updateTransition(machineWithTwoStates(), 't1', { name: 'pay', to: 's1' });
    expect(machine.transitions[0]?.name).toBe('pay');
    expect(machine.transitions[0]?.to).toBe('s1');
  });

  it('removes a transition', () => {
    expect(removeTransition(machineWithTwoStates(), 't1').transitions).toHaveLength(0);
    expect(() => removeTransition(machineWithTwoStates(), 'ghost')).toThrow(StateMachineError);
  });

  it('groups siblings regardless of direction', () => {
    const machine = addTransition(
      machineWithTwoStates(),
      createTransition({ id: 't2', name: 'back', from: 's2', to: 's1' }),
    );
    const transition = machine.transitions[0];
    if (transition === undefined) {
      throw new Error('missing transition');
    }
    expect(siblingTransitions(machine, transition).map((item) => item.id)).toEqual(['t1', 't2']);
  });
});

describe('side effects', () => {
  const transitionBefore: SideEffectListRef = {
    kind: 'transition',
    transitionId: 't1',
    phase: 'before',
  };
  const enterAfter: SideEffectListRef = {
    kind: 'state',
    stateId: 's2',
    trigger: 'enter',
    phase: 'after',
  };
  let machine: StateMachine;

  beforeEach(() => {
    machine = machineWithTwoStates();
  });

  it('starts empty for every list', () => {
    expect(getSideEffects(machine, transitionBefore)).toEqual([]);
    expect(getSideEffects(machine, enterAfter)).toEqual([]);
  });

  it('appends preserving order', () => {
    let next = machine;
    for (const definition of CATALOG) {
      next = addSideEffect(next, transitionBefore, createSideEffect(definition));
    }
    expect(getSideEffects(next, transitionBefore).map((effect) => effect.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });

  it('keeps each of the six lists independent', () => {
    const refs: readonly SideEffectListRef[] = [
      { kind: 'state', stateId: 's1', trigger: 'enter', phase: 'before' },
      { kind: 'state', stateId: 's1', trigger: 'enter', phase: 'after' },
      { kind: 'state', stateId: 's1', trigger: 'leave', phase: 'before' },
      { kind: 'state', stateId: 's1', trigger: 'leave', phase: 'after' },
      { kind: 'transition', transitionId: 't1', phase: 'before' },
      { kind: 'transition', transitionId: 't1', phase: 'after' },
    ];
    let next = machine;
    refs.forEach((ref, index) => {
      const definition = { id: `d${index}`, name: `effect-${index}` };
      next = addSideEffect(next, ref, createSideEffect(definition, `e${index}`));
    });
    refs.forEach((ref, index) => {
      expect(getSideEffects(next, ref).map((effect) => effect.name)).toEqual([`effect-${index}`]);
    });
  });

  it('inserts at an explicit index', () => {
    const first = addSideEffect(
      machine,
      enterAfter,
      createSideEffect(CATALOG[0] ?? { id: '', name: '' }),
    );
    const second = addSideEffect(
      first,
      enterAfter,
      createSideEffect(CATALOG[1] ?? { id: '', name: '' }),
      0,
    );
    expect(getSideEffects(second, enterAfter).map((effect) => effect.name)).toEqual([
      'beta',
      'alpha',
    ]);
  });

  it('removes by id and rejects unknown ids', () => {
    const effect = createSideEffect(CATALOG[0] ?? { id: '', name: '' }, 'effect-1');
    const withEffect = addSideEffect(machine, enterAfter, effect);
    expect(
      getSideEffects(removeSideEffect(withEffect, enterAfter, 'effect-1'), enterAfter),
    ).toEqual([]);
    expect(() => removeSideEffect(withEffect, enterAfter, 'ghost')).toThrow(StateMachineError);
  });

  it('reorders, since the order matters', () => {
    const effects = CATALOG.map((definition, index) => createSideEffect(definition, `e${index}`));
    const filled = setSideEffects(machine, transitionBefore, effects);
    const moved = moveSideEffect(filled, transitionBefore, 2, 0);
    expect(getSideEffects(moved, transitionBefore).map((effect) => effect.name)).toEqual([
      'gamma',
      'alpha',
      'beta',
    ]);
  });

  it('fails for unknown owners', () => {
    expect(() =>
      getSideEffects(machine, { kind: 'transition', transitionId: 'ghost', phase: 'after' }),
    ).toThrow(StateMachineError);
  });
});
