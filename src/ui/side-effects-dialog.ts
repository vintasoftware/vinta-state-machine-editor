import { moveItem } from '../model/array.js';
import {
  countParams,
  formatJson,
  hasParams,
  type JsonTextMessages,
  parseParamsText,
} from '../model/json.js';
import { createSideEffect } from '../model/machine.js';
import { parseSideEffectDefinitions } from '../model/parse.js';
import type { JsonObject, SideEffect, SideEffectDefinition, SideEffectProvider } from '../types.js';
import { createButton, createElement, focusableElements, isHtmlElement } from './dom.js';
import {
  createIconButton,
  DEFAULT_ICONS,
  type EditorIcons,
  type IconOverrides,
  mergeIcons,
} from './icons.js';
import { JsonFormEditor } from './json-form.js';
import type { JsonTextEditor } from './json-text-editor.js';
import { ReorderController } from './reorder.js';
import {
  DEFAULT_STRINGS,
  type EditorStrings,
  mergeStrings,
  type StringOverrides,
} from './strings.js';
import { dialogStyles } from './styles.js';
import { applyTheme, type EditorTheme, themeOf } from './theme.js';

export interface SideEffectsDialogOptions {
  readonly title: string;
  readonly description: string;
  readonly effects: readonly SideEffect[];
  readonly provider?: SideEffectProvider | undefined;
  readonly readOnly?: boolean;
  /**
   * Glyphs for the rows' handles and buttons. Anything left out keeps its
   * default; left out entirely, whatever was assigned to `icons` stands.
   */
  readonly icons?: IconOverrides | undefined;
  /**
   * Wording of the list and its rows. Anything left out stays in English; left
   * out entirely, whatever was assigned to `strings` stands.
   */
  readonly strings?: StringOverrides | undefined;
}

type DialogResolver = (result: readonly SideEffect[] | null) => void;
type ParamsMode = 'form' | 'json';

/** What the catalog picker offers before anything is chosen, in English. */
export const DEFAULT_ADD_PLACEHOLDER = 'Select a side effect…';

