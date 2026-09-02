import { describe, expect, it } from 'vitest';
import { copyName } from '../src/model/clipboard.js';
import { parseParamsText } from '../src/model/json.js';
import { setSideEffects } from '../src/model/machine.js';
import {
  describeElement,
  describeSideEffectList,
  describeSource,
  historyLabel,
  shortHookLabel,
} from '../src/ui/labels.js';
import { emptyPropertiesDraft, PropertiesDialogElement } from '../src/ui/properties-dialog.js';
import {
  formatSideEffectHead,
  formatSideEffectSummary,
  formatSideEffectTitle,
} from '../src/ui/side-effect-summary.js';
import { formatParamsBadge, SideEffectsDialogElement } from '../src/ui/side-effects-dialog.js';
import {
  DEFAULT_STRINGS,
  isStringGroup,
  mergeStrings,
  STRING_GROUPS,
  type StringOverrides,
} from '../src/ui/strings.js';
import {
  flush,
  mountEditor,
  queryAll,
  queryButton,
  queryOne,
  sampleMachine,
  shadowOf,
  sideEffect,
} from './helpers.js';

/** The first hook on the sample machine's first state. */
const ENTER_DRAFT = {
  kind: 'state',
  stateId: 'draft',
  phase: 'before',
  trigger: 'enter',
} as const;

describe('the string set', () => {
  it('names a group for every part of the editor that speaks', () => {
    expect(STRING_GROUPS.length).toBe(Object.keys(DEFAULT_STRINGS).length);
    for (const group of STRING_GROUPS) {
      expect(Object.keys(DEFAULT_STRINGS[group]).length).toBeGreaterThan(0);
    }
  });

  it('recognizes its own group names and nothing else', () => {
    expect(isStringGroup('toolbar')).toBe(true);
    expect(isStringGroup('seed')).toBe(true);
    expect(isStringGroup('toString')).toBe(false);
    expect(isStringGroup('nope')).toBe(false);
  });

  it('keeps every unnamed string in English, inside a named group', () => {
    const merged = mergeStrings({ toolbar: { addState: 'Adicionar estado' } });
    expect(merged.toolbar.addState).toBe('Adicionar estado');
    expect(merged.toolbar.paste).toBe('Paste');
  });

  it('keeps every unnamed group in English', () => {
    const merged = mergeStrings({ toolbar: { addState: 'Adicionar estado' } });
    expect(merged.state.remove).toBe('Remove state');
    expect(merged.dialog.save).toBe('Save');
  });

  it('reads `undefined` as "not named" rather than as an error', () => {
    // Spreading a host's own optional config produces exactly this.
    const merged = mergeStrings({
      toolbar: { addState: undefined, fit: 'Ajustar' },
      state: undefined,
    });
    expect(merged.toolbar.addState).toBe('Add state');
    expect(merged.toolbar.fit).toBe('Ajustar');
    expect(merged.state.remove).toBe('Remove state');
  });

  it('puts everything back when given nothing at all', () => {
    expect(mergeStrings(undefined)).toBe(DEFAULT_STRINGS);
  });

  it('ignores a key the group does not have', () => {
    // A stale translation file must not smuggle anything into the set.
    const stale: StringOverrides = JSON.parse('{"toolbar": {"retired": "x", "fit": "Ajustar"}}');
    const merged = mergeStrings(stale);
    expect(merged.toolbar.fit).toBe('Ajustar');
    expect(Object.hasOwn(merged.toolbar, 'retired')).toBe(false);
  });
});

