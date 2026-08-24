import { moveItem } from '../model/array.js';
import { countParams, formatJson, hasParams, parseParamsText } from '../model/json.js';
import { createSideEffect } from '../model/machine.js';
import { parseSideEffectDefinitions } from '../model/parse.js';
import type { JsonObject, SideEffect, SideEffectDefinition, SideEffectProvider } from '../types.js';
import { createButton, createElement, focusableElements, isHtmlElement } from './dom.js';
import { JsonFormEditor } from './json-form.js';
import type { JsonTextEditor } from './json-text-editor.js';
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
type ParamsMode = 'form' | 'json';

const DEFAULT_ADD_PLACEHOLDER = 'Select a side effect…';

/** Short label for the parameters toggle on a row. */
export function formatParamsBadge(params: JsonObject): string {
  const count = countParams(params);
  return count === 0 ? '{ }' : `{ } ${count}`;
}

/**
 * Modal listing every side effect of a list, in order. Supports adding from the
 * injected catalog, removing, reordering by drag & drop or keyboard, and editing
 * each side effect's JSON parameters as a nested form or as raw JSON.
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
  /** Id of the side effect whose parameters are open, if any. */
  #expandedId: string | undefined;
  /** CodeMirror instance of the open parameters panel, if any. */
  #textEditor: JsonTextEditor | undefined;
  #paramsMode: ParamsMode = 'form';

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
      rowSelector: '.row-item',
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
    this.#textEditor?.destroy();
    this.#textEditor = undefined;
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
    this.#expandedId = undefined;
    this.#paramsMode = 'form';
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
    this.#textEditor?.destroy();
    this.#textEditor = undefined;
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
    // Every render throws the panel away, so the editor has to go with it.
    this.#textEditor?.destroy();
    this.#textEditor = undefined;
    this.#list.replaceChildren();
    this.#empty.hidden = this.#draft.length > 0;

    this.#draft.forEach((effect, index) => {
      const item = createElement('li', {
        className: 'row-item',
        parent: this.#list,
        attrs: { 'data-index': String(index), 'data-effect-id': effect.id },
      });
      const row = createElement('div', { className: 'row', parent: item });

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
      createElement('span', {
        className: 'row__name',
        parent: row,
        text: effect.name,
        // The name truncates when it runs out of room, so keep it readable on hover.
        attrs: { title: effect.name },
      });

      const expanded = this.#expandedId === effect.id;
      const params = createButton({
        className: 'row__params',
        parent: row,
        text: formatParamsBadge(effect.params),
        attrs: {
          'aria-expanded': expanded ? 'true' : 'false',
          'aria-label': `${expanded ? 'Hide' : 'Edit'} parameters of ${effect.name}, ${countParams(effect.params)} set`,
          title: 'JSON parameters',
          'data-params-for': effect.id,
        },
      });
      params.classList.toggle('is-set', hasParams(effect.params));
      params.classList.toggle('is-open', expanded);
      params.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#expandedId = expanded ? undefined : effect.id;
        this.#renderList();
      });

      const remove = createButton({
        className: 'row__remove',
        parent: row,
        text: '✕',
        attrs: { 'aria-label': `Remove ${effect.name}` },
      });
      remove.disabled = this.#readOnly;
      remove.addEventListener('click', () => {
        this.#draft = this.#draft.filter((item) => item.id !== effect.id);
        if (this.#expandedId === effect.id) {
          this.#expandedId = undefined;
        }
        this.#renderList();
      });

      if (expanded) {
        this.#renderParamsPanel(item, effect);
      }

      if (focusIndex === index) {
        handle.focus();
      }
    });
  }

  /** The parameters editor: a nested form, or the same value as raw JSON text. */
  #renderParamsPanel(item: HTMLElement, effect: SideEffect): void {
    const panel = createElement('div', { className: 'params', parent: item });

    const modes = createElement('div', {
      className: 'params__modes',
      parent: panel,
      attrs: { role: 'tablist', 'aria-label': `Parameter editor for ${effect.name}` },
    });
    const form = createElement('div', { className: 'params__form', parent: panel });
    const json = createElement('div', { className: 'params__json', parent: panel });
    const error = createElement('p', { className: 'params__error', parent: json });

    const editor = new JsonFormEditor({
      container: form,
      onChange: (value) => this.#updateParams(effect.id, value),
    });

    const currentParams = (): JsonObject =>
      this.#draft.find((entry) => entry.id === effect.id)?.params ?? {};

    let text: JsonTextEditor | undefined;
    let loading: Promise<void> | undefined;

    /**
     * CodeMirror is a large dependency for a panel most sessions never open, so
     * it is fetched the first time the JSON tab is shown. Bundlers split it into
     * its own chunk, keeping it out of the initial download.
     */
    const mountTextEditor = async (): Promise<void> => {
      const module = await import('./json-text-editor.js');
      // The panel can be torn down while the chunk is in flight.
      if (!json.isConnected) {
        return;
      }
      text = new module.JsonTextEditor({
        container: json,
        root: this.#shadow,
        label: `Parameters of ${effect.name} as JSON`,
        value: formatJson(currentParams()),
        onInput: (value) => {
          const parsed = parseParamsText(value);
          error.textContent = parsed.ok ? '' : parsed.error;
          if (parsed.ok) {
            this.#updateParams(effect.id, parsed.value);
          }
        },
      });
      text.readOnly = this.#readOnly;
      json.insertBefore(text.element, error);
      this.#textEditor = text;
    };

    const showJson = async (): Promise<void> => {
      loading ??= mountTextEditor();
      await loading;
      if (text === undefined) {
        return;
      }
      text.value = formatJson(currentParams());
      error.textContent = '';
    };

    const showMode = (mode: ParamsMode): void => {
      this.#paramsMode = mode;
      form.hidden = mode !== 'form';
      json.hidden = mode !== 'json';
      for (const tab of modes.children) {
        tab.setAttribute(
          'aria-selected',
          tab.getAttribute('data-mode') === mode ? 'true' : 'false',
        );
      }
      if (mode === 'form') {
        editor.setValue(currentParams(), this.#readOnly);
        return;
      }
      void showJson();
    };

    for (const mode of ['form', 'json'] as const) {
      const tab = createButton({
        className: 'params__mode',
        parent: modes,
        text: mode === 'form' ? 'Form' : 'JSON',
        attrs: { role: 'tab', 'data-mode': mode, 'aria-selected': 'false' },
      });
      tab.addEventListener('click', (event) => {
        event.stopPropagation();
        if (mode === 'form' && this.#paramsMode === 'json' && text !== undefined) {
          // Refuse to leave the text tab while it does not parse, so the edit is not lost.
          const parsed = parseParamsText(text.value);
          if (!parsed.ok) {
            error.textContent = parsed.error;
            return;
          }
          this.#updateParams(effect.id, parsed.value);
        }
        showMode(mode);
      });
    }

    showMode(this.#paramsMode);
  }

  /** Writes new parameters into the draft without re-rendering the open editor. */
  #updateParams(effectId: string, params: JsonObject): void {
    this.#draft = this.#draft.map((effect) =>
      effect.id === effectId ? { ...effect, params } : effect,
    );
    const badge = this.#list.querySelector(`[data-params-for="${effectId}"]`);
    if (isHtmlElement(badge)) {
      badge.textContent = formatParamsBadge(params);
      badge.classList.toggle('is-set', hasParams(params));
    }
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
