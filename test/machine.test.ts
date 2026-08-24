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
  creationTransitions,
  describeChange,
  getSideEffects,
  isFinalState,
  isInitialState,
  moveSideEffect,
  moveTransition,
  outgoingTransitions,
  removeSideEffect,
  removeState,
  removeTransition,
  setFinalStates,
  setInitialStates,
  setSideEffectDescription,
  setSideEffectEnabled,
  setSideEffectParams,
  setSideEffects,
  setStateColor,
  setStateDescription,
  setTransitionDescription,
  setTransitionGuard,
  setTransitionPermission,
  setTransitionTrigger,
  siblingTransitions,
  toggleFinalState,
  toggleInitialState,
  uniqueTransitionName,
  updateState,
  updateTransition,
} from '../src/model/machine.js';
import {
  isStateColor,
  type SideEffectListRef,
  STATE_COLORS,
  type StateMachine,
} from '../src/types.js';

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
    initialStateIds: [],
    finalStateIds: [],
    data: {},
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

describe('initial and final states', () => {
  it('starts with no roles assigned', () => {
    const machine = createEmptyMachine();
    expect(machine.initialStateIds).toEqual([]);
    expect(machine.finalStateIds).toEqual([]);
  });

  it('toggles a state in and out of each list', () => {
    let machine = machineWithTwoStates();
    machine = toggleInitialState(machine, 's1');
    expect(isInitialState(machine, 's1')).toBe(true);
    expect(isFinalState(machine, 's1')).toBe(false);

    machine = toggleFinalState(machine, 's2');
    expect(machine.finalStateIds).toEqual(['s2']);

    machine = toggleInitialState(machine, 's1');
    expect(machine.initialStateIds).toEqual([]);
  });

  it('lets a state be both initial and final', () => {
    let machine = machineWithTwoStates();
    machine = toggleInitialState(machine, 's1');
    machine = toggleFinalState(machine, 's1');
    expect(isInitialState(machine, 's1')).toBe(true);
    expect(isFinalState(machine, 's1')).toBe(true);
  });

  it('supports several initial states, keeping the given order', () => {
    const machine = setInitialStates(machineWithTwoStates(), ['s2', 's1']);
    expect(machine.initialStateIds).toEqual(['s2', 's1']);
  });

  it('drops duplicates', () => {
    const machine = setFinalStates(machineWithTwoStates(), ['s1', 's1', 's2']);
    expect(machine.finalStateIds).toEqual(['s1', 's2']);
  });

  it('rejects unknown states', () => {
    expect(() => setInitialStates(machineWithTwoStates(), ['ghost'])).toThrow(StateMachineError);
    expect(() => toggleFinalState(machineWithTwoStates(), 'ghost')).toThrow(StateMachineError);
  });

  it('forgets a removed state', () => {
    let machine = machineWithTwoStates();
    machine = toggleInitialState(machine, 's1');
    machine = toggleFinalState(machine, 's1');
    machine = removeState(machine, 's1');
    expect(machine.initialStateIds).toEqual([]);
    expect(machine.finalStateIds).toEqual([]);
  });

  it('leaves the previous machine untouched', () => {
    const machine = machineWithTwoStates();
    const next = toggleInitialState(machine, 's1');
    expect(machine.initialStateIds).toEqual([]);
    expect(next.initialStateIds).toEqual(['s1']);
  });
});