/** Short label for the parameters toggle on a row. */
export function formatParamsBadge(
  params: JsonObject,
  strings: EditorStrings = DEFAULT_STRINGS,
): string {
  return strings.params.badge({ count: countParams(params) });
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
  #icons: EditorIcons = DEFAULT_ICONS;
  #strings: EditorStrings = DEFAULT_STRINGS;

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

    // The wording of these is written on open(), once the set in force is known.
    this.#list = createElement('ol', { className: 'list', parent: this.#panel });
    this.#empty = createElement('p', { className: 'empty', parent: this.#panel });

    const add = createElement('div', { className: 'add', parent: this.#panel });
    this.#select = createElement('select', { parent: add });
    this.#addButton = createButton({ className: 'button', parent: add });
    this.#status = createElement('p', { className: 'status', parent: this.#panel });

    const footer = createElement('footer', { className: 'footer', parent: this.#panel });
    this.#cancelButton = createButton({ className: 'button', parent: footer });
    this.#saveButton = createButton({ className: 'button button--primary', parent: footer });

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
   * The glyphs the rows are drawn with. The editor hands its own down when it
   * opens the dialog; a host driving the dialog on its own sets them here.
   * Assigning a partial set leaves every other icon at its default.
   */
  get icons(): EditorIcons {
    return this.#icons;
  }

  set icons(overrides: IconOverrides | undefined) {
    this.#icons = mergeIcons(overrides);
    this.#renderList();
  }

  /**
   * The wording of the list and its rows. The editor hands its own down when it
   * opens the dialog; a host driving the dialog on its own sets it here.
   * Assigning a partial set leaves every other string in English.
   */
  get strings(): EditorStrings {
    return this.#strings;
  }

  set strings(overrides: StringOverrides | undefined) {
    this.#strings = mergeStrings(overrides);
    this.#applyStrings();
    this.#renderList();
  }

  /** Writes the wording onto the parts built once, in the constructor. */
  #applyStrings(): void {
    const text = this.#strings.sideEffects;
    this.#list.setAttribute('aria-label', text.listLabel);
    this.#empty.textContent = text.empty;
    this.#select.setAttribute('aria-label', text.selectLabel);
    this.#addButton.textContent = text.add;
    this.#saveButton.textContent = this.#strings.dialog.save;
    this.#cancelButton.textContent = this.#readOnly
      ? this.#strings.dialog.close
      : this.#strings.dialog.cancel;
  }

  /**
   * What the JSON tab says when the text does not parse. The three structural
   * complaints are ours; the syntax errors around them are `JSON.parse`'s.
   */
  #jsonMessages(): JsonTextMessages {
    const { invalid, notJsonValues, notObject } = this.#strings.json;
    return { invalid, notJsonValues, notObject };
  }

  /** Opens the modal; resolves with the new list, or `null` when cancelled. */
  open(options: SideEffectsDialogOptions): Promise<readonly SideEffect[] | null> {
    this.#previouslyFocused = this.ownerDocument.activeElement;
    this.#draft = [...options.effects];
    this.#readOnly = options.readOnly === true;
    if (options.icons !== undefined) {
      this.#icons = mergeIcons(options.icons);
    }
    if (options.strings !== undefined) {
      this.#strings = mergeStrings(options.strings);
    }
    this.#expandedId = undefined;
    this.#paramsMode = 'form';
    this.#title.textContent = options.title;
    this.#subtitle.textContent = options.description;
    this.#applyStrings();
    this.#addButton.disabled = true;
    this.#select.disabled = this.#readOnly;
    this.#saveButton.hidden = this.#readOnly;
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
      this.#setStatus(this.#strings.sideEffects.noCatalog, true);
      return;
    }
    if (this.#readOnly) {
      this.#setStatus('');
      return;
    }
    this.#setStatus(this.#strings.sideEffects.loading);
    try {
      const result = parseSideEffectDefinitions(await provider());
      if (!result.ok) {
        this.#setStatus(
          this.#strings.sideEffects.invalidCatalog({ errors: result.errors.join(' ') }),
          true,
        );
        return;
      }
      this.#definitions = result.value;
      this.#renderCatalog();
      this.#setStatus('');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.#setStatus(this.#strings.sideEffects.loadFailed({ reason }), true);
    }
  }

  #renderCatalog(): void {
    this.#select.replaceChildren();
    const text = this.#strings.sideEffects;
    const placeholder = createElement('option', {
      text: text.placeholder,
      attrs: { value: '' },
      parent: this.#select,
    });
    placeholder.selected = true;
    for (const definition of this.#definitions) {
      createElement('option', {
        text:
          definition.description === undefined
            ? definition.name
            : text.catalogOption({
                name: definition.name,
                description: definition.description,
              }),
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

    const text = this.#strings.row;
    this.#draft.forEach((effect, index) => {
      const item = createElement('li', {
        className: effect.enabled ? 'row-item' : 'row-item is-disabled',
        parent: this.#list,
        attrs: { 'data-index': String(index), 'data-effect-id': effect.id },
      });
      const row = createElement('div', { className: 'row', parent: item });

      const handle = createIconButton(this.#icons, 'dragHandle', {
        className: 'row__handle',
        parent: row,
        attrs: {
          'aria-label': text.reorderLabel({
            name: effect.name,
            index: index + 1,
            total: this.#draft.length,
          }),
          title: text.reorderTitle,
          'data-handle-index': String(index),
        },
      });
      handle.disabled = this.#readOnly;
      handle.addEventListener('keydown', this.#onHandleKeyDown);

      createElement('span', { className: 'row__order', parent: row, text: `${index + 1}` });

      // A disabled side effect stays attached and configured; it just does not run.
      const enabled = createElement('input', {
        className: 'row__enabled',
        parent: row,
        attrs: {
          'aria-label': text.enabledLabel({ name: effect.name }),
          title: text.enabledTitle,
        },
      });
      enabled.type = 'checkbox';
      enabled.checked = effect.enabled;
      enabled.disabled = this.#readOnly;
      enabled.addEventListener('change', () => {
        this.#patch(effect.id, { enabled: enabled.checked });
        item.classList.toggle('is-disabled', !enabled.checked);
      });

      createElement('span', {
        className: 'row__name',
        parent: row,
        text: effect.name,
        // The name truncates when it runs out of room, so keep it readable on hover.
        attrs: { title: effect.name },
      });

      const expanded = this.#expandedId === effect.id;
      // The badge is the parameters icon plus how many are set, so replacing
      // the icon leaves the count exactly where it was.
      const paramCount = countParams(effect.params);
      const params = createIconButton(this.#icons, 'params', {
        className: 'row__params',
        parent: row,
        label: paramCount === 0 ? undefined : String(paramCount),
        attrs: {
          'aria-expanded': expanded ? 'true' : 'false',
          'aria-label': text.paramsLabel({ name: effect.name, count: paramCount, expanded }),
          title: text.paramsTitle,
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

      const remove = createIconButton(this.#icons, 'remove', {
        className: 'row__remove',
        parent: row,
        attrs: { 'aria-label': text.remove({ name: effect.name }) },
      });
      remove.disabled = this.#readOnly;
      remove.addEventListener('click', () => {
        this.#draft = this.#draft.filter((entry) => entry.id !== effect.id);
        if (this.#expandedId === effect.id) {
          this.#expandedId = undefined;
        }
        this.#renderList();
      });

      // Second line, so a long note never squeezes the controls off the row.
      const description = createElement('input', {
        className: 'row__description',
        parent: item,
        attrs: {
          'aria-label': text.descriptionLabel({ name: effect.name }),
          placeholder: text.descriptionPlaceholder,
        },
      });
      description.value = effect.description;
      description.readOnly = this.#readOnly;
      // Written straight into the draft: re-rendering here would drop the caret.
      description.addEventListener('input', () => {
        this.#patch(effect.id, { description: description.value });
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
      attrs: {
        role: 'tablist',
        'aria-label': this.#strings.params.editorLabel({ name: effect.name }),
      },
    });
    const form = createElement('div', { className: 'params__form', parent: panel });
    const json = createElement('div', { className: 'params__json', parent: panel });
    const error = createElement('p', { className: 'params__error', parent: json });

    const editor = new JsonFormEditor({
      container: form,
      onChange: (value) => this.#updateParams(effect.id, value),
      icons: this.#icons,
      strings: this.#strings,
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
        label: this.#strings.params.jsonLabel({ name: effect.name }),
        value: formatJson(currentParams()),
        onInput: (value) => {
          const parsed = parseParamsText(value, this.#jsonMessages());
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
        text: mode === 'form' ? this.#strings.params.modeForm : this.#strings.params.modeJson,
        attrs: { role: 'tab', 'data-mode': mode, 'aria-selected': 'false' },
      });
      tab.addEventListener('click', (event) => {
        event.stopPropagation();
        if (mode === 'form' && this.#paramsMode === 'json' && text !== undefined) {
          // Refuse to leave the text tab while it does not parse, so the edit is not lost.
          const parsed = parseParamsText(text.value, this.#jsonMessages());
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

  /** Writes per-attachment metadata into the draft, leaving the DOM alone. */
  #patch(
    effectId: string,
    patch: { readonly enabled?: boolean; readonly description?: string },
  ): void {
    this.#draft = this.#draft.map((effect) =>
      effect.id === effectId
        ? {
            ...effect,
            enabled: patch.enabled ?? effect.enabled,
            description: patch.description ?? effect.description,
          }
        : effect,
    );
  }

  /** Writes new parameters into the draft without re-rendering the open editor. */
  #updateParams(effectId: string, params: JsonObject): void {
    this.#draft = this.#draft.map((effect) =>
      effect.id === effectId ? { ...effect, params } : effect,
    );
    const badge = this.#list.querySelector(`[data-params-for="${effectId}"]`);
    if (isHtmlElement(badge)) {
      badge.textContent = formatParamsBadge(params, this.#strings);
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
      this.#setStatus(this.#strings.sideEffects.pickOne, true);
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
