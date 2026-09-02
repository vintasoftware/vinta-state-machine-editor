import { createButton, createElement, focusableElements, isHtmlElement } from './dom.js';
import {
  DEFAULT_STRINGS,
  type EditorStrings,
  mergeStrings,
  type StringOverrides,
} from './strings.js';
import { dialogStyles } from './styles.js';
import { applyTheme, type EditorTheme, themeOf } from './theme.js';

export interface ConfirmDialogOptions {
  readonly title: string;
  /** What the action is about to do, in the user's terms. */
  readonly message: string;
  /** Wording of the button that goes ahead. Defaults to `dialog.confirm`. */
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /**
   * Wording for the two buttons. Anything left out keeps its default; left out
   * entirely, whatever was assigned to `strings` stands.
   */
  readonly strings?: StringOverrides | undefined;
}

type ConfirmResolver = (confirmed: boolean) => void;

/**
 * Modal asking the user to confirm something that cannot be shrugged off.
 *
 * It is deliberately thin: a question, a cancel and a confirm. Anything the
 * user can undo does not need one, so the only caller is **Organize**, which
 * throws away every position on the canvas at once.
 */
export class ConfirmDialogElement extends HTMLElement {
  static readonly tagName = 'state-machine-confirm-dialog';

  readonly #shadow: ShadowRoot;
  readonly #backdrop: HTMLElement;
  readonly #panel: HTMLElement;
  readonly #title: HTMLElement;
  readonly #message: HTMLElement;
  readonly #confirmButton: HTMLButtonElement;
  readonly #cancelButton: HTMLButtonElement;

  #resolve: ConfirmResolver | undefined;
  #strings: EditorStrings = DEFAULT_STRINGS;
  #previouslyFocused: Element | null = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.append(createElement('style', { text: dialogStyles }));

    this.#backdrop = createElement('div', { className: 'backdrop', parent: this.#shadow });
    this.#panel = createElement('div', {
      className: 'panel panel--confirm',
      parent: this.#backdrop,
      attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'confirm-title' },
    });

    const header = createElement('header', { parent: this.#panel });
    this.#title = createElement('h2', {
      className: 'title',
      parent: header,
      attrs: { id: 'confirm-title' },
    });
    this.#message = createElement('p', {
      className: 'subtitle',
      parent: header,
      attrs: { 'data-confirm': 'message' },
    });

    const footer = createElement('footer', { className: 'footer', parent: this.#panel });
    this.#cancelButton = createButton({
      className: 'button',
      parent: footer,
      attrs: { 'data-confirm': 'cancel' },
    });
    this.#confirmButton = createButton({
      className: 'button button--primary',
      parent: footer,
      attrs: { 'data-confirm': 'confirm' },
    });

    this.#cancelButton.addEventListener('click', () => this.#finish(false));
    this.#confirmButton.addEventListener('click', () => this.#finish(true));
    this.#backdrop.addEventListener('pointerdown', this.#onBackdropPointerDown);
    this.#panel.addEventListener('keydown', this.#onKeyDown);
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
   * The wording of the two buttons. The editor hands its own down when it opens
   * the dialog; a host driving the dialog on its own sets it here. Assigning a
   * partial set leaves every other string in English.
   */
  get strings(): EditorStrings {
    return this.#strings;
  }

  set strings(overrides: StringOverrides | undefined) {
    this.#strings = mergeStrings(overrides);
  }

  /**
   * Opens the modal; resolves `true` only if the user pressed the confirm
   * button. Cancelling, Escape and a click on the backdrop all resolve `false`,
   * so a caller never has to tell one refusal from another.
   */
  open(options: ConfirmDialogOptions): Promise<boolean> {
    this.#previouslyFocused = this.ownerDocument.activeElement;
    if (options.strings !== undefined) {
      this.#strings = mergeStrings(options.strings);
    }
    this.#title.textContent = options.title;
    this.#message.textContent = options.message;
    this.#confirmButton.textContent = options.confirmLabel ?? this.#strings.dialog.confirm;
    this.#cancelButton.textContent = options.cancelLabel ?? this.#strings.dialog.cancel;
    // Focus lands on Cancel: the destructive button should be pressed on
    // purpose, not by the Enter that opened the dialog.
    this.#cancelButton.focus();

    return new Promise<boolean>((resolve) => {
      this.#resolve = resolve;
    });
  }

  #finish(confirmed: boolean): void {
    const resolve = this.#resolve;
    this.#resolve = undefined;
    this.dispatchEvent(new CustomEvent('dialog-close', { detail: { confirmed } }));
    if (this.#previouslyFocused !== null && isHtmlElement(this.#previouslyFocused)) {
      this.#previouslyFocused.focus();
    }
    resolve?.(confirmed);
  }

  #onBackdropPointerDown = (event: PointerEvent): void => {
    if (event.target === this.#backdrop) {
      this.#finish(false);
    }
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.#finish(false);
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
