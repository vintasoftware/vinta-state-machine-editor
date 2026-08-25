import { describe, expect, it } from 'vitest';
import {
  addSideEffect,
  addState,
  canPaste,
  copyElement,
  copyName,
  createState,
  createTransition,
  duplicateState,
  duplicateTransition,
  getSideEffects,
  uniqueName,
  uniqueStateName,
} from '../src/index.js';
import type { SideEffectListRef, StateMachine } from '../src/types.js';
import { sampleMachine, sideEffect } from './helpers.js';

const ENTER_BEFORE: SideEffectListRef = {
  kind: 'state',
  stateId: 'draft',
  trigger: 'enter',
  phase: 'before',
};

/** The sample machine, with one side effect on `draft` and one on `pay`. */
function machineWithEffects(): StateMachine {
  const machine = addSideEffect(sampleMachine(), ENTER_BEFORE, sideEffect('effect-1', 'sendEmail'));
  return addSideEffect(
    machine,
    { kind: 'transition', transitionId: 'pay', phase: 'after' },
    sideEffect('effect-2', 'chargeCard'),
  );
}

describe('copyName', () => {
  it('marks a copy', () => {
    expect(copyName('Draft')).toBe('Draft copy');
  });

  it('replaces a suffix already there rather than stacking one', () => {
    expect(copyName('Draft copy')).toBe('Draft copy');
    expect(copyName('Draft copy 4')).toBe('Draft copy');
  });

  it('leaves a word that merely ends in copy alone', () => {
    expect(copyName('Photocopy')).toBe('Photocopy copy');
  });
});

describe('unique names', () => {
  it('numbers from two, and only when it has to', () => {
    expect(uniqueName('Draft', new Set())).toBe('Draft');
    expect(uniqueName('Draft', new Set(['Draft']))).toBe('Draft 2');
    expect(uniqueName('Draft', new Set(['Draft', 'Draft 2', 'Draft 3']))).toBe('Draft 4');
  });

  it('reads the names a machine already holds', () => {
    const machine = addState(
      sampleMachine(),
      createState({ id: 'extra', name: 'Draft copy', position: { x: 0, y: 0 } }),
    );
    expect(uniqueStateName(machine, 'Draft copy')).toBe('Draft copy 2');
    expect(uniqueStateName(machine, 'Anything')).toBe('Anything');
  });
});

describe('copyElement', () => {
  it('takes the element itself, which cannot drift once it is taken', () => {
    const machine = sampleMachine();
    const entry = copyElement(machine, { kind: 'state', id: 'draft' });
    expect(entry).toEqual({ kind: 'state', state: machine.states[0] });

    const edge = copyElement(machine, { kind: 'transition', id: 'pay' });
    expect(edge).toEqual({ kind: 'transition', transition: machine.transitions[0] });
  });

  it('returns nothing for an element that is not there', () => {
    const machine = sampleMachine();
    expect(copyElement(machine, { kind: 'state', id: 'ghost' })).toBeUndefined();
    expect(copyElement(machine, { kind: 'transition', id: 'ghost' })).toBeUndefined();
  });
});

describe('canPaste', () => {
  it('refuses an empty clipboard', () => {
    expect(canPaste(sampleMachine(), null)).toBe(false);
  });

  it('takes a state into any machine, including one it never came from', () => {
    const entry = copyElement(sampleMachine(), { kind: 'state', id: 'draft' });
    expect(canPaste({ ...sampleMachine(), states: [], transitions: [] }, entry ?? null)).toBe(true);
  });

  it('needs both of a transition’s endpoints', () => {
    const machine = sampleMachine();
    const entry = copyElement(machine, { kind: 'transition', id: 'pay' });
    expect(canPaste(machine, entry ?? null)).toBe(true);
    expect(canPaste({ ...machine, states: machine.states.slice(0, 1) }, entry ?? null)).toBe(false);
  });

  it('takes a creation edge as long as its target is there', () => {
    const machine = sampleMachine();
    const creation = createTransition({ id: 'create', name: 'create', from: null, to: 'draft' });
    const entry = copyElement(
      { ...machine, transitions: [...machine.transitions, creation] },
      { kind: 'transition', id: 'create' },
    );
    expect(canPaste(machine, entry ?? null)).toBe(true);
    expect(canPaste({ ...machine, states: machine.states.slice(1) }, entry ?? null)).toBe(false);
  });
});

describe('duplicateState', () => {
  it('carries everything but the identity', () => {
    const machine = machineWithEffects();
    const original = machine.states[0];
    if (original === undefined) {
      throw new Error('missing state');
    }
    const copy = duplicateState(
      { ...original, color: 'warning', description: 'Waiting.', data: { owner: 'billing' } },
      { name: 'Draft copy', position: { x: 40, y: 60 } },
    );

    expect(copy.name).toBe('Draft copy');
    expect(copy.position).toEqual({ x: 40, y: 60 });
    expect(copy.color).toBe('warning');
    expect(copy.description).toBe('Waiting.');
    expect(copy.data).toEqual({ owner: 'billing' });
    expect(copy.id).not.toBe(original.id);
  });

  it('gives every copied side effect an id of its own', () => {
    const machine = machineWithEffects();
    const original = machine.states[0];
    if (original === undefined) {
      throw new Error('missing state');
    }
    const copy = duplicateState(original, { name: 'x', position: { x: 0, y: 0 } });

    const [copied] = copy.onEnter.before;
    expect(copied?.name).toBe('sendEmail');
    expect(copied?.id).not.toBe('effect-1');
    // The definition behind the attachment is the same one, though.
    expect(copied?.definitionId).toBe('definition');
    expect(getSideEffects(machine, ENTER_BEFORE)[0]?.id).toBe('effect-1');
  });
});

describe('duplicateTransition', () => {
  it('keeps the endpoints and every attribute', () => {
    const machine = machineWithEffects();
    const original = machine.transitions[0];
    if (original === undefined) {
      throw new Error('missing transition');
    }
    const copy = duplicateTransition(
      {
        ...original,
        trigger: { id: 'pay-action', name: 'pay' },
        guard: 'order.total > 0',
        requiredPermission: 'orders.pay',
        description: 'Captures the payment.',
      },
      { name: 'pay copy', labelOffset: { x: 0, y: 80 } },
    );

    expect(copy.from).toBe('draft');
    expect(copy.to).toBe('paid');
    expect(copy.name).toBe('pay copy');
    expect(copy.labelOffset).toEqual({ x: 0, y: 80 });
    expect(copy.trigger).toEqual({ id: 'pay-action', name: 'pay' });
    expect(copy.guard).toBe('order.total > 0');
    expect(copy.requiredPermission).toBe('orders.pay');
    expect(copy.description).toBe('Captures the payment.');
    expect(copy.id).not.toBe(original.id);
    expect(copy.effects.after[0]?.id).not.toBe('effect-2');
    expect(copy.effects.after[0]?.name).toBe('chargeCard');
  });
});