describe('a parametrized string', () => {
  it('is a function taking named values, not a template', () => {
    expect(DEFAULT_STRINGS.state.remove).toBe('Remove state');
    expect(typeof DEFAULT_STRINGS.card.toolsLabel).toBe('function');
    expect(DEFAULT_STRINGS.card.toolsLabel({ name: 'Draft' })).toBe('Tools for “Draft”');
  });

  it('leaves JSON in a plain string alone: there is no syntax to escape', () => {
    expect(DEFAULT_STRINGS.json.notObject).toContain('{"to": "user"}');
  });

  it('lets the host pick a plural form the default cannot', () => {
    // Russian: one form for 1, another for 2–4, a third for 5 and up.
    const plural = new Intl.PluralRules('ru');
    const FORMS: Record<string, string> = {
      one: 'элемент',
      few: 'элемента',
      many: 'элементов',
      other: 'элементов',
    };
    const strings = mergeStrings({
      json: { itemCount: ({ count }) => `${count} ${FORMS[plural.select(count)] ?? ''}` },
    });
    const forms = [1, 3, 7].map((count) => strings.json.itemCount({ count }));
    expect(forms).toEqual(['1 элемент', '3 элемента', '7 элементов']);
  });

  it('lets a sentence decide, rather than taking a pre-baked branch', () => {
    // `expanded` arrives as a boolean, so the wording is not two keys the
    // caller has already chosen between.
    const strings = mergeStrings({
      row: {
        paramsLabel: ({ name, count, expanded }) =>
          `${expanded ? 'Ocultar' : 'Editar'} ${count} par. de ${name}`,
      },
    });
    expect(strings.row.paramsLabel({ name: 'x', count: 2, expanded: true })).toBe(
      'Ocultar 2 par. de x',
    );
    expect(strings.row.paramsLabel({ name: 'x', count: 2, expanded: false })).toBe(
      'Editar 2 par. de x',
    );
  });
});

describe('the label helpers', () => {
  it('describes a state hook through the set it is given', () => {
    const strings = mergeStrings({
      phase: { before: 'antes' },
      triggerVerb: { enter: 'de entrar em' },
      sideEffects: {
        stateTitle: ({ phase, verb }) => `Efeitos · ${phase} ${verb}`,
        stateDescription: ({ phase, verb, name }) => `Executa ${phase} ${verb} o estado “${name}”.`,
      },
    });
    const labels = describeSideEffectList(sampleMachine(), ENTER_DRAFT, strings);
    expect(labels.title).toBe('Efeitos · antes de entrar em');
    expect(labels.description).toBe('Executa antes de entrar em o estado “Draft”.');
  });

  it('stays in English when no set is given', () => {
    const labels = describeSideEffectList(sampleMachine(), ENTER_DRAFT);
    expect(labels.title).toBe('Side effects · before entering');
    expect(labels.description).toBe('Runs before entering the state “Draft”.');
  });

  it('leaves the quotation marks around a name to the set', () => {
    const strings = mergeStrings({
      properties: { stateDescription: ({ name }) => `Atributos do estado «${name}».` },
    });
    const labels = describeElement(sampleMachine(), { kind: 'state', id: 'draft' }, strings);
    expect(labels.description).toBe('Atributos do estado «Draft».');
  });

  it('names a creation edge’s source through `source.start`', () => {
    const strings = mergeStrings({ source: { start: 'o início' } });
    expect(describeSource(sampleMachine(), null, strings)).toBe('o início');
    expect(describeSource(sampleMachine(), 'draft', strings)).toBe('Draft');
  });

  it('builds a hook chip label from the phase and the trigger', () => {
    const strings = mergeStrings({
      phase: { before: 'antes' },
      trigger: { enter: 'entrada' },
      chip: { hookLabel: ({ phase, trigger }) => `${trigger} · ${phase}` },
    });
    expect(shortHookLabel(ENTER_DRAFT, strings)).toBe('entrada · antes');
  });

  it('hands the change to a function rather than appending it', () => {
    // Where the verb goes is the sentence's business, not ours.
    const strings = mergeStrings({
      toolbar: { undoChange: ({ change }) => `${change} を元に戻す` },
      change: { 'state-add': '状態の追加' },
    });
    expect(historyLabel('undo', { kind: 'state-add', stateId: 'draft' }, strings)).toBe(
      '状態の追加 を元に戻す',
    );
  });

  it('falls back to the bare verb with nothing to take back', () => {
    const strings = mergeStrings({ toolbar: { redo: 'Refazer' } });
    expect(historyLabel('redo', undefined, strings)).toBe('Refazer');
  });

  it('names every kind of change', () => {
    const kinds = Object.keys(DEFAULT_STRINGS.change);
    expect(kinds).toContain('side-effects-change');
    expect(kinds).toContain('replace');
    expect(kinds).toContain('state-data');
    expect(kinds).toHaveLength(20);
  });
});

