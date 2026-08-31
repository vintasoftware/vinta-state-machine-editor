import { parseActionDefinitions } from '../model/parse.js';
import type {
  ActionDefinition,
  ActionProvider,
  GuardValidator,
  TransitionTrigger,
} from '../types.js';
import { createButton, createElement, focusableElements, isHtmlElement } from './dom.js';
import {
  createIconButton,
  DEFAULT_ICONS,
  type EditorIcons,
  type IconOverrides,
  mergeIcons,
} from './icons.js';
import { dialogStyles } from './styles.js';
import { applyTheme, type EditorTheme, themeOf } from './theme.js';

/** Everything the properties dialog can edit. A state only uses `description`. */
export interface PropertiesDraft {
  readonly trigger: TransitionTrigger | null;
  readonly guard: string;
  readonly requiredPermission: string;
  readonly description: string;
  /** Position among the edges leaving the same state; `-1` when not applicable. */
  readonly orderIndex: number;
}

/** Where the transition sits among its siblings, and what to call that group. */
export interface OrderContext {
  readonly index: number;
  readonly total: number;
  /** Name of the source state, or the start pseudo-node. */
  readonly sourceLabel: string;
}

export interface PropertiesDialogOptions {
  readonly title: string;
  readonly description: string;
  readonly kind: 'state' | 'transition';
  readonly values: PropertiesDraft;
  readonly actionProvider?: ActionProvider | undefined;
  readonly guardValidator?: GuardValidator | undefined;
  readonly order?: OrderContext | undefined;
  readonly readOnly?: boolean;
  /**
   * Glyphs for the order controls. Anything left out keeps its default; left
   * out entirely, whatever was assigned to `icons` stands.
   */
  readonly icons?: IconOverrides | undefined;
}

type DialogResolver = (result: PropertiesDraft | null) => void;

const NO_TRIGGER_LABEL = 'No trigger';

export function emptyPropertiesDraft(): PropertiesDraft {
  return { trigger: null, guard: '', requiredPermission: '', description: '', orderIndex: -1 };
}

/** Reads a free text trigger back into the denormalized pair the model stores. */
export function triggerFromText(text: string): TransitionTrigger | null {
  const trimmed = text.trim();
  return trimmed.length === 0 ? null : { id: trimmed, name: trimmed };
}

interface FieldParts {
  readonly row: HTMLElement;
  readonly control: HTMLElement;
}

function createField(
  parent: ParentNode,
  label: string,
  options: { readonly name: string; readonly hint?: string },
): FieldParts {
  const row = createElement('div', {
    className: 'field',
    parent,
    attrs: { 'data-field-row': options.name },
  });
  createElement('span', { className: 'field__label', parent: row, text: label });
  const control = createElement('div', { className: 'field__control', parent: row });
  if (options.hint !== undefined) {
    createElement('p', { className: 'field__hint', parent: row, text: options.hint });
  }
  return { row, control };
}

/**
 * Modal editing the first-class attributes of one state or transition.
 *
 * The trigger catalog and the guard language both belong to the host: this
 * dialog picks a trigger out of whatever the {@link ActionProvider} returns and
 * shows whatever a {@link GuardValidator} says, and interprets neither itself.
 */
export class PropertiesDialogElement extends HTMLElement {
  static readonly tagName = 'state-machine-properties-dialog';

  readonly #shadow: ShadowRoot;
  readonly #backdrop: HTMLElement;
  readonly #panel: HTMLElement;
  readonly #title: HTMLElement;
  readonly #subtitle: HTMLElement;
  readonly #body: HTMLElement;
  readonly #status: HTMLElement;
  readonly #saveButton: HTMLButtonElement;
  readonly #cancelButton: HTMLButtonElement;

  #draft: PropertiesDraft = emptyPropertiesDraft();
  #resolve: DialogResolver | undefined;
  #readOnly = false;
  #icons: EditorIcons = DEFAULT_ICONS;
  #previouslyFocused: Element | null = null;
  /** Bumped on every guard edit, so a slow validator cannot overwrite a newer verdict. */
  #guardToken = 0;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.append(createElement('style', { text: dialogStyles }));

