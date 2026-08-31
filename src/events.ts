import type { MachineChange, Selection, StateMachine } from './types.js';
import type { EditorTheme } from './ui/theme.js';

export const STATE_MACHINE_CHANGE_EVENT = 'state-machine-change';
export const SELECTION_CHANGE_EVENT = 'state-machine-selection-change';
export const THEME_CHANGE_EVENT = 'state-machine-theme-change';

export interface StateMachineChangeDetail {
  /** The machine after the change. */
  readonly value: StateMachine;
  /** What changed. */
  readonly change: MachineChange;
  /** `true` while a gesture is still running (e.g. a node being dragged). */
  readonly transient: boolean;
}

export type StateMachineChangeEvent = CustomEvent<StateMachineChangeDetail>;

export interface SelectionChangeDetail {
  readonly selection: Selection;
}

export type SelectionChangeEvent = CustomEvent<SelectionChangeDetail>;

export interface ThemeChangeDetail {
  readonly theme: EditorTheme;
}

/**
 * Announces the scheme the editor now draws in — including the switch its own
 * toolbar button makes, which is the only way a host learns about a choice the
 * user made inside the component.
 */
export type ThemeChangeEvent = CustomEvent<ThemeChangeDetail>;

export interface StateMachineEditorEventMap extends HTMLElementEventMap {
  'state-machine-change': StateMachineChangeEvent;
  'state-machine-selection-change': SelectionChangeEvent;
  'state-machine-theme-change': ThemeChangeEvent;
}
