import { afterEach, describe, expect, it, vi } from 'vitest';
import { rectsOverlap } from '../src/geometry/placement.js';
import { toWorld } from '../src/geometry/viewport.js';
import {
  defineStateMachineEditor,
  type SelectionChangeEvent,
  type StateMachineChangeEvent,
  StateMachineEditorElement,
  StateMachineError,
} from '../src/index.js';
import { createState, createTransition, getSideEffects } from '../src/model/machine.js';
import type {
  GuardValidation,
  JsonObject,
  MachineChange,
  Point,
  Rect,
  Selection,
  StateMachine,
} from '../src/types.js';
import {
  ACTIONS,
  CATALOG,
  fireKey,
  firePointer,
  flush,
  mountEditor,
  pinchEnd,
  pinchMove,
  pinchStart,
  queryAll,
  queryButton,
  queryOne,
  querySvg,
  sampleMachine,
  shadowOf,
  sideEffect,
} from './helpers.js';

function changes(editor: StateMachineEditorElement): readonly MachineChange[] {
  const recorded: MachineChange[] = [];
  editor.addEventListener('state-machine-change', (event: StateMachineChangeEvent) => {
    recorded.push(event.detail.change);
  });
  return recorded;
}

function selectionsOf(editor: StateMachineEditorElement): readonly Selection[] {
  const recorded: Selection[] = [];
  editor.addEventListener('state-machine-selection-change', (event: SelectionChangeEvent) => {
    recorded.push(event.detail.selection);
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

  it('keeps the card tools out of the header, so the name has the line to itself', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);

    // The header holds the name and, while one is open, the rename editor.
    expect(queryAll(shadow, '.node .node__header button')).toHaveLength(0);
    expect(queryAll(shadow, '.edge-card__header button')).toHaveLength(0);
    const stateRail = queryAll(shadow, '.node .card-actions')[0] ?? shadow;
    expect(queryAll(stateRail, 'button').map((button) => button.className)).toEqual([
      'node__color',
      'icon-button node__rename',
      'icon-button node__properties',
      'icon-button node__remove',
    ]);
    expect(queryAll(shadow, '.edge-card .card-actions button')).toHaveLength(3);
  });

  it('stands the tool rail down while its card is being renamed', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node__rename')[0]?.click();

    const shadow = shadowOf(editor);
    expect(queryAll(shadow, '.node .card-actions')[0]?.hidden).toBe(true);
    // The editor lives in the header it took over, and keeps its own buttons.
    expect(queryAll(shadow, '.node .node__header .name-input')).toHaveLength(1);

    queryButton(shadow, '.icon-button--cancel').click();
    expect(queryAll(shadow, '.node .card-actions')[0]?.hidden).toBe(false);
  });

  it('exposes four side effect slots per state and two per transition', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);
    expect(queryAll(shadow, '.node .hook__label').map((label) => label.textContent)).toEqual([
      'before · enter',
      'after · enter',
      'before · leave',
      'after · leave',
      'before · enter',
      'after · enter',
      'before · leave',
      'after · leave',
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
            sideEffect('e1', 'sendEmail'),
            sideEffect('e2', 'chargeCard'),
            sideEffect('e3', 'writeAuditLog'),
          ],
          after: [],
        },
      })),
    };

    const chips = queryAll(shadowOf(editor), '.edge-card .chip');
    // How many follow the first is the count badge's job, drawn from data-count.
    expect(chips[0]?.textContent).toBe('sendEmail');
    expect(chips[0]?.getAttribute('data-count')).toBe('3');
    expect(chips[0]?.hasAttribute('data-many')).toBe(true);
    expect(chips[0]?.title).toBe('1. sendEmail\n2. chargeCard\n3. writeAuditLog');
    expect(chips[1]?.textContent).toBe('+ Add side effect');
    expect(chips[1]?.hasAttribute('data-many')).toBe(false);
  });

  it('removes views when the machine shrinks', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.value = {
      states: [],
      transitions: [],
      initialStateIds: [],
      finalStateIds: [],
      data: {},
    };
    expect(queryAll(shadowOf(editor), '.node')).toHaveLength(0);
    expect(queryAll(shadowOf(editor), '.edge-card')).toHaveLength(0);
    expect(queryOne(shadowOf(editor), '.empty-state').hidden).toBe(false);
  });

  it('rejects malformed machines', () => {
    const editor = mountEditor();
    expect(() => {
      editor.value = {
        initialStateIds: [],
        finalStateIds: [],
        states: [],
        transitions: [createTransition({ id: 't', name: 'x', from: 'ghost', to: 'ghost' })],
        data: {},
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

  it('renames a state from the rename button, which touch users can tap', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node__rename')[0]?.click();

    const input = shadowOf(editor).querySelector('.name-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing rename input');
    }
    expect(shadowOf(editor).activeElement).toBe(input);
    input.value = 'Submitted';
    fireKey(input, 'Enter');

    expect(editor.value.states[0]?.name).toBe('Submitted');
  });

  it('renames a transition from its rename button', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryOne(shadowOf(editor), '.edge-card__rename').click();

    const input = shadowOf(editor).querySelector('.name-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing rename input');
    }
    input.value = 'settle';
    fireKey(input, 'Enter');

    expect(editor.value.transitions[0]?.name).toBe('settle');
  });

  it('renames the selection with F2 and with Enter', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    firePointer(queryOne(shadowOf(editor), '.node'), 'pointerdown');
    fireKey(editor, 'F2');
    const first = shadowOf(editor).querySelector('.name-input');
    if (!(first instanceof HTMLInputElement)) {
      throw new Error('F2 did not open the rename input');
    }
    first.value = 'Renamed by F2';
    fireKey(first, 'Enter');
    expect(editor.value.states[0]?.name).toBe('Renamed by F2');

    fireKey(editor, 'Enter');
    expect(shadowOf(editor).querySelector('.name-input')).not.toBeNull();
  });

  it('does not rename when nothing is selected', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    fireKey(editor, 'F2');
    expect(shadowOf(editor).querySelector('.name-input')).toBeNull();
  });

  it('exposes renameSelection() for host toolbars', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.renameSelection();
    expect(shadowOf(editor).querySelector('.name-input')).toBeNull();

    editor.selection = { kind: 'transition', id: 'pay' };
    editor.renameSelection();
    const input = shadowOf(editor).querySelector('.name-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing rename input');
    }
    expect(input.value).toBe('pay');
  });

  it('saves the new name from the save button', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node__rename')[0]?.click();

    const shadow = shadowOf(editor);
    const input = shadow.querySelector('.name-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing rename input');
    }
    // While editing, the rename and remove buttons give way to save and cancel.
    expect(queryButton(shadow, '.node__rename').hidden).toBe(true);
    expect(queryButton(shadow, '.node__remove').hidden).toBe(true);

    input.value = 'Submitted';
    queryButton(shadow, '.icon-button--confirm').click();

    expect(editor.value.states[0]?.name).toBe('Submitted');
    expect(shadow.querySelector('.name-input')).toBeNull();
    expect(queryButton(shadow, '.node__rename').hidden).toBe(false);
  });

  it('discards the edit from the cancel button', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryOne(shadowOf(editor), '.edge-card__rename').click();

    const shadow = shadowOf(editor);
    const input = shadow.querySelector('.name-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing rename input');
    }
    input.value = 'ignored';
    queryButton(shadow, '.icon-button--cancel').click();

    expect(editor.value.transitions[0]?.name).toBe('pay');
    expect(shadow.querySelector('.name-input')).toBeNull();
    expect(queryOne(shadow, '.edge-card__name').hidden).toBe(false);
  });

  it('keeps the edit open when the input loses focus', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node__rename')[0]?.click();

    const shadow = shadowOf(editor);
    const input = shadow.querySelector('.name-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing rename input');
    }
    const before = editor.value.states[0]?.name;
    input.value = 'Submitted';
    input.dispatchEvent(new FocusEvent('blur'));

    // Clicking away neither commits nor discards — the pending text waits for
    // the user to press save or cancel.
    expect(editor.value.states[0]?.name).toBe(before);
    expect(shadow.querySelector('.name-input')).toBe(input);
    expect(input.value).toBe('Submitted');
    expect(queryButton(shadow, '.node__rename').hidden).toBe(true);

    queryButton(shadow, '.icon-button--confirm').click();
    expect(editor.value.states[0]?.name).toBe('Submitted');
  });

  it('brings the card buttons back after a cancelled rename', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node__rename')[0]?.click();

    const shadow = shadowOf(editor);
    queryButton(shadow, '.icon-button--cancel').click();

    // Cancelling restores every part of the card the editor stood in for —
    // properties included, which no commit re-render comes along to fix.
    expect(queryButton(shadow, '.node__properties').hidden).toBe(false);
    expect(queryButton(shadow, '.node__rename').hidden).toBe(false);
    expect(queryButton(shadow, '.node__remove').hidden).toBe(false);
    expect(queryOne(shadow, '.node .node__name').hidden).toBe(false);
  });

  it('leaves an open rename alone when another one starts', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const renameButtons = queryAll(shadowOf(editor), '.node__rename');
    renameButtons[0]?.click();

    const shadow = shadowOf(editor);
    const first = shadow.querySelector('.name-input');
    if (!(first instanceof HTMLInputElement)) {
      throw new Error('missing rename input');
    }
    first.value = 'Submitted';
    queryAll(shadow, '.node__rename')[1]?.click();

    // Two cards are being renamed at once; neither edit resolves the other.
    const inputs = shadow.querySelectorAll('.name-input');
    expect(inputs.length).toBe(2);
    expect(first.isConnected).toBe(true);
    expect(first.value).toBe('Submitted');

    const second = inputs[1];
    if (!(second instanceof HTMLInputElement)) {
      throw new Error('missing second rename input');
    }
    second.value = 'Paid';
    fireKey(second, 'Enter');

    expect(editor.value.states[1]?.name).toBe('Paid');
    expect(first.isConnected).toBe(true);
    expect(first.value).toBe('Submitted');

    queryOne(shadow, '.icon-button--confirm').click();
    expect(editor.value.states[0]?.name).toBe('Submitted');
  });

  it('keeps focus in the input when the buttons are pressed', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node__rename')[0]?.click();

    const shadow = shadowOf(editor);
    const save = queryButton(shadow, '.icon-button--confirm');
    const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    save.dispatchEvent(event);

    // Blocking the default keeps the caret in the field so pressing either button
    // reads as part of the same edit.
    expect(event.defaultPrevented).toBe(true);
    expect(shadow.activeElement?.className).toBe('name-input');
  });

  it('survives a re-render while the name is being edited', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node__rename')[0]?.click();

    // Any committed change re-renders every card.
    editor.addState({ name: 'Elsewhere', position: { x: 900, y: 900 } });

    const shadow = shadowOf(editor);
    expect(shadow.querySelector('.name-input')).not.toBeNull();
    expect(queryButton(shadow, '.node__rename').hidden).toBe(true);
    expect(queryOne(shadow, '.node .node__name').hidden).toBe(true);
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
    queryAll(shadowOf(editor), '.node__remove')[0]?.click();

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

  it('keeps the selection when assigning a machine that still has it', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };
    const listener = vi.fn();
    editor.addEventListener('state-machine-selection-change', listener);
    editor.addEventListener('state-machine-change', listener);

    const renamed = sampleMachine();
    editor.value = {
      ...renamed,
      states: renamed.states.map((state) =>
        state.id === 'draft' ? { ...state, name: 'Drafting' } : state,
      ),
    };

    expect(editor.selection).toEqual({ kind: 'state', id: 'draft' });
    expect(listener).not.toHaveBeenCalled();
    expect(queryOne(shadowOf(editor), '.node.is-selected').textContent).toContain('Drafting');
  });

  it('keeps a transition selected across an assignment that keeps the transition', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'transition', id: 'pay' };

    editor.value = sampleMachine();

    expect(editor.selection).toEqual({ kind: 'transition', id: 'pay' });
  });

  it('drops the selection, and says so, when the selected element is gone', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };
    const emitted = selectionsOf(editor);
    const machineChanges = vi.fn();
    editor.addEventListener('state-machine-change', machineChanges);

    const without = sampleMachine();
    editor.value = {
      ...without,
      states: without.states.filter((state) => state.id !== 'draft'),
      transitions: [],
      initialStateIds: [],
    };

    expect(editor.selection).toBeNull();
    expect(emitted).toEqual([null]);
    expect(machineChanges).not.toHaveBeenCalled();
  });

  it('drops a selected transition that the new machine no longer has', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'transition', id: 'pay' };
    const emitted = selectionsOf(editor);

    const without = sampleMachine();
    editor.value = { ...without, transitions: [] };

    expect(editor.selection).toBeNull();
    expect(emitted).toEqual([null]);
  });

  it('stays silent when assigning a machine with nothing selected', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const listener = vi.fn();
    editor.addEventListener('state-machine-selection-change', listener);

    editor.value = {
      states: [],
      transitions: [],
      initialStateIds: [],
      finalStateIds: [],
      data: {},
    };

    expect(editor.selection).toBeNull();
    expect(listener).not.toHaveBeenCalled();
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

  it('falls back to the content size when the canvas cannot be measured', () => {
    // jsdom reports 0x0 for every element, like a hidden or not yet laid out canvas.
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.zoomToFit();
    expect(editor.viewport.scale).toBe(1);
  });

  it('does nothing when there is nothing to fit', () => {
    const editor = mountEditor();
    editor.setZoom(2);
    const before = editor.viewport;
    editor.zoomToFit();
    expect(editor.viewport).toBe(before);
  });
});

