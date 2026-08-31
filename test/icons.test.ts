import { beforeEach, describe, expect, it } from 'vitest';
import { setSideEffects } from '../src/model/machine.js';
import {
  clearIcon,
  createIconButton,
  DEFAULT_ICONS,
  ICON_NAMES,
  isIconName,
  mergeIcons,
  refreshIcons,
  setIcon,
} from '../src/ui/icons.js';
import { emptyPropertiesDraft, PropertiesDialogElement } from '../src/ui/properties-dialog.js';
import { SideEffectsDialogElement } from '../src/ui/side-effects-dialog.js';
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

function svgIcon(id: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('data-id', id);
  return svg;
}

describe('the icon set', () => {
  it('names an icon for every glyph the editor draws', () => {
    expect(ICON_NAMES.length).toBe(Object.keys(DEFAULT_ICONS).length);
    for (const name of ICON_NAMES) {
      expect(DEFAULT_ICONS[name]).toBeTruthy();
    }
  });

  it('recognizes its own names and nothing else', () => {
    expect(isIconName('rename')).toBe(true);
    expect(isIconName('dragHandle')).toBe(true);
    expect(isIconName('Rename')).toBe(false);
    expect(isIconName('toString')).toBe(false);
  });

  it('keeps every icon a host does not name', () => {
    const merged = mergeIcons({ rename: '📝' });
    expect(merged.rename).toBe('📝');
    expect(merged.remove).toBe(DEFAULT_ICONS.remove);
    expect(Object.keys(merged).length).toBe(ICON_NAMES.length);
  });

  it('reads an undefined entry as “not named”, not as an empty icon', () => {
    expect(mergeIcons({ rename: undefined }).rename).toBe(DEFAULT_ICONS.rename);
    expect(mergeIcons(undefined)).toBe(DEFAULT_ICONS);
  });

  it('never mutates the defaults', () => {
    mergeIcons({ undo: 'X' });
    expect(DEFAULT_ICONS.undo).toBe('↶');
  });
});

describe('drawing one icon', () => {
  it('draws a string as text, never as markup', () => {
    const button = createIconButton(mergeIcons({ remove: '<b>x</b>' }), 'remove');
    expect(button.textContent).toBe('<b>x</b>');
    expect(button.querySelector('b')).toBeNull();
  });

  it('copies a node, so the same icon can be in many buttons at once', () => {
    const template = svgIcon('shared');
    const icons = mergeIcons({ rename: template });
    const first = createIconButton(icons, 'rename');
    const second = createIconButton(icons, 'rename');

    expect(first.querySelector('svg')).not.toBeNull();
    expect(second.querySelector('svg')).not.toBeNull();
    expect(first.querySelector('svg')).not.toBe(second.querySelector('svg'));
    // The host's own node is left where it was, unattached.
    expect(template.parentNode).toBeNull();
  });

  it('calls a factory once per button', () => {
    let calls = 0;
    const icons = mergeIcons({
      rename: () => {
        calls += 1;
        return svgIcon(`made-${calls}`);
      },
    });
    createIconButton(icons, 'rename');
    createIconButton(icons, 'rename');
    expect(calls).toBe(2);
  });

  it('puts a label after the icon', () => {
    const button = createIconButton(DEFAULT_ICONS, 'add', { label: 'Creation' });
    expect(button.textContent).toBe('+ Creation');
  });

  it('wraps every icon in a part a host can reach from outside the shadow root', () => {
    const button = createIconButton(DEFAULT_ICONS, 'undo');
    expect(queryOne(button, '.icon').getAttribute('part')).toBe('icon');
  });
});