describe('the side effect summaries', () => {
  it('marks a disabled side effect through the set', () => {
    const strings = mergeStrings({
      sideEffect: { disabled: ({ name }) => `${name} [desligado]` },
    });
    const effects = [sideEffect('a', 'sendEmail', { enabled: false })];
    expect(formatSideEffectHead(effects, undefined, strings)).toBe('sendEmail [desligado]');
  });

  it('counts the rest through the set', () => {
    const strings = mergeStrings({
      sideEffect: { summary: ({ head, count }) => `${head} + ${count}` },
    });
    const effects = [sideEffect('a', 'one'), sideEffect('b', 'two'), sideEffect('c', 'three')];
    expect(formatSideEffectSummary(effects, undefined, strings)).toBe('one + 2');
  });

  it('lists the whole set in the tooltip, disabled entries marked', () => {
    const strings = mergeStrings({
      sideEffect: {
        titleEntry: ({ index, name, disabled }) => `${index}) ${name}${disabled ? ' ✗' : ''}`,
      },
    });
    const effects = [sideEffect('a', 'one'), sideEffect('b', 'two', { enabled: false })];
    expect(formatSideEffectTitle(effects, strings)).toBe('1) one\n2) two ✗');
  });

  it('reads the empty label off the set', () => {
    const strings = mergeStrings({ chip: { empty: 'Sem efeitos' } });
    expect(formatSideEffectTitle([], strings)).toBe('Sem efeitos');
    expect(formatSideEffectHead([], undefined, strings)).toBe('Sem efeitos');
  });

  it('still honours an explicit empty label over the set', () => {
    const strings = mergeStrings({ chip: { empty: 'Sem efeitos' } });
    expect(formatSideEffectHead([], 'nothing', strings)).toBe('nothing');
  });
});

describe('the parameters badge', () => {
  it('lets one function cover both the empty and the counted form', () => {
    const strings = mergeStrings({
      params: { badge: ({ count }) => (count === 0 ? '∅' : `${count} par.`) },
    });
    expect(formatParamsBadge({}, strings)).toBe('∅');
    expect(formatParamsBadge({ to: 'user' }, strings)).toBe('1 par.');
  });
});

describe('the JSON parser messages', () => {
  it('reports a non-object through the messages it is given', () => {
    const result = parseParamsText('[1, 2]', {
      invalid: 'inválido',
      notJsonValues: 'não é JSON',
      notObject: 'precisa ser um objeto',
    });
    expect(result).toEqual({ ok: false, error: 'precisa ser um objeto' });
  });

  it('stays in English when no messages are given', () => {
    expect(parseParamsText('[1, 2]').ok).toBe(false);
  });
});

describe('the copy suffix', () => {
  it('appends the suffix it is given', () => {
    expect(copyName('Draft', 'cópia')).toBe('Draft cópia');
  });

  it('replaces a suffix already there rather than stacking one', () => {
    expect(copyName('Draft cópia', 'cópia')).toBe('Draft cópia');
    expect(copyName('Draft cópia 2', 'cópia')).toBe('Draft cópia');
  });

  it('treats a suffix with regexp syntax in it as plain words', () => {
    expect(copyName('Draft (copy)', '(copy)')).toBe('Draft (copy)');
  });
});

