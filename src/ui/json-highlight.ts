import { createElement } from './dom.js';

export type JsonTokenKind =
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'punctuation'
  | 'whitespace'
  | 'invalid';

export interface JsonToken {
  readonly kind: JsonTokenKind;
  readonly value: string;
}

const PUNCTUATION = new Set(['{', '}', '[', ']', ',', ':']);
const WHITESPACE = /\s/;
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const NUMBER_LIKE = /^[-+0-9.eExXa-fA-F]+/;
const WORD = /^[A-Za-z_$][\w$]*/;

/** Length of the string literal starting at `start`, or `undefined` when unterminated. */
function stringLength(text: string, start: number): number | undefined {
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '"') {
      return index - start + 1;
    }
    if (char === '\n') {
      return undefined;
    }
    index += 1;
  }
  return undefined;
}

/** True when the next meaningful character after `index` is a colon. */
function isFollowedByColon(text: string, index: number): boolean {
  for (let cursor = index; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === undefined) {
      return false;
    }
    if (WHITESPACE.test(char)) {
      continue;
    }
    return char === ':';
  }
  return false;
}

/**
 * Splits JSON source into tokens for display. Never throws and never drops
 * input: joining the token values always reproduces the original text, which is
 * what keeps the highlight layer aligned with the textarea above it.
 */
export function tokenizeJson(text: string): readonly JsonToken[] {
  const tokens: JsonToken[] = [];
  let index = 0;

  const push = (kind: JsonTokenKind, value: string): void => {
    if (value.length === 0) {
      return;
    }
    tokens.push({ kind, value });
    index += value.length;
  };

  while (index < text.length) {
    const char = text[index];
    if (char === undefined) {
      break;
    }
    const rest = text.slice(index);

    if (WHITESPACE.test(char)) {
      const run = /^\s+/.exec(rest);
      push('whitespace', run === null ? char : run[0]);
      continue;
    }

    if (PUNCTUATION.has(char)) {
      push('punctuation', char);
      continue;
    }

    if (char === '"') {
      const length = stringLength(text, index);
      if (length === undefined) {
        // Stop at the line end, so one unterminated string does not paint the
        // rest of the document red while it is still being typed.
        const lineEnd = text.indexOf('\n', index);
        push('invalid', text.slice(index, lineEnd === -1 ? text.length : lineEnd));
        continue;
      }
      const value = text.slice(index, index + length);
      push(isFollowedByColon(text, index + length) ? 'key' : 'string', value);
      continue;
    }

    if (char === '-' || (char >= '0' && char <= '9')) {
      const match = NUMBER.exec(rest);
      // A number that stops mid-way (`1.`, `0x2`) is shown as invalid, not split.
      const loose = NUMBER_LIKE.exec(rest);
      if (match !== null && (loose === null || loose[0].length === match[0].length)) {
        push('number', match[0]);
        continue;
      }
      push('invalid', loose === null ? char : loose[0]);
      continue;
    }

    const word = WORD.exec(rest);
    if (word !== null) {
      const value = word[0];
      if (value === 'true' || value === 'false') {
        push('boolean', value);
      } else if (value === 'null') {
        push('null', value);
      } else {
        push('invalid', value);
      }
      continue;
    }

    push('invalid', char);
  }

  return tokens;
}

/**
 * Paints `text` into `target` as coloured spans. A trailing newline is added so
 * the last line of the textarea always has a matching line underneath it.
 */
export function renderHighlight(target: HTMLElement, text: string): void {
  const nodes = tokenizeJson(text).map((token) =>
    createElement('span', { className: `tok tok--${token.kind}`, text: token.value }),
  );
  target.replaceChildren(...nodes, document.createTextNode('\n'));
}
