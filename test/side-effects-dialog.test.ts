import { undo } from '@codemirror/commands';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineStateMachineEditor, type SideEffectsDialogElement } from '../src/index.js';
import { formatJson } from '../src/model/json.js';
import { createSideEffect } from '../src/model/machine.js';
import type { SideEffect, SideEffectDefinition } from '../src/types.js';
import {
  CATALOG,
  codeEditor,
  fireKey,
  flush,
  queryAll,
  queryButton,
  queryOne,
  readCode,
  shadowOf,
  typeCode,
  waitForCodeEditor,
} from './helpers.js';

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
  it('keeps a long name readable when it has to be truncated', async () => {
    const dialog = mountDialog();
    const name = 'sendOrderConfirmationEmailToCustomerServiceAndAlsoToBilling';
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [createSideEffect({ id: 'send-email', name }, 'e1')],
    });
    await flush();

    // The row truncates with an ellipsis in CSS, so the full name lives in the
    // tooltip. Layout itself is verified in a browser; jsdom has none.
    expect(queryOne(shadowOf(dialog), '.row__name').title).toBe(name);
  });

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

describe('side effect parameters', () => {
  function openWithParams(dialog: SideEffectsDialogElement): void {
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [
        createSideEffect({ id: 'send-email', name: 'sendEmail' }, 'e1'),
        {
          ...createSideEffect({ id: 'charge', name: 'chargeCard' }, 'e2'),
          params: { amount: 10, currency: 'BRL' },
        },
      ],
    });
  }

  function paramsToggles(dialog: SideEffectsDialogElement): readonly HTMLElement[] {
    return queryAll(shadowOf(dialog), '.row__params');
  }

  it('shows how many parameters each side effect carries', async () => {
    const dialog = mountDialog();
    openWithParams(dialog);
    await flush();

    const toggles = paramsToggles(dialog);
    expect(toggles[0]?.textContent).toBe('{ }');
    expect(toggles[0]?.classList.contains('is-set')).toBe(false);
    expect(toggles[1]?.textContent).toBe('{ } 2');
    expect(toggles[1]?.classList.contains('is-set')).toBe(true);
    expect(toggles[1]?.getAttribute('aria-label')).toBe('Edit parameters of chargeCard, 2 set');
  });

  it('opens one parameter editor at a time', async () => {
    const dialog = mountDialog();
    openWithParams(dialog);
    await flush();

    paramsToggles(dialog)[0]?.click();
    expect(shadowOf(dialog).querySelectorAll('.params')).toHaveLength(1);
    expect(paramsToggles(dialog)[0]?.getAttribute('aria-expanded')).toBe('true');

    paramsToggles(dialog)[1]?.click();
    expect(shadowOf(dialog).querySelectorAll('.params')).toHaveLength(1);
    expect(paramsToggles(dialog)[0]?.getAttribute('aria-expanded')).toBe('false');
    expect(paramsToggles(dialog)[1]?.getAttribute('aria-expanded')).toBe('true');

    paramsToggles(dialog)[1]?.click();
    expect(shadowOf(dialog).querySelectorAll('.params')).toHaveLength(0);
  });

  it('renders one form row per parameter, with its type', async () => {
    const dialog = mountDialog();
    openWithParams(dialog);
    await flush();
    paramsToggles(dialog)[1]?.click();

    const shadow = shadowOf(dialog);
    const keys = queryAll(shadow, '.jf-key').map((input) =>
      input instanceof HTMLInputElement ? input.value : '',
    );
    expect(keys).toEqual(['amount', 'currency']);
    const types = queryAll(shadow, '.jf-type').map((select) =>
      select instanceof HTMLSelectElement ? select.value : '',
    );
    expect(types).toEqual(['number', 'string']);
  });

  it('edits a value through the form and keeps it on save', async () => {
    const dialog = mountDialog();
    const result = dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [
        {
          ...createSideEffect({ id: 'charge', name: 'chargeCard' }, 'e1'),
          params: { amount: 10 },
        },
      ],
    });
    await flush();
    queryButton(shadowOf(dialog), '.row__params').click();

    const value = shadowOf(dialog).querySelector('.jf-value');
    if (!(value instanceof HTMLInputElement)) {
      throw new Error('missing value input');
    }
    value.value = '42';
    value.dispatchEvent(new Event('change', { bubbles: true }));

    queryButton(shadowOf(dialog), '.button--primary').click();
    const saved = await result;
    expect(saved?.[0]?.params).toEqual({ amount: 42 });
  });

  it('adds, renames, retypes and removes fields', async () => {
    const dialog = mountDialog();
    const result = dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [createSideEffect({ id: 'charge', name: 'chargeCard' }, 'e1')],
    });
    await flush();
    const shadow = shadowOf(dialog);
    queryButton(shadow, '.row__params').click();

    queryButton(shadow, '.jf-add').click();
    expect(dialog.effects[0]?.params).toEqual({ key: '' });

    const key = shadow.querySelector('.jf-key');
    if (!(key instanceof HTMLInputElement)) {
      throw new Error('missing key input');
    }
    key.value = 'retries';
    key.dispatchEvent(new Event('change', { bubbles: true }));
    expect(dialog.effects[0]?.params).toEqual({ retries: '' });

    const type = shadow.querySelector('.jf-type');
    if (!(type instanceof HTMLSelectElement)) {
      throw new Error('missing type select');
    }
    type.value = 'number';
    type.dispatchEvent(new Event('change', { bubbles: true }));
    expect(dialog.effects[0]?.params).toEqual({ retries: 0 });

    // The badge tracks the count while the editor is open.
    expect(queryButton(shadow, '.row__params').textContent).toBe('{ } 1');

    queryButton(shadow, '.jf-remove').click();
    expect(dialog.effects[0]?.params).toEqual({});

    queryButton(shadow, '.button--primary').click();
    const saved = await result;
    expect(saved?.[0]?.params).toEqual({});
  });

  it('nests objects and arrays', async () => {
    const dialog = mountDialog();
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [
        {
          ...createSideEffect({ id: 'charge', name: 'chargeCard' }, 'e1'),
          params: { meta: { locale: 'pt-BR' }, tags: ['a'] },
        },
      ],
    });
    await flush();
    const shadow = shadowOf(dialog);
    queryButton(shadow, '.row__params').click();

    // Parent rows summarise, children render their own row underneath.
    expect(queryAll(shadow, '.jf-summary').map((s) => s.textContent)).toEqual([
      '1 field',
      '1 item',
    ]);
    expect(queryAll(shadow, '.jf-index').map((s) => s.textContent)).toEqual(['0:']);
    const keys = queryAll(shadow, '.jf-key').map((input) =>
      input instanceof HTMLInputElement ? input.value : '',
    );
    expect(keys).toEqual(['meta', 'locale', 'tags']);
  });

  it('edits the same parameters as raw JSON', async () => {
    const dialog = mountDialog();
    const result = dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [
        {
          ...createSideEffect({ id: 'charge', name: 'chargeCard' }, 'e1'),
          params: { amount: 10 },
        },
      ],
    });
    await flush();
    const shadow = shadowOf(dialog);
    queryButton(shadow, '.row__params').click();
    queryAll(shadow, '.params__mode')[1]?.click();
    await waitForCodeEditor(shadow);

    expect(readCode(shadow)).toBe('{\n  "amount": 10\n}');

    typeCode(shadow, '{"amount": 99, "note": "manual"}');
    expect(queryOne(shadow, '.params__error').textContent).toBe('');

    queryButton(shadow, '.button--primary').click();
    const saved = await result;
    expect(saved?.[0]?.params).toEqual({ amount: 99, note: 'manual' });
  });

  it('reports invalid JSON and keeps the last good value', async () => {
    const dialog = mountDialog();
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [
        {
          ...createSideEffect({ id: 'charge', name: 'chargeCard' }, 'e1'),
          params: { amount: 10 },
        },
      ],
    });
    await flush();
    const shadow = shadowOf(dialog);
    queryButton(shadow, '.row__params').click();
    queryAll(shadow, '.params__mode')[1]?.click();
    await waitForCodeEditor(shadow);

    typeCode(shadow, '{"amount": }');

    expect(queryOne(shadow, '.params__error').textContent?.length).toBeGreaterThan(0);
    expect(dialog.effects[0]?.params).toEqual({ amount: 10 });

    // Switching back to the form is refused while the text does not parse.
    queryAll(shadow, '.params__mode')[0]?.click();
    expect(queryOne(shadow, '.params__json').hidden).toBe(false);
  });

  it('carries edits from the JSON tab back into the form', async () => {
    const dialog = mountDialog();
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [createSideEffect({ id: 'charge', name: 'chargeCard' }, 'e1')],
    });
    await flush();
    const shadow = shadowOf(dialog);
    queryButton(shadow, '.row__params').click();
    queryAll(shadow, '.params__mode')[1]?.click();
    await waitForCodeEditor(shadow);

    typeCode(shadow, '{"to": "user", "retries": 2}');
    queryAll(shadow, '.params__mode')[0]?.click();

    const keys = queryAll(shadow, '.jf-key').map((input) =>
      input instanceof HTMLInputElement ? input.value : '',
    );
    expect(keys).toEqual(['to', 'retries']);
  });

  it('prefills parameters from the catalog defaults', async () => {
    const dialog = mountDialog();
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [],
      provider: () => [{ id: 'charge', name: 'chargeCard', defaultParams: { currency: 'BRL' } }],
    });
    await flush();

    const shadow = shadowOf(dialog);
    const select = shadow.querySelector('select');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing select');
    }
    select.value = 'charge';
    queryButton(shadow, '.add .button').click();

    expect(dialog.effects[0]?.params).toEqual({ currency: 'BRL' });
    expect(queryButton(shadow, '.row__params').textContent).toBe('{ } 1');
  });

  it('is read-only when the dialog is', async () => {
    const dialog = mountDialog();
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      readOnly: true,
      effects: [
        {
          ...createSideEffect({ id: 'charge', name: 'chargeCard' }, 'e1'),
          params: { amount: 10 },
        },
      ],
    });
    await flush();
    const shadow = shadowOf(dialog);
    queryButton(shadow, '.row__params').click();

    expect(shadow.querySelector('.jf-add')).toBeNull();
    expect(shadow.querySelector('.jf-remove')).toBeNull();
    const value = shadow.querySelector('.jf-value');
    expect(value instanceof HTMLInputElement && value.disabled).toBe(true);
  });
});

