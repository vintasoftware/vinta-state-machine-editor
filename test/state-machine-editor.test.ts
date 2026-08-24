import { afterEach, describe, expect, it, vi } from 'vitest';
import { toWorld } from '../src/geometry/viewport.js';
import {
  defineStateMachineEditor,
  type StateMachineChangeEvent,
  StateMachineEditorElement,
  StateMachineError,
} from '../src/index.js';
import { createTransition, getSideEffects } from '../src/model/machine.js';
import type { MachineChange, Point } from '../src/types.js';
import {
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
            { id: 'e1', definitionId: 'a', name: 'sendEmail', params: {} },
            { id: 'e2', definitionId: 'b', name: 'chargeCard', params: {} },
            { id: 'e3', definitionId: 'c', name: 'writeAuditLog', params: {} },
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
    editor.value = { states: [], transitions: [], initialStateIds: [], finalStateIds: [] };
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
        transitions: [
          {
            id: 't',
            name: 'x',
            from: 'ghost',
            to: 'ghost',
            labelOffset: { x: 0, y: 0 },
            effects: { before: [], after: [] },
          },
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

  it('keeps focus in the input when the buttons are pressed', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    queryAll(shadowOf(editor), '.node__rename')[0]?.click();

    const shadow = shadowOf(editor);
    const save = queryButton(shadow, '.icon-button--confirm');
    const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    save.dispatchEvent(event);

    // Blocking the default keeps the caret in the field, so blur cannot commit
    // an edit the user is about to cancel.
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
            { id: 'e1', definitionId: 'a', name: 'chargeCard', params: { amount: 10 } },
            { id: 'e2', definitionId: 'b', name: 'writeAuditLog', params: {} },
          ],
          after: [{ id: 'e3', definitionId: 'c', name: 'pingWebhook', params: {} }],
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
    expect(queryAll(shadowOf(editor), '.edge-card .chip')[0]?.textContent).toBe(
      'chargeCard and 1 more',
    );
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

    fireKey(editor, 'F2');
    expect(shadowOf(editor).querySelector('.name-input')).toBeNull();
  });
});
