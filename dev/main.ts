/**
 * Interactive playground: `npm run dev`.
 *
 * It wires the element the same way a host application would — a `value`
 * property in, `state-machine-change` events out, and an injected provider for
 * the side effect catalog (here a fake endpoint with latency).
 */
import {
  type ActionDefinition,
  createSideEffect,
  createState,
  createTransition,
  defineStateMachineEditor,
  describeChange,
  type GuardValidation,
  type JsonObject,
  type SelectionChangeEvent,
  type SideEffectDefinition,
  type StateMachine,
  type StateMachineChangeEvent,
  StateMachineEditorElement,
} from '../src/index.js';

defineStateMachineEditor();

const CATALOG: readonly SideEffectDefinition[] = [
  {
    id: 'send-confirmation',
    name: 'sendConfirmationEmail',
    description: 'Transactional email',
    defaultParams: { template: 'order-confirmation', locale: 'pt-BR' },
  },
  {
    id: 'charge-card',
    name: 'chargeCard',
    description: 'Captures the payment',
    defaultParams: { capture: true, retries: 3 },
  },
  { id: 'reserve-stock', name: 'reserveStock', defaultParams: { warehouse: 'default' } },
  { id: 'release-stock', name: 'releaseStock' },
  { id: 'notify-warehouse', name: 'notifyWarehouse' },
  { id: 'audit-log', name: 'writeAuditLog', description: 'Compliance trail' },
  { id: 'refund', name: 'refundCustomer', defaultParams: { reason: 'cancelled' } },
  {
    id: 'ping-webhook',
    name: 'pingWebhook',
    description: 'Fan-out to subscribers',
    defaultParams: { url: 'https://example.com/hooks/orders', retries: { max: 5, backoff: 'exp' } },
  },
];

/** The events a transition can be fired by — the trigger picker's catalog. */
const ACTIONS: readonly ActionDefinition[] = [
  { id: 'submit', name: 'submit', description: 'Customer places the order' },
  { id: 'pay', name: 'pay', description: 'Payment captured' },
  { id: 'cancel', name: 'cancel' },
  { id: 'refund', name: 'refund' },
  { id: 'import', name: 'import', description: 'Bulk import from a spreadsheet' },
];

/**
 * Stands in for `fetch('/api/side-effects')`. Swap the body for a real request:
 * `const response = await fetch(url); return response.json();`
 */
async function fetchSideEffectCatalog(): Promise<readonly SideEffectDefinition[]> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  return CATALOG;
}

async function fetchActionCatalog(): Promise<readonly ActionDefinition[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return ACTIONS;
}

/**
 * Stands in for a real expression checker. The guard language belongs to the
 * host, so this one only insists on a shape the demo backend would accept.
 */
