import { describe, expect, it } from 'vitest';
import {
  isUnpositioned,
  type LayoutOptions,
  layoutPositions,
  organizeMachine,
} from '../src/geometry/layout.js';
import { createState, createTransition } from '../src/model/machine.js';
import type { Point, StateMachine, Transition } from '../src/types.js';

const OPTIONS: LayoutOptions = {
  nodeSize: { width: 200, height: 100 },
  labelSize: { width: 100, height: 50 },
};

/**
 * Matches the module's own constants, so the tests read as geometry not magic:
 * a gap is a whole transition card plus a margin on either side of it.
 */
const COLUMN_PITCH = 200 + (100 + 88 * 2);
const ROW_PITCH = 100 + (50 + 64 * 2);

interface Edge {
  readonly from: string | null;
  readonly to: string;
  readonly labelOffset?: Point;
}

function machineOf(
  stateIds: readonly string[],
  edges: readonly Edge[],
  roles: { readonly initial?: readonly string[]; readonly final?: readonly string[] } = {},
): StateMachine {
  return {
    states: stateIds.map((id) => createState({ id, name: id, position: { x: 0, y: 0 } })),
    transitions: edges.map((edge, index) =>
      createTransition({
        id: `t${index}`,
        name: `t${index}`,
        from: edge.from,
        to: edge.to,
        labelOffset: edge.labelOffset ?? { x: 0, y: 0 },
      }),
    ),
    initialStateIds: roles.initial ?? [],
    finalStateIds: roles.final ?? [],
    data: {},
  };
}

function at(machine: StateMachine, id: string): Point {
  const position = layoutPositions(machine, OPTIONS).get(id);
  if (position === undefined) {
    throw new Error(`No position for "${id}".`);
  }
  return position;
}

/** Column each state landed in, so a test can talk about order rather than pixels. */
function columnOf(machine: StateMachine, id: string): number {
  return at(machine, id).x / COLUMN_PITCH;
}

function transitionOf(machine: StateMachine, id: string): Transition {
  const found = machine.transitions.find((transition) => transition.id === id);
  if (found === undefined) {
    throw new Error(`No transition "${id}".`);
  }
  return found;
}

describe('isUnpositioned', () => {
  it('recognizes a machine whose cards all sit on the origin', () => {
    expect(isUnpositioned(machineOf(['a', 'b'], [{ from: 'a', to: 'b' }]))).toBe(true);
  });

  it('leaves a machine alone as soon as one card has been placed', () => {
    const machine = machineOf(['a', 'b'], [{ from: 'a', to: 'b' }]);
    const moved: StateMachine = {
      ...machine,
      states: machine.states.map((state) =>
        state.id === 'b' ? { ...state, position: { x: 10, y: 0 } } : state,
      ),
    };
    expect(isUnpositioned(moved)).toBe(false);
  });

  it('has nothing to lay out in an empty machine', () => {
    expect(isUnpositioned(machineOf([], []))).toBe(false);
  });
});