describe('the editor', () => {
  it('translates the toolbar in place, without a rebuild', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    await flush();
    const shadow = shadowOf(editor);

    editor.strings = {
      toolbar: { addState: 'Adicionar estado', organize: 'Organizar', fit: 'Ajustar' },
    };
    await flush();

    expect(queryButton(shadow, '.toolbar__add').textContent).toBe('Adicionar estado');
    expect(queryButton(shadow, '.toolbar__organize').textContent).toBe('Organizar');
    expect(queryOne(shadow, '.toolbar').getAttribute('aria-label')).toBe('Editor tools');
    editor.remove();
  });

  it('rebuilds the cards so their labels follow the set', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    await flush();
    const shadow = shadowOf(editor);

    editor.strings = { state: { remove: 'Remover estado', rename: 'Renomear estado' } };
    await flush();

    const card = queryOne(shadow, '[data-state-id="draft"]');
    expect(queryButton(card, '.node__remove').getAttribute('aria-label')).toBe('Remover estado');
    expect(queryButton(card, '.node__rename').getAttribute('aria-label')).toBe('Renomear estado');
    editor.remove();
  });

  it('passes the whole set back, defaults filled in', () => {
    const editor = mountEditor();
    editor.strings = { toolbar: { fit: 'Ajustar' } };
    expect(editor.strings.toolbar.fit).toBe('Ajustar');
    expect(editor.strings.toolbar.paste).toBe('Paste');
    editor.remove();
  });

  it('puts every string back when assigned `undefined`', async () => {
    const editor = mountEditor();
    editor.strings = { toolbar: { addState: 'Adicionar estado' } };
    await flush();
    editor.strings = undefined;
    await flush();
    expect(queryButton(shadowOf(editor), '.toolbar__add').textContent).toBe('Add state');
    editor.remove();
  });

  it('names the empty canvas through the set', async () => {
    const editor = mountEditor();
    editor.strings = { canvas: { empty: 'Nenhum estado ainda.' } };
    await flush();
    expect(queryOne(shadowOf(editor), '.empty-state').textContent).toBe('Nenhum estado ainda.');
    editor.remove();
  });

  it('names the theme toggle after the scheme it switches to', async () => {
    const editor = mountEditor();
    editor.strings = { toolbar: { themeLight: 'Tema claro', themeDark: 'Tema escuro' } };
    await flush();
    const button = queryButton(shadowOf(editor), '.toolbar__theme');
    expect(button.getAttribute('aria-label')).toBe('Tema claro');
    editor.toggleTheme();
    await flush();
    expect(button.getAttribute('aria-label')).toBe('Tema escuro');
    editor.remove();
  });

  it('seeds a new state with the translated name', () => {
    const editor = mountEditor();
    editor.strings = { seed: { stateName: ({ index }) => `Estado ${index}` } };
    expect(editor.addState().name).toBe('Estado 1');
    editor.remove();
  });

  it('seeds a creation transition with the translated name', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.strings = { seed: { creationName: 'criar' } };
    expect(editor.addTransition(null, 'draft').name).toBe('criar');
    editor.remove();
  });

  it('names a pasted copy with the translated suffix', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.strings = { seed: { copySuffix: 'cópia' } };
    editor.selection = { kind: 'state', id: 'draft' };
    expect(editor.copySelection()).toBe(true);
    expect(editor.paste()).not.toBeNull();
    expect(editor.value.states.map((state) => state.name)).toContain('Draft cópia');
    editor.remove();
  });

  it('names the undo button after what it would take back', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.strings = {
      toolbar: { undoChange: ({ change }) => `Desfazer ${change}` },
      change: { 'state-add': 'adicionar estado' },
    };
    editor.addState();
    await flush();
    const undo = queryButton(shadowOf(editor), '.toolbar__history');
    expect(undo.getAttribute('aria-label')).toBe('Desfazer adicionar estado');
    editor.remove();
  });

  it('names a colour through the set', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.strings = {
      color: { neutral: 'neutro' },
      state: { colorTitle: ({ color }) => `Cor: ${color}` },
    };
    await flush();
    const card = queryOne(shadowOf(editor), '[data-state-id="draft"]');
    expect(queryButton(card, '.node__color').title).toBe('Cor: neutro');
    editor.remove();
  });

  it('hands its set down to the side effects dialog', async () => {
    const editor = mountEditor();
    editor.value = setSideEffects(sampleMachine(), ENTER_DRAFT, [sideEffect('a', 'sendEmail')]);
    editor.strings = {
      row: { remove: ({ name }) => `Remover ${name}` },
      sideEffects: { add: 'Adicionar' },
    };
    const open = editor.openSideEffects(ENTER_DRAFT);
    await flush();

    const panel = shadowOf(queryOne(shadowOf(editor), SideEffectsDialogElement.tagName));
    expect(queryButton(panel, '.row__remove').getAttribute('aria-label')).toBe('Remover sendEmail');
    expect(queryAll(panel, '.add .button')[0]?.textContent).toBe('Adicionar');

    queryAll(panel, '.footer .button')[0]?.click();
    await open;
    editor.remove();
  });

  it('hands its set down to the properties dialog', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.strings = { properties: { fieldGuard: 'Condição' }, dialog: { save: 'Guardar' } };
    const open = editor.openProperties({ kind: 'transition', id: 'pay' });
    await flush();

    const panel = shadowOf(queryOne(shadowOf(editor), PropertiesDialogElement.tagName));
    expect(queryOne(panel, '[data-field-row="guard"] .field__label').textContent).toBe('Condição');
    expect(queryAll(panel, '.footer .button')[1]?.textContent).toBe('Guardar');

    queryAll(panel, '.footer .button')[0]?.click();
    await open;
    editor.remove();
  });
});