describe('initial and final states', () => {
  it('marks initial states with an entry arrow and final states with a double outline', () => {
    const editor = mountEditor();
    editor.value = sampleMachine(); // draft is initial, paid is final

    const shadow = shadowOf(editor);
    const nodes = queryAll(shadow, '.node');
    expect(nodes[0]?.classList.contains('is-initial')).toBe(true);
    expect(nodes[0]?.classList.contains('is-final')).toBe(false);
    expect(nodes[1]?.classList.contains('is-final')).toBe(true);

    const markers = queryAll(shadow, '.node').map(
      (_, index) => shadow.querySelectorAll('.start-marker')[index],
    );
    expect(markers[0] instanceof SVGElement && markers[0].style.display).toBe('');
    expect(markers[1] instanceof SVGElement && markers[1].style.display).toBe('none');
  });

  it('draws the entry arrow just left of the state', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    const dot = querySvg(shadowOf(editor), '.start-marker__dot');
    const line = querySvg(shadowOf(editor), '.start-marker__line');
    // draft sits at x = 0, so the arrow reaches into negative space and stops at its border.
    expect(Number(dot.getAttribute('cx'))).toBeLessThan(0);
    expect(Number(line.getAttribute('x2'))).toBeCloseTo(-3, 5);
    expect(Number(line.getAttribute('x1'))).toBeLessThan(Number(line.getAttribute('x2')));
  });

  it('toggles both roles from the card, and reports each change', () => {
    const editor = mountEditor();
    editor.value = { ...sampleMachine(), initialStateIds: [], finalStateIds: [] };
    const recorded = changes(editor);
    const shadow = shadowOf(editor);

    queryAll(shadow, '.node__role--initial')[0]?.click();
    expect(editor.value.initialStateIds).toEqual(['draft']);

    queryAll(shadow, '.node__role--final')[0]?.click();
    expect(editor.value.finalStateIds).toEqual(['draft']);

    // Both roles at once is legal, and each has its own change event.
    expect(recorded).toEqual([{ kind: 'initial-states-change' }, { kind: 'final-states-change' }]);

    queryAll(shadow, '.node__role--initial')[0]?.click();
    expect(editor.value.initialStateIds).toEqual([]);
  });

  it('reflects the current roles in the toggles, for assistive tech too', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);

    const initialToggle = queryAll(shadow, '.node__role--initial')[0];
    const finalToggle = queryAll(shadow, '.node__role--final')[0];
    expect(initialToggle?.getAttribute('aria-pressed')).toBe('true');
    expect(initialToggle?.classList.contains('is-on')).toBe(true);
    expect(initialToggle?.getAttribute('aria-label')).toBe('Unmark “Draft” as an initial state');
    expect(finalToggle?.getAttribute('aria-pressed')).toBe('false');
    expect(finalToggle?.getAttribute('aria-label')).toBe('Mark “Draft” as a final state');
  });

  it('supports several initial and final states', () => {
    const editor = mountEditor();
    editor.value = { ...sampleMachine(), initialStateIds: [], finalStateIds: [] };

    editor.setInitialStates(['draft', 'paid']);
    editor.setFinalStates(['paid']);

    const shadow = shadowOf(editor);
    expect(queryAll(shadow, '.node.is-initial')).toHaveLength(2);
    expect(queryAll(shadow, '.node.is-final')).toHaveLength(1);
    expect(queryAll(shadow, '.node')[1]?.classList.contains('is-initial')).toBe(true);
  });

  it('toggles roles through the public API', () => {
    const editor = mountEditor();
    editor.value = { ...sampleMachine(), initialStateIds: [], finalStateIds: [] };
    editor.toggleInitialState('paid');
    editor.toggleFinalState('paid');
    expect(editor.value.initialStateIds).toEqual(['paid']);
    expect(editor.value.finalStateIds).toEqual(['paid']);
  });

  it('drops the marks when the state is deleted', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node__remove')[0]?.click();

    expect(editor.value.initialStateIds).toEqual([]);
    expect(editor.value.finalStateIds).toEqual(['paid']);
    // One card left, so one (hidden) marker element remains.
    expect(shadowOf(editor).querySelectorAll('.start-marker')).toHaveLength(1);
  });

  it('shows but disables the toggles in read-only mode', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.readOnly = true;

    const shadow = shadowOf(editor);
    const initialToggle = queryButton(shadow, '.node__role--initial');
    expect(initialToggle.hidden).toBe(false);
    expect(initialToggle.disabled).toBe(true);
    expect(initialToggle.classList.contains('is-on')).toBe(true);

    initialToggle.click();
    expect(editor.value.initialStateIds).toEqual(['draft']);
  });
});

describe('parameter hints on the canvas', () => {
  function machineWithParams(): ReturnType<typeof sampleMachine> {
    const base = sampleMachine();
    return {
      ...base,
      transitions: base.transitions.map((transition) => ({
        ...transition,
        effects: {
          before: [
            sideEffect('e1', 'chargeCard', { params: { amount: 10 } }),
            sideEffect('e2', 'writeAuditLog'),
          ],
          after: [sideEffect('e3', 'pingWebhook')],
        },
      })),
    };
  }

  it('marks chips whose list has parameters', () => {
    const editor = mountEditor();
    editor.value = machineWithParams();

    const chips = queryAll(shadowOf(editor), '.edge-card .chip');
    expect(chips[0]?.hasAttribute('data-has-params')).toBe(true);
    expect(chips[1]?.hasAttribute('data-has-params')).toBe(false);
  });

  it('keeps the collapsed label free of the marker', () => {
    const editor = mountEditor();
    editor.value = machineWithParams();
    // The `{ }` hint is a CSS pseudo-element, so the label reads the same.
    expect(queryAll(shadowOf(editor), '.edge-card .chip')[0]?.textContent).toBe('chargeCard');
  });

  it('spells the hint out for screen readers and in the tooltip', () => {
    const editor = mountEditor();
    editor.value = machineWithParams();

    const chip = queryAll(shadowOf(editor), '.edge-card .chip')[0];
    expect(chip?.getAttribute('aria-label')).toContain('1 with parameters');
    expect(chip?.title).toBe('1. chargeCard {"amount":10}\n2. writeAuditLog');
  });

  it('updates the hint after the dialog saves parameters', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.sideEffectProvider = () => [
      { id: 'charge', name: 'chargeCard', defaultParams: { amount: 5 } },
    ];

    queryAll(shadowOf(editor), '.edge-card .chip')[0]?.click();
    await flush();
    const dialog = openedDialog(editor);
    const select = dialog.querySelector('select');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing select');
    }
    select.value = 'charge';
    queryButton(dialog, '.add .button').click();
    queryButton(dialog, '.button--primary').click();
    await flush();

    const chip = queryAll(shadowOf(editor), '.edge-card .chip')[0];
    expect(chip?.hasAttribute('data-has-params')).toBe(true);
    expect(chip?.textContent).toBe('chargeCard');
  });
});

describe('state colours', () => {
  function colored(): ReturnType<typeof sampleMachine> {
    const base = sampleMachine();
    return {
      ...base,
      states: base.states.map((state, index) => ({
        ...state,
        color: index === 0 ? 'info' : 'neutral',
      })),
    };
  }

  it('paints a bar on every card and records the colour on the element', () => {
    const editor = mountEditor();
    editor.value = colored();

    const nodes = queryAll(shadowOf(editor), '.node');
    expect(nodes[0]?.getAttribute('data-color')).toBe('info');
    expect(nodes[1]?.getAttribute('data-color')).toBe('neutral');
    expect(queryAll(shadowOf(editor), '.node__bar')).toHaveLength(2);
  });

  it('keeps the palette closed until the swatch is pressed', () => {
    const editor = mountEditor();
    editor.value = colored();
    const shadow = shadowOf(editor);

    expect(queryAll(shadow, '.node__palette').every((palette) => palette.hidden)).toBe(true);
    expect(queryAll(shadow, '.node__color')[0]?.getAttribute('aria-expanded')).toBe('false');
  });

  it('offers exactly the six named colours', () => {
    const editor = mountEditor();
    editor.value = colored();
    const shadow = shadowOf(editor);
    queryAll(shadow, '.node__color')[0]?.click();

    const palette = queryAll(shadow, '.node__palette')[0];
    expect(palette?.hidden).toBe(false);
    expect(
      queryAll(palette ?? shadow, '.palette__option').map((o) => o.getAttribute('data-color')),
    ).toEqual(['neutral', 'info', 'success', 'warning', 'danger', 'muted']);
    expect(
      queryAll(palette ?? shadow, '.palette__option')
        .filter((o) => o.getAttribute('aria-selected') === 'true')
        .map((o) => o.getAttribute('data-color')),
    ).toEqual(['info']);
    expect(queryAll(shadow, '.node__color')[0]?.getAttribute('aria-expanded')).toBe('true');
  });

  it('applies the picked colour, reports it and closes', () => {
    const editor = mountEditor();
    editor.value = colored();
    const recorded = changes(editor);
    const shadow = shadowOf(editor);

    queryAll(shadow, '.node__color')[0]?.click();
    const danger = queryAll(shadow, '.palette__option').find(
      (option) => option.getAttribute('data-color') === 'danger',
    );
    danger?.click();

    expect(editor.value.states[0]?.color).toBe('danger');
    expect(recorded).toEqual([{ kind: 'state-color', stateId: 'draft' }]);
    expect(queryAll(shadow, '.node__palette')[0]?.hidden).toBe(true);
    expect(queryAll(shadow, '.node')[0]?.getAttribute('data-color')).toBe('danger');
  });

  it('closes on a second press of the same swatch', () => {
    const editor = mountEditor();
    editor.value = colored();
    const shadow = shadowOf(editor);

    queryAll(shadow, '.node__color')[0]?.click();
    expect(queryAll(shadow, '.node__palette')[0]?.hidden).toBe(false);
    queryAll(shadow, '.node__color')[0]?.click();
    expect(queryAll(shadow, '.node__palette')[0]?.hidden).toBe(true);
  });

  it('closes with Escape and when the canvas is pressed', () => {
    const editor = mountEditor();
    editor.value = colored();
    const shadow = shadowOf(editor);

    queryAll(shadow, '.node__color')[0]?.click();
    fireKey(editor, 'Escape');
    expect(queryAll(shadow, '.node__palette')[0]?.hidden).toBe(true);

    queryAll(shadow, '.node__color')[0]?.click();
    firePointer(queryOne(shadow, '.viewport'), 'pointerdown');
    expect(queryAll(shadow, '.node__palette')[0]?.hidden).toBe(true);
  });

  it('only keeps one palette open at a time', () => {
    const editor = mountEditor();
    editor.value = colored();
    const shadow = shadowOf(editor);

    queryAll(shadow, '.node__color')[0]?.click();
    // Pressing the other card dismisses the first palette.
    firePointer(queryAll(shadow, '.node')[1] ?? shadow, 'pointerdown');
    expect(queryAll(shadow, '.node__palette')[0]?.hidden).toBe(true);
  });

  it('sets a colour through the public API', () => {
    const editor = mountEditor();
    editor.value = colored();
    editor.setStateColor('paid', 'warning');
    expect(editor.value.states[1]?.color).toBe('warning');
    expect(queryAll(shadowOf(editor), '.node')[1]?.getAttribute('data-color')).toBe('warning');
  });

  it('hides the picker in read-only mode but keeps the bar', () => {
    const editor = mountEditor();
    editor.value = colored();
    editor.readOnly = true;
    const shadow = shadowOf(editor);

    expect(queryButton(shadow, '.node__color').hidden).toBe(true);
    expect(queryAll(shadow, '.node__bar')).toHaveLength(2);
    queryAll(shadow, '.node__color')[0]?.click();
    expect(queryAll(shadow, '.node__palette')[0]?.hidden).toBe(true);
  });
});