describe('layoutPositions', () => {
  it('puts a chain in one column per step, on a single row', () => {
    const machine = machineOf(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    );
    expect(at(machine, 'a')).toEqual({ x: 0, y: 0 });
    expect(at(machine, 'b')).toEqual({ x: COLUMN_PITCH, y: 0 });
    expect(at(machine, 'c')).toEqual({ x: COLUMN_PITCH * 2, y: 0 });
  });

  it('leaves a whole transition card between two columns', () => {
    const machine = machineOf(['a', 'b'], [{ from: 'a', to: 'b' }]);
    const gap = at(machine, 'b').x - at(machine, 'a').x - OPTIONS.nodeSize.width;
    expect(gap).toBeGreaterThan(OPTIONS.labelSize.width);
  });

  it('leaves a whole transition card between two stacked states, too', () => {
    const machine = machineOf(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ],
    );
    const gap = at(machine, 'c').y - at(machine, 'b').y - OPTIONS.nodeSize.height;
    // A card skipping a column, or a self loop, is nudged into this gap: it has
    // to hold one and still read as a gap.
    expect(gap).toBeGreaterThan(OPTIONS.labelSize.height);
  });

  it('gives a card measured taller than the rest its own room', () => {
    const machine = machineOf(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ],
    );
    // "b" carries a list of side effects, so it renders three times as tall as
    // a bare card; stacking on one measurement would put "c" through it.
    const tall = { width: OPTIONS.nodeSize.width, height: OPTIONS.nodeSize.height * 3 };
    const options = { ...OPTIONS, nodeSizes: new Map([['b', tall]]) };
    const positions = layoutPositions(machine, options);
    const top = positions.get('b');
    const below = positions.get('c');
    if (top === undefined || below === undefined) {
      throw new Error('Both cards should have been placed.');
    }
    expect(below.y - top.y).toBeGreaterThan(tall.height);
  });

  it('spreads the columns by the widest card in each', () => {
    const machine = machineOf(['a', 'b'], [{ from: 'a', to: 'b' }]);
    const wide = { width: OPTIONS.nodeSize.width * 2, height: OPTIONS.nodeSize.height };
    const options = { ...OPTIONS, nodeSizes: new Map([['a', wide]]) };
    const positions = layoutPositions(machine, options);
    expect(positions.get('b')?.x).toBe(COLUMN_PITCH + OPTIONS.nodeSize.width);
  });

  it('stacks a branch in the same column and centres the column it leaves', () => {
    const machine = machineOf(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ],
    );
    expect(columnOf(machine, 'b')).toBe(1);
    expect(columnOf(machine, 'c')).toBe(1);
    expect(at(machine, 'c').y - at(machine, 'b').y).toBe(ROW_PITCH);
    // Two rows in the second column, one in the first: the single card sits
    // level with the middle of the pair rather than at the top of the block.
    expect(at(machine, 'a').y).toBe((at(machine, 'b').y + at(machine, 'c').y) / 2);
  });

  it('starts from the states the machine declares as initial', () => {
    // "done" would rank first on in-degree alone, since the only edge into it
    // comes back around; the initial flag is what says where a record enters.
    const machine = machineOf(
      ['done', 'draft'],
      [
        { from: 'draft', to: 'done' },
        { from: 'done', to: 'draft' },
      ],
      { initial: ['draft'] },
    );
    expect(columnOf(machine, 'draft')).toBe(0);
    expect(columnOf(machine, 'done')).toBe(1);
  });

  it('starts from the states a creation edge feeds', () => {
    const machine = machineOf(
      ['done', 'draft'],
      [
        { from: 'draft', to: 'done' },
        { from: 'done', to: 'draft' },
        { from: null, to: 'draft' },
      ],
    );
    expect(columnOf(machine, 'draft')).toBe(0);
    expect(columnOf(machine, 'done')).toBe(1);
  });

  it('starts from the states nothing transitions into, when none is declared', () => {
    const machine = machineOf(['b', 'a'], [{ from: 'a', to: 'b' }]);
    expect(columnOf(machine, 'a')).toBe(0);
    expect(columnOf(machine, 'b')).toBe(1);
  });

  it('lays out a machine that is one closed cycle', () => {
    const machine = machineOf(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
    );
    expect(columnOf(machine, 'a')).toBe(0);
    expect(columnOf(machine, 'b')).toBe(1);
    expect(columnOf(machine, 'c')).toBe(2);
  });

  it('reaches a cycle no walk from the entry points can get into', () => {
    // b and c only ever transition into a, so nothing leads to them.
    const machine = machineOf(
      ['a', 'b', 'c'],
      [
        { from: 'b', to: 'c' },
        { from: 'c', to: 'b' },
        { from: 'c', to: 'a' },
      ],
    );
    const positions = layoutPositions(machine, OPTIONS);
    expect([...positions.keys()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores a self transition when ranking', () => {
    const machine = machineOf(
      ['a', 'b'],
      [
        { from: 'a', to: 'a' },
        { from: 'a', to: 'b' },
      ],
    );
    expect(columnOf(machine, 'a')).toBe(0);
    expect(columnOf(machine, 'b')).toBe(1);
  });

  it('orders a column to keep the edges into it from crossing', () => {
    // Declared order puts c above d in the third column, which crosses a→d with
    // b→c. The barycentre sweep swaps them so both edges run straight.
    const machine = machineOf(
      ['s', 'c', 'd', 'a', 'b'],
      [
        { from: 's', to: 'a' },
        { from: 's', to: 'b' },
        { from: 'a', to: 'd' },
        { from: 'b', to: 'c' },
      ],
    );
    expect(columnOf(machine, 'c')).toBe(2);
    expect(columnOf(machine, 'd')).toBe(2);
    expect(at(machine, 'a').y).toBeLessThan(at(machine, 'b').y);
    expect(at(machine, 'd').y).toBeLessThan(at(machine, 'c').y);
    // Each edge stays on its own row: that is what "no crossing" means here.
    expect(at(machine, 'a').y).toBe(at(machine, 'd').y);
    expect(at(machine, 'b').y).toBe(at(machine, 'c').y);
  });

  it('stacks disconnected sub-graphs instead of interleaving them', () => {
    const machine = machineOf(
      ['a', 'b', 'x', 'y'],
      [
        { from: 'a', to: 'b' },
        { from: 'x', to: 'y' },
      ],
    );
    expect(columnOf(machine, 'a')).toBe(0);
    expect(columnOf(machine, 'x')).toBe(0);
    // The second island clears the first by more than a card's height.
    expect(at(machine, 'x').y - at(machine, 'a').y).toBeGreaterThan(OPTIONS.nodeSize.height);
  });

  it('draws the block from the origin it is given', () => {
    const machine = machineOf(['a'], []);
    expect(layoutPositions(machine, { ...OPTIONS, origin: { x: 40, y: 24 } }).get('a')).toEqual({
      x: 40,
      y: 24,
    });
  });
});

describe('organizeMachine', () => {
  it('moves every state onto the layout', () => {
    const machine = machineOf(['a', 'b'], [{ from: 'a', to: 'b' }]);
    const organized = organizeMachine(machine, OPTIONS);
    expect(organized.states.map((state) => state.position)).toEqual([
      { x: 0, y: 0 },
      { x: COLUMN_PITCH, y: 0 },
    ]);
  });

  it('keeps everything but the positions, in the order it found them', () => {
    const machine = machineOf(['a', 'b'], [{ from: 'a', to: 'b' }], { initial: ['a'] });
    const organized = organizeMachine(machine, OPTIONS);
    expect(organized.states.map((state) => state.id)).toEqual(['a', 'b']);
    expect(organized.transitions).toEqual(machine.transitions);
    expect(organized.initialStateIds).toEqual(['a']);
  });

  it('hands a dragged transition card back to automatic placement', () => {
    const machine = machineOf(['a', 'b'], [{ from: 'a', to: 'b', labelOffset: { x: 30, y: 60 } }]);
    expect(transitionOf(organizeMachine(machine, OPTIONS), 't0').labelOffset).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('returns the machine untouched when it is already laid out this way', () => {
    const machine = machineOf(['a', 'b'], [{ from: 'a', to: 'b' }]);
    const organized = organizeMachine(machine, OPTIONS);
    expect(organizeMachine(organized, OPTIONS)).toBe(organized);
  });

  it('has nothing to do to an empty machine', () => {
    const machine = machineOf([], []);
    expect(organizeMachine(machine, OPTIONS)).toBe(machine);
  });
});
