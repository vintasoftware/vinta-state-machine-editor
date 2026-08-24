import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { createElement } from './dom.js';

export interface JsonTextEditorOptions {
  /** Element the editor is appended to. */
  readonly container: HTMLElement;
  /** Shadow root the editor lives in, so CodeMirror injects its styles there. */
  readonly root: ShadowRoot;
  /** Accessible name for the editor. */
  readonly label: string;
  /** Initial document. Passed at construction so undo cannot erase it. */
  readonly value?: string;
  readonly onInput: (text: string) => void;
}

const MONOSPACE = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Token colours, taken from the component's own custom properties. */
const highlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--sme-code-key)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--sme-code-string)' },
  { tag: tags.number, color: 'var(--sme-code-number)' },
  { tag: [tags.bool, tags.null, tags.keyword], color: 'var(--sme-code-keyword)' },
  {
    tag: [tags.punctuation, tags.separator, tags.brace, tags.squareBracket],
    color: 'var(--sme-code-punctuation)',
  },
  { tag: tags.invalid, color: 'var(--sme-code-invalid)' },
]);

const theme = EditorView.theme({
  '&': {
    color: 'var(--sme-text)',
    backgroundColor: 'var(--sme-surface)',
    border: '1px solid var(--sme-border)',
    borderRadius: '8px',
    fontSize: '12px',
  },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--sme-accent)' },
  '.cm-scroller': {
    fontFamily: MONOSPACE,
    lineHeight: '1.5',
    minHeight: '108px',
    maxHeight: '240px',
    overflow: 'auto',
  },
  '.cm-content': { padding: '8px 0', caretColor: 'var(--sme-text)' },
  '.cm-line': { padding: '0 8px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--sme-text)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--sme-code-selection)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--sme-accent-soft)',
    color: 'inherit',
    outline: 'none',
  },
  '.cm-nonmatchingBracket': { color: 'var(--sme-code-invalid)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--sme-text-muted)',
  },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy' },
  '.cm-tooltip': {
    backgroundColor: 'var(--sme-surface)',
    border: '1px solid var(--sme-border)',
    borderRadius: '6px',
    color: 'var(--sme-text)',
    fontSize: '11px',
  },
});

/**
 * CodeMirror 6 set up for editing a small JSON document: syntax highlighting,
 * bracket matching, undo history, auto indentation and inline parse errors.
 *
 * Colours come from the component's CSS custom properties, so the editor follows
 * the light and dark themes without being rebuilt.
 */
export class JsonTextEditor {
  readonly #view: EditorView;
  readonly #host: HTMLElement;
  readonly #editable = new Compartment();

  constructor(options: JsonTextEditorOptions) {
    const host = createElement('div', {
      className: 'params__editor',
      parent: options.container,
    });
    this.#host = host;

    this.#view = new EditorView({
      parent: host,
      // Without this CodeMirror would inject its stylesheet into the document
      // instead of the shadow root, and the editor would render unstyled.
      root: options.root,
      state: EditorState.create({
        doc: options.value ?? '',
        extensions: [
          json(),
          linter(jsonParseLinter()),
          lintGutter(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          bracketMatching(),
          indentOnInput(),
          indentUnit.of('  '),
          syntaxHighlighting(highlightStyle),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': options.label }),
          theme,
          this.#editable.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              options.onInput(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
  }

  /** Wrapper element, so callers can place the editor among their own nodes. */
  get element(): HTMLElement {
    return this.#host;
  }

  get value(): string {
    return this.#view.state.doc.toString();
  }

  set value(text: string) {
    if (text === this.value) {
      return;
    }
    this.#view.dispatch({
      changes: { from: 0, to: this.#view.state.doc.length, insert: text },
      // Programmatic fills are not the user's edits, so undo must skip them —
      // otherwise one Ctrl+Z empties a field the user never typed into.
      annotations: Transaction.addToHistory.of(false),
    });
  }

  set readOnly(readOnly: boolean) {
    this.#view.dispatch({
      effects: this.#editable.reconfigure(
        readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [],
      ),
    });
  }

  focus(): void {
    this.#view.focus();
  }

  /** Releases CodeMirror's listeners. Always call this before dropping the DOM. */
  destroy(): void {
    this.#view.destroy();
    this.#host.remove();
  }
}
