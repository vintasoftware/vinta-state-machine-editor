import type { MachineChange, Selection, StateMachine } from './types.js';
import type { EditorTheme } from './ui/theme.js';

export const STATE_MACHINE_CHANGE_EVENT = 'state-machine-change';
export const SELECTION_CHANGE_EVENT = 'state-machine-selection-change';
export const THEME_CHANGE_EVENT = 'state-machine-theme-change';
export const FAN_OUT_EVENT = 'state-machine-fan-out';

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

export interface FanOutDetail {
  /** The waiting state whose fan-out link was followed. */
  readonly stateId: string;
  /** Key of the machine its children are governed by, from `state.data`. */
  readonly childMachine: string;
}

/**
 * Announces that someone asked to go to the machine a state fans out to.
 *
 * The canvas draws one version of one machine, and a fan-out crosses into
 * another — so the component says where the user wants to go and stops there.
 * A Django admin listens for this and navigates to that machine's editor.
 *
 * ```js
 * editor.addEventListener('state-machine-fan-out', (event) => {
 *   location.href = `/admin/machines/${event.detail.childMachine}/`;
 * });
 * ```
 */
export type FanOutEvent = CustomEvent<FanOutDetail>;

export interface StateMachineEditorEventMap extends HTMLElementEventMap {
  'state-machine-fan-out': FanOutEvent;
  'state-machine-change': StateMachineChangeEvent;
  'state-machine-selection-change': SelectionChangeEvent;
  'state-machine-theme-change': ThemeChangeEvent;
}
