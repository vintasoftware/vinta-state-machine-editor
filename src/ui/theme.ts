/**
 * The colour scheme the editor and its dialogs render in.
 *
 * The scheme is the host's to choose, never the operating system's: the editor
 * is a component embedded in someone else's page, and a page that is light all
 * the way through has no use for a canvas that turns dark on its own. Hosts
 * that *do* want to follow `prefers-color-scheme` can watch it themselves and
 * assign `theme`.
 */
export type EditorTheme = 'dark' | 'light';

export const EDITOR_THEMES: readonly EditorTheme[] = ['dark', 'light'];

/** The scheme used when the host names none. */
export const DEFAULT_THEME: EditorTheme = 'dark';

/** Name of the attribute carrying the theme, on the editor and the dialogs. */
export const THEME_ATTRIBUTE = 'theme';

export function isEditorTheme(value: unknown): value is EditorTheme {
  return EDITOR_THEMES.some((theme) => theme === value);
}

/**
 * The scheme `value` names, or {@link DEFAULT_THEME} for anything else — an
 * absent attribute, a typo, a host assigning something off the type.
 */
export function normalizeTheme(value: unknown): EditorTheme {
  return isEditorTheme(value) ? value : DEFAULT_THEME;
}

/** The other scheme: what the toolbar's toggle switches to. */
export function otherTheme(theme: EditorTheme): EditorTheme {
  return theme === 'dark' ? 'light' : 'dark';
}

/** The scheme `element` is set to, read off its `theme` attribute. */
export function themeOf(element: Element): EditorTheme {
  return normalizeTheme(element.getAttribute(THEME_ATTRIBUTE));
}

/** Writes `value` to the `theme` attribute of `element`, normalized. */
export function applyTheme(element: Element, value: unknown): void {
  element.setAttribute(THEME_ATTRIBUTE, normalizeTheme(value));
}
