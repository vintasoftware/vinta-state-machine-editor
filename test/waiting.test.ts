import { afterEach, describe, expect, it } from 'vitest';
import type { StateMachineChangeEvent } from '../src/index.js';
import {
  createState,
  createTransition,
  emptyWaitingConfig,
  isWaitingState,
  parseDuration,
  readWaiting,
  type StateMachine,
  StateMachineError,
  setWaiting,
  toggleWaiting,
} from '../src/index.js';
import { flush, mountEditor, queryAll, queryButton, queryOne, shadowOf } from './helpers.js';

const ACTIONS = [
  { id: 'import.finish', name: 'finish' },
  { id: 'import.cancel', name: 'cancel' },
];

function waitingMachine(data: Record<string, unknown> = {}): StateMachine {
  return {
    states: [
      createState({
        id: 'processing',
        name: 'Processing',
        position: { x: 0, y: 0 },
        data: {
          is_waiting: true,
          join_action: 'import.finish',
          child_machine: 'import_file.status',
          timeout: 'PT2H',
          ...data,
        },
      }),
      createState({ id: 'done', name: 'Done', position: { x: 400, y: 0 } }),
    ],
    transitions: [
      createTransition({
        id: 'finish',
        name: 'finish',
        from: 'processing',
        to: 'done',
        trigger: { id: 'import.finish', name: 'finish' },
      }),
    ],
    initialStateIds: ['processing'],
    finalStateIds: ['done'],
    data: {},
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('the waiting configuration in state.data', () => {
  it('reads the four keys off a state', () => {
    const [state] = waitingMachine().states;
    expect(state === undefined ? undefined : readWaiting(state)).toEqual({
      isWaiting: true,
      joinAction: 'import.finish',
      childMachine: 'import_file.status',
      timeout: 'PT2H',
      countsAs: '',
    });
  });

  it('reads a state that has never heard of them as one that does not wait', () => {
    const state = createState({ id: 'a', name: 'A', position: { x: 0, y: 0 } });
    expect(readWaiting(state)).toEqual(emptyWaitingConfig());
    expect(isWaitingState(state)).toBe(false);
  });

  it('ignores keys of the wrong type rather than failing the document', () => {
    const state = createState({
      id: 'a',
      name: 'A',
      position: { x: 0, y: 0 },
      data: { is_waiting: 'yes', join_action: 7 },
    });
    expect(readWaiting(state)).toEqual(emptyWaitingConfig());
  });

  it('drops a key rather than storing a blank, and keeps what it does not own', () => {
    const machine: StateMachine = {
      ...waitingMachine(),
      states: [
        createState({
          id: 'processing',
          name: 'Processing',
          position: { x: 0, y: 0 },
          data: { is_waiting: true, deferUntilCommit: true },
        }),
        createState({ id: 'done', name: 'Done', position: { x: 0, y: 0 } }),
      ],
    };
    const next = setWaiting(machine, 'processing', {
      isWaiting: true,
      joinAction: 'import.finish',
      childMachine: '',
      timeout: '',
      countsAs: '',
    });
    expect(next.states[0]?.data).toEqual({
      is_waiting: true,
      join_action: 'import.finish',
      deferUntilCommit: true,
    });
  });

  it('keeps the rest of the configuration when the wait is turned off', () => {
    const off = toggleWaiting(waitingMachine(), 'processing');
    expect(off.states[0]?.data).toEqual({
      is_waiting: false,
      join_action: 'import.finish',
      child_machine: 'import_file.status',
      timeout: 'PT2H',
    });
    const state = off.states.find((candidate) => candidate.id === 'processing');
    expect(state === undefined ? undefined : readWaiting(state)).toMatchObject({
      isWaiting: false,
      joinAction: 'import.finish',
    });
  });

  /*
   * Absence is what a document written before fan-outs existed looks like, so it
   * cannot also mean "the user switched this off": a host reading the first as
   * "leave the state alone" would silently drop the second. Asserting through
   * `readWaiting` is not enough — it answers `false` either way, which is what
   * let the deletion through in the first place.
   */
  it('writes the flag out as false rather than deleting it', () => {
    const off = toggleWaiting(waitingMachine(), 'processing');
    const data = off.states[0]?.data ?? {};
    expect('is_waiting' in data).toBe(true);
    expect(data['is_waiting']).toBe(false);
  });

  it('says false even when nothing else is left to notice', () => {
    // The case a host cannot work around: the three settings were all empty, so
    // switching off leaves no sibling key behind to read the absence against.
    const machine: StateMachine = {
      ...waitingMachine(),
      states: [
        createState({
          id: 'processing',
          name: 'Processing',
          position: { x: 0, y: 0 },
          data: { is_waiting: true },
        }),
        createState({ id: 'done', name: 'Done', position: { x: 0, y: 0 } }),
      ],
    };
    expect(toggleWaiting(machine, 'processing').states[0]?.data).toEqual({ is_waiting: false });
  });

  it('stays quiet about a state that has never been configured', () => {
    const machine: StateMachine = {
      ...waitingMachine(),
      states: [
        createState({
          id: 'processing',
          name: 'Processing',
          position: { x: 0, y: 0 },
          data: { counts_as: 'success' },
        }),
        createState({ id: 'done', name: 'Done', position: { x: 0, y: 0 } }),
      ],
    };
    const next = setWaiting(machine, 'processing', {
      ...emptyWaitingConfig(),
      countsAs: 'failure',
    });
    // Reporting into a parent's batch is not waiting for one: nothing here has
    // ever been a fan-out, so there is no decision to record.
    expect(next.states[0]?.data).toEqual({ counts_as: 'failure' });
  });

  it('records the decision once a setting has been filled in', () => {
    const machine: StateMachine = {
      ...waitingMachine(),
      states: [
        createState({ id: 'processing', name: 'Processing', position: { x: 0, y: 0 } }),
        createState({ id: 'done', name: 'Done', position: { x: 0, y: 0 } }),
      ],
    };
    const next = setWaiting(machine, 'processing', {
      ...emptyWaitingConfig(),
      joinAction: 'import.finish',
    });
    expect(next.states[0]?.data).toEqual({ is_waiting: false, join_action: 'import.finish' });
  });

  it('keeps saying false once it has said it', () => {
    const machine: StateMachine = {
      ...waitingMachine(),
      states: [
        createState({
          id: 'processing',
          name: 'Processing',
          position: { x: 0, y: 0 },
          data: { is_waiting: false },
        }),
        createState({ id: 'done', name: 'Done', position: { x: 0, y: 0 } }),
      ],
    };
    expect(setWaiting(machine, 'processing', emptyWaitingConfig()).states[0]?.data).toEqual({
      is_waiting: false,
    });
  });

  it('refuses a state that is not there', () => {
    expect(() => toggleWaiting(waitingMachine(), 'nope')).toThrow(StateMachineError);
  });
});

describe('reading an ISO 8601 duration', () => {
  it('reads the units a timeout is spelled in', () => {
    expect(parseDuration('PT2H')).toEqual({ days: 0, hours: 2, minutes: 0, seconds: 0 });
    expect(parseDuration('P1DT6H30M')).toEqual({ days: 1, hours: 6, minutes: 30, seconds: 0 });
    expect(parseDuration('P2W')).toEqual({ days: 14, hours: 0, minutes: 0, seconds: 0 });
    expect(parseDuration('PT0S')).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('hands back nothing for what is not one', () => {
    expect(parseDuration('two hours')).toBeUndefined();
    expect(parseDuration('P')).toBeUndefined();
    expect(parseDuration('PT')).toBeUndefined();
    // Months and years depend on when you start counting, so they are not read.
    expect(parseDuration('P1M')).toBeUndefined();
  });
});

describe('the waiting band on a state card', () => {
  it('stays away from a state that does not wait', () => {
    const editor = mountEditor();
    editor.value = {
      states: [createState({ id: 'a', name: 'A', position: { x: 0, y: 0 } })],
      transitions: [],
      initialStateIds: [],
      finalStateIds: [],
      data: {},
    };
    const root = shadowOf(editor);
    expect(queryOne(root, '.band').hidden).toBe(true);
    expect(queryOne(root, '.node').classList.contains('is-waiting')).toBe(false);
  });

  it('names what the state fans out to, joins with and gives up after', () => {
    const editor = mountEditor();
    editor.value = waitingMachine();
    const card = queryOne(shadowOf(editor), '.node[data-state-id="processing"]');
    expect(queryOne(card, '.band').hidden).toBe(false);
    expect(queryOne(card, '.band__row--child .band__value').textContent).toBe('import_file.status');
    expect(queryOne(card, '.band__row--join .band__value').textContent).toBe('⚡ import.finish');
    expect(queryOne(card, '.band__row--timeout .band__value').textContent).toBe('2h');
  });

  it('marks the card so it is findable without touching its colour', () => {
    const editor = mountEditor();
    editor.value = waitingMachine();
    const card = queryOne(shadowOf(editor), '.node[data-state-id="processing"]');
    expect(card.classList.contains('is-waiting')).toBe(true);
    expect(card.getAttribute('data-color')).toBe('neutral');
  });

  it('leaves out a line with nothing in it, but never the join', () => {
    const editor = mountEditor();
    editor.value = waitingMachine({ child_machine: '', timeout: '', join_action: '' });
    const card = queryOne(shadowOf(editor), '.node[data-state-id="processing"]');
    expect(queryOne(card, '.band__row--child').hidden).toBe(true);
    expect(queryOne(card, '.band__row--timeout').hidden).toBe(true);
    expect(queryOne(card, '.band__row--join').hidden).toBe(false);
    expect(queryOne(card, '.band__row--join').classList.contains('is-unset')).toBe(true);
  });

  it('shows a timeout it cannot read exactly as it was written', () => {
    const editor = mountEditor();
    editor.value = waitingMachine({ timeout: 'two hours' });
    const card = queryOne(shadowOf(editor), '.node[data-state-id="processing"]');
    expect(queryOne(card, '.band__row--timeout .band__value').textContent).toBe('two hours');
  });

  it('toggles the wait from the card footer, as one undoable step', () => {
    const editor = mountEditor();
    editor.value = waitingMachine();
    const root = shadowOf(editor);
    const changes: string[] = [];
    editor.addEventListener('state-machine-change', (event: StateMachineChangeEvent) => {
      changes.push(event.detail.change.kind);
    });
    const toggle = queryButton(root, '.node[data-state-id="processing"] .node__role--waiting');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    expect(changes).toEqual(['state-data']);
    expect(editor.value.states[0]?.data['is_waiting']).toBe(false);
    expect(queryOne(root, '.node[data-state-id="processing"] .band').hidden).toBe(true);
    editor.undo();
    expect(editor.value.states[0]?.data['is_waiting']).toBe(true);
  });

  it('locks the toggle while the editor is read-only', () => {
    const editor = mountEditor();
    editor.value = waitingMachine();
    editor.readOnly = true;
    const toggle = queryButton(shadowOf(editor), '.node__role--waiting');
    expect(toggle.disabled).toBe(true);
  });

  it('opens the state properties from a band row', async () => {
    const editor = mountEditor();
    editor.value = waitingMachine();
    const root = shadowOf(editor);
    queryButton(root, '.node[data-state-id="processing"] .band__row--join').click();
    await flush();
    const dialog = root.querySelector('state-machine-properties-dialog');
    expect(dialog).not.toBeNull();
    const panel = dialog === null ? null : shadowOf(dialog);
    expect(panel === null ? null : queryOne(panel, '[data-field="join-action"]')).not.toBeNull();
  });
});

describe('the waiting fields of the properties dialog', () => {
  it('writes the whole configuration back in one step', async () => {
    const editor = mountEditor();
    editor.value = waitingMachine();
    const root = shadowOf(editor);
    const opened = editor.openProperties({ kind: 'state', id: 'processing' });
    await flush();
    const dialog = root.querySelector('state-machine-properties-dialog');
    if (dialog === null) {
      throw new Error('No properties dialog.');
    }
    const panel = shadowOf(dialog);
    const timeout = queryOne(panel, '[data-field="timeout"]');
    if (!(timeout instanceof HTMLInputElement)) {
      throw new Error('No timeout field.');
    }
    timeout.value = 'PT30M';
    timeout.dispatchEvent(new Event('input', { bubbles: true }));
    queryButton(panel, '.button--primary').click();
    await opened;
    expect(editor.value.states[0]?.data['timeout']).toBe('PT30M');
    expect(queryOne(root, '.band__row--timeout .band__value').textContent).toBe('30m');
  });

  it('picks the join action out of the action catalog', async () => {
    const editor = mountEditor();
    editor.actionProvider = () => ACTIONS;
    editor.value = waitingMachine();
    const root = shadowOf(editor);
    void editor.openProperties({ kind: 'state', id: 'processing' });
    await flush();
    const dialog = root.querySelector('state-machine-properties-dialog');
    if (dialog === null) {
      throw new Error('No properties dialog.');
    }
    const select = queryOne(shadowOf(dialog), 'select[data-field="join-action"]');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('No join action picker.');
    }
    expect(queryAll(shadowOf(dialog), 'option').map((option) => option.textContent)).toContain(
      'cancel',
    );
    expect(select.value).toBe('import.finish');
  });

  it('leaves the fields of a transition alone', async () => {
    const editor = mountEditor();
    editor.value = waitingMachine();
    const root = shadowOf(editor);
    void editor.openProperties({ kind: 'transition', id: 'finish' });
    await flush();
    const dialog = root.querySelector('state-machine-properties-dialog');
    if (dialog === null) {
      throw new Error('No properties dialog.');
    }
    expect(shadowOf(dialog).querySelector('[data-field="join-action"]')).toBeNull();
  });
});
