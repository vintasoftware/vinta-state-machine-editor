import { describe, expect, it } from 'vitest';
import { formatJson } from '../src/model/json.js';
import { type JsonToken, renderHighlight, tokenizeJson } from '../src/ui/json-highlight.js';

function kinds(text: string): readonly string[] {
  return tokenizeJson(text)
    .filter((token) => token.kind !== 'whitespace')
    .map((token) => token.kind);
}

function values(text: string): readonly string[] {
  return tokenizeJson(text)
    .filter((token) => token.kind !== 'whitespace')
    .map((token) => token.value);
}

function joined(tokens: readonly JsonToken[]): string {
  return tokens.map((token) => token.value).join('');
}

describe('tokenizeJson', () => {
  it('separates keys from string values', () => {
    expect(kinds('{"to": "user"}')).toEqual([
      'punctuation',
      'key',
      'punctuation',
      'string',
      'punctuation',
    ]);
  });

  it('treats a string as a key only when a colon follows', () => {
    expect(kinds('["a", "b"]')).toEqual([
      'punctuation',
      'string',
      'punctuation',
      'string',
      'punctuation',
    ]);
    // Whitespace and newlines between the string and its colon are fine.
    expect(kinds('{"a"\n  : 1}')).toEqual([
      'punctuation',
      'key',
      'punctuation',
      'number',
      'punctuation',
    ]);
  });

  it('recognises numbers, booleans and null', () => {
    expect(kinds('[1, -2.5, 3e10, true, false, null]')).toEqual([
      'punctuation',
      'number',
      'punctuation',
      'number',
      'punctuation',
      'number',
      'punctuation',
      'boolean',
      'punctuation',
      'boolean',
      'punctuation',
      'null',
      'punctuation',
    ]);
  });

  it('keeps escapes inside strings, including escaped quotes', () => {
    expect(values('{"say": "he said \\"hi\\""}')).toEqual([
      '{',
      '"say"',
      ':',
      '"he said \\"hi\\""',
      '}',
    ]);
  });

  it('marks unterminated strings as invalid', () => {
    expect(kinds('{"open: 1')).toEqual(['punctuation', 'invalid']);
  });

  it('stops an unterminated string at the line end', () => {
    // Only the offending line loses its colours; the next line is tokenized afresh.
    expect(values('{"a": "oops\n"b": 2}')).toEqual([
      '{',
      '"a"',
      ':',
      '"oops',
      '"b"',
      ':',
      '2',
      '}',
    ]);
  });

  it('marks malformed numbers and stray words as invalid', () => {
    expect(kinds('[1., 0x2, nope]')).toEqual([
      'punctuation',
      'invalid',
      'punctuation',
      'invalid',
      'punctuation',
      'invalid',
      'punctuation',
    ]);
  });

  it('never loses input, whatever it is given', () => {
    const samples = [
      '',
      '{}',
      '   ',
      formatJson({ a: [1, { b: null }], c: 'x' }),
      '{"broken": ',
      '{"n": 1.}',
      'garbage ¯\\_(ツ)_/¯',
      '{"emoji": "🙂", "tab": "\\t"}',
      '{\n\t"indented": true\n}',
    ];
    for (const sample of samples) {
      expect(joined(tokenizeJson(sample))).toBe(sample);
    }
  });

  it('preserves whitespace as its own tokens', () => {
    const tokens = tokenizeJson('{\n  "a": 1\n}');
    expect(tokens.filter((token) => token.kind === 'whitespace').map((t) => t.value)).toEqual([
      '\n  ',
      ' ',
      '\n',
    ]);
  });
});

describe('renderHighlight', () => {
  it('paints one span per token, with a class naming its kind', () => {
    const target = document.createElement('pre');
    renderHighlight(target, '{"a": 1}');

    const spans = [...target.querySelectorAll('span')].map((span) => ({
      className: span.className,
      text: span.textContent,
    }));
    expect(spans).toEqual([
      { className: 'tok tok--punctuation', text: '{' },
      { className: 'tok tok--key', text: '"a"' },
      { className: 'tok tok--punctuation', text: ':' },
      { className: 'tok tok--whitespace', text: ' ' },
      { className: 'tok tok--number', text: '1' },
      { className: 'tok tok--punctuation', text: '}' },
    ]);
  });

  it('reproduces the source text exactly, plus a trailing newline', () => {
    const target = document.createElement('pre');
    const source = formatJson({ nested: { list: [1, 'two', false] } });
    renderHighlight(target, source);
    expect(target.textContent).toBe(`${source}\n`);
  });

  it('treats the source as text, never as markup', () => {
    const target = document.createElement('pre');
    renderHighlight(target, '{"html": "<img src=x onerror=alert(1)>"}');
    expect(target.querySelector('img')).toBeNull();
    expect(target.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('replaces the previous paint', () => {
    const target = document.createElement('pre');
    renderHighlight(target, '{"a": 1}');
    renderHighlight(target, '{"b": 2}');
    expect(target.textContent).toBe('{"b": 2}\n');
  });
});