describe('parallel transitions', () => {
  function machineWithParallelEdges(): ReturnType<typeof sampleMachine> {
    const base = sampleMachine();
    return {
      ...base,
      transitions: [
        ...base.transitions,
        createTransition({ id: 'retry', name: 'retry', from: 'draft', to: 'paid' }),
        createTransition({ id: 'refund', name: 'refund', from: 'paid', to: 'draft' }),
      ],
    };
  }

  function cardCenters(editor: StateMachineEditorElement): readonly Point[] {
    return queryAll(shadowOf(editor), '.edge-card').map((card) => ({
      x: Number.parseFloat(card.style.left),
      y: Number.parseFloat(card.style.top),
    }));
  }

  it('fans transitions between the same pair apart, in both directions', () => {
    const editor = mountEditor();
    editor.value = machineWithParallelEdges();

    const centers = cardCenters(editor);
    expect(centers).toHaveLength(3);
    for (let i = 0; i < centers.length; i += 1) {
      for (let j = i + 1; j < centers.length; j += 1) {
        const a = centers[i];
        const b = centers[j];
        if (a === undefined || b === undefined) {
          throw new Error('missing card');
        }
        // Cards are around 64px tall, so anything closer would overlap.
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(70);
      }
    }
  });

  it('gives every edge of a pair its own path', () => {
    const editor = mountEditor();
    editor.value = machineWithParallelEdges();
    const paths = queryAll(shadowOf(editor), '.edge-card').map((_, index) => {
      const path = shadowOf(editor).querySelectorAll('path.edge')[index];
      return path?.getAttribute('d') ?? '';
    });
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('repositioning transitions', () => {
  it('drags a transition card and bends its edge to follow', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);
    const before = queryOne(shadow, '.edge-card');
    const startLeft = Number.parseFloat(before.style.left);
    const startTop = Number.parseFloat(before.style.top);

    const header = queryOne(shadow, '.edge-card__header');
    firePointer(header, 'pointerdown', { clientX: startLeft, clientY: startTop });
    firePointer(document, 'pointermove', { clientX: startLeft, clientY: startTop + 120 });
    firePointer(document, 'pointerup', { clientX: startLeft, clientY: startTop + 120 });

    expect(editor.value.transitions[0]?.labelOffset).toEqual({ x: 0, y: 120 });

    const card = queryOne(shadow, '.edge-card');
    expect(Number.parseFloat(card.style.top)).toBeCloseTo(startTop + 120, 5);
    // The card sits on the curve's midpoint, so the curve went with it.
    expect(querySvg(shadow, 'path.edge').getAttribute('d')).toContain('Q ');
  });

  it('reports the move as transient then committed', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const recorded: { kind: string; transient: boolean }[] = [];
    editor.addEventListener('state-machine-change', (event: StateMachineChangeEvent) => {
      recorded.push({ kind: event.detail.change.kind, transient: event.detail.transient });
    });

    const header = queryOne(shadowOf(editor), '.edge-card__header');
    firePointer(header, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(document, 'pointermove', { clientX: 60, clientY: 90 });
    firePointer(document, 'pointerup', { clientX: 60, clientY: 90 });

    expect(recorded).toEqual([
      { kind: 'transition-move', transient: true },
      { kind: 'transition-move', transient: false },
    ]);
  });

  it('snaps back to automatic placement when dropped near the edge', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const header = queryOne(shadowOf(editor), '.edge-card__header');

    firePointer(header, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(document, 'pointermove', { clientX: 0, clientY: 120 });
    expect(editor.value.transitions[0]?.labelOffset).toEqual({ x: 0, y: 120 });

    firePointer(document, 'pointermove', { clientX: 4, clientY: 6 });
    firePointer(document, 'pointerup', { clientX: 4, clientY: 6 });
    expect(editor.value.transitions[0]?.labelOffset).toEqual({ x: 0, y: 0 });
  });

  it('keeps a moved card attached when its states move', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);
    const header = queryOne(shadow, '.edge-card__header');
    firePointer(header, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(document, 'pointermove', { clientX: 0, clientY: 100 });
    firePointer(document, 'pointerup', { clientX: 0, clientY: 100 });
    const movedTop = Number.parseFloat(queryOne(shadow, '.edge-card').style.top);

    // The offset is relative, so dragging the source state carries the card along.
    const nodeHeader = queryOne(shadow, '.node .node__header');
    firePointer(nodeHeader, 'pointerdown', { clientX: 10, clientY: 10 });
    firePointer(document, 'pointermove', { clientX: 10, clientY: 210 });
    firePointer(document, 'pointerup', { clientX: 10, clientY: 210 });

    expect(Number.parseFloat(queryOne(shadow, '.edge-card').style.top)).toBeGreaterThan(movedTop);
    expect(editor.value.transitions[0]?.labelOffset).toEqual({ x: 0, y: 100 });
  });

  it('does not move transitions in read-only mode', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.readOnly = true;

    const header = queryOne(shadowOf(editor), '.edge-card__header');
    firePointer(header, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(document, 'pointermove', { clientX: 80, clientY: 80 });
    firePointer(document, 'pointerup', { clientX: 80, clientY: 80 });

    expect(editor.value.transitions[0]?.labelOffset).toEqual({ x: 0, y: 0 });
  });
});

describe('pinch to zoom', () => {
  it('zooms by how much the fingers spread', () => {
    const editor = mountEditor();
    const viewport = queryOne(shadowOf(editor), '.viewport');

    pinchStart(viewport, [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]);
    pinchMove(viewport, [
      { clientX: 50, clientY: 100 },
      { clientX: 250, clientY: 100 },
    ]);

    expect(editor.viewport.scale).toBeCloseTo(2, 5);
  });

  it('pinches in as well as out', () => {
    const editor = mountEditor();
    const viewport = queryOne(shadowOf(editor), '.viewport');

    pinchStart(viewport, [
      { clientX: 100, clientY: 100 },
      { clientX: 300, clientY: 100 },
    ]);
    pinchMove(viewport, [
      { clientX: 150, clientY: 100 },
      { clientX: 250, clientY: 100 },
    ]);

    expect(editor.viewport.scale).toBeCloseTo(0.5, 5);
  });

  it('keeps the point between the fingers anchored', () => {
    const editor = mountEditor();
    const viewport = queryOne(shadowOf(editor), '.viewport');
    const center = { x: 150, y: 120 };
    const before = toWorld(editor.viewport, center);

    pinchStart(viewport, [
      { clientX: 100, clientY: 120 },
      { clientX: 200, clientY: 120 },
    ]);
    pinchMove(viewport, [
      { clientX: 30, clientY: 120 },
      { clientX: 270, clientY: 120 },
    ]);

    const after = toWorld(editor.viewport, center);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('pans when both fingers move together', () => {
    const editor = mountEditor();
    const viewport = queryOne(shadowOf(editor), '.viewport');

    pinchStart(viewport, [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]);
    pinchMove(viewport, [
      { clientX: 140, clientY: 130 },
      { clientX: 240, clientY: 130 },
    ]);

    expect(editor.viewport.scale).toBeCloseTo(1, 5);
    expect(editor.viewport.x).toBeCloseTo(40, 5);
    expect(editor.viewport.y).toBeCloseTo(30, 5);
  });

  it('stays inside the supported zoom range', () => {
    const editor = mountEditor();
    const viewport = queryOne(shadowOf(editor), '.viewport');

    pinchStart(viewport, [
      { clientX: 100, clientY: 100 },
      { clientX: 110, clientY: 100 },
    ]);
    pinchMove(viewport, [
      { clientX: 0, clientY: 100 },
      { clientX: 4000, clientY: 100 },
    ]);

    expect(editor.viewport.scale).toBe(3);
  });

  it('takes over from a node drag that was already running', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);
    const header = queryOne(shadow, '.node .node__header');

    firePointer(header, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    firePointer(document, 'pointermove', { pointerId: 1, clientX: 60, clientY: 10 });
    expect(editor.value.states[0]?.position).toEqual({ x: 50, y: 0 });

    // Second finger lands: the pinch wins and the node stops following.
    firePointer(queryOne(shadow, '.viewport'), 'pointerdown', {
      pointerId: 2,
      clientX: 260,
      clientY: 10,
    });
    firePointer(document, 'pointermove', { pointerId: 1, clientX: 10, clientY: 10 });
    firePointer(document, 'pointermove', { pointerId: 2, clientX: 460, clientY: 10 });

    expect(editor.value.states[0]?.position).toEqual({ x: 50, y: 0 });
    expect(editor.viewport.scale).toBeGreaterThan(1);
  });

  it('does not start a pan with the second finger', () => {
    const editor = mountEditor();
    const viewport = queryOne(shadowOf(editor), '.viewport');

    pinchStart(viewport, [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]);
    // Both fingers hold still: nothing should move.
    pinchMove(viewport, [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]);

    expect(editor.viewport).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('ends the gesture when a finger is lifted', () => {
    const editor = mountEditor();
    const viewport = queryOne(shadowOf(editor), '.viewport');

    pinchStart(viewport, [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]);
    pinchMove(viewport, [
      { clientX: 50, clientY: 100 },
      { clientX: 250, clientY: 100 },
    ]);
    const zoomed = editor.viewport.scale;

    firePointer(viewport, 'pointerup', { pointerId: 2, clientX: 250, clientY: 100 });
    firePointer(document, 'pointermove', { pointerId: 1, clientX: 400, clientY: 400 });

    expect(editor.viewport.scale).toBe(zoomed);
    pinchEnd(viewport, 1);
  });

  it('zooms continuously with a trackpad pinch (ctrl + wheel)', () => {
    const editor = mountEditor();
    const viewport = queryOne(shadowOf(editor), '.viewport');

    viewport.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -4, ctrlKey: true, cancelable: true }),
    );
    const small = editor.viewport.scale;
    expect(small).toBeGreaterThan(1);
    expect(small).toBeLessThan(1.02);

    viewport.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true }),
    );
    expect(editor.viewport.scale).toBeGreaterThan(small * 1.4);
  });

  it('treats shift + wheel as panning, not zooming', () => {
    const editor = mountEditor();
    const viewport = queryOne(shadowOf(editor), '.viewport');

    viewport.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 40, shiftKey: true, cancelable: true }),
    );

    expect(editor.viewport.scale).toBe(1);
    expect(editor.viewport.y).toBe(-40);
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
    expect(queryAll(shadowOf(editor), '.edge-card .chip')[0]?.textContent).toBe('sendEmail');
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
    expect(
      queryAll(shadowOf(editor), '.node__rename, .node__remove').every((button) => button.hidden),
    ).toBe(true);
    expect(queryAll(shadowOf(editor), '.node__link').every((button) => button.hidden)).toBe(true);
    // Properties are readable read-only, exactly like the side effect chips.
    expect(queryAll(shadowOf(editor), '.node__properties').every((button) => button.hidden)).toBe(
      false,
    );
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

    fireKey(editor, 'F2');
    expect(shadowOf(editor).querySelector('.name-input')).toBeNull();
  });
});

// -- creation transitions ---------------------------------------------------

function machineWithCreation(): ReturnType<typeof sampleMachine> {
  const base = sampleMachine();
  return {
    ...base,
    transitions: [
      createTransition({ id: 'create', name: 'create', from: null, to: 'draft' }),
      ...base.transitions,
    ],
  };
}

describe('theme', () => {
  /** The dialog element itself — the theme lives on it, not in its shadow tree. */
  function dialogElement(editor: StateMachineEditorElement, tag: string): Element {
    const dialog = shadowOf(editor).querySelector(tag);
    if (dialog === null) {
      throw new Error(`${tag} is not open`);
    }
    return dialog;
  }

  it('starts dark, and says so in the attribute', () => {
    const editor = mountEditor();

    expect(editor.theme).toBe('dark');
    expect(editor.getAttribute('theme')).toBe('dark');
  });

  it('takes the scheme from an attribute set before it is mounted', () => {
    defineStateMachineEditor();
    const editor = document.createElement('state-machine-editor');
    editor.setAttribute('theme', 'light');
    document.body.append(editor);

    expect(editor.theme).toBe('light');
  });

  it('reflects an assigned scheme to the attribute', () => {
    const editor = mountEditor();
    editor.theme = 'light';

    expect(editor.getAttribute('theme')).toBe('light');
    expect(editor.theme).toBe('light');
  });

  it('reads a scheme it does not know as the default', () => {
    const editor = mountEditor();
    editor.setAttribute('theme', 'midnight');

    // Left in the DOM as written — like an unknown `type` on an `<input>` —
    // and rendered as the default, which is what the CSS falls back to.
    expect(editor.getAttribute('theme')).toBe('midnight');
    expect(editor.theme).toBe('dark');
  });

  it('never asks the operating system', () => {
    const matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn() }));
    vi.stubGlobal('matchMedia', matchMedia);
    const editor = mountEditor();
    editor.value = sampleMachine();

    expect(editor.theme).toBe('dark');
    expect(matchMedia).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('switches from the toolbar, and names the scheme the press moves to', () => {
    const editor = mountEditor();
    const button = queryButton(shadowOf(editor), '.toolbar__theme');

    expect(button.getAttribute('aria-label')).toBe('Switch to the light theme');
    button.click();
    expect(editor.theme).toBe('light');
    expect(button.getAttribute('aria-label')).toBe('Switch to the dark theme');

    button.click();
    expect(editor.theme).toBe('dark');
    expect(button.getAttribute('aria-label')).toBe('Switch to the light theme');
  });

  it('switches from the method too', () => {
    const editor = mountEditor();

    expect(editor.toggleTheme()).toBe('light');
    expect(editor.toggleTheme()).toBe('dark');
  });

  it('stays available read-only: looking is not editing', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.readOnly = true;
    const button = queryButton(shadowOf(editor), '.toolbar__theme');

    expect(button.disabled).toBe(false);
    button.click();
    expect(editor.theme).toBe('light');
  });

  it('hands the scheme down to the dialogs, which carry roots of their own', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.sideEffectProvider = () => CATALOG;
    editor.theme = 'light';

    queryAll(shadowOf(editor), '.edge-card .chip')[0]?.click();
    await flush();
    expect(dialogElement(editor, 'state-machine-side-effects-dialog').getAttribute('theme')).toBe(
      'light',
    );
    queryButton(openedDialog(editor), '.footer .button').click();
    await flush();

    queryButton(shadowOf(editor), '.toolbar__organize').click();
    await flush();
    expect(dialogElement(editor, 'state-machine-confirm-dialog').getAttribute('theme')).toBe(
      'light',
    );
  });

  it('reaches a dialog that is already open when the scheme changes', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    void editor.openProperties({ kind: 'state', id: 'draft' });
    await flush();

    editor.theme = 'light';
    expect(dialogElement(editor, 'state-machine-properties-dialog').getAttribute('theme')).toBe(
      'light',
    );
  });
});

