import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  DEFAULT_THEME,
  EDITOR_THEMES,
  isEditorTheme,
  normalizeTheme,
  otherTheme,
  THEME_ATTRIBUTE,
  themeOf,
} from '../src/ui/theme.js';

describe('themes', () => {
  it('offers dark and light, and defaults to dark', () => {
    expect(EDITOR_THEMES).toEqual(['dark', 'light']);
    expect(DEFAULT_THEME).toBe('dark');
  });

  it('recognizes the two schemes and nothing else', () => {
    expect(isEditorTheme('dark')).toBe(true);
    expect(isEditorTheme('light')).toBe(true);
    expect(isEditorTheme('Dark')).toBe(false);
    expect(isEditorTheme('system')).toBe(false);
    expect(isEditorTheme(null)).toBe(false);
    expect(isEditorTheme(undefined)).toBe(false);
  });

  it('falls back to the default for anything it does not know', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('sepia')).toBe(DEFAULT_THEME);
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    expect(normalizeTheme(0)).toBe(DEFAULT_THEME);
  });

  it('switches to the other scheme', () => {
    expect(otherTheme('dark')).toBe('light');
    expect(otherTheme('light')).toBe('dark');
  });
});

describe('the theme attribute', () => {
  it('reads a missing or unknown attribute as the default', () => {
    const element = document.createElement('div');
    expect(themeOf(element)).toBe(DEFAULT_THEME);
    element.setAttribute(THEME_ATTRIBUTE, 'neon');
    expect(themeOf(element)).toBe(DEFAULT_THEME);
  });

  it('writes a normalized value', () => {
    const element = document.createElement('div');
    applyTheme(element, 'light');
    expect(element.getAttribute(THEME_ATTRIBUTE)).toBe('light');
    applyTheme(element, 'neon');
    expect(element.getAttribute(THEME_ATTRIBUTE)).toBe(DEFAULT_THEME);
    expect(themeOf(element)).toBe(DEFAULT_THEME);
  });
});