describe('a dialog driven on its own', () => {
  it('takes a set through its `strings` property', async () => {
    const dialog = new PropertiesDialogElement();
    document.body.append(dialog);
    dialog.strings = {
      properties: { fieldDescription: 'Descrição' },
      dialog: { cancel: 'Cancelar' },
    };
    const open = dialog.open({
      title: 'x',
      description: 'y',
      kind: 'state',
      values: emptyPropertiesDraft(),
    });
    await flush();
    const shadow = shadowOf(dialog);
    expect(queryOne(shadow, '[data-field-row="description"] .field__label').textContent).toBe(
      'Descrição',
    );
    expect(queryAll(shadow, '.footer .button')[0]?.textContent).toBe('Cancelar');
    queryAll(shadow, '.footer .button')[0]?.click();
    await open;
    dialog.remove();
  });

  it('takes a set through its open options', async () => {
    const dialog = new SideEffectsDialogElement();
    document.body.append(dialog);
    const open = dialog.open({
      title: 'x',
      description: 'y',
      effects: [],
      strings: { sideEffects: { empty: 'Nenhum efeito ainda.' } },
    });
    await flush();
    expect(queryOne(shadowOf(dialog), '.empty').textContent).toBe('Nenhum efeito ainda.');
    queryAll(shadowOf(dialog), '.footer .button')[0]?.click();
    await open;
    dialog.remove();
  });
});

describe('a translation loaded as data', () => {
  it('applies the plain strings a JSON file can carry', () => {
    // What a host's translation backend actually hands back: the strings that
    // take no values. The parametrized ones are functions, so they stay in code.
    const loaded: StringOverrides = JSON.parse(
      JSON.stringify({
        toolbar: { addState: 'Adicionar estado', fit: 'Ajustar' },
        dialog: { save: 'Guardar', cancel: 'Cancelar' },
        color: { success: 'sucesso' },
      }),
    );
    const merged = mergeStrings(loaded);
    expect(merged.toolbar.addState).toBe('Adicionar estado');
    expect(merged.dialog.save).toBe('Guardar');
    expect(merged.color.success).toBe('sucesso');
    // Untouched groups and the parametrized keys keep what they had.
    expect(merged.state.remove).toBe('Remove state');
    expect(merged.json.itemCount({ count: 1 })).toBe('1 item');
  });
});