describe('creation transitions', () => {
  it('shows no start pseudo-node until a creation edge exists', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    expect(queryAll(shadowOf(editor), '.start-node')).toHaveLength(0);

    editor.value = machineWithCreation();
    expect(queryAll(shadowOf(editor), '.start-node')).toHaveLength(1);
  });

  it('drops the pseudo-node again with the last creation edge', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    const shadow = shadowOf(editor);
    expect(queryAll(shadow, '.start-node')).toHaveLength(1);

    queryButton(shadow, '.edge-card[data-transition-id="create"] .edge-card__remove').click();
    expect(editor.value.transitions.map((transition) => transition.id)).toEqual(['pay']);
    expect(queryAll(shadow, '.start-node')).toHaveLength(0);
  });

  it('places it left of the leftmost state it feeds', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    const node = queryOne(shadowOf(editor), '.start-node');
    // Draft sits at x = 0, so the dot lands in negative space, ahead of it.
    expect(Number.parseFloat(node.style.left)).toBeLessThan(0);
  });

  it('draws every creation edge from the pseudo-node, fanned apart', () => {
    const editor = mountEditor();
    const base = machineWithCreation();
    editor.value = {
      ...base,
      transitions: [
        ...base.transitions,
        createTransition({ id: 'create2', name: 'create 2', from: null, to: 'draft' }),
      ],
    };

    const shadow = shadowOf(editor);
    const cards = queryAll(shadow, '.edge-card').filter((card) =>
      (card.getAttribute('data-transition-id') ?? '').startsWith('create'),
    );
    expect(cards).toHaveLength(2);
    const [first, second] = cards.map((card) => ({
      x: Number.parseFloat(card.style.left),
      y: Number.parseFloat(card.style.top),
    }));
    if (first === undefined || second === undefined) {
      throw new Error('missing card');
    }
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(70);

    const paths = queryAll(shadow, '.edge-card').map(
      (_, index) => shadow.querySelectorAll('path.edge')[index]?.getAttribute('d') ?? '',
    );
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('bends a creation edge exactly like any other', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    const shadow = shadowOf(editor);
    const card = queryOne(shadow, '.edge-card[data-transition-id="create"]');
    const startLeft = Number.parseFloat(card.style.left);
    const startTop = Number.parseFloat(card.style.top);

    const header = queryOne(card, '.edge-card__header');
    firePointer(header, 'pointerdown', { clientX: startLeft, clientY: startTop });
    firePointer(document, 'pointermove', { clientX: startLeft, clientY: startTop + 140 });
    firePointer(document, 'pointerup', { clientX: startLeft, clientY: startTop + 140 });

    expect(editor.value.transitions[0]?.labelOffset).toEqual({ x: 0, y: 140 });
    const moved = queryOne(shadow, '.edge-card[data-transition-id="create"]');
    expect(Number.parseFloat(moved.style.top)).toBeCloseTo(startTop + 140, 5);
    expect(querySvg(shadow, 'path.edge[data-transition-id="create"]').getAttribute('d')).toContain(
      'Q ',
    );
  });

  it('offers the card button only while the state is initial', () => {
    const editor = mountEditor();
    editor.value = sampleMachine(); // draft initial, paid final
    const shadow = shadowOf(editor);
    const buttons = queryAll(shadow, '.node__create');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.hidden).toBe(false);
    expect(buttons[1]?.hidden).toBe(true);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Add a creation transition into “Draft”');

    editor.toggleInitialState('paid');
    expect(queryAll(shadow, '.node__create')[1]?.hidden).toBe(false);
  });

  it('creates the edge from the card, selects it and starts renaming', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const recorded = changes(editor);
    const shadow = shadowOf(editor);

    queryAll(shadow, '.node__create')[0]?.click();

    const created = editor.value.transitions[1];
    expect(created?.from).toBeNull();
    expect(created?.to).toBe('draft');
    expect(created?.name).toBe('create');
    expect(recorded).toEqual([{ kind: 'transition-add', transitionId: created?.id }]);
    expect(editor.selection).toEqual({ kind: 'transition', id: created?.id });
    expect(shadow.querySelector('.name-input')).not.toBeNull();
    expect(queryAll(shadow, '.start-node')).toHaveLength(1);
  });

  it('names creation edges uniquely across different cards', () => {
    const editor = mountEditor();
    editor.value = { ...sampleMachine(), initialStateIds: ['draft', 'paid'] };
    const shadow = shadowOf(editor);

    queryAll(shadow, '.node__create')[0]?.click();
    queryAll(shadow, '.node__create')[1]?.click();

    const names = editor.value.transitions
      .filter((transition) => transition.from === null)
      .map((transition) => transition.name);
    // Namespaced machine-wide, not per target state, so these must not collide.
    expect(names).toEqual(['create', 'create 2']);
  });

  it('keeps the initial flag and the creation edges independent', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    // Marking a state initial never creates an edge.
    editor.toggleInitialState('paid');
    expect(editor.value.transitions.filter((transition) => transition.from === null)).toHaveLength(
      0,
    );

    editor.addCreationTransition('paid');
    expect(editor.value.transitions.filter((transition) => transition.from === null)).toHaveLength(
      1,
    );

    // Unmarking never deletes one: a temporarily invalid graph beats silent loss.
    editor.toggleInitialState('paid');
    expect(editor.value.initialStateIds).toEqual(['draft']);
    expect(editor.value.transitions.filter((transition) => transition.from === null)).toHaveLength(
      1,
    );
    expect(queryAll(shadowOf(editor), '.start-node')).toHaveLength(1);
  });

  it('suppresses the entry arrow once a state has a creation edge', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);
    const marker = shadow.querySelectorAll('.start-marker')[0];
    expect(marker instanceof SVGElement && marker.style.display).toBe('');

    editor.addCreationTransition('draft');
    // The arrow means "can start here", the edge says exactly how. Not both.
    expect(marker instanceof SVGElement && marker.style.display).toBe('none');

    editor.value = sampleMachine();
    const again = shadowOf(editor).querySelectorAll('.start-marker')[0];
    expect(again instanceof SVGElement && again.style.display).toBe('');
  });

  it('deletes creation edges with the state they feed', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    queryAll(shadowOf(editor), '.node__remove')[0]?.click();

    expect(editor.value.states.map((state) => state.id)).toEqual(['paid']);
    expect(editor.value.transitions).toHaveLength(0);
    expect(queryAll(shadowOf(editor), '.start-node')).toHaveLength(0);
  });

  it('drags a further one out of the pseudo-node handle', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    const handle = queryButton(shadowOf(editor), '.start-node__link');

    firePointer(handle, 'pointerdown', { clientX: 0, clientY: 0 });
    firePointer(document, 'pointermove', { clientX: 450, clientY: 50 });
    firePointer(document, 'pointerup', { clientX: 450, clientY: 50 });

    const added = editor.value.transitions[2];
    expect(added?.from).toBeNull();
    expect(added?.to).toBe('paid');
    expect(added?.name).toBe('create 2');
  });

  it('treats a creation edge as an ordinary, selectable transition', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    const shadow = shadowOf(editor);
    const card = queryOne(shadow, '.edge-card[data-transition-id="create"]');

    firePointer(card, 'pointerdown');
    expect(editor.selection).toEqual({ kind: 'transition', id: 'create' });

    fireKey(editor, 'Delete');
    expect(editor.value.transitions.map((transition) => transition.id)).toEqual(['pay']);
  });

  it('hides the pseudo-node handle in read-only mode', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    editor.readOnly = true;
    expect(queryButton(shadowOf(editor), '.start-node__link').hidden).toBe(true);
    expect(
      queryAll(shadowOf(editor), '.node__create').every(
        (button) => button instanceof HTMLButtonElement && button.disabled,
      ),
    ).toBe(true);
  });
});

// -- properties -------------------------------------------------------------

function openedProperties(editor: StateMachineEditorElement): ShadowRoot {
  const dialog = shadowOf(editor).querySelector('state-machine-properties-dialog');
  if (dialog === null) {
    throw new Error('properties dialog is not open');
  }
  return shadowOf(dialog);
}

function field(root: ParentNode, name: string): HTMLInputElement | HTMLTextAreaElement {
  const found = root.querySelector(`[data-field="${name}"]`);
  if (!(found instanceof HTMLInputElement || found instanceof HTMLTextAreaElement)) {
    throw new Error(`No text field named "${name}".`);
  }
  return found;
}

function triggerSelect(root: ParentNode): HTMLSelectElement {
  const found = root.querySelector('[data-field="trigger"]');
  if (!(found instanceof HTMLSelectElement)) {
    throw new Error('The trigger is not a picker.');
  }
  return found;
}

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function save(editor: StateMachineEditorElement): Promise<void> {
  queryButton(openedProperties(editor), '.button--primary').click();
  await flush();
}

