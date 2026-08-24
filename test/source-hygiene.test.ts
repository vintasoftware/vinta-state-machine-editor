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
