import { moveItem } from '../model/array.js';
import { createSideEffect } from '../model/machine.js';
import { parseSideEffectDefinitions } from '../model/parse.js';
import type { SideEffect, SideEffectDefinition, SideEffectProvider } from '../types.js';
import { createButton, createElement, focusableElements, isHtmlElement } from './dom.js';
import { ReorderController } from './reorder.js';
import { dialogStyles } from './styles.js';

export interface SideEffectsDialogOptions {
  readonly title: string;
  readonly description: string;
  readonly effects: readonly SideEffect[];
  readonly provider?: SideEffectProvider | undefined;
  readonly readOnly?: boolean;
}

type DialogResolver = (result: readonly SideEffect[] | null) => void;

const DEFAULT_ADD_PLACEHOLDER = 'Select a side effect…';

/**
 * Modal listing every side effect of a list, in order. Supports adding from the
 * injected catalog, removing, and reordering by drag & drop or keyboard.
 */
export class SideEffectsDialogElement extends HTMLElement {
  static readonly tagName = 'state-machine-side-effects-dialog';

  readonly #shadow: ShadowRoot;
  readonly #backdrop: HTMLElement;
  readonly #panel: HTMLElement;
  readonly #title: HTMLElement;
  readonly #subtitle: HTMLElement;
  readonly #list: HTMLElement;
  readonly #empty: HTMLElement;
  readonly #select: HTMLSelectElement;
  readonly #addButton: HTMLButtonElement;
  readonly #status: HTMLElement;
  readonly #saveButton: HTMLButtonElement;
  readonly #cancelButton: HTMLButtonElement;
  readonly #reorder: ReorderController;

  #draft: readonly SideEffect[] = [];
  #definitions: readonly SideEffectDefinition[] = [];
  #resolve: DialogResolver | undefined;
  #readOnly = false;
  #previouslyFocused: Element | null = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.append(createElement('style', { text: dialogStyles }));

