import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defineStateMachineEditor,
  type StateMachineChangeEvent,
  StateMachineEditorElement,
  StateMachineError,
} from '../src/index.js';
import { getSideEffects } from '../src/model/machine.js';
import type { MachineChange } from '../src/types.js';
import {
  CATALOG,
  fireKey,
  firePointer,
  flush,
  mountEditor,
  queryAll,
  queryButton,
  queryOne,
  querySvg,
  sampleMachine,
  shadowOf,
} from './helpers.js';

function changes(editor: StateMachineEditorElement): readonly MachineChange[] {
  const recorded: MachineChange[] = [];
  editor.addEventListener('state-machine-change', (event: StateMachineChangeEvent) => {
    recorded.push(event.detail.change);
  });
  return recorded;
}

function openedDialog(editor: StateMachineEditorElement): ShadowRoot {
  const dialog = shadowOf(editor).querySelector('state-machine-side-effects-dialog');
  if (dialog === null) {
    throw new Error('dialog is not open');
  }
  return shadowOf(dialog);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('registration', () => {
  it('defines the custom elements once', () => {
    defineStateMachineEditor();
    defineStateMachineEditor();
    expect(customElements.get('state-machine-editor')).toBe(StateMachineEditorElement);
    expect(document.createElement('state-machine-editor')).toBeInstanceOf(
      StateMachineEditorElement,
    );
  });
});

describe('rendering', () => {
  it('renders one card per state and per transition', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    const shadow = shadowOf(editor);
    expect(queryAll(shadow, '.node')).toHaveLength(2);
    expect(queryAll(shadow, '.edge-card')).toHaveLength(1);
    expect(queryOne(shadow, '.node .node__name').textContent).toBe('Draft');
    expect(queryOne(shadow, '.edge-card__name').textContent).toBe('pay');
    expect(querySvg(shadow, '.edge').getAttribute('d')).toMatch(/^M /);
  });

  it('places nodes at their world position', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const nodes = queryAll(shadowOf(editor), '.node');
    expect(nodes[1]?.style.left).toBe('400px');
    expect(nodes[1]?.style.top).toBe('0px');
  });

  it('exposes four side effect slots per state and two per transition', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);
    expect(queryAll(shadow, '.node .hook__label').map((label) => label.textContent)).toEqual([
      'enter · before',
      'enter · after',
      'leave · before',
      'leave · after',
      'enter · before',
      'enter · after',
      'leave · before',
      'leave · after',
    ]);
    expect(queryAll(shadow, '.edge-card .hook__label').map((label) => label.textContent)).toEqual([
      'before',
      'after',
    ]);
  });

  it('collapses side effect lists into the chip label', () => {
    const editor = mountEditor();
    const machine = sampleMachine();
    editor.value = {
      ...machine,
      transitions: machine.transitions.map((transition) => ({
        ...transition,
        effects: {
          before: [
            { id: 'e1', definitionId: 'a', name: 'sendEmail' },
            { id: 'e2', definitionId: 'b', name: 'chargeCard' },
            { id: 'e3', definitionId: 'c', name: 'writeAuditLog' },
          ],
          after: [],
        },
      })),
    };

    const chips = queryAll(shadowOf(editor), '.edge-card .chip');
    expect(chips[0]?.textContent).toBe('sendEmail and 2 more');
    expect(chips[0]?.title).toBe('1. sendEmail\n2. chargeCard\n3. writeAuditLog');
    expect(chips[1]?.textContent).toBe('+ Add side effect');
  });

  it('removes views when the machine shrinks', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.value = { states: [], transitions: [] };
    expect(queryAll(shadowOf(editor), '.node')).toHaveLength(0);
    expect(queryAll(shadowOf(editor), '.edge-card')).toHaveLength(0);
    expect(queryOne(shadowOf(editor), '.empty-state').hidden).toBe(false);
  });

  it('rejects malformed machines', () => {
    const editor = mountEditor();
    expect(() => {
      editor.value = {
        states: [],
        transitions: [
          { id: 't', name: 'x', from: 'ghost', to: 'ghost', effects: { before: [], after: [] } },
        ],
      };
    }).toThrow(StateMachineError);
  });
});

