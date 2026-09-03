import { describe, expect, it } from 'vitest';
import {
  createState,
  createTransition,
  decisionRows,
  findGroupOf,
  groupKeyOf,
  groupTransitions,
  isDecision,
  moveDecisionRow,
  outgoingTransitions,
  type StateMachine,
  StateMachineError,
  setDecisionLabelOffset,
} from '../src/index.js';

/** `finish` leaving `running` four ways, plus one unrelated edge in between. */
function decisionMachine(): StateMachine {
  const finish = { id: 'import.finish', name: 'finish' };
  const cancel = { id: 'import.cancel', name: 'cancel' };
  return {
    states: [
      createState({ id: 'running', name: 'Running', position: { x: 0, y: 0 } }),
      createState({ id: 'timed_out', name: 'Timed out', position: { x: 300, y: 0 } }),
      createState({ id: 'completed', name: 'Completed', position: { x: 300, y: 120 } }),
      createState({ id: 'partial', name: 'Partial', position: { x: 300, y: 240 } }),
      createState({ id: 'failed', name: 'Failed', position: { x: 300, y: 360 } }),
    ],
    transitions: [
      createTransition({
        id: 'a',
        name: 'time out',
        from: 'running',
        to: 'timed_out',
        trigger: finish,
        guard: 'reason is timeout',
      }),
      createTransition({
        id: 'x',
        name: 'cancel',
        from: 'running',
        to: 'failed',
        trigger: cancel,
      }),
      createTransition({
        id: 'b',
        name: 'complete',
        from: 'running',
        to: 'completed',
        trigger: finish,
        guard: 'failed == 0',
      }),
      createTransition({
        id: 'c',
        name: 'partial',
        from: 'running',
        to: 'partial',
        trigger: finish,
        guard: 'succeeded > 0',
      }),
      createTransition({
        id: 'd',
        name: 'fail',
        from: 'running',
        to: 'failed',
        trigger: finish,
      }),
    ],
    initialStateIds: ['running'],
    finalStateIds: [],
    data: {},
  };
}

describe('grouping edges by action', () => {
  it('puts the edges leaving one state under one action together', () => {
    const groups = groupTransitions(decisionMachine());
    expect(groups.map((group) => group.transitions.map((t) => t.id))).toEqual([
      ['a', 'b', 'c', 'd'],
      ['x'],
    ]);
    expect(groups[0]?.triggerId).toBe('import.finish');
    expect(groups[0]?.triggerName).toBe('finish');
    expect(groups[0]?.from).toBe('running');
  });

  it('keeps the members in the order the engine tries them', () => {
    const machine = decisionMachine();
    const [group] = groupTransitions(machine);
    expect(group?.transitions.map((t) => t.guard)).toEqual([
      'reason is timeout',
      'failed == 0',
      'succeeded > 0',
      '',
    ]);
  });

  it('leaves an untriggered edge in a group of its own', () => {
    const machine: StateMachine = {
      states: [
        createState({ id: 'a', name: 'A', position: { x: 0, y: 0 } }),
        createState({ id: 'b', name: 'B', position: { x: 0, y: 0 } }),
      ],
      transitions: [
        createTransition({ id: 't1', name: 'one', from: 'a', to: 'b' }),
        createTransition({ id: 't2', name: 'two', from: 'a', to: 'b' }),
      ],
      initialStateIds: [],
      finalStateIds: [],
      data: {},
    };
    const groups = groupTransitions(machine);
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => !isDecision(group))).toBe(true);
  });

  it('tells edges of the same action apart by their source', () => {
    const trigger = { id: 'pay', name: 'Pay' };
    const one = createTransition({ id: '1', name: 'a', from: 'draft', to: 'paid', trigger });
    const two = createTransition({ id: '2', name: 'b', from: 'held', to: 'paid', trigger });
    expect(groupKeyOf(one)).not.toBe(groupKeyOf(two));
  });

  it('gives a creation edge a key of its own rather than the empty source', () => {
    const trigger = { id: 'pay', name: 'Pay' };
    const creation = createTransition({ id: '1', name: 'a', from: null, to: 'paid', trigger });
    const fromState = createTransition({ id: '2', name: 'b', from: 'x', to: 'paid', trigger });
    expect(groupKeyOf(creation)).not.toBe(groupKeyOf(fromState));
  });

  it('finds the group one transition belongs to', () => {
    const machine = decisionMachine();
    expect(findGroupOf(machine, 'c')?.transitions.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(findGroupOf(machine, 'nope')).toBeUndefined();
  });
});

