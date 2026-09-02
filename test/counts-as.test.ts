import { afterEach, describe, expect, it } from 'vitest';
import {
  countsAsStatus,
  createState,
  type JsonObject,
  readCountsAs,
  readCountsAsPartial,
  type StateMachine,
  setWaiting,
} from '../src/index.js';
import { flush, mountEditor, queryButton, queryOne, shadowOf } from './helpers.js';

function childMachine(data: JsonObject, final = false): StateMachine {
  return {
    states: [
      createState({ id: 'imported', name: 'Imported', position: { x: 0, y: 0 }, data }),
      createState({ id: 'other', name: 'Other', position: { x: 300, y: 0 } }),
    ],
    transitions: [],
    initialStateIds: [],
    finalStateIds: final ? ['imported'] : [],
    data: {},
  };
}

function stateOf(machine: StateMachine) {
  const state = machine.states[0];
  if (state === undefined) {
    throw new Error('No state.');
  }
  return state;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('reading the report pair', () => {
  it('reads the key, never the handlers in the hook lists', () => {
    expect(readCountsAs(stateOf(childMachine({ counts_as: 'success' })))).toBe('success');
    expect(readCountsAs(stateOf(childMachine({})))).toBe('');
    expect(readCountsAs(stateOf(childMachine({ counts_as: 'maybe' })))).toBe('');
    expect(readCountsAsPartial(stateOf(childMachine({ counts_as_partial: 'enter' })))).toBe(
      'enter',
    );
  });

  it('is a whole pair on a state that can be left', () => {
    const state = stateOf(childMachine({ counts_as: 'success' }));
    expect(countsAsStatus(state, false)).toEqual({ kind: 'pair', countsAs: 'success' });
  });

  it('drops the leave half on a final state, which can never be left', () => {
    const state = stateOf(childMachine({ counts_as: 'failure' }));
    expect(countsAsStatus(state, true)).toEqual({ kind: 'enter-only', countsAs: 'failure' });
  });

  it('accepts an enter-only pair on a final state and refuses it anywhere else', () => {
    const state = stateOf(childMachine({ counts_as: 'success', counts_as_partial: 'enter' }));
    expect(countsAsStatus(state, true)).toEqual({ kind: 'enter-only', countsAs: 'success' });
    expect(countsAsStatus(state, false)).toEqual({
      kind: 'broken',
      countsAs: 'success',
      half: 'enter',
    });
  });

  it('refuses a leave half on its own, final or not', () => {
    const state = stateOf(childMachine({ counts_as: 'success', counts_as_partial: 'leave' }));
    expect(countsAsStatus(state, true)).toMatchObject({ kind: 'broken', half: 'leave' });
    expect(countsAsStatus(state, false)).toMatchObject({ kind: 'broken', half: 'leave' });
  });

  it('says nothing at all without the key, whatever the halves claim', () => {
    const state = stateOf(childMachine({ counts_as_partial: 'enter' }));
    expect(countsAsStatus(state, false)).toEqual({ kind: 'none' });
  });

  it('leaves the half the host reported alone when the outcome is rewritten', () => {
    const machine = childMachine({ counts_as: 'success', counts_as_partial: 'enter' });
    const next = setWaiting(machine, 'imported', {
      isWaiting: false,
      joinAction: '',
      childMachine: '',
      timeout: '',
      countsAs: 'failure',
    });
    expect(next.states[0]?.data).toEqual({
      counts_as: 'failure',
      counts_as_partial: 'enter',
    });
  });
});

describe('the report control on the card', () => {
  it('draws the band for a state that only reports, without waiting itself', () => {
    const editor = mountEditor();
    editor.value = childMachine({ counts_as: 'success' });
    const card = queryOne(shadowOf(editor), '.node[data-state-id="imported"]');
    expect(queryOne(card, '.band').hidden).toBe(false);
    expect(card.classList.contains('is-waiting')).toBe(false);
    expect(queryOne(card, '.band__row--child').hidden).toBe(true);
    expect(queryOne(card, '.band__row--join').hidden).toBe(true);
    expect(queryOne(card, '.band__row--counts .band__value').textContent).toBe('✓ success');
  });

  it('drops the leave half the moment Final is toggled on, and says so', () => {
    const editor = mountEditor();
    editor.value = childMachine({ counts_as: 'success' });
    const root = shadowOf(editor);
    const value = queryOne(root, '.band__row--counts .band__value');
    expect(value.textContent).toBe('✓ success');
    queryButton(root, '.node[data-state-id="imported"] .node__role--final').click();
    expect(queryOne(root, '.band__row--counts .band__value').textContent).toBe(
      '✓ success · on enter only',
    );
    queryButton(root, '.node[data-state-id="imported"] .node__role--final').click();
    expect(queryOne(root, '.band__row--counts .band__value').textContent).toBe('✓ success');
  });

  it('renders a half configured pair as broken, with the error where it happened', () => {
    const editor = mountEditor();
    editor.value = childMachine({ counts_as: 'success', counts_as_partial: 'enter' });
    const root = shadowOf(editor);
    expect(queryOne(root, '.band__row--counts').classList.contains('is-broken')).toBe(true);
    const error = queryOne(root, '.band__error');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('enter');
  });

  it('stops complaining once the state is marked final', () => {
    const editor = mountEditor();
    editor.value = childMachine({ counts_as: 'success', counts_as_partial: 'enter' }, true);
    const root = shadowOf(editor);
    expect(queryOne(root, '.band__error').hidden).toBe(true);
    expect(queryOne(root, '.band__row--counts').classList.contains('is-broken')).toBe(false);
  });

  it('never inspects the hook lists to decide any of it', () => {
    const editor = mountEditor();
    // A handler in both lanes, and no key: the control stays away.
    editor.value = {
      ...childMachine({}),
      states: [
        {
          ...stateOf(childMachine({})),
          onEnter: {
            before: [],
            after: [
              {
                id: 'e1',
                definitionId: 'report_success',
                name: 'reportSuccess',
                params: {},
                enabled: true,
                description: '',
                data: {},
              },
            ],
          },
        },
      ],
    };
    expect(queryOne(shadowOf(editor), '.band').hidden).toBe(true);
  });

  it('edits the outcome from the properties dialog', async () => {
    const editor = mountEditor();
    editor.value = childMachine({});
    const root = shadowOf(editor);
    const opened = editor.openProperties({ kind: 'state', id: 'imported' });
    await flush();
    const dialog = root.querySelector('state-machine-properties-dialog');
    if (dialog === null) {
      throw new Error('No properties dialog.');
    }
    const panel = shadowOf(dialog);
    const select = queryOne(panel, '[data-field="counts-as"]');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('No counts-as field.');
    }
    select.value = 'failure';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    queryButton(panel, '.button--primary').click();
    await opened;
    expect(editor.value.states[0]?.data['counts_as']).toBe('failure');
    expect(queryOne(root, '.band__row--counts .band__value').textContent).toBe('✗ failure');
  });
});