describe('redrawing icons in place', () => {
  it('redraws every icon under a root, label and all', () => {
    const root = document.createElement('div');
    const rename = createIconButton(DEFAULT_ICONS, 'rename', { parent: root });
    const role = createIconButton(DEFAULT_ICONS, 'initial', { parent: root, label: 'Initial' });

    refreshIcons(root, mergeIcons({ rename: '📝', initial: '●' }));

    expect(rename.textContent).toBe('📝');
    expect(role.textContent).toBe('● Initial');
  });

  it('leaves an element alone once its icon is cleared', () => {
    const root = document.createElement('div');
    const button = createIconButton(DEFAULT_ICONS, 'add', { parent: root, label: 'Add' });
    clearIcon(button);
    button.textContent = 'sendEmail';

    refreshIcons(root, mergeIcons({ add: '✚' }));

    expect(button.textContent).toBe('sendEmail');
  });

  it('ignores an element carrying a name it does not know', () => {
    const root = document.createElement('div');
    const stray = document.createElement('span');
    stray.setAttribute('data-icon', 'nonsense');
    stray.textContent = 'left alone';
    root.append(stray);

    refreshIcons(root, DEFAULT_ICONS);

    expect(stray.textContent).toBe('left alone');
  });

  it('replaces what was drawn before rather than adding to it', () => {
    const element = document.createElement('button');
    setIcon(element, DEFAULT_ICONS, 'undo');
    setIcon(element, mergeIcons({ redo: '⟳' }), 'redo');
    expect(element.textContent).toBe('⟳');
    expect(element.children.length).toBe(1);
  });
});

describe('the editor’s icons', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('starts on the defaults, and reads the whole set back', () => {
    const editor = mountEditor();
    expect(editor.icons).toEqual(DEFAULT_ICONS);
  });

  it('reads back a partial set filled in with the defaults', () => {
    const editor = mountEditor();
    editor.icons = { rename: '📝' };
    expect(editor.icons.rename).toBe('📝');
    expect(editor.icons.remove).toBe(DEFAULT_ICONS.remove);
  });

  it('puts every icon back when assigned undefined', () => {
    const editor = mountEditor();
    editor.icons = { undo: 'U' };
    editor.icons = undefined;
    expect(editor.icons).toEqual(DEFAULT_ICONS);
  });

  it('redraws the toolbar, built long before a host can assign icons', () => {
    const editor = mountEditor();
    const shadow = shadowOf(editor);
    const undo = queryButton(shadow, '.toolbar__history');
    expect(undo.textContent).toBe('↶');

    editor.icons = { undo: 'back' };

    expect(undo.textContent).toBe('back');
  });

  it('redraws the cards already on the canvas', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);
    expect(queryButton(shadow, '.node__rename').textContent).toBe('✎');

    editor.icons = { rename: '📝', properties: '⚡', remove: 'X', link: '»' };

    expect(queryButton(shadow, '.node__rename').textContent).toBe('📝');
    expect(queryButton(shadow, '.node__properties').textContent).toBe('⚡');
    expect(queryButton(shadow, '.node__remove').textContent).toBe('X');
    expect(queryButton(shadow, '.node__link').textContent).toBe('»');
    expect(queryButton(shadow, '.edge-card__rename').textContent).toBe('📝');
    expect(queryButton(shadow, '.edge-card__remove').textContent).toBe('X');
  });

  it('draws cards made after the change with the new icons', () => {
    const editor = mountEditor();
    editor.icons = { rename: '📝' };
    editor.value = sampleMachine();
    expect(queryButton(shadowOf(editor), '.node__rename').textContent).toBe('📝');
  });

  it('keeps the label beside a role icon', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);
    expect(queryButton(shadow, '.node__role--initial').textContent).toBe('▶ Initial');
    expect(queryButton(shadow, '.node__role--final').textContent).toBe('◉ Final');
    expect(queryButton(shadow, '.node__create').textContent).toBe('+ Creation');

    editor.icons = { initial: '→', final: '■', add: '✚' };

    expect(queryButton(shadow, '.node__role--initial').textContent).toBe('→ Initial');
    expect(queryButton(shadow, '.node__role--final').textContent).toBe('■ Final');
    expect(queryButton(shadow, '.node__create').textContent).toBe('✚ Creation');
  });

  it('leads an empty side effect chip with the add icon, and a filled one with a name', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    const shadow = shadowOf(editor);
    expect(queryAll(shadow, '.chip__label')[0]?.textContent).toBe('+ Add side effect');

    editor.icons = { add: '✚' };
    expect(queryAll(shadow, '.chip__label')[0]?.textContent).toBe('✚ Add side effect');

    editor.value = setSideEffects(editor.value, ENTER_DRAFT, [sideEffect('one', 'sendEmail')]);
    const filled = queryAll(shadow, '.chip__label')[0];
    expect(filled?.textContent).toBe('sendEmail');
    // Nothing left behind for the next icon set to redraw over the name.
    expect(filled?.hasAttribute('data-icon')).toBe(false);

    editor.icons = { add: '★' };
    expect(queryAll(shadow, '.chip__label')[0]?.textContent).toBe('sendEmail');
  });

  it('names the theme toggle after the scheme it switches to', () => {
    const editor = mountEditor();
    const toggle = queryButton(shadowOf(editor), '.toolbar__theme');
    expect(toggle.textContent).toBe('☀');

    editor.icons = { lightTheme: 'L', darkTheme: 'D' };
    expect(toggle.textContent).toBe('L');

    editor.toggleTheme();
    expect(toggle.textContent).toBe('D');
  });

  it('redraws the inline rename controls', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.icons = { confirm: 'OK', cancel: 'NO' };
    const shadow = shadowOf(editor);
    queryButton(shadow, '.node__rename').click();

    expect(queryButton(shadow, '.icon-button--confirm').textContent).toBe('OK');
    expect(queryButton(shadow, '.icon-button--cancel').textContent).toBe('NO');
  });

  it('takes a node for an icon the canvas draws many times over', () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.icons = { remove: svgIcon('close') };
    const shadow = shadowOf(editor);
    const drawn = queryAll(shadow, '.node__remove');

    expect(drawn.length).toBe(2);
    for (const button of drawn) {
      expect(button.querySelector('svg[data-id="close"]')).not.toBeNull();
    }
  });
});

