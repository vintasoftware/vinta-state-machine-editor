import { describe, expect, it } from 'vitest';
import { dialogStyles, editorStyles } from '../src/ui/styles.js';

/**
 * Parses a sheet the way a browser would and returns how many style rules each
 * `(pointer: coarse)` block holds, in source order.
 *
 * A sheet that has lost its braces still *reads* like CSS — the file is a
 * template literal, so neither TypeScript nor the linter looks inside it — and
 * a browser drops the whole malformed block silently. Counting the rules the
 * parser actually kept is the only way to notice.
 */
function coarseRuleCounts(css: string): readonly number[] {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  const counts: number[] = [];
  for (const rule of Array.from(style.sheet?.cssRules ?? [])) {
    if (rule instanceof CSSMediaRule && rule.conditionText.includes('pointer: coarse')) {
      counts.push(rule.cssRules.length);
    }
  }
  style.remove();
  return counts;
}

describe('the touch-target media queries', () => {
  it('grows a screenful of targets in the editor sheet', () => {
    const [editorBlock, ...rest] = coarseRuleCounts(editorStyles);
    expect(rest).toEqual([]);
    expect(editorBlock).toBeGreaterThanOrEqual(20);
  });

  it('grows the dialog rows and the properties fields', () => {
    const [rows, fields, ...rest] = coarseRuleCounts(dialogStyles);
    expect(rest).toEqual([]);
    expect(rows).toBeGreaterThanOrEqual(8);
    expect(fields).toBeGreaterThanOrEqual(2);
  });

  it('keeps the rules a fingertip needs, not just any rules at all', () => {
    const style = document.createElement('style');
    style.textContent = editorStyles;
    document.head.append(style);
    const selectors = Array.from(style.sheet?.cssRules ?? [])
      .filter((rule) => rule instanceof CSSMediaRule)
      .flatMap((rule) => Array.from(rule.cssRules))
      .filter((rule) => rule instanceof CSSStyleRule)
      .map((rule) => rule.selectorText);
    style.remove();
    expect(selectors).toContain('.icon-button');
    expect(selectors).toContain('.toolbar button');
    expect(selectors).toContain('.edge-card');
  });
});