describe('editing', () => {
  it('adds a state from the toolbar and reports the change', () => {
    const editor = mountEditor();
    const recorded = changes(editor);
    queryButton(shadowOf(editor), '.toolbar__add').click();

    expect(editor.value.states).toHaveLength(1);
    expect(recorded).toEqual([{ kind: 'state-add', stateId: editor.value.states[0]?.id }]);
    expect(queryAll(shadowOf(editor), '.node')).toHaveLength(1);
  });

  it('drags a node, emitting transient changes then a final one', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const transientFlags: boolean[] = [];
    editor.addEventListener('state-machine-change', (event: StateMachineChangeEvent) => {
      transientFlags.push(event.detail.transient);
    });

    const header = queryOne(shadowOf(editor), '.node .node__header');
    firePointer(header, 'pointerdown', { clientX: 10, clientY: 10 });
    firePointer(document, 'pointermove', { clientX: 110, clientY: 60 });
    firePointer(document, 'pointerup', { clientX: 110, clientY: 60 });

    expect(editor.value.states[0]?.position).toEqual({ x: 100, y: 50 });
    expect(transientFlags).toEqual([true, false]);
    expect(queryAll(shadowOf(editor), '.node')[0]?.style.left).toBe('100px');
  });

  it('creates a transition by dragging the link handle onto another state', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const handle = queryAll(shadowOf(editor), '.node__link')[0];
    if (handle === undefined) {
      throw new Error('missing link handle');
    }

    firePointer(handle, 'pointerdown', { clientX: 232, clientY: 16 });
    firePointer(document, 'pointermove', { clientX: 450, clientY: 40 });
    firePointer(document, 'pointerup', { clientX: 450, clientY: 40 });

    expect(editor.value.transitions).toHaveLength(2);
    expect(editor.value.transitions[1]).toMatchObject({ from: 'draft', to: 'paid' });
  });

  it('does not create a transition when dropped on empty canvas', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const handle = queryAll(shadowOf(editor), '.node__link')[0];
    if (handle === undefined) {
      throw new Error('missing link handle');
    }
    firePointer(handle, 'pointerdown', { clientX: 232, clientY: 16 });
    firePointer(document, 'pointerup', { clientX: 900, clientY: 900 });
    expect(editor.value.transitions).toHaveLength(1);
  });

  it('renames a state inline', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const name = queryOne(shadowOf(editor), '.node .node__name');
    name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const input = shadowOf(editor).querySelector('.name-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing rename input');
    }
    input.value = 'Reviewing';
    fireKey(input, 'Enter');

    expect(editor.value.states[0]?.name).toBe('Reviewing');
    expect(queryOne(shadowOf(editor), '.node .node__name').textContent).toBe('Reviewing');
    expect(shadowOf(editor).querySelector('.name-input')).toBeNull();
  });

  it('cancels an inline rename with Escape', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryOne(shadowOf(editor), '.edge-card__name').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true }),
    );
    const input = shadowOf(editor).querySelector('.name-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing rename input');
    }
    input.value = 'ignored';
    fireKey(input, 'Escape');
    expect(editor.value.transitions[0]?.name).toBe('pay');
  });

  it('removes a state and its transitions from the card button', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node .icon-button')[0]?.click();

    expect(editor.value.states).toHaveLength(1);
    expect(editor.value.transitions).toHaveLength(0);
    expect(queryAll(shadowOf(editor), '.edge-card')).toHaveLength(0);
  });

  it('deletes the selection with the Delete key', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    firePointer(queryOne(shadowOf(editor), '.node'), 'pointerdown');
    expect(editor.selection).toEqual({ kind: 'state', id: 'draft' });

    fireKey(editor, 'Delete');
    expect(editor.value.states.map((state) => state.id)).toEqual(['paid']);
  });

  it('emits selection changes', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const listener = vi.fn();
    editor.addEventListener('state-machine-selection-change', listener);

    firePointer(queryOne(shadowOf(editor), '.edge-card'), 'pointerdown');
    expect(editor.selection).toEqual({ kind: 'transition', id: 'pay' });
    firePointer(queryOne(shadowOf(editor), '.viewport'), 'pointerdown');
    expect(editor.selection).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('viewport', () => {
  it('zooms in and out from the toolbar', () => {
    const editor = mountEditor();
    editor.zoomIn();
    expect(editor.viewport.scale).toBeCloseTo(1.25, 5);
    expect(queryButton(shadowOf(editor), '.toolbar__zoom').textContent).toBe('125%');
    editor.zoomOut();
    expect(editor.viewport.scale).toBeCloseTo(1, 5);
    expect(queryOne(shadowOf(editor), '.world').style.transform).toContain('scale(1)');
  });

  it('clamps the zoom range', () => {
    const editor = mountEditor();
    editor.setZoom(50);
    expect(editor.viewport.scale).toBe(3);
    editor.setZoom(0.001);
    expect(editor.viewport.scale).toBe(0.2);
  });

  it('zooms with ctrl + wheel and pans with a plain wheel', () => {
    const editor = mountEditor();
    const viewport = queryOne(shadowOf(editor), '.viewport');

    viewport.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true }),
    );
    expect(editor.viewport.scale).toBeGreaterThan(1);

    const scaled = editor.viewport.scale;
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaX: 30, deltaY: 20, cancelable: true }));
    expect(editor.viewport.scale).toBe(scaled);
    expect(editor.viewport.x).toBe(-30);
    expect(editor.viewport.y).toBe(-20);
  });

  it('pans by dragging the background', () => {
    const editor = mountEditor();
    const viewport = queryOne(shadowOf(editor), '.viewport');
    firePointer(viewport, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(document, 'pointermove', { clientX: 40, clientY: 25 });
    firePointer(document, 'pointerup', { clientX: 40, clientY: 25 });
    expect(editor.viewport).toMatchObject({ x: 40, y: 25 });
  });

  it('fits the content in view', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.zoomToFit();
    expect(editor.viewport.scale).toBeGreaterThan(0);
    expect(editor.viewport.scale).toBeLessThanOrEqual(3);
  });
});

