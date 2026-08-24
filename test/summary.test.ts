import { describe, expect, it } from 'vitest';
import { createSideEffect } from '../src/model/machine.js';
import { describeSideEffectList, shortHookLabel } from '../src/ui/labels.js';
import { computeDropIndex } from '../src/ui/reorder.js';
import {
  EMPTY_SIDE_EFFECTS_LABEL,
  formatSideEffectSummary,
  formatSideEffectTitle,
} from '../src/ui/side-effect-summary.js';
import { sampleMachine } from './helpers.js';

const effects = ['sendEmail', 'chargeCard', 'writeAuditLog'].map((name, index) =>
  createSideEffect({ id: `d${index}`, name }, `e${index}`),
);

describe('side effect summary', () => {
  it('falls back to the empty label', () => {
    expect(formatSideEffectSummary([])).toBe(EMPTY_SIDE_EFFECTS_LABEL);
    expect(formatSideEffectSummary([], '+ Add')).toBe('+ Add');
  });

  it('shows only the name when there is a single side effect', () => {
    expect(formatSideEffectSummary(effects.slice(0, 1))).toBe('sendEmail');
  });

  it('shows the first name and how many are hidden', () => {
    expect(formatSideEffectSummary(effects.slice(0, 2))).toBe('sendEmail and 1 more');
    expect(formatSideEffectSummary(effects)).toBe('sendEmail and 2 more');
  });

  it('lists everything in the tooltip', () => {
    expect(formatSideEffectTitle(effects)).toBe('1. sendEmail\n2. chargeCard\n3. writeAuditLog');
    expect(formatSideEffectTitle([])).toBe(EMPTY_SIDE_EFFECTS_LABEL);
  });
});

describe('labels', () => {
  it('describes state lists', () => {
    const labels = describeSideEffectList(sampleMachine(), {
      kind: 'state',
      stateId: 'draft',
      trigger: 'leave',
      phase: 'after',
    });
    expect(labels.title).toBe('Side effects · after leaving');
    expect(labels.description).toBe('Runs after leaving the state “Draft”.');
  });

  it('describes transition lists', () => {
    const labels = describeSideEffectList(sampleMachine(), {
      kind: 'transition',
      transitionId: 'pay',
      phase: 'before',
    });
    expect(labels.description).toBe('Runs before the transition “pay”.');
  });

  it('builds short chip labels', () => {
    expect(shortHookLabel({ kind: 'state', stateId: 'a', trigger: 'enter', phase: 'before' })).toBe(
      'before · enter',
    );
    expect(shortHookLabel({ kind: 'transition', transitionId: 'a', phase: 'after' })).toBe('after');
  });
});

describe('computeDropIndex', () => {
  const centers = [10, 30, 50];

  it('keeps the first slot above every row', () => {
    expect(computeDropIndex(centers, 0)).toBe(0);
  });

  it('lands on the row whose center the pointer passed', () => {
    expect(computeDropIndex(centers, 20)).toBe(1);
    expect(computeDropIndex(centers, 40)).toBe(2);
  });

  it('never goes past the last row', () => {
    expect(computeDropIndex(centers, 9999)).toBe(2);
    expect(computeDropIndex([], 10)).toBe(0);
  });
});
