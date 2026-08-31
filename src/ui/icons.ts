import { createElement, type ElementOptions } from './dom.js';

/**
 * What one icon draws as: a string, rendered as plain text, or a DOM node the
 * host builds — an `<svg>`, an `<img>`, anything.
 *
 * Strings are set as text, never as markup: an icon set is data the host may
 * well have loaded from somewhere else, and a component that parsed it as HTML
 * would hand that somewhere else a script tag. A host that wants markup builds
 * the node itself, which says plainly whose markup it is.
 */
export type IconContent = string | Node;

/**
 * An icon, or a function returning a fresh one per button.
 *
 * The same icon is drawn in many places at once — every state card has its own
 * rename button — and a node can only be in one of them, so a node given
 * directly is treated as a template and copied. A function is called for each
 * button instead, which is what an icon set built on a framework's render
 * function wants.
 */
export type Icon = IconContent | (() => IconContent);

/**
 * Every glyph the editor draws on a button or a handle, keyed by what it means
 * rather than by where it appears: one `remove` covers the cards, the side
 * effect rows and the parameter fields, because a host replacing it has one
 * idea of what "remove" looks like.
 */
export interface EditorIcons {
  /** Toolbar, takes back the last edit. */
  readonly undo: Icon;
  /** Toolbar, puts back what undo took. */
  readonly redo: Icon;
  readonly zoomOut: Icon;
  readonly zoomIn: Icon;
  /** Toolbar, shown while the dark theme is on: pressing it lights the editor. */
  readonly lightTheme: Icon;
  /** Toolbar, shown while the light theme is on: pressing it darkens the editor. */
  readonly darkTheme: Icon;
  /** Opens the inline name editor on a state or a transition card. */
  readonly rename: Icon;
  /** Opens the properties dialog of a state or a transition. */
  readonly properties: Icon;
  /** Takes something away: a card, a side effect, a parameter. */
  readonly remove: Icon;
  /** Keeps what the inline name editor holds. */
  readonly confirm: Icon;
  /** Throws away what the inline name editor holds. */
  readonly cancel: Icon;
  /** The handle dragged from one card to another to draw a transition. */
  readonly link: Icon;
  /** Marks the initial role on a state card. */
  readonly initial: Icon;
  /** Marks the final role on a state card. */
  readonly final: Icon;
  /** Leads a label that adds something, e.g. `+ Creation`. */
  readonly add: Icon;
  /** The grip a side effect is dragged by to reorder it. */
  readonly dragHandle: Icon;
  /** Marks the button holding a side effect's JSON parameters. */
  readonly params: Icon;
  /** Moves a transition earlier among its siblings. */
  readonly moveUp: Icon;
  /** Moves a transition later among its siblings. */
  readonly moveDown: Icon;
}

/**
 * What the editor draws when the host names nothing.
 *
 * Plain characters on purpose: they need no assets, no network and no build
 * step, they inherit the button's colour, and they render at any zoom. A page
 * with an icon set of its own replaces them through `icons`.
 */
export const DEFAULT_ICONS: EditorIcons = {
  undo: '↶',
  redo: '↷',
  zoomOut: '−',
  zoomIn: '+',
  lightTheme: '☀',
  darkTheme: '☾',
  rename: '✎',
  properties: '⚙',
  remove: '✕',
  confirm: '✓',
  cancel: '✕',
  link: '→',
  initial: '▶',
  final: '◉',
  add: '+',
  dragHandle: '⠿',
  params: '{ }',
  moveUp: '↑',
  moveDown: '↓',
};

/** Name of every icon, in declaration order. */
export type IconName = keyof EditorIcons;

/**
 * A host's icons: the ones it names, with the rest left at their defaults.
 *
 * Every entry also admits `undefined` — spreading a host's own optional config
 * produces exactly that, and it should read as "not named", not as an error.
 */
export type IconOverrides = { readonly [K in IconName]?: Icon | undefined };

/** Attribute remembering which icon an element carries, so a new set can redraw it. */
const ICON_ATTRIBUTE = 'data-icon';
/** Attribute remembering the text that follows an icon, for the same reason. */
const ICON_LABEL_ATTRIBUTE = 'data-icon-label';

export function isIconName(value: string): value is IconName {
  return Object.hasOwn(DEFAULT_ICONS, value);
}

