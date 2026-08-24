import { createElement } from './dom.js';
import { renderHighlight } from './json-highlight.js';

export interface JsonTextEditorOptions {
  /** Element the editor is appended to. */
  readonly container: HTMLElement;
  /** Accessible name for the text area. */
  readonly label: string;
  readonly onInput: (text: string) => void;
}

/**
 * A plain `<textarea>` with its own text made transparent, sitting exactly on
 * top of a highlighted copy of the same source.
 *
 * Everything native therefore still works — selection, undo, spellcheck off,
 * IME, mobile keyboards, screen readers — while the colours come from a layer
 * the user never interacts with. The two layers must keep identical typography
 * and padding, which is enforced in the stylesheet.
 */
export class JsonTextEditor {
  readonly #root: HTMLElement;
  readonly #highlight: HTMLElement;
  readonly #textarea: HTMLTextAreaElement;

  constructor(options: JsonTextEditorOptions) {
    this.#root = createElement('div', { className: 'params__editor', parent: options.container });
    this.#highlight = createElement('pre', {
      className: 'params__highlight',
      parent: this.#root,
      attrs: { 'aria-hidden': 'true' },
    });
    this.#textarea = createElement('textarea', {
      className: 'params__text',
      parent: this.#root,
      attrs: {
        spellcheck: 'false',
        autocapitalize: 'off',
        autocorrect: 'off',
        'aria-label': options.label,
      },
    });

    this.#textarea.addEventListener('input', () => {
      this.#paint();
      options.onInput(this.#textarea.value);
    });
    // The highlight layer does not scroll on its own; it follows the textarea.
    this.#textarea.addEventListener('scroll', this.#syncScroll);
  }

  get value(): string {
    return this.#textarea.value;
  }

  set value(text: string) {
    this.#textarea.value = text;
    this.#paint();
  }

  get textarea(): HTMLTextAreaElement {
    return this.#textarea;
  }

  set readOnly(readOnly: boolean) {
    this.#textarea.readOnly = readOnly;
  }

  focus(): void {
    this.#textarea.focus();
  }

  #paint(): void {
    renderHighlight(this.#highlight, this.#textarea.value);
    this.#syncScroll();
  }

  #syncScroll = (): void => {
    this.#highlight.scrollTop = this.#textarea.scrollTop;
    this.#highlight.scrollLeft = this.#textarea.scrollLeft;
  };
}
