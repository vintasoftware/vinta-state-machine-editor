import { defineStateMachineEditor, type StateMachineEditorElement } from '../src/index.js';
import { createState, createTransition } from '../src/model/machine.js';
import type { SideEffectDefinition, StateMachine } from '../src/types.js';

export const CATALOG: readonly SideEffectDefinition[] = [
  { id: 'send-email', name: 'sendEmail', description: 'Notifies the customer' },
  { id: 'charge', name: 'chargeCard' },
  { id: 'log', name: 'writeAuditLog' },
];

export function sampleMachine(): StateMachine {
  const draft = createState({ id: 'draft', name: 'Draft', position: { x: 0, y: 0 } });
  const paid = createState({ id: 'paid', name: 'Paid', position: { x: 400, y: 0 } });
  return {
    states: [draft, paid],
    transitions: [createTransition({ id: 'pay', name: 'pay', from: 'draft', to: 'paid' })],
  };
}

export function mountEditor(): StateMachineEditorElement {
  defineStateMachineEditor();
  const editor = document.createElement('state-machine-editor');
  document.body.append(editor);
  return editor;
}

export function shadowOf(element: Element): ShadowRoot {
  const root = element.shadowRoot;
  if (root === null) {
    throw new Error('Element has no shadow root.');
  }
  return root;
}

export function queryOne(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`No HTMLElement matching "${selector}".`);
  }
  return found;
}

export function queryButton(root: ParentNode, selector: string): HTMLButtonElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`No button matching "${selector}".`);
  }
  return found;
}

export function queryAll(root: ParentNode, selector: string): readonly HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const element of root.querySelectorAll(selector)) {
    if (element instanceof HTMLElement) {
      found.push(element);
    }
  }
  return found;
}

export function querySvg(root: ParentNode, selector: string): SVGElement {
  const found = root.querySelector(selector);
  if (!(found instanceof SVGElement)) {
    throw new Error(`No SVGElement matching "${selector}".`);
  }
  return found;
}

export interface PointerInit {
  readonly clientX?: number;
  readonly clientY?: number;
  readonly button?: number;
  readonly pointerId?: number;
}

export function firePointer(target: EventTarget, type: string, init: PointerInit = {}): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: init.clientX ?? 0,
      clientY: init.clientY ?? 0,
      button: init.button ?? 0,
      pointerId: init.pointerId ?? 1,
    }),
  );
}

/** Presses `count` fingers on `target` at the given points, in order. */
export function pinchStart(target: EventTarget, points: readonly PointerInit[]): void {
  points.forEach((point, index) => {
    firePointer(target, 'pointerdown', { pointerId: index + 1, ...point });
  });
}

/** Moves already-pressed fingers, one pointermove per finger. */
export function pinchMove(target: EventTarget, points: readonly PointerInit[]): void {
  points.forEach((point, index) => {
    firePointer(target, 'pointermove', { pointerId: index + 1, ...point });
  });
}

export function pinchEnd(target: EventTarget, count: number): void {
  for (let index = 0; index < count; index += 1) {
    firePointer(target, 'pointerup', { pointerId: index + 1 });
  }
}

export function fireKey(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init }),
  );
}

/** Lets pending microtasks (e.g. the dialog catalog promise) settle. */
export async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