describe('the properties dialog', () => {
  it('edits a state description and reports it', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const recorded = changes(editor);

    queryAll(shadowOf(editor), '.node__properties')[0]?.click();
    await flush();

    expect(queryOne(openedProperties(editor), '.title').textContent).toBe('Properties · Draft');
    type(field(openedProperties(editor), 'description'), 'Not submitted yet.');
    await save(editor);

    expect(editor.value.states[0]?.description).toBe('Not submitted yet.');
    expect(recorded).toEqual([{ kind: 'description', ref: { kind: 'state', id: 'draft' } }]);
  });

  it('offers no transition-only fields for a state', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node__properties')[0]?.click();
    await flush();

    const dialog = openedProperties(editor);
    expect(dialog.querySelector('[data-field="trigger"]')).toBeNull();
    expect(dialog.querySelector('[data-field="guard"]')).toBeNull();
    expect(dialog.querySelector('[data-field="permission"]')).toBeNull();
  });

  it('emits one change per edited transition field', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const recorded = changes(editor);

    queryOne(shadowOf(editor), '.edge-card__properties').click();
    await flush();

    const dialog = openedProperties(editor);
    type(field(dialog, 'trigger'), 'pay');
    type(field(dialog, 'guard'), 'order.total > 0');
    type(field(dialog, 'permission'), 'orders.pay');
    type(field(dialog, 'description'), 'Captures the payment.');
    await save(editor);

    const transition = editor.value.transitions[0];
    expect(transition?.trigger).toEqual({ id: 'pay', name: 'pay' });
    expect(transition?.guard).toBe('order.total > 0');
    expect(transition?.requiredPermission).toBe('orders.pay');
    expect(transition?.description).toBe('Captures the payment.');
    expect(recorded.map((change) => change.kind)).toEqual([
      'transition-trigger',
      'transition-guard',
      'transition-permission',
      'description',
    ]);
  });

  it('reports nothing for the fields left alone', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const recorded = changes(editor);

    queryOne(shadowOf(editor), '.edge-card__properties').click();
    await flush();
    type(field(openedProperties(editor), 'guard'), 'always');
    await save(editor);

    expect(recorded).toEqual([{ kind: 'transition-guard', transitionId: 'pay' }]);
  });

  it('discards everything on cancel', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const recorded = changes(editor);

    const opened = editor.openProperties({ kind: 'transition', id: 'pay' });
    await flush();
    type(field(openedProperties(editor), 'guard'), 'never');
    queryAll(openedProperties(editor), '.button')[0]?.click();

    expect(await opened).toBe(false);
    expect(editor.value.transitions[0]?.guard).toBe('');
    expect(recorded).toEqual([]);
  });

  it('resolves true through the programmatic API when saved', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    const opened = editor.openProperties({ kind: 'state', id: 'draft' });
    await flush();
    type(field(openedProperties(editor), 'description'), 'x');
    queryButton(openedProperties(editor), '.button--primary').click();

    expect(await opened).toBe(true);
    expect(await editor.openProperties({ kind: 'state', id: 'ghost' })).toBe(false);
  });

  it('picks the trigger from the injected action catalog', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const provider = vi.fn(() => Promise.resolve(ACTIONS));
    editor.actionProvider = provider;

    queryOne(shadowOf(editor), '.edge-card__properties').click();
    await flush();

    expect(provider).toHaveBeenCalledTimes(1);
    const select = triggerSelect(openedProperties(editor));
    expect(
      queryAll(openedProperties(editor), 'option').map((option) => option.textContent),
    ).toEqual(['No trigger', 'pay', 'cancel']);

    select.value = 'pay-action';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await save(editor);

    expect(editor.value.transitions[0]?.trigger).toEqual({ id: 'pay-action', name: 'pay' });
  });

  it('keeps a trigger the catalog no longer knows about', async () => {
    const editor = mountEditor();
    const base = sampleMachine();
    editor.value = {
      ...base,
      transitions: base.transitions.map((transition) => ({
        ...transition,
        trigger: { id: 'retired', name: 'retired' },
      })),
    };
    editor.actionProvider = () => ACTIONS;

    queryOne(shadowOf(editor), '.edge-card__properties').click();
    await flush();

    const select = triggerSelect(openedProperties(editor));
    expect(select.value).toBe('retired');
    await save(editor);
    expect(editor.value.transitions[0]?.trigger).toEqual({ id: 'retired', name: 'retired' });
  });

  it('falls back to free text when no action provider is set', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    queryOne(shadowOf(editor), '.edge-card__properties').click();
    await flush();

    const dialog = openedProperties(editor);
    expect(dialog.querySelector('select[data-field="trigger"]')).toBeNull();
    expect(queryOne(dialog, '[data-field-row="trigger"] .field__hint').textContent).toContain(
      'free text',
    );

    type(field(dialog, 'trigger'), '  pay  ');
    await save(editor);
    expect(editor.value.transitions[0]?.trigger).toEqual({ id: 'pay', name: 'pay' });
  });

  it('clears the trigger when the free text field is emptied', async () => {
    const editor = mountEditor();
    const base = sampleMachine();
    editor.value = {
      ...base,
      transitions: base.transitions.map((transition) => ({
        ...transition,
        trigger: { id: 'pay', name: 'pay' },
      })),
    };
    const recorded = changes(editor);

    queryOne(shadowOf(editor), '.edge-card__properties').click();
    await flush();
    type(field(openedProperties(editor), 'trigger'), '');
    await save(editor);

    expect(editor.value.transitions[0]?.trigger).toBeNull();
    expect(recorded).toEqual([{ kind: 'transition-trigger', transitionId: 'pay' }]);
  });

  it('runs the guard through the injected validator and shows its errors', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const validator = vi.fn(
      (expression: string): GuardValidation =>
        expression.includes('(')
          ? { ok: false, errors: ['Unbalanced parentheses.', 'Try again.'] }
          : { ok: true },
    );
    editor.guardValidator = validator;

    queryOne(shadowOf(editor), '.edge-card__properties').click();
    await flush();

    type(field(openedProperties(editor), 'guard'), 'total > (0');
    await flush();
    expect(validator).toHaveBeenCalledWith('total > (0');
    expect(
      queryAll(openedProperties(editor), '.field__error').map((item) => item.textContent),
    ).toEqual(['Unbalanced parentheses.', 'Try again.']);

    type(field(openedProperties(editor), 'guard'), 'total > 0');
    await flush();
    expect(queryAll(openedProperties(editor), '.field__error')).toHaveLength(0);

    // The component never interprets the expression, so an invalid one still saves.
    type(field(openedProperties(editor), 'guard'), 'total > (0');
    await flush();
    await save(editor);
    expect(editor.value.transitions[0]?.guard).toBe('total > (0');
  });

  it('never validates when no validator is injected', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    queryOne(shadowOf(editor), '.edge-card__properties').click();
    await flush();
    type(field(openedProperties(editor), 'guard'), 'anything at all ((( ');
    await flush();

    expect(queryAll(openedProperties(editor), '.field__error')).toHaveLength(0);
    expect(queryOne(openedProperties(editor), '.field__errors').hidden).toBe(true);
  });

  it('reorders an edge among the ones leaving the same state', async () => {
    const editor = mountEditor();
    const base = sampleMachine();
    editor.value = {
      ...base,
      transitions: [
        ...base.transitions,
        createTransition({ id: 'void', name: 'void', from: 'draft', to: 'paid' }),
        createTransition({ id: 'back', name: 'back', from: 'paid', to: 'draft' }),
      ],
    };
    const recorded = changes(editor);

    void editor.openProperties({ kind: 'transition', id: 'void' });
    await flush();

    const dialog = openedProperties(editor);
    expect(queryOne(dialog, '.order__readout').textContent).toBe('2 of 2');
    expect(queryOne(dialog, '[data-field-row="order"] .field__hint').textContent).toContain(
      'leaving Draft',
    );
    expect(queryButton(dialog, '.order__move--down').disabled).toBe(true);

    queryButton(dialog, '.order__move--up').click();
    expect(queryOne(dialog, '.order__readout').textContent).toBe('1 of 2');
    await save(editor);

    expect(editor.value.transitions.map((transition) => transition.id)).toEqual([
      'void',
      'pay',
      'back',
    ]);
    expect(recorded).toEqual([{ kind: 'transition-reorder', transitionId: 'void' }]);
  });

  it('groups creation edges under the start pseudo-node for ordering', async () => {
    const editor = mountEditor();
    const base = machineWithCreation();
    editor.value = {
      ...base,
      transitions: [
        ...base.transitions,
        createTransition({ id: 'create2', name: 'create 2', from: null, to: 'paid' }),
      ],
    };

    void editor.openProperties({ kind: 'transition', id: 'create2' });
    await flush();
    expect(
      queryOne(openedProperties(editor), '[data-field-row="order"] .field__hint').textContent,
    ).toContain('leaving the start');
    expect(queryOne(openedProperties(editor), '.order__readout').textContent).toBe('2 of 2');
  });

  it('opens read-only without a save button', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.readOnly = true;

    queryOne(shadowOf(editor), '.edge-card__properties').click();
    await flush();

    const dialog = openedProperties(editor);
    expect(queryButton(dialog, '.button--primary').hidden).toBe(true);
    expect(field(dialog, 'guard').readOnly).toBe(true);
    expect(queryButton(dialog, '.order__move--up').disabled).toBe(true);
  });
});

describe('the transition card summary', () => {
  it('keeps the name as the headline and hangs the trigger below it', () => {
    const editor = mountEditor();
    const base = sampleMachine();
    editor.value = {
      ...base,
      transitions: base.transitions.map((transition) => ({
        ...transition,
        trigger: { id: 'pay-action', name: 'pay' },
        guard: 'order.total > 0',
      })),
    };

    const shadow = shadowOf(editor);
    // The name is the edge's identity and the target of the inline rename gesture,
    // so it stays first; the trigger and guard ride underneath it.
    expect(queryOne(shadow, '.edge-card__name').textContent).toBe('pay');
    expect(queryOne(shadow, '.edge-card__meta').hidden).toBe(false);
    expect(queryOne(shadow, '.edge-card__trigger').textContent).toBe('⚡ pay');
    expect(queryOne(shadow, '.edge-card__guard').textContent).toBe('[order.total > 0]');
    expect(queryOne(shadow, '.edge-card__guard').title).toBe('Guard: order.total > 0');
  });

  it('hides the second line while there is nothing on it', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);
    expect(queryOne(shadow, '.edge-card__meta').hidden).toBe(true);
    expect(queryOne(shadow, '.edge-card__trigger').hidden).toBe(true);
    expect(queryOne(shadow, '.edge-card__guard').hidden).toBe(true);
  });

  it('shows a guard on its own, for an edge with no trigger yet', () => {
    const editor = mountEditor();
    const base = sampleMachine();
    editor.value = {
      ...base,
      transitions: base.transitions.map((transition) => ({ ...transition, guard: 'is_staff' })),
    };
    const shadow = shadowOf(editor);
    expect(queryOne(shadow, '.edge-card__meta').hidden).toBe(false);
    expect(queryOne(shadow, '.edge-card__trigger').hidden).toBe(true);
  });

  it('still renames through the name, not the trigger', () => {
    const editor = mountEditor();
    const base = sampleMachine();
    editor.value = {
      ...base,
      transitions: base.transitions.map((transition) => ({
        ...transition,
        trigger: { id: 'pay-action', name: 'pay' },
      })),
    };

    queryButton(shadowOf(editor), '.edge-card__rename').click();
    const input = queryOne(shadowOf(editor), '.name-input');
    expect(input instanceof HTMLInputElement && input.value).toBe('pay');
  });

  it('marks a creation edge on the canvas', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    const card = queryOne(shadowOf(editor), '.edge-card[data-transition-id="create"]');
    expect(card.classList.contains('is-creation')).toBe(true);
  });
});

describe('disabled side effects on the canvas', () => {
  it('counts them but marks them', () => {
    const editor = mountEditor();
    const base = sampleMachine();
    editor.value = {
      ...base,
      transitions: base.transitions.map((transition) => ({
        ...transition,
        effects: {
          before: [
            sideEffect('e1', 'sendEmail', { enabled: false }),
            sideEffect('e2', 'chargeCard'),
          ],
          after: [],
        },
      })),
    };

    const chip = queryAll(shadowOf(editor), '.edge-card .chip')[0];
    expect(chip?.textContent).toBe('sendEmail (off)');
    expect(chip?.getAttribute('data-count')).toBe('2');
    expect(chip?.hasAttribute('data-many')).toBe(true);
    expect(chip?.title).toBe('1. sendEmail — disabled\n2. chargeCard');
  });
});

describe('host-owned data on the canvas', () => {
  it('survives a drag on all four levels', () => {
    const editor = mountEditor();
    const base = sampleMachine();
    editor.value = {
      ...base,
      data: { schemaVersion: 3 },
      states: base.states.map((state) => ({
        ...state,
        data: { table: `orders_${state.id}` },
        onEnter: {
          before: [sideEffect('e1', 'sendEmail', { data: { onCommit: true } })],
          after: [],
        },
      })),
      transitions: base.transitions.map((transition) => ({
        ...transition,
        data: { audited: true, tags: ['legacy', null] },
      })),
    };

    // A drag is the harshest round trip: every frame reparses and rebuilds.
    const header = queryOne(shadowOf(editor), '.node .node__header');
    firePointer(header, 'pointerdown', { clientX: 10, clientY: 10 });
    firePointer(document, 'pointermove', { clientX: 90, clientY: 130 });
    firePointer(document, 'pointerup', { clientX: 90, clientY: 130 });

    const after = editor.value;
    expect(after.states[0]?.position).toEqual({ x: 80, y: 120 });
    expect(after.data).toEqual({ schemaVersion: 3 });
    expect(after.states[0]?.data).toEqual({ table: 'orders_draft' });
    expect(after.states[0]?.onEnter.before[0]?.data).toEqual({ onCommit: true });
    expect(after.transitions[0]?.data).toEqual({ audited: true, tags: ['legacy', null] });

    // And it survives being handed straight back in, which is what a host does.
    editor.value = after;
    expect(editor.value.states[0]?.data).toEqual({ table: 'orders_draft' });
    expect(editor.value.transitions[0]?.data).toEqual({ audited: true, tags: ['legacy', null] });
  });

  it('emits no change of its own when a host rewrites it', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const recorded = changes(editor);
    editor.value = { ...editor.value, data: { anything: 'goes' } };
    expect(recorded).toEqual([]);
    expect(editor.value.data).toEqual({ anything: 'goes' });
  });
});

