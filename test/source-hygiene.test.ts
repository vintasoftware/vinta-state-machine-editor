import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripLiterals } from './strip-literals.js';

const SOURCE_ROOT = join(process.cwd(), 'src');

function sourceFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (extname(entry.name) === '.ts') {
      files.push(path);
    }
  }
  return files.sort();
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly text: string;
}

const RULES: readonly { readonly rule: string; readonly pattern: RegExp }[] = [
  { rule: 'type assertion (`as`)', pattern: /\bas\s+(?!const\b)/ },
  { rule: 'angle-bracket assertion', pattern: /=\s*<[A-Z][A-Za-z0-9_]*>/ },
  { rule: '`any` type', pattern: /\bany\b/ },
  { rule: 'non-null assertion (`!`)', pattern: /![.,;)\]]/ },
];

function scan(file: string): readonly Violation[] {
  const raw = readFileSync(file, 'utf8');
  const violations: Violation[] = [];
  stripLiterals(raw)
    .split('\n')
    .forEach((text, index) => {
      for (const { rule, pattern } of RULES) {
        if (pattern.test(text)) {
          violations.push({ file, line: index + 1, rule, text: text.trim() });
        }
      }
    });
  if (/@ts-(ignore|expect-error|nocheck)/.test(raw)) {
    violations.push({ file, line: 0, rule: 'ts directive comment', text: '' });
  }
  return violations;
}

describe('source hygiene', () => {
  it('strips comments and literals before scanning', () => {
    const source = "const x = 'as any!'; // as any";
    const stripped = stripLiterals(source);
    expect(stripped).toHaveLength(source.length);
    expect(stripped.startsWith('const x =')).toBe(true);
    expect(stripped).not.toContain('any');
    expect(stripLiterals('const a = 1;')).toBe('const a = 1;');
    expect(stripLiterals('a();\n/* as any */\nb();')).toBe('a();\n            \nb();');
  });

  it('finds every source file', () => {
    expect(sourceFiles(SOURCE_ROOT).length).toBeGreaterThan(10);
  });

  it('has no type assertions, `any`, or non-null assertions in src/', () => {
    const violations = sourceFiles(SOURCE_ROOT).flatMap(scan);
    const report = violations
      .map(
        (violation) => `${violation.file}:${violation.line} — ${violation.rule}: ${violation.text}`,
      )
      .join('\n');
    expect(report).toBe('');
  });
});

/*
 * Every word a person reads comes out of the string set, so a host can replace
 * the lot. That is easy to undo by accident: a new button, a literal typed
 * straight into its `text:` or `aria-label`, and one label is quietly back in
 * English for everybody. The scan below is what stops that.
 */

/** Where a user-facing label is written, in the shapes `createElement` takes. */
const LABEL_SITES: readonly { readonly rule: string; readonly pattern: RegExp }[] = [
  { rule: 'literal `text:`', pattern: /\btext:\s*['"`]/ },
  { rule: 'literal `label:`', pattern: /\blabel:\s*['"`]/ },
  { rule: 'literal `title`', pattern: /\btitle:\s*['"`]|\.title\s*=\s*['"`]/ },
  { rule: 'literal `aria-label`', pattern: /'aria-label':\s*['"`]/ },
  { rule: 'literal `placeholder`', pattern: /\bplaceholder:\s*['"`]/ },
  { rule: 'literal `textContent`', pattern: /\.textContent\s*=\s*['"`]/ },
];

/**
 * Whether `literal` — quotes included — is text a person reads.
 *
 * A value that is entirely interpolated or punctuation is not: the row
 * ordinals and the `{ }` badge among them.
 */
function isProse(literal: string): boolean {
  return /[A-Za-z]{2}/.test(literal.slice(1, -1).replaceAll(/\$\{[^}]*\}/g, ''));
}

/** Files that legitimately hold English: the defaults, and the words beside them. */
const ALLOWED = new Set(['strings.ts', 'labels.ts', 'side-effect-summary.ts', 'json.ts']);

function scanLabels(file: string): readonly Violation[] {
  if (ALLOWED.has(file.split('/').pop() ?? '')) {
    return [];
  }
  const violations: Violation[] = [];
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((text, index) => {
      for (const { rule, pattern } of LABEL_SITES) {
        const found = pattern.exec(text);
        if (found === null) {
          continue;
        }
        // The pattern stops at the opening quote; take the whole literal to
        // decide whether it is prose or a stray `''`.
        const literal = /(['"`])(?:\\.|(?!\1)[^\\])*\1/.exec(text.slice(found.index));
        if (literal === null || !isProse(literal[0])) {
          continue;
        }
        violations.push({ file, line: index + 1, rule, text: text.trim() });
      }
    });
  return violations;
}

describe('user-facing strings', () => {
  it('tells prose from punctuation', () => {
    expect(isProse("'Add state'")).toBe(true);
    expect(isProse("''")).toBe(false);
    expect(isProse("'{ }'")).toBe(false);
    // Spelled out so this line is not itself a template placeholder.
    expect(isProse(['`', '$', '{index + 1}', '`'].join(''))).toBe(false);
  });

  it('leaves no label written straight into the DOM outside the string set', () => {
    const violations = sourceFiles(join(SOURCE_ROOT, 'ui')).flatMap(scanLabels);
    const report = violations
      .map(
        (violation) =>
          `${violation.file}:${violation.line} — ${violation.rule}: ${violation.text}\n` +
          '    Add a key to EditorStrings and read it off the set instead.',
      )
      .join('\n');
    expect(report).toBe('');
  });
});
