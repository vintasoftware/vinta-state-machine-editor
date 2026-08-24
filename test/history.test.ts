import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  createHistory,
  createState,
  HISTORY_LIMIT,
  type History,
  pendingRedo,
  pendingUndo,
  recordHistory,
  redoHistory,
  undoHistory,
} from '../src/index.js';
import type { StateMachine } from '../src/types.js';
import { sampleMachine } from './helpers.js';

/** A machine told apart from its neighbours by the state it carries. */
function machineNamed(name: string): StateMachine {
  return {
    ...sampleMachine(),
    states: [createState({ id: name, name, position: { x: 0, y: 0 } })],
  };
}

function record(history: History, machine: StateMachine): History {
  return recordHistory(history, { machine, change: { kind: 'state-add', stateId: 'x' } });
}

describe('history', () => {
  it('starts empty', () => {
    const history = createHistory();
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(pendingUndo(history)).toBeUndefined();
    expect(pendingRedo(history)).toBeUndefined();
  });

  it('walks back and forward through recorded machines', () => {
    const first = machineNamed('first');
    const second = machineNamed('second');
    const present = machineNamed('third');
    const history = record(record(createHistory(), first), second);

    const back = undoHistory(history, present);
    expect(back?.machine).toBe(second);
    const further = back === undefined ? undefined : undoHistory(back.history, back.machine);
    expect(further?.machine).toBe(first);

    const forward =
      further === undefined ? undefined : redoHistory(further.history, further.machine);
    expect(forward?.machine).toBe(second);
    const forwardAgain =
      forward === undefined ? undefined : redoHistory(forward.history, forward.machine);
    expect(forwardAgain?.machine).toBe(present);
    expect(forwardAgain === undefined ? true : canRedo(forwardAgain.history)).toBe(false);
  });

  it('reports the change each direction would apply', () => {
    const history = recordHistory(createHistory(), {
      machine: machineNamed('before'),
      change: { kind: 'state-move', stateId: 'draft' },
    });
    expect(pendingUndo(history)).toEqual({ kind: 'state-move', stateId: 'draft' });

    const back = undoHistory(history, machineNamed('after'));
    expect(back === undefined ? undefined : pendingRedo(back.history)).toEqual({
      kind: 'state-move',
      stateId: 'draft',
    });
  });

  it('returns nothing at either end', () => {
    const empty = createHistory();
    expect(undoHistory(empty, machineNamed('only'))).toBeUndefined();
    expect(redoHistory(empty, machineNamed('only'))).toBeUndefined();
  });

  it('drops the redo branch once the timeline moves on by another route', () => {
    const history = record(createHistory(), machineNamed('first'));
    const back = undoHistory(history, machineNamed('second'));
    if (back === undefined) {
      throw new Error('nothing to undo');
    }
    expect(canRedo(back.history)).toBe(true);

    const rewritten = record(back.history, machineNamed('third'));
    expect(canRedo(rewritten)).toBe(false);
    expect(canUndo(rewritten)).toBe(true);
  });

  it('forgets the oldest steps past the limit', () => {
    let history = createHistory();
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      history = record(history, machineNamed(`machine-${index}`));
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]?.machine.states[0]?.id).toBe('machine-5');
  });

  it('honours a caller supplied limit', () => {
    const history = record(record(record(createHistory(), machineNamed('a')), machineNamed('b')), {
      ...machineNamed('c'),
    });
    const capped = recordHistory(
      history,
      { machine: machineNamed('d'), change: { kind: 'replace' } },
      2,
    );
    expect(capped.past).toHaveLength(2);
  });

  it('never mutates the history it is handed', () => {
    const history = record(createHistory(), machineNamed('first'));
    const snapshot = { past: [...history.past], future: [...history.future] };
    undoHistory(history, machineNamed('second'));
    record(history, machineNamed('third'));
    expect(history).toEqual(snapshot);
  });
});