describe('the start bar', () => {
  /** Where an edge's path leaves its source: the `M x y` at the head of the `d`. */
  function pathStart(editor: StateMachineEditorElement, transitionId: string): Point {
    const path = querySvg(shadowOf(editor), `path.edge[data-transition-id="${transitionId}"]`);
    const match = /^M (-?[\d.]+) (-?[\d.]+)/.exec(path.getAttribute('d') ?? '');
    if (match?.[1] === undefined || match[2] === undefined) {
      throw new Error(`Transition "${transitionId}" has no path.`);
    }
    return { x: Number.parseFloat(match[1]), y: Number.parseFloat(match[2]) };
  }

  function barHeight(editor: StateMachineEditorElement): number {
    return Number.parseFloat(queryOne(shadowOf(editor), '.start-node').style.height);
  }

  /** Two states stacked vertically, each fed by its own creation edge. */
  function twoCreationEdges(): ReturnType<typeof sampleMachine> {
    const base = sampleMachine();
    const tops: Readonly<Record<string, number>> = { draft: 600, paid: 0 };
    return {
      ...base,
      states: base.states.map((state) => ({
        ...state,
        position: { x: 400, y: tops[state.id] ?? 0 },
      })),
      transitions: [
        createTransition({ id: 'to-draft', name: 'create', from: null, to: 'draft' }),
        createTransition({ id: 'to-paid', name: 'create 2', from: null, to: 'paid' }),
      ],
    };
  }

  it('grows with the number of creation edges', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    const one = barHeight(editor);
    expect(one).toBeGreaterThan(0);

    const base = machineWithCreation();
    editor.value = {
      ...base,
      transitions: [
        ...base.transitions,
        createTransition({ id: 'c2', name: 'create 2', from: null, to: 'draft' }),
        createTransition({ id: 'c3', name: 'create 3', from: null, to: 'paid' }),
        createTransition({ id: 'c4', name: 'create 4', from: null, to: 'paid' }),
        createTransition({ id: 'c5', name: 'create 5', from: null, to: 'draft' }),
      ],
    };
    // Five slots outgrow the floor the label sets, so the bar starts growing.
    expect(barHeight(editor)).toBeGreaterThan(one);
  });

  it('gives every creation edge its own start, with room between them', () => {
    const editor = mountEditor();
    editor.value = twoCreationEdges();

    const first = pathStart(editor, 'to-draft');
    const second = pathStart(editor, 'to-paid');
    // Same vertical line — the bar's right edge — at different heights.
    expect(first.x).toBe(second.x);
    expect(Math.abs(first.y - second.y)).toBeGreaterThan(20);
  });

  it('orders the slots by target so the lines do not cross', () => {
    const editor = mountEditor();
    editor.value = twoCreationEdges(); // draft sits low, paid sits high

    // Paid is the higher state, so its edge takes the higher slot.
    expect(pathStart(editor, 'to-paid').y).toBeLessThan(pathStart(editor, 'to-draft').y);
  });

  it('reshuffles the slots when a state is dragged past another', () => {
    const editor = mountEditor();
    editor.value = twoCreationEdges();
    expect(pathStart(editor, 'to-paid').y).toBeLessThan(pathStart(editor, 'to-draft').y);

    // Swap them: draft goes above paid, so the slots have to swap with them.
    editor.value = {
      ...editor.value,
      states: editor.value.states.map((state) => ({
        ...state,
        position: { ...state.position, y: state.id === 'draft' ? 0 : 600 },
      })),
    };
    expect(pathStart(editor, 'to-draft').y).toBeLessThan(pathStart(editor, 'to-paid').y);
  });

  it('reorders the starting points when a card is dragged past another', () => {
    const editor = mountEditor();
    editor.value = twoCreationEdges();
    // paid sits high, so its edge starts above draft's.
    expect(pathStart(editor, 'to-paid').y).toBeLessThan(pathStart(editor, 'to-draft').y);

    // Drag the high edge's card well below the other one. The line now heads
    // downwards, so leaving from the top slot would cross its neighbour.
    const card = queryOne(shadowOf(editor), '.edge-card[data-transition-id="to-paid"]');
    const from = {
      x: Number.parseFloat(card.style.left),
      y: Number.parseFloat(card.style.top),
    };
    const header = queryOne(card, '.edge-card__header');
    firePointer(header, 'pointerdown', { clientX: from.x, clientY: from.y });
    firePointer(document, 'pointermove', { clientX: from.x, clientY: from.y + 700 });
    firePointer(document, 'pointerup', { clientX: from.x, clientY: from.y + 700 });

    expect(editor.value.transitions[1]?.labelOffset.y).toBeGreaterThan(0);
    expect(pathStart(editor, 'to-paid').y).toBeGreaterThan(pathStart(editor, 'to-draft').y);
  });

  it('does not reshuffle for a nudge that changes nothing', () => {
    const editor = mountEditor();
    editor.value = twoCreationEdges();
    const before = pathStart(editor, 'to-paid').y;

    const card = queryOne(shadowOf(editor), '.edge-card[data-transition-id="to-paid"]');
    const from = {
      x: Number.parseFloat(card.style.left),
      y: Number.parseFloat(card.style.top),
    };
    const header = queryOne(card, '.edge-card__header');
    firePointer(header, 'pointerdown', { clientX: from.x, clientY: from.y });
    firePointer(document, 'pointermove', { clientX: from.x, clientY: from.y - 60 });
    firePointer(document, 'pointerup', { clientX: from.x, clientY: from.y - 60 });

    // It moved, but not past its neighbour, so the slots stay where they were.
    expect(editor.value.transitions[1]?.labelOffset.y).toBeLessThan(0);
    expect(pathStart(editor, 'to-paid').y).toBe(before);
  });

  it('keeps the slot order independent of the evaluation order', () => {
    const editor = mountEditor();
    editor.value = twoCreationEdges();
    const before = pathStart(editor, 'to-paid').y;

    // Reordering the array is what decides evaluation order; it is not layout.
    editor.value = {
      ...editor.value,
      transitions: [...editor.value.transitions].reverse(),
    };
    expect(editor.value.transitions.map((transition) => transition.id)).toEqual([
      'to-paid',
      'to-draft',
    ]);
    expect(pathStart(editor, 'to-paid').y).toBe(before);
  });

  it('still fans two creation edges that share a target', () => {
    const editor = mountEditor();
    const base = machineWithCreation();
    editor.value = {
      ...base,
      transitions: [
        ...base.transitions,
        createTransition({ id: 'c2', name: 'create 2', from: null, to: 'draft' }),
      ],
    };

    // No ordering can separate edges with the same target, so the fan still has to.
    const cards = queryAll(shadowOf(editor), '.edge-card').filter((card) =>
      (card.getAttribute('data-transition-id') ?? '').startsWith('c'),
    );
    const centers = cards.map((card) => ({
      x: Number.parseFloat(card.style.left),
      y: Number.parseFloat(card.style.top),
    }));
    const [first, second] = centers;
    if (first === undefined || second === undefined) {
      throw new Error('missing card');
    }
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(70);
  });

  it('names itself, so nobody has to guess what the bar is', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    const bar = queryOne(shadowOf(editor), '.start-node');
    expect(queryOne(bar, '.start-node__label').textContent).toBe('Create');
    expect(bar.getAttribute('aria-label')).toBe('Create: 1 creation transition');

    editor.addCreationTransition('paid');
    expect(queryOne(shadowOf(editor), '.start-node').getAttribute('aria-label')).toBe(
      'Create: 2 creation transitions',
    );
  });

  it('stays tall enough to read even with a single edge', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    // One edge needs 34px of slot, but the label needs more than that.
    expect(barHeight(editor)).toBeGreaterThanOrEqual(96);
  });

  it('keeps a whole transition card between itself and the state it feeds', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    const shadow = shadowOf(editor);
    const bar = queryOne(shadow, '.start-node');
    const barRight = Number.parseFloat(bar.style.left) + 26;
    const leftmost = Math.min(...editor.value.states.map((state) => state.position.x));
    const card = queryOne(shadow, '.edge-card[data-transition-id="create"]');
    const centre = Number.parseFloat(card.style.left);

    // The card is 186px wide and does not sit half way: the control point pulls
    // it towards the target, so both sides are checked rather than assumed.
    expect(centre - 93 - barRight).toBeGreaterThan(40);
    expect(leftmost - (centre + 93)).toBeGreaterThan(40);
  });

  it('leaves the bar out of the states and the roles', () => {
    const editor = mountEditor();
    editor.value = machineWithCreation();
    expect(editor.value.states).toHaveLength(2);
    expect(queryAll(shadowOf(editor), '.start-node .node__role')).toHaveLength(0);

    // Pressing it selects nothing: it is not an element of the machine.
    firePointer(queryOne(shadowOf(editor), '.start-node'), 'pointerdown');
    expect(editor.selection).toBeNull();
  });
});

describe('placing new elements in free space', () => {
  /** Box a state occupies, at the sizes the editor falls back to under jsdom. */
  function stateBoxes(editor: StateMachineEditorElement): readonly Rect[] {
    return editor.value.states.map((state) => ({
      x: state.position.x,
      y: state.position.y,
      width: 248,
      height: 152,
    }));
  }

  function cardBoxes(editor: StateMachineEditorElement): readonly Rect[] {
    return queryAll(shadowOf(editor), '.edge-card').map((card) => ({
      x: Number.parseFloat(card.style.left) - 93,
      y: Number.parseFloat(card.style.top) - 36,
      width: 186,
      height: 72,
    }));
  }

  it('never stacks a new state on an existing one', () => {
    const editor = mountEditor();
    editor.value = {
      states: [],
      transitions: [],
      initialStateIds: [],
      finalStateIds: [],
      data: {},
    };

    for (let index = 0; index < 6; index += 1) {
      editor.addState();
    }

    const boxes = stateBoxes(editor);
    expect(boxes).toHaveLength(6);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a === undefined || b === undefined) {
          throw new Error('missing state');
        }
        expect(rectsOverlap(a, b)).toBe(false);
      }
    }
  });

  it('still honours an explicit position', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    // draft already sits at 0,0 — an explicit position is the caller's business.
    const state = editor.addState({ position: { x: 0, y: 0 } });
    expect(state.position).toEqual({ x: 0, y: 0 });
  });

  it('keeps a new transition card off the cards already there', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const before = cardBoxes(editor);

    // A second edge between the same pair, whose card would otherwise land on
    // the first one once the fan is not enough on its own.
    editor.addTransition('draft', 'paid');
    editor.addTransition('draft', 'paid');

    const boxes = cardBoxes(editor);
    expect(boxes).toHaveLength(before.length + 2);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a === undefined || b === undefined) {
          throw new Error('missing card');
        }
        expect(rectsOverlap(a, b)).toBe(false);
      }
    }
  });

  it('leaves the offset at zero when the spot is already free', () => {
    const editor = mountEditor();
    const base = sampleMachine();
    editor.value = {
      ...base,
      // Far enough apart that a whole card fits in the gap between them.
      states: base.states.map((state) => ({
        ...state,
        position: { ...state.position, x: state.id === 'draft' ? 0 : 700 },
      })),
      transitions: [],
    };
    // The spot the edge would use is clear, so the editor must not invent an
    // offset — a non-zero one opts the card out of automatic placement for good.
    expect(editor.addTransition('draft', 'paid').labelOffset).toEqual({ x: 0, y: 0 });
  });

  it('lifts the card off the nodes when they are too close to hold it', () => {
    const editor = mountEditor();
    editor.value = { ...sampleMachine(), transitions: [] };

    // draft ends at x=248 and paid starts at x=400: a 186px card cannot sit in
    // a 152px gap, so it has to leave the line rather than cover both nodes.
    const transition = editor.addTransition('draft', 'paid');
    expect(transition.labelOffset.y).not.toBe(0);

    const card = cardBoxes(editor)[0];
    if (card === undefined) {
      throw new Error('missing card');
    }
    for (const state of stateBoxes(editor)) {
      expect(rectsOverlap(card, state)).toBe(false);
    }
  });

  it('places a creation edge clear of the cards around the bar', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.addCreationTransition('draft');
    editor.addCreationTransition('draft');

    const boxes = cardBoxes(editor);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a === undefined || b === undefined) {
          throw new Error('missing card');
        }
        expect(rectsOverlap(a, b)).toBe(false);
      }
    }
  });

  it('reports the placement as part of the add, not as a move', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const recorded = changes(editor);

    editor.addTransition('draft', 'paid');
    editor.addTransition('draft', 'paid');

    // The card is placed before the machine is committed, so a host sees one
    // event per new edge rather than an add followed by a correcting move.
    expect(recorded.map((change) => change.kind)).toEqual(['transition-add', 'transition-add']);
  });
});

