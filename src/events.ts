import type { MachineChange, Selection, StateMachine } from './types.js';

export const STATE_MACHINE_CHANGE_EVENT = 'state-machine-change';
export const SELECTION_CHANGE_EVENT = 'state-machine-selection-change';

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

export interface StateMachineEditorEventMap extends HTMLElementEventMap {
  'state-machine-change': StateMachineChangeEvent;
  'state-machine-selection-change': SelectionChangeEvent;
}