    this.#backdrop = createElement('div', { className: 'backdrop', parent: this.#shadow });
    this.#panel = createElement('div', {
      className: 'panel',
      parent: this.#backdrop,
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title' },
    });

    const header = createElement('header', { parent: this.#panel });
    this.#title = createElement('h2', {
      className: 'title',
      parent: header,
      attrs: { id: 'dialog-title' },
    });
    this.#subtitle = createElement('p', { className: 'subtitle', parent: header });

    this.#list = createElement('ol', {
      className: 'list',
      parent: this.#panel,
      attrs: { 'aria-label': 'Side effects, in execution order' },
    });
    this.#empty = createElement('p', {
      className: 'empty',
      parent: this.#panel,
      text: 'No side effects yet.',
    });

    const add = createElement('div', { className: 'add', parent: this.#panel });
    this.#select = createElement('select', {
      parent: add,
      attrs: { 'aria-label': 'Side effect to add' },
    });
    this.#addButton = createButton({ className: 'button', parent: add, text: 'Add' });
    this.#status = createElement('p', { className: 'status', parent: this.#panel });

    const footer = createElement('footer', { className: 'footer', parent: this.#panel });
    this.#cancelButton = createButton({ className: 'button', parent: footer, text: 'Cancel' });
    this.#saveButton = createButton({
      className: 'button button--primary',
      parent: footer,
      text: 'Save',
    });

    this.#reorder = new ReorderController({
      list: this.#list,
      rowSelector: '.row',
      handleSelector: '.row__handle',
      onReorder: (from, to) => {
        this.#draft = moveItem(this.#draft, from, to);
        this.#renderList();
      },
    });

    this.#addButton.addEventListener('click', this.#onAdd);
    this.#cancelButton.addEventListener('click', () => this.#finish(null));
    this.#saveButton.addEventListener('click', () => this.#finish(this.#draft));
    this.#backdrop.addEventListener('pointerdown', this.#onBackdropPointerDown);
    this.#panel.addEventListener('keydown', this.#onKeyDown);
  }

  disconnectedCallback(): void {
    this.#reorder.destroy();
  }

  /** Current draft, exposed for testing and host inspection. */
  get effects(): readonly SideEffect[] {
    return this.#draft;
  }

  /** Opens the modal; resolves with the new list, or `null` when cancelled. */
  open(options: SideEffectsDialogOptions): Promise<readonly SideEffect[] | null> {
    this.#previouslyFocused = this.ownerDocument.activeElement;
    this.#draft = [...options.effects];
    this.#readOnly = options.readOnly === true;
    this.#title.textContent = options.title;
    this.#subtitle.textContent = options.description;
    this.#addButton.disabled = true;
    this.#select.disabled = this.#readOnly;
    this.#saveButton.hidden = this.#readOnly;
    this.#cancelButton.textContent = this.#readOnly ? 'Close' : 'Cancel';
    this.#renderList();
    this.#loadCatalog(options.provider);
    this.#cancelButton.focus();

    return new Promise<readonly SideEffect[] | null>((resolve) => {
      this.#resolve = resolve;
    });
  }

  #finish(result: readonly SideEffect[] | null): void {
    const resolve = this.#resolve;
    this.#resolve = undefined;
    this.dispatchEvent(new CustomEvent('dialog-close', { detail: { saved: result !== null } }));
    if (this.#previouslyFocused !== null && isHtmlElement(this.#previouslyFocused)) {
      this.#previouslyFocused.focus();
    }
    resolve?.(result);
  }

  #setStatus(message: string, isError = false): void {
    this.#status.textContent = message;
    this.#status.classList.toggle('is-error', isError);
  }

  async #loadCatalog(provider: SideEffectProvider | undefined): Promise<void> {
    this.#select.replaceChildren();
    if (provider === undefined) {
      this.#setStatus('No side effect catalog was provided.', true);
      return;
    }
    if (this.#readOnly) {
      this.#setStatus('');
      return;
    }
    this.#setStatus('Loading side effects…');
    try {
      const result = parseSideEffectDefinitions(await provider());
      if (!result.ok) {
        this.#setStatus(`Invalid side effect catalog: ${result.errors.join(' ')}`, true);
        return;
      }
      this.#definitions = result.value;
      this.#renderCatalog();
      this.#setStatus('');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.#setStatus(`Could not load side effects: ${reason}`, true);
    }
  }

  #renderCatalog(): void {
    this.#select.replaceChildren();
    const placeholder = createElement('option', {
      text: DEFAULT_ADD_PLACEHOLDER,
      attrs: { value: '' },
      parent: this.#select,
    });
    placeholder.selected = true;
    for (const definition of this.#definitions) {
      createElement('option', {
        text:
          definition.description === undefined
            ? definition.name
            : `${definition.name} — ${definition.description}`,
        attrs: { value: definition.id },
        parent: this.#select,
      });
    }
    this.#addButton.disabled = this.#definitions.length === 0;
  }

  #renderList(focusIndex?: number): void {
    this.#list.replaceChildren();
    this.#empty.hidden = this.#draft.length > 0;

    this.#draft.forEach((effect, index) => {
      const row = createElement('li', {
        className: 'row',
        parent: this.#list,
        attrs: { 'data-index': String(index), 'data-effect-id': effect.id },
      });
      const handle = createButton({
        className: 'row__handle',
        parent: row,
        text: '⠿',
        attrs: {
          'aria-label': `Reorder ${effect.name}. Position ${index + 1} of ${this.#draft.length}. Use Alt with arrow keys to move.`,
          title: 'Drag to reorder, or press Alt + Arrow Up/Down',
          'data-handle-index': String(index),
        },
      });
      handle.disabled = this.#readOnly;
      handle.addEventListener('keydown', this.#onHandleKeyDown);

      createElement('span', { className: 'row__order', parent: row, text: `${index + 1}` });
      createElement('span', { className: 'row__name', parent: row, text: effect.name });

      const remove = createButton({
        className: 'row__remove',
        parent: row,
        text: '✕',
        attrs: { 'aria-label': `Remove ${effect.name}` },
      });
      remove.disabled = this.#readOnly;
      remove.addEventListener('click', () => {
        this.#draft = this.#draft.filter((item) => item.id !== effect.id);
        this.#renderList();
      });

      if (focusIndex === index) {
        handle.focus();
      }
    });
  }

  #move(from: number, to: number): void {
    if (to < 0 || to >= this.#draft.length) {
      return;
    }
    this.#draft = moveItem(this.#draft, from, to);
    this.#renderList(to);
  }

  #onHandleKeyDown = (event: KeyboardEvent): void => {
    if (!event.altKey || this.#readOnly) {
      return;
    }
    const target = event.currentTarget;
    if (!isHtmlElement(target)) {
      return;
    }
    const raw = target.getAttribute('data-handle-index');
    const index = raw === null ? Number.NaN : Number.parseInt(raw, 10);
    if (Number.isNaN(index)) {
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.#move(index, index - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.#move(index, index + 1);
    }
  };

  #onAdd = (): void => {
    const definition = this.#definitions.find((item) => item.id === this.#select.value);
    if (definition === undefined) {
      this.#setStatus('Pick a side effect to add.', true);
      return;
    }
    this.#draft = [...this.#draft, createSideEffect(definition)];
    this.#setStatus('');
    this.#renderList();
  };

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
