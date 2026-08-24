import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineStateMachineEditor, type SideEffectsDialogElement } from '../src/index.js';
import { createSideEffect } from '../src/model/machine.js';
import type { SideEffect, SideEffectDefinition } from '../src/types.js';
import { CATALOG, fireKey, flush, queryAll, queryButton, queryOne, shadowOf } from './helpers.js';

function mountDialog(): SideEffectsDialogElement {
  defineStateMachineEditor();
  const dialog = document.createElement('state-machine-side-effects-dialog');
  document.body.append(dialog);
  return dialog;
}

/**
 * The catalog crosses an untrusted boundary at runtime, so this simulates a
 * malformed endpoint response without resorting to a type assertion.
 */
function malformedCatalog(): readonly SideEffectDefinition[] {
  const payload: readonly SideEffectDefinition[] = JSON.parse('[{"id":"a"},"nope"]');
  return payload;
}

function draftEffects(): readonly SideEffect[] {
  return [
    createSideEffect({ id: 'send-email', name: 'sendEmail' }, 'e1'),
    createSideEffect({ id: 'charge', name: 'chargeCard' }, 'e2'),
  ];
}

function rowNames(dialog: SideEffectsDialogElement): readonly string[] {
  return queryAll(shadowOf(dialog), '.row__name').map((row) => row.textContent ?? '');
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('side effects dialog', () => {
  it('lists the current side effects in execution order', async () => {
    const dialog = mountDialog();
    void dialog.open({ title: 'Side effects', description: 'test', effects: draftEffects() });
    await flush();

    expect(rowNames(dialog)).toEqual(['sendEmail', 'chargeCard']);
    expect(queryAll(shadowOf(dialog), '.row__order').map((cell) => cell.textContent)).toEqual([
      '1',
      '2',
    ]);
  });

  it('loads the catalog from the injected provider', async () => {
    const dialog = mountDialog();
    const provider = vi.fn(() => Promise.resolve(CATALOG));
    void dialog.open({ title: 'Side effects', description: 'test', effects: [], provider });
    await flush();

    expect(provider).toHaveBeenCalledTimes(1);
    const options = queryAll(shadowOf(dialog), 'option').map((option) => option.textContent);
    expect(options).toEqual([
      'Select a side effect…',
      'sendEmail — Notifies the customer',
      'chargeCard',
      'writeAuditLog',
    ]);
  });

  it('adds a side effect from the catalog and saves it', async () => {
    const dialog = mountDialog();
    const result = dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [],
      provider: () => CATALOG,
    });
    await flush();

    const select = shadowOf(dialog).querySelector('select');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing select');
    }
    select.value = 'charge';
    queryButton(shadowOf(dialog), '.add .button').click();
    expect(rowNames(dialog)).toEqual(['chargeCard']);

    queryButton(shadowOf(dialog), '.button--primary').click();
    const saved = await result;
    expect(saved?.map((effect) => effect.name)).toEqual(['chargeCard']);
    expect(saved?.[0]?.definitionId).toBe('charge');
  });

  it('removes a side effect', async () => {
    const dialog = mountDialog();
    void dialog.open({ title: 'Side effects', description: 'test', effects: draftEffects() });
    await flush();

    queryAll(shadowOf(dialog), '.row__remove')[0]?.click();
    expect(rowNames(dialog)).toEqual(['chargeCard']);
  });

  it('reorders with the keyboard, keeping focus on the moved handle', async () => {
    const dialog = mountDialog();
    void dialog.open({ title: 'Side effects', description: 'test', effects: draftEffects() });
    await flush();

    const handle = queryAll(shadowOf(dialog), '.row__handle')[0];
    if (handle === undefined) {
      throw new Error('missing handle');
    }
    fireKey(handle, 'ArrowDown', { altKey: true });
    expect(rowNames(dialog)).toEqual(['chargeCard', 'sendEmail']);
    expect(shadowOf(dialog).activeElement?.getAttribute('data-handle-index')).toBe('1');

    const moved = queryAll(shadowOf(dialog), '.row__handle')[1];
    if (moved === undefined) {
      throw new Error('missing handle');
    }
    fireKey(moved, 'ArrowUp', { altKey: true });
    expect(rowNames(dialog)).toEqual(['sendEmail', 'chargeCard']);
  });

  it('ignores arrow keys without the alt modifier', async () => {
    const dialog = mountDialog();
    void dialog.open({ title: 'Side effects', description: 'test', effects: draftEffects() });
    await flush();

    const handle = queryAll(shadowOf(dialog), '.row__handle')[0];
    if (handle === undefined) {
      throw new Error('missing handle');
    }
    fireKey(handle, 'ArrowDown');
    expect(rowNames(dialog)).toEqual(['sendEmail', 'chargeCard']);
  });

  it('resolves with null when cancelled', async () => {
    const dialog = mountDialog();
    const result = dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: draftEffects(),
    });
    await flush();
    queryAll(shadowOf(dialog), '.footer .button')[0]?.click();
    await expect(result).resolves.toBeNull();
  });

  it('resolves with null when Escape is pressed', async () => {
    const dialog = mountDialog();
    const result = dialog.open({ title: 'Side effects', description: 'test', effects: [] });
    await flush();
    fireKey(queryOne(shadowOf(dialog), '.panel'), 'Escape');
    await expect(result).resolves.toBeNull();
  });

  it('surfaces provider failures', async () => {
    const dialog = mountDialog();
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [],
      provider: () => Promise.reject(new Error('network down')),
    });
    await flush();

    const status = queryOne(shadowOf(dialog), '.status');
    expect(status.textContent).toContain('network down');
    expect(status.classList.contains('is-error')).toBe(true);
  });

  it('rejects an invalid catalog payload', async () => {
    const dialog = mountDialog();
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [],
      provider: () => Promise.resolve(malformedCatalog()),
    });
    await flush();
    expect(queryOne(shadowOf(dialog), '.status').textContent).toContain(
      'Invalid side effect catalog',
    );
  });

  it('is inert in read-only mode', async () => {
    const dialog = mountDialog();
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: draftEffects(),
      readOnly: true,
    });
    await flush();

    expect(queryButton(shadowOf(dialog), '.button--primary').hidden).toBe(true);
    expect(queryButton(shadowOf(dialog), '.row__handle').disabled).toBe(true);
    expect(queryButton(shadowOf(dialog), '.row__remove').disabled).toBe(true);
  });
});
