import { parseActionDefinitions } from '../model/parse.js';
import { emptyWaitingConfig, type WaitingConfig } from '../model/waiting.js';
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
import {
  DEFAULT_STRINGS,
  type EditorStrings,
  mergeStrings,
  type StringOverrides,
} from './strings.js';
import { dialogStyles } from './styles.js';
import { applyTheme, type EditorTheme, themeOf } from './theme.js';

/**
 * Everything the properties dialog can edit. A transition uses the trigger, the
 * guard, the permission and the order; a state uses the fan-out it waits on.
 * Both use the description.
 */
export interface PropertiesDraft {
  readonly trigger: TransitionTrigger | null;
  readonly guard: string;
  readonly requiredPermission: string;
  readonly description: string;
  /** Position among the edges leaving the same state; `-1` when not applicable. */
  readonly orderIndex: number;
  /** The batch a state waits on. Left at its defaults for a transition. */
  readonly waiting: WaitingConfig;
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
  /**
   * Wording of the fields and their hints. Anything left out stays in English;
   * left out entirely, whatever was assigned to `strings` stands.
   */
  readonly strings?: StringOverrides | undefined;
}

type DialogResolver = (result: PropertiesDraft | null) => void;

export function emptyPropertiesDraft(): PropertiesDraft {
  return {
    trigger: null,
    guard: '',
    requiredPermission: '',
    description: '',
    orderIndex: -1,
    waiting: emptyWaitingConfig(),
  };
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
  #strings: EditorStrings = DEFAULT_STRINGS;
  #previouslyFocused: Element | null = null;
  /** Bumped on every guard edit, so a slow validator cannot overwrite a newer verdict. */
  #guardToken = 0;
  /** Bumped on every render, so a catalog arriving late cannot fill a stale panel. */
  #actionsToken = 0;
  /** The pickers waiting for the action catalog, filled when it lands. */
  #actionFields: ((definitions: readonly ActionDefinition[]) => void)[] = [];

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
    // Both are written on open(), which is when the wording in force is known.
    this.#cancelButton = createButton({ className: 'button', parent: footer });
    this.#saveButton = createButton({ className: 'button button--primary', parent: footer });

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

  /**
   * The wording of the fields. The editor hands its own down when it opens the
   * dialog; a host driving the dialog on its own sets it here. Assigning a
   * partial set leaves every other string in English.
   */
  get strings(): EditorStrings {
    return this.#strings;
  }

  set strings(overrides: StringOverrides | undefined) {
    this.#strings = mergeStrings(overrides);
  }

  /** Opens the modal; resolves with the edited values, or `null` when cancelled. */
  open(options: PropertiesDialogOptions): Promise<PropertiesDraft | null> {
    this.#previouslyFocused = this.ownerDocument.activeElement;
    this.#draft = options.values;
    this.#readOnly = options.readOnly === true;
    if (options.icons !== undefined) {
      this.#icons = mergeIcons(options.icons);
    }
    if (options.strings !== undefined) {
      this.#strings = mergeStrings(options.strings);
    }
    this.#title.textContent = options.title;
    this.#subtitle.textContent = options.description;
    this.#saveButton.textContent = this.#strings.dialog.save;
    this.#saveButton.hidden = this.#readOnly;
    this.#cancelButton.textContent = this.#readOnly
      ? this.#strings.dialog.close
      : this.#strings.dialog.cancel;
    this.#setStatus('');
    this.#renderFields(options);
    this.#cancelButton.focus();

    return new Promise<PropertiesDraft | null>((resolve) => {
      this.#resolve = resolve;
    });
  }

  #renderFields(options: PropertiesDialogOptions): void {
    this.#body.replaceChildren();
    this.#actionsToken += 1;
    this.#actionFields = [];
    if (options.kind === 'transition') {
      this.#renderTrigger(options);
      this.#renderGuard(options.guardValidator);
      this.#renderPermission();
    }
    this.#renderDescription();
    if (options.kind === 'transition' && options.order !== undefined) {
      this.#renderOrder(options.order);
    }
    if (options.kind === 'state') {
      this.#renderWaiting(options);
    }
    // One load for every picker on the panel: two fields asking the same host
    // for the same catalog is one fetch too many.
    if (options.actionProvider !== undefined && this.#actionFields.length > 0) {
      void this.#loadActions(options.actionProvider);
    }
  }

  /** A picker when the host supplies a catalog, plain text when it does not. */
  #renderTrigger(options: PropertiesDialogOptions): void {
    const text = this.#strings.properties;
    const { control } = createField(this.#body, text.fieldTrigger, {
      name: 'trigger',
      ...(options.actionProvider === undefined ? { hint: text.triggerHint } : {}),
    });
    if (options.actionProvider === undefined) {
      const input = createElement('input', {
        className: 'field__input',
        parent: control,
        attrs: {
          'aria-label': text.fieldTrigger,
          'data-field': 'trigger',
          placeholder: text.triggerPlaceholder,
        },
      });
      input.value = this.#draft.trigger?.name ?? '';
      input.readOnly = this.#readOnly;
      input.addEventListener('input', () => {
        this.#draft = { ...this.#draft, trigger: triggerFromText(input.value) };
      });
      return;
    }
    const select = this.#createActionSelect(control, text.fieldTrigger, 'trigger', () => ({
      id: this.#draft.trigger?.id ?? '',
      name: this.#draft.trigger?.name ?? '',
    }));
    select.addEventListener('change', () => {
      this.#draft = { ...this.#draft, trigger: this.#triggerFor(select) };
    });
  }

  #triggerFor(select: HTMLSelectElement): TransitionTrigger | null {
    const option = select.selectedOptions[0];
    if (option === undefined || option.value === '') {
      return null;
    }
    return { id: option.value, name: option.textContent ?? option.value };
  }

  /**
   * A `<select>` over the action catalog, filled once the catalog arrives.
   *
   * `current` is read rather than passed, so the option standing for an action
   * the catalog has never heard of is rebuilt from whatever the draft holds by
   * then — a value retired server-side must not be silently dropped on save.
   */
  #createActionSelect(
    parent: ParentNode,
    label: string,
    field: string,
    current: () => { readonly id: string; readonly name: string },
  ): HTMLSelectElement {
    const select = createElement('select', {
      className: 'field__input',
      parent,
      attrs: { 'aria-label': label, 'data-field': field },
    });
    select.disabled = this.#readOnly;
    const fill = (definitions: readonly ActionDefinition[]): void => {
      const chosen = current();
      select.replaceChildren();
      createElement('option', {
        text: this.#strings.properties.triggerNone,
        attrs: { value: '' },
        parent: select,
      });
      const known = definitions.map((definition) => definition.id);
      const extra =
        chosen.id.length > 0 && !known.includes(chosen.id)
          ? [{ id: chosen.id, name: chosen.name.length > 0 ? chosen.name : chosen.id }]
          : [];
      for (const definition of [...definitions, ...extra]) {
        createElement('option', {
          text: definition.name,
          attrs: { value: definition.id },
          parent: select,
        });
      }
      select.value = chosen.id;
    };
    fill([]);
    this.#actionFields.push(fill);
    return select;
  }

  async #loadActions(provider: ActionProvider): Promise<void> {
    this.#actionsToken += 1;
    const token = this.#actionsToken;
    const fields = this.#actionFields;
    this.#setStatus(this.#strings.properties.actionsLoading);
    try {
      const result = parseActionDefinitions(await provider());
      if (token !== this.#actionsToken) {
        return;
      }
      if (!result.ok) {
        this.#setStatus(
          this.#strings.properties.actionsInvalid({ errors: result.errors.join(' ') }),
          true,
        );
        return;
      }
      for (const fill of fields) {
        fill(result.value);
      }
      this.#setStatus('');
    } catch (error) {
      if (token !== this.#actionsToken) {
        return;
      }
      const reason = error instanceof Error ? error.message : String(error);
      this.#setStatus(this.#strings.properties.actionsLoadFailed({ reason }), true);
    }
  }

  /**
   * The batch a state waits on: whether it waits at all, the action that closes
   * the wait, the machine the children run, and how long it is given.
   *
   * The three details stay editable while the toggle is off — turning the wait
   * off is not the same as forgetting how it was configured.
   */
  #renderWaiting(options: PropertiesDialogOptions): void {
    const text = this.#strings.waiting;
    createElement('h3', { className: 'section', parent: this.#body, text: text.section });

    const flag = createField(this.#body, text.fieldWaiting, {
      name: 'waiting',
      hint: text.waitingHint,
    });
    const toggle = createElement('input', {
      className: 'field__check',
      parent: flag.control,
      attrs: { 'aria-label': text.fieldWaiting, 'data-field': 'is-waiting' },
    });
    toggle.type = 'checkbox';
    toggle.checked = this.#draft.waiting.isWaiting;
    toggle.disabled = this.#readOnly;
    toggle.addEventListener('change', () => {
      this.#patchWaiting({ isWaiting: toggle.checked });
    });

    const join = createField(this.#body, text.fieldJoin, { name: 'join', hint: text.joinHint });
    if (options.actionProvider === undefined) {
      const input = this.#waitingInput(
        join.control,
        'join-action',
        text.fieldJoin,
        text.joinPlaceholder,
        () => this.#draft.waiting.joinAction,
      );
      input.addEventListener('input', () => {
        this.#patchWaiting({ joinAction: input.value.trim() });
      });
    } else {
      const select = this.#createActionSelect(join.control, text.fieldJoin, 'join-action', () => ({
        id: this.#draft.waiting.joinAction,
        name: this.#draft.waiting.joinAction,
      }));
      select.addEventListener('change', () => {
        this.#patchWaiting({ joinAction: select.value });
      });
    }

    const child = createField(this.#body, text.fieldChild, { name: 'child', hint: text.childHint });
    const childInput = this.#waitingInput(
      child.control,
      'child-machine',
      text.fieldChild,
      text.childPlaceholder,
      () => this.#draft.waiting.childMachine,
    );
    childInput.addEventListener('input', () => {
      this.#patchWaiting({ childMachine: childInput.value.trim() });
    });

    const timeout = createField(this.#body, text.fieldTimeout, {
      name: 'timeout',
      hint: text.timeoutHint,
    });
    const timeoutInput = this.#waitingInput(
      timeout.control,
      'timeout',
      text.fieldTimeout,
      text.timeoutPlaceholder,
      () => this.#draft.waiting.timeout,
    );
    timeoutInput.addEventListener('input', () => {
      this.#patchWaiting({ timeout: timeoutInput.value.trim() });
    });
  }

  #waitingInput(
    parent: ParentNode,
    field: string,
    label: string,
    placeholder: string,
    value: () => string,
  ): HTMLInputElement {
    const input = createElement('input', {
      className: 'field__input',
      parent,
      attrs: { 'aria-label': label, 'data-field': field, placeholder },
    });
    input.value = value();
    input.readOnly = this.#readOnly;
    return input;
  }

  #patchWaiting(patch: Partial<WaitingConfig>): void {
    this.#draft = { ...this.#draft, waiting: { ...this.#draft.waiting, ...patch } };
  }

  #renderGuard(validator: GuardValidator | undefined): void {
    const text = this.#strings.properties;
    const { control } = createField(this.#body, text.fieldGuard, { name: 'guard' });
    const input = createElement('textarea', {
      className: 'field__input field__input--area',
      parent: control,
      attrs: {
        'aria-label': text.guardLabel,
        'data-field': 'guard',
        rows: '2',
        placeholder: text.guardPlaceholder,
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
    const text = this.#strings.properties;
    const { control } = createField(this.#body, text.fieldPermission, { name: 'permission' });
    const input = createElement('input', {
      className: 'field__input',
      parent: control,
      attrs: {
        'aria-label': text.fieldPermission,
        'data-field': 'permission',
        placeholder: text.permissionPlaceholder,
      },
    });
    input.value = this.#draft.requiredPermission;
    input.readOnly = this.#readOnly;
    input.addEventListener('input', () => {
      this.#draft = { ...this.#draft, requiredPermission: input.value };
    });
  }

  #renderDescription(): void {
    const label = this.#strings.properties.fieldDescription;
    const { control } = createField(this.#body, label, { name: 'description' });
    const input = createElement('textarea', {
      className: 'field__input field__input--area',
      parent: control,
      attrs: { 'aria-label': label, 'data-field': 'description', rows: '3' },
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
    const text = this.#strings.properties;
    const { control } = createField(this.#body, text.fieldOrder, {
      name: 'order',
      hint: text.orderHint({ source: order.sourceLabel }),
    });
    const readout = createElement('span', { className: 'order__readout', parent: control });
    const up = createIconButton(this.#icons, 'moveUp', {
      className: 'order__move order__move--up',
      parent: control,
      attrs: { 'aria-label': text.moveUp },
    });
    const down = createIconButton(this.#icons, 'moveDown', {
      className: 'order__move order__move--down',
      parent: control,
      attrs: { 'aria-label': text.moveDown },
    });
    const refresh = (): void => {
      readout.textContent = text.orderReadout({
        index: this.#draft.orderIndex + 1,
        total: order.total,
      });
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
