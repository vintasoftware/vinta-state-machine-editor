/**
 * Domain model for the state machine editor.
 *
 * Every structure is deeply readonly: all mutations go through the pure helpers
 * in `src/model/machine.ts`, which return a brand new machine.
 */

export type MaybePromise<T> = T | Promise<T>;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A side effect available to be attached, as returned by the catalog provider. */
export interface SideEffectDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
}

/** A side effect actually attached to a state or a transition. */
export interface SideEffect {
  /** Unique id of this attachment (not of the definition). */
  readonly id: string;
  /** Id of the {@link SideEffectDefinition} this attachment points to. */
  readonly definitionId: string;
  /** Display name, denormalized so the graph renders without the catalog. */
  readonly name: string;
}

/** Whether the side effects run before or after the thing they are attached to. */
export type SideEffectPhase = 'before' | 'after';

export const SIDE_EFFECT_PHASES: readonly SideEffectPhase[] = ['before', 'after'];

/** Ordered side effect lists. Order is meaningful and preserved. */
export interface SideEffectHooks {
  readonly before: readonly SideEffect[];
  readonly after: readonly SideEffect[];
}

export interface StateNode {
  readonly id: string;
  readonly name: string;
  /** Position of the node's top-left corner, in world (unzoomed) coordinates. */
  readonly position: Point;
  /** Side effects that run around *entering* this state. */
  readonly onEnter: SideEffectHooks;
  /** Side effects that run around *leaving* this state. */
  readonly onLeave: SideEffectHooks;
}

export interface Transition {
  readonly id: string;
  readonly name: string;
  /** Id of the source {@link StateNode}. */
  readonly from: string;
  /** Id of the target {@link StateNode}. */
  readonly to: string;
  /**
   * Where the transition card sits, relative to the point the editor picks on
   * the edge. `{ x: 0, y: 0 }` keeps it on the edge, following the states.
   */
  readonly labelOffset: Point;
  /** Side effects that run around the transition itself. */
  readonly effects: SideEffectHooks;
}

export interface StateMachine {
  readonly states: readonly StateNode[];
  readonly transitions: readonly Transition[];
  /** Ids of the states the machine can start in. */
  readonly initialStateIds: readonly string[];
  /** Ids of the states that end the machine. A state may be both initial and final. */
  readonly finalStateIds: readonly string[];
}

/** How a state participates in the machine's lifecycle. */
export type StateRole = 'initial' | 'final';

export const STATE_ROLES: readonly StateRole[] = ['initial', 'final'];

/** Which side of a state a side effect list belongs to. */
export type StateTrigger = 'enter' | 'leave';

export const STATE_TRIGGERS: readonly StateTrigger[] = ['enter', 'leave'];

/** Addresses one ordered side effect list inside a machine. */
export type SideEffectListRef =
  | {
      readonly kind: 'state';
      readonly stateId: string;
      readonly trigger: StateTrigger;
      readonly phase: SideEffectPhase;
    }
  | {
      readonly kind: 'transition';
      readonly transitionId: string;
      readonly phase: SideEffectPhase;
    };

export type Selection =
  | { readonly kind: 'state'; readonly id: string }
  | { readonly kind: 'transition'; readonly id: string }
  | null;

/**
 * Supplies the catalog of side effects the user can attach.
 * Injected by the host so the component never owns fetching/auth concerns.
 */
export type SideEffectProvider = () => MaybePromise<readonly SideEffectDefinition[]>;

/** Describes what changed in a machine, carried by the `state-machine-change` event. */
export type MachineChange =
  | { readonly kind: 'state-add'; readonly stateId: string }
  | { readonly kind: 'state-remove'; readonly stateId: string }
  | { readonly kind: 'state-rename'; readonly stateId: string }
  | { readonly kind: 'state-move'; readonly stateId: string }
  | { readonly kind: 'transition-add'; readonly transitionId: string }
  | { readonly kind: 'transition-remove'; readonly transitionId: string }
  | { readonly kind: 'transition-rename'; readonly transitionId: string }
  | { readonly kind: 'transition-move'; readonly transitionId: string }
  | { readonly kind: 'side-effects-change'; readonly ref: SideEffectListRef }
  | { readonly kind: 'initial-states-change' }
  | { readonly kind: 'final-states-change' }
  | { readonly kind: 'replace' };