describe('the JSON editor', () => {
  async function openJsonTab(dialog: SideEffectsDialogElement): Promise<ShadowRoot> {
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      effects: [
        {
          ...createSideEffect({ id: 'charge', name: 'chargeCard' }, 'e1'),
          params: { amount: 10, note: 'manual', ok: true, missing: null },
        },
      ],
    });
    await flush();
    const shadow = shadowOf(dialog);
    queryButton(shadow, '.row__params').click();
    queryAll(shadow, '.params__mode')[1]?.click();
    await waitForCodeEditor(shadow);
    return shadow;
  }

  it('mounts CodeMirror inside the dialog shadow root', async () => {
    const dialog = mountDialog();
    const shadow = await openJsonTab(dialog);
    expect(shadow.querySelector('.cm-editor')).not.toBeNull();
    // The editor must live in the shadow root, not leak into the document.
    expect(document.querySelector('.cm-editor')).toBeNull();
  });

  it('highlights the document, naming each kind of token', async () => {
    const dialog = mountDialog();
    const shadow = await openJsonTab(dialog);

    const view = codeEditor(shadow);
    // CodeMirror renders lazily; force the viewport to be measured.
    view.dispatch({ selection: { anchor: 0 } });
    const styled = shadow.querySelectorAll('.cm-line span');
    expect(styled.length).toBeGreaterThan(0);
  });

  it('gives the editor an accessible name', async () => {
    const dialog = mountDialog();
    const shadow = await openJsonTab(dialog);
    expect(shadow.querySelector('.cm-content')?.getAttribute('aria-label')).toBe(
      'Parameters of chargeCard as JSON',
    );
  });

  it('supports undo through CodeMirror history', async () => {
    const dialog = mountDialog();
    const shadow = await openJsonTab(dialog);

    typeCode(shadow, '{"amount": 99}');
    expect(dialog.effects[0]?.params).toEqual({ amount: 99 });

    undo(codeEditor(shadow));
    expect(readCode(shadow)).toBe(
      formatJson({ amount: 10, note: 'manual', ok: true, missing: null }),
    );
    expect(dialog.effects[0]?.params).toEqual({
      amount: 10,
      note: 'manual',
      ok: true,
      missing: null,
    });
  });

  it('is not editable when the dialog is read-only', async () => {
    const dialog = mountDialog();
    void dialog.open({
      title: 'Side effects',
      description: 'test',
      readOnly: true,
      effects: [
        {
          ...createSideEffect({ id: 'charge', name: 'chargeCard' }, 'e1'),
          params: { amount: 10 },
        },
      ],
    });
    await flush();
    const shadow = shadowOf(dialog);
    queryButton(shadow, '.row__params').click();
    queryAll(shadow, '.params__mode')[1]?.click();
    await waitForCodeEditor(shadow);

    expect(codeEditor(shadow).state.readOnly).toBe(true);
    expect(shadow.querySelector('.cm-content')?.getAttribute('contenteditable')).not.toBe('true');
  });

  it('tears the editor down when the panel closes', async () => {
    const dialog = mountDialog();
    const shadow = await openJsonTab(dialog);
    expect(shadow.querySelector('.cm-editor')).not.toBeNull();

    // Collapsing the row re-renders the list, which must dispose the view.
    queryButton(shadow, '.row__params').click();
    expect(shadow.querySelector('.cm-editor')).toBeNull();
  });

  it('tears the editor down when the dialog closes', async () => {
    const dialog = mountDialog();
    const shadow = await openJsonTab(dialog);
    queryAll(shadow, '.footer .button')[0]?.click();
    expect(shadow.querySelector('.cm-editor')).toBeNull();
  });
});
