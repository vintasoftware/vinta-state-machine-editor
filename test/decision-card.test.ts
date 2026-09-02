import { afterEach, describe, expect, it } from 'vitest';
import type { StateMachineChangeEvent } from '../src/index.js';
import { createState, createTransition, type StateMachine } from '../src/index.js';
import {
  fireKey,
  firePointer,
  mountEditor,
  queryAll,
  queryButton,
  queryOne,
  shadowOf,
} from './helpers.js';

const FINISH = { id: 'import.finish', name: 'finish' };

/** Three guarded outcomes plus a fallback, all under one action. */
function decisionMachine(): StateMachine {
  return {
    states: [
      createState({ id: 'running', name: 'Running', position: { x: 0, y: 0 } }),
      createState({ id: 'timed_out', name: 'Timed out', position: { x: 400, y: 0 } }),
      createState({ id: 'completed', name: 'Completed', position: { x: 400, y: 160 } }),
      createState({ id: 'failed', name: 'Failed', position: { x: 400, y: 320 } }),
    ],
    transitions: [
      createTransition({
        id: 'a',
        name: 'time out',
        from: 'running',
        to: 'timed_out',
        trigger: FINISH,
        guard: 'reason is timeout',
      }),
      createTransition({
        id: 'b',
        name: 'complete',
        from: 'running',
        to: 'completed',
        trigger: FINISH,
        guard: 'failed == 0',
      }),
      createTransition({
        id: 'c',
        name: 'give up',
        from: 'running',
        to: 'failed',
        trigger: FINISH,
      }),
    ],
    initialStateIds: ['running'],
    finalStateIds: [],
    data: {},
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('the decision card', () => {
  it('draws one card for the edges sharing a source and an action', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    expect(queryAll(root, '.edge-card')).toHaveLength(1);
    expect(queryAll(root, '.decision__row')).toHaveLength(3);
    // Every edge still keeps a curve of its own.
    expect(root.querySelectorAll('path.edge[data-transition-id]')).toHaveLength(3);
  });

  it('heads the card with the action and how many outcomes it has', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    expect(queryOne(root, '.decision__action').textContent).toBe('⚡ finish');
    expect(queryOne(root, '.decision__count').textContent).toBe('3 outcomes');
  });

  it('leaves a lone edge drawn exactly as it always was', () => {
    const editor = mountEditor();
    const machine = decisionMachine();
    editor.value = {
      ...machine,
      transitions: [machine.transitions[0] ?? createTransition({ name: 'x', from: null, to: 'a' })],
    };
    const root = shadowOf(editor);
    expect(queryAll(root, '.decision__row')).toHaveLength(0);
    expect(queryOne(root, '.edge-card[data-transition-id="a"]')).toBeTruthy();
    expect(queryOne(root, '.edge-card__name').textContent).toBe('time out');
  });

  it('numbers the guarded rows and pins the unguarded one to the bottom', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const rows = queryAll(shadowOf(editor), '.decision__row');
    expect(rows.map((row) => row.getAttribute('data-transition-id'))).toEqual(['a', 'b', 'c']);
    const orders = rows.map((row) => queryOne(row, '.decision__order').textContent);
    expect(orders.slice(0, 2)).toEqual(['1', '2']);
    expect(rows[2]?.classList.contains('is-fallback')).toBe(true);
    expect(
      queryOne(shadowOf(editor), '.decision__row.is-fallback .decision__outcome').textContent,
    ).toBe('else');
  });

  it('names each row after where it lands', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const targets = queryAll(shadowOf(editor), '.decision__target').map((el) => el.textContent);
    expect(targets).toEqual(['→ Timed out', '→ Completed', '→ Failed']);
  });

  it('flags the rows a fallback has made unreachable', () => {
    const editor = mountEditor();
    const machine = decisionMachine();
    // The unguarded edge first: nothing behind it is ever consulted.
    editor.value = {
      ...machine,
      transitions: [
        machine.transitions[2] ?? machine.transitions[0],
        machine.transitions[0],
        machine.transitions[1],
      ].filter((transition) => transition !== undefined),
    };
    const root = shadowOf(editor);
    const dead = queryAll(root, '.decision__row.is-dead');
    expect(dead.map((row) => row.getAttribute('data-transition-id'))).toEqual(['a', 'b']);
    expect(queryAll(root, '.decision__flag:not([hidden])')).toHaveLength(2);
  });

  it('opens a row in place to edit the edge behind it', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    const row = queryOne(root, '.decision__row[data-transition-id="b"]');
    const summary = queryButton(row, '.decision__summary');
    expect(queryOne(row, '.decision__panel').hidden).toBe(true);
    summary.click();
    const open = queryOne(root, '.decision__row[data-transition-id="b"]');
    expect(queryOne(open, '.decision__panel').hidden).toBe(false);
    expect(summary.getAttribute('aria-expanded')).toBe('true');
    expect(editor.selection).toEqual({ kind: 'transition', id: 'b' });
  });

  it('writes the guard typed into an open row back to the machine', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    queryButton(root, '.decision__row[data-transition-id="b"] .decision__summary').click();
    const changes: string[] = [];
    editor.addEventListener('state-machine-change', (event: StateMachineChangeEvent) => {
      changes.push(event.detail.change.kind);
    });
    const input = queryOne(root, '.decision__row[data-transition-id="b"] [data-field="guard"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('No guard field.');
    }
    input.value = 'failed == 0 and skipped == 0';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changes).toEqual(['transition-guard']);
    expect(editor.value.transitions.find((t) => t.id === 'b')?.guard).toBe(
      'failed == 0 and skipped == 0',
    );
  });

  it('renames an outcome from the same panel', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    queryButton(root, '.decision__row[data-transition-id="a"] .decision__summary').click();
    const input = queryOne(root, '.decision__row[data-transition-id="a"] [data-field="name"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('No name field.');
    }
    input.value = 'timed out';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editor.value.transitions.find((t) => t.id === 'a')?.name).toBe('timed out');
  });

  it('keeps the side effect chips of every outcome', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    queryButton(root, '.decision__row[data-transition-id="a"] .decision__summary').click();
    expect(
      queryAll(root, '.decision__row[data-transition-id="a"] .decision__panel .chip'),
    ).toHaveLength(2);
  });

  it('removes one outcome from its own row', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    queryButton(root, '.decision__row[data-transition-id="a"] .decision__summary').click();
    queryButton(root, '.decision__row[data-transition-id="a"] .decision__remove').click();
    expect(editor.value.transitions.map((t) => t.id)).toEqual(['b', 'c']);
    expect(queryAll(root, '.decision__row')).toHaveLength(2);
  });

  it('falls back to a lone edge card once a group is down to one member', () => {
    const editor = mountEditor();
    const machine = decisionMachine();
    editor.value = { ...machine, transitions: machine.transitions.slice(0, 2) };
    const root = shadowOf(editor);
    expect(queryAll(root, '.decision__row')).toHaveLength(2);
    editor.value = { ...machine, transitions: machine.transitions.slice(0, 1) };
    expect(queryAll(root, '.decision__row')).toHaveLength(0);
    expect(queryOne(root, '.edge-card[data-transition-id="a"]')).toBeTruthy();
  });

  it('reorders outcomes from the keyboard, one undoable step each', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    const handle = queryButton(root, '.decision__row[data-transition-id="b"] .decision__handle');
    fireKey(handle, 'ArrowUp', { altKey: true });
    expect(editor.value.transitions.map((t) => t.id)).toEqual(['b', 'a', 'c']);
    expect(editor.canUndo).toBe(true);
    editor.undo();
    expect(editor.value.transitions.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('will not walk an outcome past the ends of the list', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    fireKey(
      queryButton(root, '.decision__row[data-transition-id="a"] .decision__handle'),
      'ArrowUp',
      {
        altKey: true,
      },
    );
    expect(editor.value.transitions.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(editor.canUndo).toBe(false);
  });

  it('moves the whole card, writing one position onto every outcome', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    const header = queryOne(root, '.edge-card__header');
    firePointer(header, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(document, 'pointermove', { clientX: 140, clientY: 90 });
    firePointer(document, 'pointerup', { clientX: 140, clientY: 90 });
    const offsets = editor.value.transitions.map((t) => t.labelOffset);
    expect(offsets[0]).toEqual(offsets[1]);
    expect(offsets[1]).toEqual(offsets[2]);
    expect(offsets[0]?.x).not.toBe(0);
  });

  it('picks one outcome when its row is pressed', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    firePointer(queryOne(root, '.decision__row[data-transition-id="c"]'), 'pointerdown');
    expect(editor.selection).toEqual({ kind: 'transition', id: 'c' });
    expect(
      queryOne(root, '.decision__row[data-transition-id="c"]').classList.contains('is-selected'),
    ).toBe(true);
  });

  it('locks every control while the editor is read-only', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    editor.readOnly = true;
    const root = shadowOf(editor);
    queryButton(root, '.decision__row[data-transition-id="a"] .decision__summary').click();
    expect(queryButton(root, '.decision__row .decision__handle').disabled).toBe(true);
    const guard = queryOne(root, '.decision__row[data-transition-id="a"] [data-field="guard"]');
    expect(guard instanceof HTMLInputElement && guard.readOnly).toBe(true);
    expect(queryOne(root, '.decision__row[data-transition-id="a"] .decision__remove').hidden).toBe(
      true,
    );
  });

  it('opens the row for renaming when the selection is a decision outcome', () => {
    const editor = mountEditor();
    editor.value = decisionMachine();
    const root = shadowOf(editor);
    editor.selection = { kind: 'transition', id: 'b' };
    editor.renameSelection();
    expect(queryOne(root, '.decision__row[data-transition-id="b"] .decision__panel').hidden).toBe(
      false,
    );
    // No inline label editor: the name is a field of the panel now.
    expect(root.querySelector('.name-input')).toBeNull();
  });
});