    this.#backdrop = createElement('div', { className: 'backdrop', parent: this.#shadow });
    this.#panel = createElement('div', {
      className: 'panel',
      parent: this.#backdrop,
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'properties-title' },
    });

    const header = createElement('header', { parent: this.#panel });
    this.#title = createElement('h2', {
      className: 'title',
      parent: header,
      attrs: { id: 'properties-title' },
    });
    this.#subtitle = createElement('p', { className: 'subtitle', parent: header });

    this.#body = createElement('div', { className: 'fields', parent: this.#panel });
    this.#status = createElement('p', { className: 'status', parent: this.#panel });

    const footer = createElement('footer', { className: 'footer', parent: this.#panel });
    this.#cancelButton = createButton({ className: 'button', parent: footer, text: 'Cancel' });
    this.#saveButton = createButton({
      className: 'button button--primary',
      parent: footer,
      text: 'Save',
    });

    this.#cancelButton.addEventListener('click', () => this.#finish(null));
    this.#saveButton.addEventListener('click', () => this.#finish(this.#draft));
    this.#backdrop.addEventListener('pointerdown', this.#onBackdropPointerDown);
    this.#panel.addEventListener('keydown', this.#onKeyDown);
  }

  /** Current draft, exposed for testing and host inspection. */
  get values(): PropertiesDraft {
    return this.#draft;
  }

  /**
   * The colour scheme, reflected to the `theme` attribute. The editor hands its
   * own down when it opens the dialog; a host driving the dialog on its own
   * sets it here. Defaults to dark, like the editor.
   */
  get theme(): EditorTheme {
    return themeOf(this);
  }

  set theme(value: EditorTheme) {
    applyTheme(this, value);
  }

  /**
   * The glyphs the order controls are drawn with. The editor hands its own down
   * when it opens the dialog; a host driving the dialog on its own sets them
   * here. Assigning a partial set leaves every other icon at its default.
   */
  get icons(): EditorIcons {
    return this.#icons;
  }

  set icons(overrides: IconOverrides | undefined) {
    this.#icons = mergeIcons(overrides);
  }

  /** Opens the modal; resolves with the edited values, or `null` when cancelled. */
  open(options: PropertiesDialogOptions): Promise<PropertiesDraft | null> {
    this.#previouslyFocused = this.ownerDocument.activeElement;
    this.#draft = options.values;
    this.#readOnly = options.readOnly === true;
    if (options.icons !== undefined) {
      this.#icons = mergeIcons(options.icons);
    }
    this.#title.textContent = options.title;
    this.#subtitle.textContent = options.description;
    this.#saveButton.hidden = this.#readOnly;
    this.#cancelButton.textContent = this.#readOnly ? 'Close' : 'Cancel';
    this.#setStatus('');
    this.#renderFields(options);
    this.#cancelButton.focus();

    return new Promise<PropertiesDraft | null>((resolve) => {
      this.#resolve = resolve;
    });
  }

  #renderFields(options: PropertiesDialogOptions): void {
    this.#body.replaceChildren();
    if (options.kind === 'transition') {
      this.#renderTrigger(options);
      this.#renderGuard(options.guardValidator);
      this.#renderPermission();
    }
    this.#renderDescription();
    if (options.kind === 'transition' && options.order !== undefined) {
      this.#renderOrder(options.order);
    }
  }

  /** A picker when the host supplies a catalog, plain text when it does not. */
  #renderTrigger(options: PropertiesDialogOptions): void {
    const { control } = createField(this.#body, 'Trigger', {
      name: 'trigger',
      ...(options.actionProvider === undefined
        ? { hint: 'No action catalog was provided, so the trigger is free text.' }
        : {}),
    });
    if (options.actionProvider === undefined) {
      const input = createElement('input', {
        className: 'field__input',
        parent: control,
        attrs: { 'aria-label': 'Trigger', 'data-field': 'trigger', placeholder: 'e.g. pay' },
      });
      input.value = this.#draft.trigger?.name ?? '';
      input.readOnly = this.#readOnly;
      input.addEventListener('input', () => {
        this.#draft = { ...this.#draft, trigger: triggerFromText(input.value) };
      });
      return;
    }
    const select = createElement('select', {
      className: 'field__input',
      parent: control,
      attrs: { 'aria-label': 'Trigger', 'data-field': 'trigger' },
    });
    select.disabled = this.#readOnly;
    this.#renderTriggerOptions(select, []);
    select.addEventListener('change', () => {
      this.#draft = { ...this.#draft, trigger: this.#triggerFor(select) };
    });
    void this.#loadActions(options.actionProvider, select);
  }

  #triggerFor(select: HTMLSelectElement): TransitionTrigger | null {
    const option = select.selectedOptions[0];
    if (option === undefined || option.value === '') {
      return null;
    }
    return { id: option.value, name: option.textContent ?? option.value };
  }

  /**
   * The current trigger is always offered, even when the catalog does not know
   * it — an action retired server-side must not be silently dropped on save.
   */
  #renderTriggerOptions(select: HTMLSelectElement, definitions: readonly ActionDefinition[]): void {
    select.replaceChildren();
    const current = this.#draft.trigger;
    createElement('option', { text: NO_TRIGGER_LABEL, attrs: { value: '' }, parent: select });
    const known = definitions.map((definition) => definition.id);
    const extra =
      current !== null && !known.includes(current.id)
        ? [{ id: current.id, name: current.name }]
        : [];
    for (const definition of [...definitions, ...extra]) {
      createElement('option', {
        text: definition.name,
        attrs: { value: definition.id },
        parent: select,
      });
    }
    select.value = current?.id ?? '';
  }

  async #loadActions(provider: ActionProvider, select: HTMLSelectElement): Promise<void> {
    this.#setStatus('Loading actions…');
    try {
      const result = parseActionDefinitions(await provider());
      if (!result.ok) {
        this.#setStatus(`Invalid action catalog: ${result.errors.join(' ')}`, true);
        return;
      }
      if (!select.isConnected) {
        return;
      }
      this.#renderTriggerOptions(select, result.value);
      this.#setStatus('');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.#setStatus(`Could not load actions: ${reason}`, true);
    }
  }

  #renderGuard(validator: GuardValidator | undefined): void {
    const { control } = createField(this.#body, 'Guard', { name: 'guard' });
    const input = createElement('textarea', {
      className: 'field__input field__input--area',
      parent: control,
      attrs: {
        'aria-label': 'Guard expression',
        'data-field': 'guard',
        rows: '2',
        placeholder: 'Condition the host evaluates',
      },
    });
    input.value = this.#draft.guard;
    input.readOnly = this.#readOnly;
    const errors = createElement('ul', { className: 'field__errors', parent: control });
    errors.hidden = true;
    input.addEventListener('input', () => {
      this.#draft = { ...this.#draft, guard: input.value };
      void this.#validateGuard(validator, input.value, errors);
    });
  }

  async #validateGuard(
    validator: GuardValidator | undefined,
    expression: string,
    errors: HTMLElement,
  ): Promise<void> {
    if (validator === undefined) {
      return;
    }
    this.#guardToken += 1;
    const token = this.#guardToken;
    const result = await validator(expression);
    if (token !== this.#guardToken || !errors.isConnected) {
      return;
    }
    errors.replaceChildren();
    errors.hidden = result.ok;
    if (result.ok) {
      return;
    }
    for (const message of result.errors) {
      createElement('li', { className: 'field__error', parent: errors, text: message });
    }
  }

  #renderPermission(): void {
    const { control } = createField(this.#body, 'Required permission', { name: 'permission' });
    const input = createElement('input', {
      className: 'field__input',
      parent: control,
      attrs: {
        'aria-label': 'Required permission',
        'data-field': 'permission',
        placeholder: 'e.g. orders.pay',
      },
    });
    input.value = this.#draft.requiredPermission;
    input.readOnly = this.#readOnly;
    input.addEventListener('input', () => {
      this.#draft = { ...this.#draft, requiredPermission: input.value };
    });
  }

  #renderDescription(): void {
    const { control } = createField(this.#body, 'Description', { name: 'description' });
    const input = createElement('textarea', {
      className: 'field__input field__input--area',
      parent: control,
      attrs: { 'aria-label': 'Description', 'data-field': 'description', rows: '3' },
    });
    input.value = this.#draft.description;
    input.readOnly = this.#readOnly;
    input.addEventListener('input', () => {
      this.#draft = { ...this.#draft, description: input.value };
    });
  }

  /**
   * Order is position, not a number stored on the edge: moving one edge moves it
   * among its siblings and everything else keeps its place.
   */
  #renderOrder(order: OrderContext): void {
    const { control } = createField(this.#body, 'Order', {
      name: 'order',
      hint: `Edges leaving ${order.sourceLabel} are evaluated in this order.`,
    });
    const readout = createElement('span', { className: 'order__readout', parent: control });
    const up = createIconButton(this.#icons, 'moveUp', {
      className: 'order__move order__move--up',
      parent: control,
      attrs: { 'aria-label': 'Move earlier' },
    });
    const down = createIconButton(this.#icons, 'moveDown', {
      className: 'order__move order__move--down',
      parent: control,
      attrs: { 'aria-label': 'Move later' },
    });
    const refresh = (): void => {
      readout.textContent = `${this.#draft.orderIndex + 1} of ${order.total}`;
      up.disabled = this.#readOnly || this.#draft.orderIndex <= 0;
      down.disabled = this.#readOnly || this.#draft.orderIndex >= order.total - 1;
    };
    const move = (delta: number): void => {
      const next = this.#draft.orderIndex + delta;
      if (next < 0 || next >= order.total) {
        return;
      }
      this.#draft = { ...this.#draft, orderIndex: next };
      refresh();
    };
    up.addEventListener('click', () => move(-1));
    down.addEventListener('click', () => move(1));
    refresh();
  }

  #setStatus(message: string, isError = false): void {
    this.#status.textContent = message;
    this.#status.classList.toggle('is-error', isError);
  }

  #finish(result: PropertiesDraft | null): void {
    const resolve = this.#resolve;
    this.#resolve = undefined;
    this.dispatchEvent(new CustomEvent('dialog-close', { detail: { saved: result !== null } }));
    if (this.#previouslyFocused !== null && isHtmlElement(this.#previouslyFocused)) {
      this.#previouslyFocused.focus();
    }
    resolve?.(result);
  }

  #onBackdropPointerDown = (event: PointerEvent): void => {
    if (event.target === this.#backdrop) {
      this.#finish(null);
    }
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.#finish(null);
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = focusableElements(this.#panel);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    const active = this.#shadow.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
