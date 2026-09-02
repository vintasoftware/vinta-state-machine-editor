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
  type IconOverrides,
  type JsonObject,
  type SelectionChangeEvent,
  type SideEffectDefinition,
  type StateMachine,
  type StateMachineChangeEvent,
  StateMachineEditorElement,
  type ThemeChangeEvent,
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
  {
    id: 'import.finish',
    name: 'import.finish',
    description: 'Every child of the import batch has finished',
  },
];

/*
 * Two icon sets, to show the two forms an icon takes beyond the defaults.
 * Both are *partial*: `icons` replaces only what it names, so a set that left
 * `link` out would keep drawing the default arrow for it.
 */

/**
 * Strings are drawn as plain text — never parsed as markup — so an emoji set is
 * one object literal and nothing else.
 */
const EMOJI_ICONS: IconOverrides = {
  undo: '↩️',
  redo: '↪️',
  zoomOut: '🔍',
  zoomIn: '🔎',
  lightTheme: '🌞',
  darkTheme: '🌜',
  rename: '📝',
  properties: '🎛️',
  remove: '❌',
  confirm: '✅',
  cancel: '🚫',
  link: '🔗',
  initial: '🟢',
  final: '🏁',
  add: '➕',
  dragHandle: '↕️',
  params: '🧩',
  moveUp: '🔼',
  moveDown: '🔽',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * One stroked 24×24 icon, as a function returning a fresh node per button.
 *
 * A plain `<svg>` node would do just as well — the editor copies a node it is
 * given, once per button that carries it — but a factory is what an icon set
 * bound to a framework's render function looks like, so that is the form shown
 * here. `currentColor` is what makes these inherit each button's own colour,
 * hover and disabled states included.
 */
function strokeIcon(shapes: string): () => SVGSVGElement {
  return () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = shapes;
    return svg;
  };
}