describe('icons in the dialogs', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('reach the side effect rows the editor opens', async () => {
    const editor = mountEditor();
    editor.value = sampleMachine();
    editor.icons = { dragHandle: '::', remove: 'X', params: '<>' };
    editor.value = setSideEffects(editor.value, ENTER_DRAFT, [
      sideEffect('one', 'sendEmail', { params: { to: 'a@b.c' } }),
    ]);
    void editor.openSideEffects(ENTER_DRAFT);
    await flush();

    const dialog = queryOne(shadowOf(editor), 'state-machine-side-effects-dialog');
    const panel = shadowOf(dialog);
    expect(queryButton(panel, '.row__handle').textContent).toBe('::');
    expect(queryButton(panel, '.row__remove').textContent).toBe('X');
    // The count rides after the icon, so replacing one keeps the other.
    expect(queryButton(panel, '.row__params').textContent).toBe('<> 1');
  });

  it('leave the parameters badge as the icon alone when nothing is set', async () => {
    const dialog = new SideEffectsDialogElement();
    document.body.append(dialog);
    void dialog.open({
      title: 'Side effects',
      description: '',
      effects: [sideEffect('one', 'sendEmail')],
    });
    await flush();

    expect(queryButton(shadowOf(dialog), '.row__params').textContent).toBe('{ }');
  });

  it('can be set on a dialog a host drives itself', async () => {
    const dialog = new SideEffectsDialogElement();
    document.body.append(dialog);
    dialog.icons = { dragHandle: '≡' };
    void dialog.open({
      title: 'Side effects',
      description: '',
      effects: [sideEffect('one', 'sendEmail')],
    });
    await flush();

    expect(dialog.icons.dragHandle).toBe('≡');
    expect(queryButton(shadowOf(dialog), '.row__handle').textContent).toBe('≡');
  });

  it('reach the order controls of the properties dialog', async () => {
    const dialog = new PropertiesDialogElement();
    document.body.append(dialog);
    void dialog.open({
      title: 'Properties',
      description: '',
      kind: 'transition',
      values: { ...emptyPropertiesDraft(), orderIndex: 0 },
      order: { index: 0, total: 2, sourceLabel: 'Draft' },
      icons: { moveUp: 'up', moveDown: 'down' },
    });
    await flush();

    const panel = shadowOf(dialog);
    expect(queryButton(panel, '.order__move--up').textContent).toBe('up');
    expect(queryButton(panel, '.order__move--down').textContent).toBe('down');
  });
});