describe('state colours', () => {
  it('starts neutral', () => {
    expect(createState({ name: 'A', position: { x: 0, y: 0 } }).color).toBe('neutral');
  });

  it('can be created with a colour', () => {
    expect(createState({ name: 'A', position: { x: 0, y: 0 }, color: 'danger' }).color).toBe(
      'danger',
    );
  });

  it('repaints one state without touching the rest', () => {
    const machine = machineWithTwoStates();
    const next = setStateColor(machine, 's1', 'success');
    expect(next.states[0]?.color).toBe('success');
    expect(next.states[1]?.color).toBe('neutral');
    expect(machine.states[0]?.color).toBe('neutral');
  });

  it('keeps the colour through unrelated edits', () => {
    let machine = setStateColor(machineWithTwoStates(), 's1', 'warning');
    machine = updateState(machine, 's1', { name: 'Renamed', position: { x: 5, y: 5 } });
    expect(machine.states[0]?.color).toBe('warning');
  });

  it('rejects unknown states', () => {
    expect(() => setStateColor(machineWithTwoStates(), 'ghost', 'info')).toThrow(StateMachineError);
  });

  it('knows which strings name a colour', () => {
    expect(STATE_COLORS).toEqual(['neutral', 'info', 'success', 'warning', 'danger', 'muted']);
    for (const color of STATE_COLORS) {
      expect(isStateColor(color)).toBe(true);
    }
    expect(isStateColor('purple')).toBe(false);
    expect(isStateColor(undefined)).toBe(false);
  });
});

describe('creation transitions', () => {
  function machineWithCreation(): StateMachine {
    const base = machineWithTwoStates();
    return {
      ...base,
      transitions: [
        createTransition({ id: 'c1', name: 'create', from: null, to: 's1' }),
        ...base.transitions,
      ],
      initialStateIds: ['s1'],
    };
  }

  it('accepts a null source and needs no state to exist for it', () => {
    const machine = addTransition(
      machineWithTwoStates(),
      createTransition({ id: 'c1', name: 'create', from: null, to: 's2' }),
    );
    expect(machine.transitions[1]?.from).toBeNull();
    expect(creationTransitions(machine).map((transition) => transition.id)).toEqual(['c1']);
  });

  it('still validates the target', () => {
    expect(() =>
      addTransition(
        machineWithTwoStates(),
        createTransition({ id: 'c1', name: 'create', from: null, to: 'ghost' }),
      ),
    ).toThrow(StateMachineError);
  });

  it('deletes creation edges along with the state they feed', () => {
    const machine = removeState(machineWithCreation(), 's1');
    expect(machine.transitions).toHaveLength(0);
    expect(creationTransitions(machine)).toHaveLength(0);
  });

  it('leaves creation edges alone when another state goes', () => {
    const machine = removeState(machineWithCreation(), 's2');
    expect(creationTransitions(machine).map((transition) => transition.id)).toEqual(['c1']);
  });

  it('turns an ordinary edge into a creation edge and back', () => {
    const machine = updateTransition(machineWithTwoStates(), 't1', { from: null });
    expect(machine.transitions[0]?.from).toBeNull();
    // `null` is a real value, so it must not be read as "leave it alone".
    expect(updateTransition(machine, 't1', { name: 'renamed' }).transitions[0]?.from).toBeNull();
    expect(updateTransition(machine, 't1', { from: 's1' }).transitions[0]?.from).toBe('s1');
  });

  it('names them uniquely across the whole machine', () => {
    const machine = machineWithCreation();
    expect(uniqueTransitionName(machine, 'create')).toBe('create 2');
    const next = addTransition(
      machine,
      createTransition({ id: 'c2', name: 'create 2', from: null, to: 's2' }),
    );
    expect(uniqueTransitionName(next, 'create')).toBe('create 3');
    expect(uniqueTransitionName(next, 'go')).toBe('go 2');
  });

  it('fans creation edges into the same state apart from each other', () => {
    const machine = addTransition(
      machineWithCreation(),
      createTransition({ id: 'c2', name: 'create 2', from: null, to: 's1' }),
    );
    const first = machine.transitions[0];
    if (first === undefined) {
      throw new Error('missing transition');
    }
    expect(siblingTransitions(machine, first).map((transition) => transition.id)).toEqual([
      'c1',
      'c2',
    ]);
  });
});