const SVG_ICONS: IconOverrides = {
  undo: strokeIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  redo: strokeIcon('<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
  zoomOut: strokeIcon('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>'),
  zoomIn: strokeIcon('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6M11 8v6"/>'),
  lightTheme: strokeIcon(
    '<circle cx="12" cy="12" r="4"/>' +
      '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2' +
      'M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ),
  darkTheme: strokeIcon('<path d="M20 14A8.1 8.1 0 0 1 10 4a8 8 0 1 0 10 10z"/>'),
  rename: strokeIcon('<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m14 6 4 4"/>'),
  properties: strokeIcon(
    '<path d="M4 7h8M17 7h3M4 17h3M12 17h8"/>' +
      '<circle cx="14.5" cy="7" r="2.2"/><circle cx="9.5" cy="17" r="2.2"/>',
  ),
  remove: strokeIcon('<path d="M6 6 18 18M18 6 6 18"/>'),
  confirm: strokeIcon('<path d="m5 13 4 4L19 7"/>'),
  cancel: strokeIcon('<path d="M6 6 18 18M18 6 6 18"/>'),
  link: strokeIcon('<path d="M4 12h14"/><path d="m13 6 6 6-6 6"/>'),
  initial: strokeIcon('<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>'),
  final: strokeIcon(
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  ),
  add: strokeIcon('<path d="M12 5v14M5 12h14"/>'),
  dragHandle: strokeIcon(
    '<path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" stroke-width="2.6"/>',
  ),
  params: strokeIcon(
    '<path d="M9 4c-2 0-2.5 1-2.5 2.5v2C6.5 10 5.5 11 4 12c1.5 1 2.5 2 2.5 3.5v2C6.5 19 7 20 9 20"/>' +
      '<path d="M15 4c2 0 2.5 1 2.5 2.5v2c0 1.5 1 2.5 2.5 3.5-1.5 1-2.5 2-2.5 3.5v2c0 1.5-.5 2.5-2.5 2.5"/>',
  ),
  moveUp: strokeIcon('<path d="m6 15 6-6 6 6"/>'),
  moveDown: strokeIcon('<path d="m6 9 6 6 6-6"/>'),
};

const ICON_SETS: Readonly<Record<string, IconOverrides | undefined>> = {
  default: undefined,
  emoji: EMOJI_ICONS,
  svg: SVG_ICONS,
};

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
  /*
   * A state that fans work out to child records and waits for the batch, so the
   * waiting band, the fan-out stub and the decision card below are all visible
   * on the demo canvas without anybody having to build them by hand.
   */
  const processing = {
    ...createState({
      id: 'processing',
      name: 'Processing items',
      position: { x: 1020, y: 860 },
      color: 'info',
      data: {
        is_waiting: true,
        join_action: 'import.finish',
        child_machine: 'import_file.status',
        timeout: 'PT2H',
      },
    }),
    onEnter: { before: [effect('audit-log', 'e-audit-3')], after: [] },
    onLeave: { before: [], after: [] },
  };

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

  /*
   * Two transitions between the same pair, in opposite directions, to show the
   * fanning — and, since `paid` is final and the engine refuses to leave a final
   * state, one card carrying a validation stripe.
   */
  const refund = {
    ...createTransition({ id: 'refund', name: 'refund', from: 'paid', to: 'pending' }),
    effects: { before: [], after: [effect('refund', 'e-refund-2')] },
  };

  const startImport = createTransition({
    id: 'start-import',
    name: 'start import',
    from: 'pending',
    to: 'processing',
    trigger: { id: 'import', name: 'import' },
  });

  /*
   * Four edges leaving one state under one action: the editor draws them as a
   * single decision card, tried top to bottom, with the unguarded one as the
   * `else` row at the bottom.
   */
  const finish = { id: 'import.finish', name: 'import.finish' };
  const finishTimedOut = createTransition({
    id: 'finish-timed-out',
    name: 'timed out',
    from: 'processing',
    to: 'cancelled',
    trigger: finish,
    guard: 'reason == "timeout"',
  });
  const finishCompleted = createTransition({
    id: 'finish-completed',
    name: 'completed',
    from: 'processing',
    to: 'paid',
    trigger: finish,
    guard: 'failed == 0',
  });
  const finishPartial = createTransition({
    id: 'finish-partial',
    name: 'partially done',
    from: 'processing',
    to: 'pending',
    trigger: finish,
    guard: 'succeeded > 0',
  });
  const finishFailed = createTransition({
    id: 'finish-failed',
    name: 'failed',
    from: 'processing',
    to: 'cancelled',
    trigger: finish,
  });

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
    // `paid` and `cancelled` count towards the batch a parent record waits on.
    // Both are final, so their report is drawn as the enter half alone.
    states: [
      draft,
      pending,
      processing,
      { ...paid, data: { counts_as: 'success' } },
      { ...cancelled, data: { counts_as: 'failure' } },
    ],
    transitions: [
      create,
      importOrder,
      submit,
      pay,
      cancel,
      refund,
      startImport,
      finishTimedOut,
      finishCompleted,
      finishPartial,
      finishFailed,
    ],
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

function isSelect(value: Element): value is HTMLSelectElement {
  return value instanceof HTMLSelectElement;
}

const editor = requireElement('#editor', isEditor);
const json = requireElement('#json', isHtml);
const log = requireElement('#log', isHtml);
const eventCount = requireElement('#event-count', isHtml);
const readOnlyToggle = requireElement('#readonly', isInput);
const themePicker = requireElement('#theme', isSelect);
const iconPicker = requireElement('#icons', isSelect);

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

/*
 * The scheme travels both ways: the picker sets it, and the editor's own
 * toolbar button reports back through `state-machine-theme-change`. A host that
 * persists the choice would save it here; this page just paints its own chrome
 * to match, so the canvas and the page around it never disagree.
 */
themePicker.addEventListener('change', () => {
  editor.setAttribute('theme', themePicker.value);
});

editor.addEventListener('state-machine-theme-change', (event: ThemeChangeEvent) => {
  const { theme } = event.detail;
  themePicker.value = theme;
  document.documentElement.setAttribute('data-theme', theme);
  addLogEntry('Theme', theme);
});

themePicker.value = editor.theme;
document.documentElement.setAttribute('data-theme', editor.theme);

/*
 * Swapping the whole set is one assignment, at any time: the toolbar was built
 * in the element's constructor and the cards outlive every render, but each
 * icon remembers which one it is and is redrawn where it stands.
 */
iconPicker.addEventListener('change', () => {
  const icons = ICON_SETS[iconPicker.value];
  editor.icons = icons;
  /*
   * One marker is not an icon: the `{ }` a chip shows when its list carries
   * parameters is drawn in CSS, which can hold text and nothing else. It
   * follows the `params` icon while that icon is a string, and falls back to
   * the default when the set hands the editor a node instead.
   */
  const marker = icons?.params;
  if (typeof marker === 'string') {
    editor.style.setProperty('--sme-params-marker', `'${marker}'`);
  } else {
    editor.style.removeProperty('--sme-params-marker');
  }
});

requireElement('#fit', isHtml).addEventListener('click', () => editor.zoomToFit());

requireElement('#reset', isHtml).addEventListener('click', () => {
  editor.value = exampleMachine();
  renderJson();
});

// What a graph authored outside this editor looks like: every card on the
// origin. Assigning it is enough — the editor lays it out before it draws it.
requireElement('#unpositioned', isHtml).addEventListener('click', () => {
  const example = exampleMachine();
  editor.value = {
    ...example,
    states: example.states.map((state) => ({ ...state, position: { x: 0, y: 0 } })),
    transitions: example.transitions.map((transition) => ({
      ...transition,
      labelOffset: { x: 0, y: 0 },
    })),
  };
  renderJson();
  editor.zoomToFit();
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