describe('undo and redo', () => {
  it('takes the last change back and puts it forward again', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryButton(shadowOf(editor), '.toolbar__add').click();
    expect(editor.value.states).toHaveLength(3);

    expect(editor.undo()).toBe(true);
    expect(editor.value.states).toHaveLength(2);
    expect(queryAll(shadowOf(editor), '.node')).toHaveLength(2);

    expect(editor.redo()).toBe(true);
    expect(editor.value.states).toHaveLength(3);
    expect(queryAll(shadowOf(editor), '.node')).toHaveLength(3);
  });

  it('reports both directions and refuses to walk past either end', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    expect(editor.canUndo).toBe(false);
    expect(editor.undo()).toBe(false);

    editor.addState();
    expect(editor.canUndo).toBe(true);
    expect(editor.canRedo).toBe(false);

    editor.undo();
    expect(editor.canUndo).toBe(false);
    expect(editor.canRedo).toBe(true);
    expect(editor.redo()).toBe(true);
    expect(editor.redo()).toBe(false);
  });

  it('announces a step as a whole-machine replacement', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.addState();
    const recorded: { kind: string; transient: boolean }[] = [];
    editor.addEventListener('state-machine-change', (event: StateMachineChangeEvent) => {
      recorded.push({ kind: event.detail.change.kind, transient: event.detail.transient });
    });

    editor.undo();
    editor.redo();

    expect(recorded).toEqual([
      { kind: 'replace', transient: false },
      { kind: 'replace', transient: false },
    ]);
  });

  it('folds a whole drag into one step', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const start = editor.value.states[0]?.position;

    const header = queryOne(shadowOf(editor), '.node .node__header');
    firePointer(header, 'pointerdown', { clientX: 10, clientY: 10 });
    firePointer(document, 'pointermove', { clientX: 60, clientY: 40 });
    firePointer(document, 'pointermove', { clientX: 110, clientY: 60 });
    firePointer(document, 'pointerup', { clientX: 110, clientY: 60 });
    expect(editor.value.states[0]?.position).toEqual({ x: 100, y: 50 });

    // The transient frames are not steps of their own: one undo goes all the way
    // back to where the card sat before the gesture started.
    expect(editor.undo()).toBe(true);
    expect(editor.value.states[0]?.position).toEqual(start);
    expect(editor.canUndo).toBe(false);
  });

  it('folds one properties save into one step, however many fields it touched', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    queryOne(shadowOf(editor), '.edge-card__properties').click();
    await flush();
    type(field(openedProperties(editor), 'guard'), 'order.total > 0');
    type(field(openedProperties(editor), 'permission'), 'orders.pay');
    await save(editor);
    expect(editor.value.transitions[0]?.guard).toBe('order.total > 0');

    editor.undo();
    expect(editor.value.transitions[0]?.guard).toBe('');
    expect(editor.value.transitions[0]?.requiredPermission).toBe('');
    expect(editor.canUndo).toBe(false);
  });

  it('brings back a removed state along with its transitions', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node__remove')[0]?.click();
    expect(editor.value.states).toHaveLength(1);
    expect(editor.value.transitions).toHaveLength(0);

    editor.undo();
    expect(editor.value.states.map((state) => state.id)).toEqual(['draft', 'paid']);
    expect(editor.value.transitions).toHaveLength(1);
    expect(editor.value.initialStateIds).toEqual(['draft']);
  });

  it('drops a selection the step leaves behind, and says so once', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const added = editor.addState();
    editor.selection = { kind: 'state', id: added.id };
    const selections = selectionsOf(editor);

    editor.undo();

    expect(editor.selection).toBeNull();
    expect(selections).toEqual([null]);
  });

  it('keeps a selection the step leaves standing', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };
    editor.addState();
    const selections = selectionsOf(editor);

    editor.undo();

    expect(editor.selection).toEqual({ kind: 'state', id: 'draft' });
    expect(selections).toEqual([]);
  });

  it('drops the redo branch once another edit is made', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.addState();
    editor.undo();
    expect(editor.canRedo).toBe(true);

    editor.addState({ name: 'Elsewhere' });

    expect(editor.canRedo).toBe(false);
    expect(editor.value.states[2]?.name).toBe('Elsewhere');
  });

  it('undoes with the keyboard and redoes with shift, on both modifiers', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.addState();

    fireKey(editor, 'z', { metaKey: true });
    expect(editor.value.states).toHaveLength(2);
    fireKey(editor, 'Z', { metaKey: true, shiftKey: true });
    expect(editor.value.states).toHaveLength(3);

    fireKey(editor, 'z', { ctrlKey: true });
    expect(editor.value.states).toHaveLength(2);
    fireKey(editor, 'y', { ctrlKey: true });
    expect(editor.value.states).toHaveLength(3);
  });

  it('leaves the shortcut alone inside a text field and while a dialog is open', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.addState();

    queryAll(shadowOf(editor), '.node__rename')[0]?.click();
    const input = shadowOf(editor).querySelector('.name-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing rename input');
    }
    fireKey(input, 'z', { metaKey: true });
    expect(editor.value.states).toHaveLength(3);
    fireKey(input, 'Escape');

    queryOne(shadowOf(editor), '.edge-card__properties').click();
    await flush();
    fireKey(openedProperties(editor).host, 'z', { metaKey: true });
    expect(editor.value.states).toHaveLength(3);
  });

  it('names the buttons after the step they would take', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const undoButton = queryAll(shadowOf(editor), '.toolbar__history')[0];
    const redoButton = queryAll(shadowOf(editor), '.toolbar__history')[1];
    if (!(undoButton instanceof HTMLButtonElement) || !(redoButton instanceof HTMLButtonElement)) {
      throw new Error('missing history buttons');
    }
    expect(undoButton.disabled).toBe(true);
    expect(undoButton.getAttribute('aria-label')).toBe('Undo');

    editor.addState();
    expect(undoButton.disabled).toBe(false);
    expect(undoButton.getAttribute('aria-label')).toBe('Undo add state');
    expect(redoButton.disabled).toBe(true);

    undoButton.click();
    expect(editor.value.states).toHaveLength(2);
    expect(redoButton.disabled).toBe(false);
    expect(redoButton.getAttribute('aria-label')).toBe('Redo add state');

    redoButton.click();
    expect(editor.value.states).toHaveLength(3);
  });

  it('disables both buttons and both shortcuts in read-only mode', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.addState();
    editor.readOnly = true;

    const buttons = queryAll(shadowOf(editor), '.toolbar__history');
    expect(buttons.map((button) => button instanceof HTMLButtonElement && button.disabled)).toEqual(
      [true, true],
    );
    fireKey(editor, 'z', { metaKey: true });
    expect(editor.value.states).toHaveLength(3);
  });

  it('clears the history when the host replaces the machine', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.addState();
    expect(editor.canUndo).toBe(true);

    editor.value = sampleMachine();

    expect(editor.canUndo).toBe(false);
    expect(editor.canRedo).toBe(false);
  });

  it('survives a host echoing the machine it was just handed', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    // What a host rendering from its own state does: take the machine off the
    // event and write it straight back.
    editor.addEventListener('state-machine-change', (event: StateMachineChangeEvent) => {
      editor.value = event.detail.value;
    });

    editor.addState();

    expect(editor.canUndo).toBe(true);
    editor.undo();
    expect(editor.value.states).toHaveLength(2);
  });

  it('forgets every step on demand, keeping the machine as it stands', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.addState();

    editor.clearHistory();

    expect(editor.canUndo).toBe(false);
    expect(editor.canRedo).toBe(false);
    expect(editor.value.states).toHaveLength(3);
  });
});

describe('copy and paste', () => {
  it('copies the selected state and pastes it clear of the original', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };

    expect(editor.copySelection()).toBe(true);
    const pasted = editor.paste();

    expect(pasted?.kind).toBe('state');
    expect(editor.value.states).toHaveLength(3);
    const copy = editor.value.states[2];
    expect(copy?.name).toBe('Draft copy');
    expect(copy?.id).not.toBe('draft');
    // Clear of the card it came from, which sits at the origin.
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 248, height: 152 },
        { x: copy?.position.x ?? 0, y: copy?.position.y ?? 0, width: 248, height: 152 },
      ),
    ).toBe(false);
  });

  it('selects what it pasted', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };
    editor.copySelection();
    const selections = selectionsOf(editor);

    const pasted = editor.paste();

    expect(editor.selection).toEqual(pasted);
    expect(selections).toEqual([pasted]);
  });

  it('carries a state’s colour, description, data and side effects across', () => {
    const editor = mountEditor();
    const machine = sampleMachine();
    const draft = machine.states[0];
    if (draft === undefined) {
      throw new Error('missing state');
    }
    editor.value = {
      ...machine,
      states: [
        {
          ...draft,
          color: 'warning',
          description: 'Waiting on the customer.',
          data: { owner: 'billing' },
          onEnter: { before: [sideEffect('effect-1', 'sendEmail')], after: [] },
        },
        ...machine.states.slice(1),
      ],
    };
    editor.selection = { kind: 'state', id: 'draft' };
    editor.copySelection();
    editor.paste();

    const copy = editor.value.states[2];
    expect(copy?.color).toBe('warning');
    expect(copy?.description).toBe('Waiting on the customer.');
    expect(copy?.data).toEqual({ owner: 'billing' });
    expect(copy?.onEnter.before[0]?.name).toBe('sendEmail');
    expect(copy?.onEnter.before[0]?.id).not.toBe('effect-1');
  });

  it('leaves the initial and final roles behind', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };
    editor.copySelection();
    editor.paste();

    // A pasted card becoming a second entry point would change what the machine
    // does, so the roles stay with the state that holds them.
    expect(editor.value.initialStateIds).toEqual(['draft']);
    expect(editor.value.finalStateIds).toEqual(['paid']);
  });

  it('copies a transition between the same two states', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'transition', id: 'pay' };
    editor.copySelection();

    const pasted = editor.paste();

    expect(pasted?.kind).toBe('transition');
    expect(editor.value.transitions).toHaveLength(2);
    const copy = editor.value.transitions[1];
    expect(copy).toMatchObject({ from: 'draft', to: 'paid', name: 'pay copy' });
    expect(copy?.id).not.toBe('pay');
    expect(queryAll(shadowOf(editor), '.edge-card')).toHaveLength(2);
  });

  it('numbers a copy of a copy rather than stacking the suffix', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };
    editor.copySelection();

    editor.paste();
    editor.paste();
    editor.copySelection();
    editor.paste();

    expect(editor.value.states.map((state) => state.name)).toEqual([
      'Draft',
      'Paid',
      'Draft copy',
      'Draft copy 2',
      'Draft copy 3',
    ]);
  });

  it('reports a paste as one add, and takes it back in one step', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };
    editor.copySelection();
    const recorded = changes(editor);

    editor.paste();
    expect(recorded.map((change) => change.kind)).toEqual(['state-add']);

    editor.undo();
    expect(editor.value.states).toHaveLength(2);
  });

  it('records nothing for the copy itself', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };
    const recorded = changes(editor);

    editor.copySelection();

    expect(recorded).toEqual([]);
    expect(editor.canUndo).toBe(false);
  });

  it('refuses to copy nothing, or an element that is gone', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    expect(editor.copySelection()).toBe(false);
    expect(editor.copy({ kind: 'state', id: 'ghost' })).toBe(false);
    expect(editor.clipboard).toBeNull();
    expect(editor.paste()).toBeNull();
  });

  it('refuses a transition whose endpoints have since been removed', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.copy({ kind: 'transition', id: 'pay' });
    expect(editor.clipboard?.kind).toBe('transition');

    queryAll(shadowOf(editor), '.node__remove')[1]?.click();

    expect(editor.paste()).toBeNull();
    expect(queryButton(shadowOf(editor), '.toolbar__paste').disabled).toBe(true);
  });

  it('survives the machine being replaced, so a state crosses documents', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.copy({ kind: 'state', id: 'draft' });

    editor.value = {
      states: [],
      transitions: [],
      initialStateIds: [],
      finalStateIds: [],
      data: {},
    };
    editor.paste();

    expect(editor.value.states).toHaveLength(1);
    expect(editor.value.states[0]?.name).toBe('Draft copy');
  });

  it('copies and pastes from the keyboard', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };

    fireKey(editor, 'c', { metaKey: true });
    expect(editor.clipboard?.kind).toBe('state');

    fireKey(editor, 'v', { metaKey: true });
    expect(editor.value.states).toHaveLength(3);

    fireKey(editor, 'v', { ctrlKey: true });
    expect(editor.value.states).toHaveLength(4);
  });

  it('leaves the key to the browser when there is nothing to do with it', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    const copy = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      metaKey: true,
    });
    editor.dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(false);

    editor.selection = { kind: 'state', id: 'draft' };
    const copied = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      metaKey: true,
    });
    editor.dispatchEvent(copied);
    expect(copied.defaultPrevented).toBe(true);
  });

  it('leaves the shortcuts alone inside a text field', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };
    queryAll(shadowOf(editor), '.node__rename')[0]?.click();
    const input = shadowOf(editor).querySelector('.name-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing rename input');
    }

    fireKey(input, 'c', { metaKey: true });
    fireKey(input, 'v', { metaKey: true });

    expect(editor.clipboard).toBeNull();
    expect(editor.value.states).toHaveLength(2);
  });

  it('names the buttons after what they hold', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);
    const copyButton = queryButton(shadow, '.toolbar__copy');
    const pasteButton = queryButton(shadow, '.toolbar__paste');

    expect(copyButton.disabled).toBe(true);
    expect(pasteButton.disabled).toBe(true);
    expect(copyButton.getAttribute('aria-label')).toBe('Copy');

    editor.selection = { kind: 'transition', id: 'pay' };
    expect(copyButton.disabled).toBe(false);
    expect(copyButton.getAttribute('aria-label')).toBe('Copy transition');

    copyButton.click();
    expect(pasteButton.disabled).toBe(false);
    expect(pasteButton.getAttribute('aria-label')).toBe('Paste transition');

    pasteButton.click();
    expect(editor.value.transitions).toHaveLength(2);
  });

  it('copies read-only but does not paste', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.selection = { kind: 'state', id: 'draft' };
    editor.readOnly = true;

    fireKey(editor, 'c', { metaKey: true });
    expect(editor.clipboard?.kind).toBe('state');
    expect(queryButton(shadowOf(editor), '.toolbar__copy').disabled).toBe(false);

    fireKey(editor, 'v', { metaKey: true });
    expect(editor.value.states).toHaveLength(2);
    expect(queryButton(shadowOf(editor), '.toolbar__paste').disabled).toBe(true);
  });

  it('takes an entry handed over from another editor', () => {
    const source = mountEditor();
    source.value = sampleMachine();
    source.copy({ kind: 'state', id: 'paid' });

    const target = mountEditor();
    target.value = sampleMachine();
    target.clipboard = source.clipboard;
    target.paste();

    expect(target.value.states.map((state) => state.name)).toEqual(['Draft', 'Paid', 'Paid copy']);
  });
});