function validateGuard(expression: string): GuardValidation {
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    return { ok: true };
  }
  const errors: string[] = [];
  if (!/^[\w\s.()'"<>=!&|+-]+$/.test(trimmed)) {
    errors.push('Only identifiers, comparisons and boolean operators are allowed.');
  }
  const opens = trimmed.split('(').length - 1;
  const closes = trimmed.split(')').length - 1;
  if (opens !== closes) {
    errors.push('Unbalanced parentheses.');
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function effect(
  definitionId: string,
  id: string,
  params?: JsonObject,
): ReturnType<typeof createSideEffect> {
  const definition = CATALOG.find((item) => item.id === definitionId);
  if (definition === undefined) {
    throw new Error(`Unknown demo side effect "${definitionId}".`);
  }
  const created = createSideEffect(definition, id);
  return params === undefined ? created : { ...created, params };
}

/*
 * Laid out on a regular grid: 620px between columns and 520px between rows.
 * A transition card is 186px wide and sits at the middle of its edge, so those
 * gaps leave one clear card's width plus margins between any two state cards —
 * which is what keeps the labels off the nodes and off each other.
 */
function exampleMachine(): StateMachine {
  const draft = createState({
    id: 'draft',
    name: 'Draft',
    position: { x: 400, y: 340 },
    color: 'info',
  });
  const pending = {
    ...createState({
      id: 'pending',
      name: 'Pending payment',
      position: { x: 1020, y: 340 },
      color: 'warning',
    }),
    onEnter: {
      before: [effect('reserve-stock', 'e-reserve')],
      after: [effect('send-confirmation', 'e-confirm'), effect('audit-log', 'e-audit-1')],
    },
    onLeave: { before: [], after: [effect('release-stock', 'e-release')] },
  };
  const paid = {
    ...createState({
      id: 'paid',
      name: 'Paid',
      position: { x: 1640, y: 100 },
      color: 'success',
    }),
    onEnter: { before: [], after: [effect('notify-warehouse', 'e-warehouse')] },
    onLeave: { before: [], after: [] },
  };
  const cancelled = createState({
    id: 'cancelled',
    name: 'Cancelled',
    position: { x: 1640, y: 620 },
    color: 'danger',
  });

  const submit = createTransition({ id: 'submit', name: 'submit', from: 'draft', to: 'pending' });
  const pay = {
    ...createTransition({ id: 'pay', name: 'pay', from: 'pending', to: 'paid' }),
    effects: {
      before: [
        effect('charge-card', 'e-charge', {
          capture: true,
          retries: 3,
          idempotencyKey: 'order-42',
        }),
      ],
      after: [
        effect('audit-log', 'e-audit-2'),
        effect('ping-webhook', 'e-webhook', {
          url: 'https://example.com/hooks/orders',
          headers: { 'x-source': 'state-machine' },
          retries: { max: 5, backoff: 'exp' },
        }),
      ],
    },
  };
  const cancel = {
    ...createTransition({ id: 'cancel', name: 'cancel', from: 'pending', to: 'cancelled' }),
    effects: { before: [], after: [effect('refund', 'e-refund')] },
  };

  // Two transitions between the same pair, in opposite directions, to show the fanning.
  const refund = {
    ...createTransition({ id: 'refund', name: 'refund', from: 'paid', to: 'pending' }),
    effects: { before: [], after: [effect('refund', 'e-refund-2')] },
  };

  // Two creation edges, so the start pseudo-node and its fanning are visible.
  const create = createTransition({
    id: 'create',
    name: 'create',
    from: null,
    to: 'draft',
    trigger: { id: 'submit', name: 'submit' },
    requiredPermission: 'orders.add_order',
    description: 'A customer starts a new order.',
  });
  const importOrder = createTransition({
    id: 'create-import',
    name: 'create 2',
    from: null,
    to: 'draft',
    trigger: { id: 'import', name: 'import' },
    guard: 'actor.is_staff',
    requiredPermission: 'orders.import_order',
  });

  return {
    states: [draft, pending, paid, cancelled],
    transitions: [create, importOrder, submit, pay, cancel, refund],
    initialStateIds: ['draft'],
    finalStateIds: ['paid', 'cancelled'],
    data: {},
  };
}

function requireElement<T extends Element>(
  selector: string,
  guard: (value: Element) => value is T,
): T {
  const found = document.querySelector(selector);
  if (found === null || !guard(found)) {
    throw new Error(`Missing element "${selector}".`);
  }
  return found;
}

function isEditor(value: Element): value is StateMachineEditorElement {
  return value instanceof StateMachineEditorElement;
}

function isHtml(value: Element): value is HTMLElement {
  return value instanceof HTMLElement;
}

function isInput(value: Element): value is HTMLInputElement {
  return value instanceof HTMLInputElement;
}

const editor = requireElement('#editor', isEditor);
const json = requireElement('#json', isHtml);
const log = requireElement('#log', isHtml);
const eventCount = requireElement('#event-count', isHtml);
const readOnlyToggle = requireElement('#readonly', isInput);

editor.sideEffectProvider = fetchSideEffectCatalog;
editor.actionProvider = fetchActionCatalog;
editor.guardValidator = validateGuard;
editor.value = exampleMachine();

let events = 0;

function renderJson(): void {
  json.textContent = JSON.stringify(editor.value, null, 2);
}

function addLogEntry(label: string, detail: string): void {
  events += 1;
  eventCount.textContent = String(events);
  const entry = document.createElement('li');
  const strong = document.createElement('b');
  strong.textContent = label;
  entry.append(strong, ` ${detail}`);
  log.prepend(entry);
  while (log.childElementCount > 40) {
    log.lastElementChild?.remove();
  }
}

editor.addEventListener('state-machine-change', (event: StateMachineChangeEvent) => {
  renderJson();
  if (event.detail.transient) {
    return; // Skip the intermediate frames of a drag: persist only committed changes.
  }
  addLogEntry(describeChange(event.detail.change), JSON.stringify(event.detail.change));
});

editor.addEventListener('state-machine-selection-change', (event: SelectionChangeEvent) => {
  const { selection } = event.detail;
  addLogEntry('Selection', selection === null ? 'none' : `${selection.kind} ${selection.id}`);
});

readOnlyToggle.addEventListener('change', () => {
  editor.readOnly = readOnlyToggle.checked;
});

requireElement('#fit', isHtml).addEventListener('click', () => editor.zoomToFit());

requireElement('#reset', isHtml).addEventListener('click', () => {
  editor.value = exampleMachine();
  renderJson();
});

requireElement('#clear', isHtml).addEventListener('click', () => {
  editor.value = {
    states: [],
    transitions: [],
    initialStateIds: [],
    finalStateIds: [],
    data: {},
  };
  renderJson();
});

renderJson();
// Fit once the stylesheets are applied, so the viewport is already measured.
window.addEventListener('load', () => {
  requestAnimationFrame(() => editor.zoomToFit());
});