describe('the rows of a decision', () => {
  it('draws them in the order the engine tries them', () => {
    const [group] = groupTransitions(decisionMachine());
    const rows = decisionRows(
      group ?? { key: '', from: null, triggerId: null, triggerName: null, transitions: [] },
    );
    expect(rows.map((row) => row.transition.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.map((row) => row.order)).toEqual([1, 2, 3, 4]);
    // In a graph that would publish, the unguarded row is already last.
    expect(rows.at(-1)?.isFallback).toBe(true);
    expect(rows.every((row) => !row.isDead)).toBe(true);
  });

  it('marks everything behind a fallback as unreachable', () => {
    const machine = decisionMachine();
    // Move the unguarded edge to the front: everything after it is now dead.
    const reordered = moveDecisionRow(machine, 'd', 0);
    const group = findGroupOf(reordered, 'd');
    const rows = decisionRows(
      group ?? { key: '', from: null, triggerId: null, triggerName: null, transitions: [] },
    );
    // The fallback stays where it was moved to. Sorting it to the bottom would
    // hide the very thing that makes the three rows behind it dead.
    expect(rows.map((row) => [row.transition.id, row.isDead])).toEqual([
      ['d', false],
      ['a', true],
      ['b', true],
      ['c', true],
    ]);
    expect(rows[0]?.isFallback).toBe(true);
    expect(rows[0]?.order).toBe(1);
  });

  it('treats a whitespace-only guard as no guard at all', () => {
    const machine = decisionMachine();
    const withBlank: StateMachine = {
      ...machine,
      transitions: machine.transitions.map((transition) =>
        transition.id === 'b' ? { ...transition, guard: '   ' } : transition,
      ),
    };
    const group = findGroupOf(withBlank, 'b');
    const rows = decisionRows(
      group ?? { key: '', from: null, triggerId: null, triggerName: null, transitions: [] },
    );
    expect(rows.find((row) => row.isFallback)?.transition.id).toBe('b');
    expect(rows.find((row) => row.transition.id === 'd')?.isDead).toBe(true);
  });
});

describe('reordering a decision', () => {
  it('moves a member and leaves every other action where it stood', () => {
    const moved = moveDecisionRow(decisionMachine(), 'd', 0);
    expect(findGroupOf(moved, 'd')?.transitions.map((t) => t.id)).toEqual(['d', 'a', 'b', 'c']);
    // `x` fires a different action, so where it now sits among them says nothing
    // about evaluation order — what matters is that it is still there, once.
    expect(outgoingTransitions(moved, 'running').filter((t) => t.id === 'x')).toHaveLength(1);
  });

  it('lands on the slot the member it displaces was holding', () => {
    const moved = moveDecisionRow(decisionMachine(), 'a', 2);
    expect(findGroupOf(moved, 'a')?.transitions.map((t) => t.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('is a no-op when the member is already there', () => {
    const machine = decisionMachine();
    expect(moveDecisionRow(machine, 'a', 0)).toBe(machine);
  });

  it('refuses an unknown transition or an out of range position', () => {
    const machine = decisionMachine();
    expect(() => moveDecisionRow(machine, 'nope', 0)).toThrow(StateMachineError);
    expect(() => moveDecisionRow(machine, 'a', 9)).toThrow(StateMachineError);
  });
});

describe('the card position a group shares', () => {
  it('writes one offset onto every member', () => {
    const moved = setDecisionLabelOffset(decisionMachine(), 'a', { x: 12, y: -8 });
    const group = findGroupOf(moved, 'a');
    expect(group?.transitions.map((t) => t.labelOffset)).toEqual([
      { x: 12, y: -8 },
      { x: 12, y: -8 },
      { x: 12, y: -8 },
      { x: 12, y: -8 },
    ]);
    // The edge of another action keeps the position it had.
    expect(findGroupOf(moved, 'x')?.transitions[0]?.labelOffset).toEqual({ x: 0, y: 0 });
  });

  it('leaves the machine alone when nothing moves', () => {
    const machine = decisionMachine();
    expect(setDecisionLabelOffset(machine, 'a', { x: 0, y: 0 })).toBe(machine);
  });
});
