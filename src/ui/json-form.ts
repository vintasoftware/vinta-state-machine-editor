import {
  appendEntry,
  coerceTo,
  isJsonArray,
  isJsonObject,
  JSON_TYPES,
  type JsonPath,
  type JsonType,
  jsonTypeOf,
  removeAtPath,
  renameKeyAtPath,
  setAtPath,
} from '../model/json.js';
import type { JsonObject, JsonValue } from '../types.js';
import { createButton, createElement } from './dom.js';

export interface JsonFormOptions {
  /** Element the form is rendered into. Its contents are replaced. */
  readonly container: HTMLElement;
  readonly onChange: (value: JsonObject) => void;
}

const INDENT_PX = 14;

function summaryOf(value: JsonValue): string {
  if (isJsonArray(value)) {
    return value.length === 1 ? '1 item' : `${value.length} items`;
  }
  if (isJsonObject(value)) {
    const count = Object.keys(value).length;
    return count === 1 ? '1 field' : `${count} fields`;
  }
  return '';
}

/**
 * Nested form over an arbitrary JSON object: every entry exposes its key, its
 * type and its value, and objects and arrays recurse into their own rows.
 */
export class JsonFormEditor {
  readonly #container: HTMLElement;
  readonly #onChange: (value: JsonObject) => void;
  #value: JsonObject = {};
  #readOnly = false;

  constructor(options: JsonFormOptions) {
    this.#container = options.container;
    this.#onChange = options.onChange;
  }

  get value(): JsonObject {
    return this.#value;
  }

  setValue(value: JsonObject, readOnly = false): void {
    this.#value = value;
    this.#readOnly = readOnly;
    this.#render();
  }

  #commit(next: JsonValue, rerender: boolean): void {
    if (!isJsonObject(next)) {
      return;
    }
    this.#value = next;
    this.#onChange(next);
    if (rerender) {
      this.#render();
    }
  }

  #render(): void {
    this.#container.replaceChildren();
    this.#renderContainer(this.#value, [], 0, this.#container);
  }

  /** Renders the entries of an object or array, then its "add" button. */
  #renderContainer(value: JsonValue, path: JsonPath, depth: number, parent: HTMLElement): void {
    if (isJsonArray(value)) {
      value.forEach((item, index) => {
        this.#renderEntry(item, [...path, index], String(index), depth, parent, false);
      });
    } else if (isJsonObject(value)) {
      for (const [key, item] of Object.entries(value)) {
        this.#renderEntry(item, [...path, key], key, depth, parent, true);
      }
    }

    if (this.#readOnly) {
      if (depth === 0 && Object.keys(this.#value).length === 0) {
        createElement('p', { className: 'jf-empty', parent, text: 'No parameters.' });
      }
      return;
    }

    const add = createButton({
      className: 'jf-add',
      parent,
      text: isJsonArray(value) ? '+ Add item' : '+ Add field',
    });
    add.style.marginLeft = `${depth * INDENT_PX}px`;
    add.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#commit(appendEntry(this.#value, path, 'string'), true);
    });
  }

  #renderEntry(
    value: JsonValue,
    path: JsonPath,
    label: string,
    depth: number,
    parent: HTMLElement,
    editableKey: boolean,
  ): void {
    const row = createElement('div', { className: 'jf-row', parent });
    row.style.paddingLeft = `${depth * INDENT_PX}px`;

    if (editableKey) {
      const key = createElement('input', {
        className: 'jf-key',
        parent: row,
        attrs: { 'aria-label': `Name of parameter ${label}` },
      });
      key.value = label;
      key.disabled = this.#readOnly;
      key.addEventListener('change', () => {
        this.#commit(
          renameKeyAtPath(this.#value, path.slice(0, -1), label, key.value.trim()),
          true,
        );
      });
    } else {
      createElement('span', { className: 'jf-index', parent: row, text: `${label}:` });
    }

    const type = jsonTypeOf(value);
    const typeSelect = createElement('select', {
      className: 'jf-type',
      parent: row,
      attrs: { 'aria-label': `Type of ${label}` },
    });
    for (const option of JSON_TYPES) {
      const element = createElement('option', { text: option, parent: typeSelect });
      element.value = option;
      element.selected = option === type;
    }
    typeSelect.disabled = this.#readOnly;
    typeSelect.addEventListener('change', () => {
      const next = JSON_TYPES.find((candidate) => candidate === typeSelect.value);
      if (next !== undefined) {
        this.#commit(setAtPath(this.#value, path, coerceTo(value, next)), true);
      }
    });

    this.#renderValueControl(value, path, label, row, type);

    if (!this.#readOnly) {
      const remove = createButton({
        className: 'jf-remove',
        parent: row,
        text: '✕',
        attrs: { 'aria-label': `Remove ${label}` },
      });
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#commit(removeAtPath(this.#value, path), true);
      });
    }

    if (type === 'object' || type === 'array') {
      this.#renderContainer(value, path, depth + 1, parent);
    }
  }

  #renderValueControl(
    value: JsonValue,
    path: JsonPath,
    label: string,
    row: HTMLElement,
    type: JsonType,
  ): void {
    if (type === 'object' || type === 'array') {
      createElement('span', { className: 'jf-summary', parent: row, text: summaryOf(value) });
      return;
    }
    if (type === 'null') {
      createElement('span', { className: 'jf-null', parent: row, text: 'null' });
      return;
    }
    if (type === 'boolean') {
      const select = createElement('select', {
        className: 'jf-value',
        parent: row,
        attrs: { 'aria-label': `Value of ${label}` },
      });
      for (const option of ['true', 'false']) {
        const element = createElement('option', { text: option, parent: select });
        element.value = option;
        element.selected = (value === true) === (option === 'true');
      }
      select.disabled = this.#readOnly;
      select.addEventListener('change', () => {
        this.#commit(setAtPath(this.#value, path, select.value === 'true'), false);
      });
      return;
    }

    const input = createElement('input', {
      className: 'jf-value',
      parent: row,
      attrs: { 'aria-label': `Value of ${label}`, type: type === 'number' ? 'number' : 'text' },
    });
    input.value = typeof value === 'number' ? String(value) : String(value);
    input.disabled = this.#readOnly;
    input.addEventListener('change', () => {
      if (type === 'number') {
        const parsed = Number(input.value);
        this.#commit(setAtPath(this.#value, path, Number.isFinite(parsed) ? parsed : 0), false);
        return;
      }
      this.#commit(setAtPath(this.#value, path, input.value), false);
    });
  }
}
