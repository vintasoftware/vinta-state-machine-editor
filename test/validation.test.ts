import { afterEach, describe, expect, it } from 'vitest';
import type { GuardValidation } from '../src/index.js';
import {
  createState,
  createTransition,
  decisionIssues,
  groupTransitions,
  type StateMachine,
  stateIssues,
} from '../src/index.js';
import { flush, mountEditor, queryAll, queryButton, queryOne, shadowOf } from './helpers.js';

const FINISH = { id: 'import.finish', name: 'finish' };

function machineWith(patch: Partial<StateMachine> = {}): StateMachine {
  return {
    states: [
      createState({
        id: 'processing',
        name: 'Processing',
        position: { x: 0, y: 0 },
        data: { is_waiting: true, join_action: 'import.finish' },
      }),
      createState({ id: 'done', name: 'Done', position: { x: 400, y: 0 } }),
    ],
    transitions: [],
    initialStateIds: [],
    finalStateIds: [],
    data: {},
    ...patch,
  };
}

function stateNamed(machine: StateMachine, id: string) {
  const state = machine.states.find((candidate) => candidate.id === id);
  if (state === undefined) {
    throw new Error(`No state "${id}".`);
  }
  return state;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('what is wrong with a state', () => {
  it('says nothing about an ordinary state', () => {
    const machine = machineWith();
    expect(stateIssues(machine, stateNamed(machine, 'done'))).toEqual([]);
  });

  it('flags a wait nothing closes', () => {
    const machine = machineWith();
    expect(stateIssues(machine, stateNamed(machine, 'processing'))).toEqual(['no-join-edge']);
  });

  it('is quiet once an edge answers the join action', () => {
    const machine = machineWith({
      transitions: [
        createTransition({
          id: 't',
          name: 'finish',
          from: 'processing',
          to: 'done',
          trigger: FINISH,
        }),
      ],
    });
    expect(stateIssues(machine, stateNamed(machine, 'processing'))).toEqual([]);
  });

  it('does not count an edge under some other action', () => {
    const machine = machineWith({
      transitions: [
        createTransition({
          id: 't',
          name: 'cancel',
          from: 'processing',
          to: 'done',
          trigger: { id: 'import.cancel', name: 'cancel' },
        }),
      ],
    });
    expect(stateIssues(machine, stateNamed(machine, 'processing'))).toEqual(['no-join-edge']);
  });

  it('flags a terminal state with a way out', () => {
    const machine = machineWith({
      finalStateIds: ['done'],
      transitions: [createTransition({ id: 't', name: 'again', from: 'done', to: 'processing' })],
    });
    expect(stateIssues(machine, stateNamed(machine, 'done'))).toEqual(['terminal-has-exit']);
  });

  it('leaves a terminal state with edges coming in alone', () => {
    const machine = machineWith({
      finalStateIds: ['done'],
      transitions: [createTransition({ id: 't', name: 'end', from: 'processing', to: 'done' })],
    });
    expect(stateIssues(machine, stateNamed(machine, 'done'))).toEqual([]);
  });
});

describe('what is wrong with a decision', () => {
  function decision(guards: readonly string[]): StateMachine {
    return machineWith({
      transitions: guards.map((guard, index) =>
        createTransition({
          id: `t${index}`,
          name: `out ${index}`,
          from: 'processing',
          to: 'done',
          trigger: FINISH,
          guard,
        }),
      ),
    });
  }

  it('flags a decision every outcome of which is guarded', () => {
    const [group] = groupTransitions(decision(['a > 1', 'b > 1']));
    expect(group === undefined ? undefined : decisionIssues(group)).toEqual(['no-fallback']);
  });

  it('is quiet once one outcome has no guard', () => {
    const [group] = groupTransitions(decision(['a > 1', '']));
    expect(group === undefined ? undefined : decisionIssues(group)).toEqual([]);
  });

  it('says nothing about a lone edge, guarded or not', () => {
    const [group] = groupTransitions(decision(['a > 1']));
    expect(group === undefined ? undefined : decisionIssues(group)).toEqual([]);
  });
});

describe('the stripes on the canvas', () => {
  it('stripes the state that waits for something nothing closes', () => {
    const editor = mountEditor();
    editor.value = machineWith();
    const root = shadowOf(editor);
    const card = queryOne(root, '.node[data-state-id="processing"]');
    expect(queryOne(card, '.stripes').hidden).toBe(false);
    expect(queryOne(card, '.stripe__text').textContent).toContain('finishes');
    expect(queryOne(root, '.node[data-state-id="done"] .stripes').hidden).toBe(true);
  });

  it('stripes a decision with no fallback, and stops when one appears', () => {
    const editor = mountEditor();
    const guarded = machineWith({
      transitions: [
        createTransition({
          id: 'a',
          name: 'a',
          from: 'processing',
          to: 'done',
          trigger: FINISH,
          guard: 'x',
        }),
        createTransition({
          id: 'b',
          name: 'b',
          from: 'processing',
          to: 'done',
          trigger: FINISH,
          guard: 'y',
        }),
      ],
    });
    editor.value = guarded;
    const root = shadowOf(editor);
    const stripes = queryOne(root, '.edge-card--decision > .stripes');
    expect(stripes.hidden).toBe(false);
    expect(stripes.textContent).toContain('fallback');
    queryButton(root, '.decision__row[data-transition-id="b"] .decision__summary').click();
    const guard = queryOne(root, '.decision__row[data-transition-id="b"] [data-field="guard"]');
    if (!(guard instanceof HTMLInputElement)) {
      throw new Error('No guard field.');
    }
    guard.value = '';
    guard.dispatchEvent(new Event('change', { bubbles: true }));
    expect(queryOne(root, '.edge-card--decision > .stripes').hidden).toBe(true);
  });

  it('stripes a terminal state that still has a way out', () => {
    const editor = mountEditor();
    editor.value = machineWith({
      finalStateIds: ['done'],
      transitions: [createTransition({ id: 't', name: 'again', from: 'done', to: 'processing' })],
    });
    const card = queryOne(shadowOf(editor), '.node[data-state-id="done"]');
    expect(queryOne(card, '.stripes').textContent).toContain('cannot be left');
  });

  it('shows the guard validator its own message, on the card', async () => {
    const editor = mountEditor();
    editor.guardValidator = (expression): GuardValidation =>
      expression === 'bad(' ? { ok: false, errors: ['unbalanced parenthesis'] } : { ok: true };
    editor.value = machineWith({
      transitions: [
        createTransition({ id: 't', name: 'go', from: 'processing', to: 'done', guard: 'bad(' }),
      ],
    });
    await flush();
    const card = queryOne(shadowOf(editor), '.edge-card[data-transition-id="t"]');
    expect(queryOne(card, '.stripes').hidden).toBe(false);
    expect(queryOne(card, '.stripe__text').textContent).toBe('unbalanced parenthesis');
  });

  it('asks the validator once per distinct guard, however many cards hold it', async () => {
    const editor = mountEditor();
    const asked: string[] = [];
    editor.guardValidator = (expression): GuardValidation => {
      asked.push(expression);
      return { ok: true };
    };
    editor.value = machineWith({
      transitions: [
        createTransition({ id: 'a', name: 'a', from: 'processing', to: 'done', guard: 'x > 1' }),
        createTransition({ id: 'b', name: 'b', from: 'done', to: 'processing', guard: 'x > 1' }),
      ],
    });
    await flush();
    editor.setStateColor('done', 'success');
    await flush();
    expect(asked).toEqual(['x > 1']);
  });

  it('stripes a guard inside a decision row', async () => {
    const editor = mountEditor();
    editor.guardValidator = (): GuardValidation => ({ ok: false, errors: ['nope'] });
    editor.value = machineWith({
      transitions: [
        createTransition({
          id: 'a',
          name: 'a',
          from: 'processing',
          to: 'done',
          trigger: FINISH,
          guard: 'x',
        }),
        createTransition({
          id: 'b',
          name: 'b',
          from: 'processing',
          to: 'done',
          trigger: FINISH,
          guard: '',
        }),
      ],
    });
    await flush();
    const root = shadowOf(editor);
    const row = queryOne(root, '.decision__row[data-transition-id="a"]');
    expect(queryOne(row, '.stripes').textContent).toContain('nope');
    // The unguarded fallback has nothing to complain about.
    expect(queryOne(root, '.decision__row[data-transition-id="b"] .stripes').hidden).toBe(true);
  });

  it('says nothing when a validator throws', async () => {
    const editor = mountEditor();
    editor.guardValidator = () => {
      throw new Error('the service is down');
    };
    editor.value = machineWith({
      transitions: [
        createTransition({ id: 't', name: 'go', from: 'processing', to: 'done', guard: 'x' }),
      ],
    });
    await flush();
    const card = queryOne(shadowOf(editor), '.edge-card[data-transition-id="t"]');
    expect(queryOne(card, '.stripes').hidden).toBe(true);
  });

  it('never blocks an edit', () => {
    const editor = mountEditor();
    editor.value = machineWith();
    const root = shadowOf(editor);
    expect(queryOne(root, '.node[data-state-id="processing"] .stripes').hidden).toBe(false);
    queryButton(root, '.node[data-state-id="processing"] .node__role--final').click();
    expect(editor.value.finalStateIds).toEqual(['processing']);
    expect(queryAll(root, '.node[data-state-id="processing"] .stripe').length).toBeGreaterThan(0);
  });
});