describe('the side effect count on a chip', () => {
  /** The sample machine with `count` side effects on the transition's before list. */
  function machineWithHook(count: number, patch: { readonly params?: JsonObject } = {}) {
    const base = sampleMachine();
    return {
      ...base,
      transitions: base.transitions.map((transition) => ({
        ...transition,
        effects: {
          before: Array.from({ length: count }, (_unused, index) =>
            sideEffect(`e${index}`, `effect${index}`, patch),
          ),
          after: [],
        },
      })),
    };
  }

  it('marks a list holding more than one, and says how many', () => {
    const editor = mountEditor();
    editor.value = machineWithHook(3);

    const chip = queryAll(shadowOf(editor), '.edge-card .chip')[0];
    expect(chip?.hasAttribute('data-many')).toBe(true);
    expect(chip?.getAttribute('data-count')).toBe('3');
    // The badge is a CSS pseudo-element fed by data-count, so the label — which
    // the chip's width elides — stays the first side effect's name alone.
    expect(chip?.textContent).toBe('effect0');
  });

  it('keeps the name in a child, so the chip itself does not clip the badge', () => {
    const editor = mountEditor();
    editor.value = machineWithHook(3);

    const chip = queryAll(shadowOf(editor), '.edge-card .chip')[0];
    // The elision belongs to the label; the badge hangs off the chip's edge,
    // outside the box, which a chip that clipped its own overflow would cut off.
    expect(chip?.children).toHaveLength(1);
    expect(queryOne(shadowOf(editor), '.edge-card .chip__label').textContent).toBe('effect0');
  });

  it('leaves a single side effect unmarked, since its name is the whole story', () => {
    const editor = mountEditor();
    editor.value = machineWithHook(1);

    const chip = queryAll(shadowOf(editor), '.edge-card .chip')[0];
    expect(chip?.hasAttribute('data-many')).toBe(false);
    expect(chip?.getAttribute('data-count')).toBe('1');
    expect(chip?.textContent).toBe('effect0');
  });

  it('leaves an empty list unmarked', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    const chip = queryAll(shadowOf(editor), '.edge-card .chip')[0];
    expect(chip?.hasAttribute('data-many')).toBe(false);
    expect(chip?.getAttribute('data-count')).toBe('0');
  });

  it('follows the list as it grows and shrinks', () => {
    const editor = mountEditor();
    editor.value = machineWithHook(2);
    const chip = queryAll(shadowOf(editor), '.edge-card .chip')[0];
    expect(chip?.hasAttribute('data-many')).toBe(true);

    editor.value = machineWithHook(1);
    expect(queryAll(shadowOf(editor), '.edge-card .chip')[0]?.hasAttribute('data-many')).toBe(
      false,
    );
  });

  it('shows on a state hook as well as a transition one', () => {
    const editor = mountEditor();
    const base = sampleMachine();
    const draft = base.states[0];
    if (draft === undefined) {
      throw new Error('missing state');
    }
    editor.value = {
      ...base,
      states: [
        {
          ...draft,
          onEnter: {
            before: [sideEffect('e1', 'sendEmail'), sideEffect('e2', 'chargeCard')],
            after: [],
          },
        },
        ...base.states.slice(1),
      ],
    };

    const chip = queryAll(shadowOf(editor), '.node .chip')[0];
    expect(chip?.hasAttribute('data-many')).toBe(true);
    expect(chip?.getAttribute('data-count')).toBe('2');
  });

  it('sits alongside the parameters marker rather than replacing it', () => {
    const editor = mountEditor();
    editor.value = machineWithHook(2, { params: { to: 'customer' } });

    const chip = queryAll(shadowOf(editor), '.edge-card .chip')[0];
    expect(chip?.hasAttribute('data-many')).toBe(true);
    expect(chip?.hasAttribute('data-has-params')).toBe(true);
    expect(chip?.getAttribute('aria-label')).toContain('2 side effects, 2 with parameters');
  });
});

describe('organizing the layout', () => {
  /** A machine as a backend that never stored coordinates hands it over. */
  function unpositioned(): StateMachine {
    return {
      states: [
        createState({ id: 'paid', name: 'Paid', position: { x: 0, y: 0 } }),
        createState({ id: 'draft', name: 'Draft', position: { x: 0, y: 0 } }),
      ],
      transitions: [createTransition({ id: 'pay', name: 'pay', from: 'draft', to: 'paid' })],
      initialStateIds: ['draft'],
      finalStateIds: ['paid'],
      data: {},
    };
  }

  function positionOf(editor: StateMachineEditorElement, id: string): Point {
    const state = editor.value.states.find((candidate) => candidate.id === id);
    if (state === undefined) {
      throw new Error(`No state "${id}".`);
    }
    return state.position;
  }

  it('lays a machine out on assignment when every card sits on the origin', () => {
    const editor = mountEditor();
    editor.value = unpositioned();

    // Draft is where a record enters, so it takes the first column whatever
    // order the states arrived in.
    expect(positionOf(editor, 'draft').x).toBeLessThan(positionOf(editor, 'paid').x);
    expect(editor.value.states.every((state) => state.position.y >= 0)).toBe(true);
  });

  it('announces the layout it invented, so the host can store it', () => {
    const editor = mountEditor();
    const recorded = changes(editor);
    editor.value = unpositioned();

    expect(recorded).toEqual([{ kind: 'layout' }]);
  });

  it('does not make the layout an undo step', () => {
    const editor = mountEditor();
    editor.value = unpositioned();

    expect(editor.canUndo).toBe(false);
  });

  it('leaves a machine that carries positions exactly where it is', () => {
    const editor = mountEditor();
    const recorded = changes(editor);
    editor.value = sampleMachine();

    expect(recorded).toEqual([]);
    expect(positionOf(editor, 'paid')).toEqual({ x: 400, y: 0 });
  });

  it('organizes on demand, as one undo step', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const recorded = changes(editor);

    expect(editor.organize()).toBe(true);
    expect(recorded).toEqual([{ kind: 'layout' }]);
    expect(positionOf(editor, 'draft').x).toBeLessThan(positionOf(editor, 'paid').x);

    editor.undo();
    expect(positionOf(editor, 'paid')).toEqual({ x: 400, y: 0 });
  });

  it('names the step after what it did', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.organize();

    expect(queryButton(shadowOf(editor), '.toolbar__history').getAttribute('aria-label')).toBe(
      'Undo organize layout',
    );
  });

  it('reports that an already organized machine has nothing to do', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.organize();

    expect(editor.organize()).toBe(false);
  });

  it('puts a dragged transition card back on its edge', () => {
    const editor = mountEditor();
    const base = sampleMachine();
    editor.value = {
      ...base,
      transitions: [
        createTransition({
          id: 'pay',
          name: 'pay',
          from: 'draft',
          to: 'paid',
          labelOffset: { x: 40, y: 90 },
        }),
      ],
    };
    editor.organize();

    expect(editor.value.transitions[0]?.labelOffset).toEqual({ x: 0, y: 0 });
  });

  /** The confirmation the toolbar's Organize opens, or a throw if it did not. */
  function confirmDialog(editor: StateMachineEditorElement): ShadowRoot {
    const dialog = shadowOf(editor).querySelector('state-machine-confirm-dialog');
    if (dialog === null) {
      throw new Error('confirmation is not open');
    }
    return shadowOf(dialog);
  }

  it('organizes from the toolbar once the question is answered', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryButton(shadowOf(editor), '.toolbar__organize').click();
    queryButton(confirmDialog(editor), '[data-confirm="confirm"]').click();
    await flush();

    // Off the position it arrived with, and onto the layout's own grid.
    expect(positionOf(editor, 'paid')).not.toEqual({ x: 400, y: 0 });
    expect(positionOf(editor, 'draft').x).toBeLessThan(positionOf(editor, 'paid').x);
  });

  it('leaves every card alone when the question is cancelled', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const recorded = changes(editor);
    queryButton(shadowOf(editor), '.toolbar__organize').click();
    queryButton(confirmDialog(editor), '[data-confirm="cancel"]').click();
    await flush();

    expect(recorded).toEqual([]);
    expect(positionOf(editor, 'paid')).toEqual({ x: 400, y: 0 });
    expect(shadowOf(editor).querySelector('state-machine-confirm-dialog')).toBeNull();
  });

  it('takes Escape on the question as a no', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryButton(shadowOf(editor), '.toolbar__organize').click();
    fireKey(queryOne(confirmDialog(editor), '.panel'), 'Escape');
    await flush();

    expect(positionOf(editor, 'paid')).toEqual({ x: 400, y: 0 });
  });

  it('leaves room between every pair of cards, not just no overlap', () => {
    const editor = mountEditor();
    // A branch and a state carrying two edges into it: the shapes that used to
    // land a transition card on top of a state, or a state under its neighbour.
    editor.value = {
      states: ['draft', 'paid', 'cancelled', 'archived'].map((id) =>
        createState({ id, name: id, position: { x: 0, y: 0 } }),
      ),
      transitions: [
        createTransition({ id: 'pay', name: 'pay', from: 'draft', to: 'paid' }),
        createTransition({ id: 'cancel', name: 'cancel', from: 'draft', to: 'cancelled' }),
        createTransition({ id: 'archive', name: 'archive', from: 'paid', to: 'archived' }),
        createTransition({ id: 'file', name: 'file', from: 'cancelled', to: 'archived' }),
        // Skips a column, so its card lands where the layout has to have left room.
        createTransition({ id: 'shortcut', name: 'shortcut', from: 'draft', to: 'archived' }),
      ],
      initialStateIds: ['draft'],
      finalStateIds: ['archived'],
      data: {},
    };
    editor.organize();

    // At the sizes the editor falls back to under jsdom.
    const boxes: Rect[] = editor.value.states.map((state) => ({
      x: state.position.x,
      y: state.position.y,
      width: 248,
      height: 152,
    }));
    for (const card of queryAll(shadowOf(editor), '.edge-card')) {
      boxes.push({
        x: Number.parseFloat(card.style.left) - 93,
        y: Number.parseFloat(card.style.top) - 36,
        width: 186,
        height: 72,
      });
    }
    // Cards that clear each other by a hair still read as one crowded blob, so
    // this asks for a gap rather than for the absence of an overlap.
    const clearance = (a: Rect, b: Rect): number =>
      Math.max(
        a.x - (b.x + b.width),
        b.x - (a.x + a.width),
        a.y - (b.y + b.height),
        b.y - (a.y + a.height),
      );
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a === undefined || b === undefined) {
          throw new Error('missing card');
        }
        expect(rectsOverlap(a, b)).toBe(false);
        expect(clearance(a, b)).toBeGreaterThanOrEqual(24);
      }
    }
  });

  it('organizes without asking when a host calls the method', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();

    expect(editor.organize()).toBe(true);
    expect(shadowOf(editor).querySelector('state-machine-confirm-dialog')).toBeNull();
  });

  it('has nothing to organize while the machine is empty', () => {
    const editor = mountEditor();

    expect(queryButton(shadowOf(editor), '.toolbar__organize').disabled).toBe(true);
    expect(editor.organize()).toBe(false);
  });

  it('stays out of a read-only editor', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.readOnly = true;

    expect(queryButton(shadowOf(editor), '.toolbar__organize').disabled).toBe(true);
    expect(editor.organize()).toBe(false);
  });
});