/** Every icon name, read off the defaults so the two can never drift apart. */
export const ICON_NAMES: readonly IconName[] = Object.keys(DEFAULT_ICONS).filter(isIconName);

/**
 * A full set from a partial one. An entry left out — or set to `undefined`,
 * which is what spreading a host's own optional fields produces — keeps its
 * default, so a host replacing one icon never loses the other eighteen.
 */
export function mergeIcons(overrides: IconOverrides | undefined): EditorIcons {
  if (overrides === undefined) {
    return DEFAULT_ICONS;
  }
  const merged = { ...DEFAULT_ICONS };
  for (const name of ICON_NAMES) {
    const override = overrides[name];
    if (override !== undefined) {
      merged[name] = override;
    }
  }
  return merged;
}

/** One drawable copy of `icon`: a template node is copied, a factory is called. */
function contentOf(icon: Icon): IconContent {
  if (typeof icon === 'function') {
    // A factory owns making the node fresh, so what it returns is used as it is.
    return icon();
  }
  return typeof icon === 'string' ? icon : icon.cloneNode(true);
}

/**
 * Draws `icon` into `element`, replacing whatever was there.
 *
 * The icon is always wrapped in a span rather than dropped in loose, so it is
 * one node whether it is a character or an `<svg>`, it can sit beside a label,
 * and a host can reach it from outside the shadow root through `::part(icon)`.
 */
function drawIcon(element: Element, icon: Icon, label: string | undefined): void {
  const glyph = createElement('span', { className: 'icon', attrs: { part: 'icon' } });
  glyph.append(contentOf(icon));
  if (label === undefined || label.length === 0) {
    element.replaceChildren(glyph);
    return;
  }
  element.replaceChildren(glyph, ` ${label}`);
}

/**
 * Draws icon `name` into `element` and records it there, so a later icon set
 * can find the element again and redraw it — the toolbar is built once, in the
 * constructor, long before a host gets to assign `icons`.
 *
 * `label` is the text that follows the icon, as in `▶ Initial`.
 */
export function setIcon(
  element: Element,
  icons: EditorIcons,
  name: IconName,
  label?: string,
): void {
  element.setAttribute(ICON_ATTRIBUTE, name);
  if (label === undefined) {
    element.removeAttribute(ICON_LABEL_ATTRIBUTE);
  } else {
    element.setAttribute(ICON_LABEL_ATTRIBUTE, label);
  }
  drawIcon(element, icons[name], label);
}

/**
 * Whether `element` already carries icon `name`, followed by `label`.
 *
 * The render loop runs on every frame of a drag, and redrawing an icon that has
 * not changed would make a new node per button per frame for nothing. Asking
 * first is safe: an icon set that *has* changed goes through
 * {@link refreshIcons}, which redraws regardless.
 */
export function hasIcon(element: Element, name: IconName, label?: string): boolean {
  return (
    element.getAttribute(ICON_ATTRIBUTE) === name &&
    element.getAttribute(ICON_LABEL_ATTRIBUTE) === (label ?? null)
  );
}

/** Redraws every icon under `root` from `icons`. */
export function refreshIcons(root: ParentNode, icons: EditorIcons): void {
  for (const element of root.querySelectorAll(`[${ICON_ATTRIBUTE}]`)) {
    const name = element.getAttribute(ICON_ATTRIBUTE);
    if (name === null || !isIconName(name)) {
      continue;
    }
    const label = element.getAttribute(ICON_LABEL_ATTRIBUTE);
    drawIcon(element, icons[name], label === null ? undefined : label);
  }
}

export interface IconButtonOptions extends Omit<ElementOptions, 'text'> {
  /** Text drawn after the icon, e.g. `Initial` in `▶ Initial`. */
  readonly label?: string | undefined;
}

/** A `<button>` carrying icon `name`. */
export function createIconButton(
  icons: EditorIcons,
  name: IconName,
  options?: IconButtonOptions,
): HTMLButtonElement {
  const button = createElement('button', options);
  button.type = 'button';
  setIcon(button, icons, name, options?.label);
  return button;
}

/**
 * Forgets the icon on `element`, so a later set leaves it alone. Used where a
 * button carries an icon only some of the time — the side effect chip leads
 * with one while its list is empty, and with the first side effect's name
 * after that.
 */
export function clearIcon(element: Element): void {
  element.removeAttribute(ICON_ATTRIBUTE);
  element.removeAttribute(ICON_LABEL_ATTRIBUTE);
}