describe('side effects dialog integration', () => {
  it('opens the dialog from a chip and applies the saved list', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.sideEffectProvider = () => CATALOG;
    const recorded = changes(editor);

    queryAll(shadowOf(editor), '.edge-card .chip')[0]?.click();
    await flush();

    const dialog = openedDialog(editor);
    expect(queryOne(dialog, '.title').textContent).toBe('Side effects · before transition');

    const select = dialog.querySelector('select');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing select');
    }
    select.value = 'send-email';
    queryButton(dialog, '.add .button').click();
    select.value = 'log';
    queryButton(dialog, '.add .button').click();
    queryButton(dialog, '.button--primary').click();
    await flush();

    const effects = getSideEffects(editor.value, {
      kind: 'transition',
      transitionId: 'pay',
      phase: 'before',
    });
    expect(effects.map((effect) => effect.name)).toEqual(['sendEmail', 'writeAuditLog']);
    expect(recorded).toEqual([
      {
        kind: 'side-effects-change',
        ref: { kind: 'transition', transitionId: 'pay', phase: 'before' },
      },
    ]);
    expect(queryAll(shadowOf(editor), '.edge-card .chip')[0]?.textContent).toBe(
      'sendEmail and 1 more',
    );
    expect(shadowOf(editor).querySelector('state-machine-side-effects-dialog')).toBeNull();
  });

  it('keeps the machine untouched when the dialog is cancelled', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.sideEffectProvider = () => CATALOG;

    queryAll(shadowOf(editor), '.node .chip')[0]?.click();
    await flush();
    const dialog = openedDialog(editor);
    const select = dialog.querySelector('select');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing select');
    }
    select.value = 'charge';
    queryButton(dialog, '.add .button').click();
    queryAll(dialog, '.footer .button')[0]?.click();
    await flush();

    expect(editor.value.states[0]?.onEnter.before).toEqual([]);
  });

  it('opens the dialog programmatically', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const pending = editor.openSideEffects({
      kind: 'state',
      stateId: 'paid',
      trigger: 'leave',
      phase: 'after',
    });
    await flush();
    expect(queryOne(openedDialog(editor), '.title').textContent).toBe(
      'Side effects · after leaving',
    );
    queryAll(openedDialog(editor), '.footer .button')[0]?.click();
    await expect(pending).resolves.toBe(false);
  });
});

describe('read-only mode', () => {
  it('hides destructive controls but still shows the side effects', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.readOnly = true;

    expect(editor.hasAttribute('readonly')).toBe(true);
    expect(queryButton(shadowOf(editor), '.toolbar__add').disabled).toBe(true);
    expect(queryAll(shadowOf(editor), '.node .icon-button').every((button) => button.hidden)).toBe(
      true,
    );
    expect(queryAll(shadowOf(editor), '.node__link').every((button) => button.hidden)).toBe(true);
    expect(queryAll(shadowOf(editor), '.node .chip')[0]?.textContent).toBe('No side effects');
  });

  it('ignores node dragging and deletion', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.setAttribute('readonly', '');

    firePointer(queryOne(shadowOf(editor), '.node .node__header'), 'pointerdown', {
      clientX: 10,
      clientY: 10,
    });
    firePointer(document, 'pointermove', { clientX: 200, clientY: 200 });
    firePointer(document, 'pointerup', { clientX: 200, clientY: 200 });
    expect(editor.value.states[0]?.position).toEqual({ x: 0, y: 0 });

    firePointer(queryOne(shadowOf(editor), '.node'), 'pointerdown');
    fireKey(editor, 'Delete');
    expect(editor.value.states).toHaveLength(2);
  });
});