describe('transition order', () => {
  function branching(): StateMachine {
    return {
      states: [
        createState({ id: 's1', name: 'One', position: { x: 0, y: 0 } }),
        createState({ id: 's2', name: 'Two', position: { x: 100, y: 0 } }),
      ],
      transitions: [
        createTransition({ id: 'a', name: 'a', from: 's1', to: 's2' }),
        createTransition({ id: 'other', name: 'other', from: 's2', to: 's1' }),
        createTransition({ id: 'b', name: 'b', from: 's1', to: 's2' }),
        createTransition({ id: 'c', name: 'c', from: 's1', to: 's1' }),
      ],
      initialStateIds: [],
      finalStateIds: [],
      data: {},
    };
  }

  it('lists the edges leaving a state in array order', () => {
    expect(outgoingTransitions(branching(), 's1').map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(outgoingTransitions(branching(), 's2').map((item) => item.id)).toEqual(['other']);
    expect(outgoingTransitions(branching(), null)).toEqual([]);
  });

  it('moves an edge among its siblings without disturbing the others', () => {
    const machine = moveTransition(branching(), 'c', 0);
    expect(outgoingTransitions(machine, 's1').map((item) => item.id)).toEqual(['c', 'a', 'b']);
    // The siblings keep the slots they held, so nothing else in the array shifts.
    expect(machine.transitions.map((item) => item.id)).toEqual(['c', 'other', 'a', 'b']);
    expect(outgoingTransitions(machine, 's2').map((item) => item.id)).toEqual(['other']);
  });

  it('moves backwards too', () => {
    const machine = moveTransition(branching(), 'a', 2);
    expect(outgoingTransitions(machine, 's1').map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('reorders creation edges as one group', () => {
    const machine: StateMachine = {
      ...branching(),
      transitions: [
        createTransition({ id: 'c1', name: 'create', from: null, to: 's1' }),
        createTransition({ id: 'keep', name: 'keep', from: 's1', to: 's2' }),
        createTransition({ id: 'c2', name: 'create 2', from: null, to: 's2' }),
      ],
    };
    const moved = moveTransition(machine, 'c2', 0);
    expect(creationTransitions(moved).map((item) => item.id)).toEqual(['c2', 'c1']);
    expect(moved.transitions.map((item) => item.id)).toEqual(['c2', 'keep', 'c1']);
  });

  it('refuses a position outside the sibling group', () => {
    expect(() => moveTransition(branching(), 'a', 3)).toThrow(StateMachineError);
    expect(() => moveTransition(branching(), 'other', 1)).toThrow(StateMachineError);
    expect(() => moveTransition(branching(), 'ghost', 0)).toThrow(StateMachineError);
  });
});

describe('transition attributes', () => {
  it('sets and clears the trigger', () => {
    const machine = setTransitionTrigger(machineWithTwoStates(), 't1', {
      id: 'pay',
      name: 'pay',
    });
    expect(machine.transitions[0]?.trigger).toEqual({ id: 'pay', name: 'pay' });
    expect(setTransitionTrigger(machine, 't1', null).transitions[0]?.trigger).toBeNull();
  });

  it('stores guards and permissions verbatim', () => {
    const machine = setTransitionPermission(
      setTransitionGuard(machineWithTwoStates(), 't1', 'total > 0 && !locked'),
      't1',
      'orders.pay',
    );
    expect(machine.transitions[0]?.guard).toBe('total > 0 && !locked');
    expect(machine.transitions[0]?.requiredPermission).toBe('orders.pay');
  });

  it('sets descriptions on both kinds of element', () => {
    const machine = setStateDescription(
      setTransitionDescription(machineWithTwoStates(), 't1', 'Moves on.'),
      's1',
      'Where it starts.',
    );
    expect(machine.transitions[0]?.description).toBe('Moves on.');
    expect(machine.states[0]?.description).toBe('Where it starts.');
  });

  it('rejects unknown ids', () => {
    expect(() => setTransitionGuard(machineWithTwoStates(), 'ghost', 'x')).toThrow(
      StateMachineError,
    );
  });
});

describe('side effect metadata', () => {
  const ref: SideEffectListRef = {
    kind: 'state',
    stateId: 's1',
    trigger: 'enter',
    phase: 'before',
  };

  function withEffects(): StateMachine {
    return addSideEffect(
      addSideEffect(
        machineWithTwoStates(),
        ref,
        createSideEffect({ id: 'a', name: 'alpha' }, 'e1'),
      ),
      ref,
      createSideEffect({ id: 'b', name: 'beta' }, 'e2'),
    );
  }

  it('attaches new side effects enabled, whatever the catalog says', () => {
    expect(getSideEffects(withEffects(), ref).map((effect) => effect.enabled)).toEqual([
      true,
      true,
    ]);
    expect(getSideEffects(withEffects(), ref)[0]?.description).toBe('');
  });

  it('turns one off without detaching it', () => {
    const machine = setSideEffectEnabled(withEffects(), ref, 'e1', false);
    const effects = getSideEffects(machine, ref);
    expect(effects).toHaveLength(2);
    expect(effects[0]?.enabled).toBe(false);
    expect(effects[1]?.enabled).toBe(true);
  });

  it('keeps enabled, description and data through every list helper', () => {
    const machine = setSideEffectDescription(
      setSideEffectEnabled(withEffects(), ref, 'e1', false),
      ref,
      'e1',
      'paused during the migration',
    );
    const moved = setSideEffectParams(moveSideEffect(machine, ref, 0, 1), ref, 'e1', { a: 1 });
    const [, first] = getSideEffects(moved, ref);
    expect(first?.id).toBe('e1');
    expect(first?.enabled).toBe(false);
    expect(first?.description).toBe('paused during the migration');
    expect(first?.params).toEqual({ a: 1 });

    const replaced = setSideEffects(moved, ref, getSideEffects(moved, ref));
    expect(getSideEffects(replaced, ref)[1]?.enabled).toBe(false);
  });
});

describe('host-owned data', () => {
  it('defaults to an empty object in every create helper', () => {
    expect(createEmptyMachine().data).toEqual({});
    expect(createState({ name: 'A', position: { x: 0, y: 0 } }).data).toEqual({});
    expect(createTransition({ name: 't', from: 'a', to: 'b' }).data).toEqual({});
    expect(createSideEffect({ id: 'd', name: 'n' }).data).toEqual({});
  });

  it('accepts one and hands it back untouched', () => {
    expect(createState({ name: 'A', position: { x: 0, y: 0 }, data: { t: 1 } }).data).toEqual({
      t: 1,
    });
    expect(createTransition({ name: 't', from: null, to: 'b', data: { x: [1] } }).data).toEqual({
      x: [1],
    });
    expect(createSideEffect({ id: 'd', name: 'n' }, 'e', { onCommit: true }).data).toEqual({
      onCommit: true,
    });
  });

  it('survives every helper that rebuilds a state or a transition', () => {
    const machine: StateMachine = {
      states: [createState({ id: 's1', name: 'One', position: { x: 0, y: 0 }, data: { a: 1 } })],
      transitions: [
        createTransition({ id: 't1', name: 'go', from: 's1', to: 's1', data: { b: 2 } }),
      ],
      initialStateIds: [],
      finalStateIds: [],
      data: { top: true },
    };
    const next = setTransitionGuard(
      updateTransition(
        updateState(setStateColor(machine, 's1', 'danger'), 's1', { position: { x: 9, y: 9 } }),
        't1',
        { name: 'renamed' },
      ),
      't1',
      'x > 1',
    );
    expect(next.data).toEqual({ top: true });
    expect(next.states[0]?.data).toEqual({ a: 1 });
    expect(next.transitions[0]?.data).toEqual({ b: 2 });
    expect(setInitialStates(next, ['s1']).data).toEqual({ top: true });
    expect(removeTransition(next, 't1').data).toEqual({ top: true });
    expect(removeState(next, 's1').data).toEqual({ top: true });
  });
});

describe('describeChange', () => {
  it('names every kind of change', () => {
    expect(describeChange({ kind: 'transition-trigger', transitionId: 't' })).toBe(
      'Change transition trigger',
    );
    expect(describeChange({ kind: 'transition-guard', transitionId: 't' })).toBe(
      'Change transition guard',
    );
    expect(describeChange({ kind: 'transition-permission', transitionId: 't' })).toBe(
      'Change required permission',
    );
    expect(describeChange({ kind: 'transition-reorder', transitionId: 't' })).toBe(
      'Reorder transitions',
    );
    expect(describeChange({ kind: 'description', ref: { kind: 'state', id: 's' } })).toBe(
      'Change description',
    );
  });
});
