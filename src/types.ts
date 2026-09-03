/**
 * Domain model for the state machine editor.
 *
 * Every structure is deeply readonly: all mutations go through the pure helpers
 * in `src/model/machine.ts`, which return a brand new machine.
 */

export type MaybePromise<T> = T | Promise<T>;

/** Any value that survives a JSON round trip. */
export type JsonValue = string | number | boolean | null | JsonArray | JsonObject;
export type JsonArray = readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

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
  /** Parameters to prefill when this side effect is attached. */
  readonly defaultParams?: JsonObject | undefined;
}

/** A side effect actually attached to a state or a transition. */
export interface SideEffect {
  /** Unique id of this attachment (not of the definition). */
  readonly id: string;
  /** Id of the {@link SideEffectDefinition} this attachment points to. */
  readonly definitionId: string;
  /** Display name, denormalized so the graph renders without the catalog. */
  readonly name: string;
  /** Arbitrary JSON handed to the side effect when it runs. */
  readonly params: JsonObject;
  /** `false` keeps the attachment configured but stops it from running. */
  readonly enabled: boolean;
  /** Free text about this particular attachment. */
  readonly description: string;
  /** Host-owned passthrough. The component never reads or interprets it. */
  readonly data: JsonObject;
}

/** Whether the side effects run before or after the thing they are attached to. */
export type SideEffectPhase = 'before' | 'after';

export const SIDE_EFFECT_PHASES: readonly SideEffectPhase[] = ['before', 'after'];

/** Ordered side effect lists. Order is meaningful and preserved. */
export interface SideEffectHooks {
  readonly before: readonly SideEffect[];
  readonly after: readonly SideEffect[];
}

/** The palette a state card can be tinted with. */
export type StateColor = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

export const STATE_COLORS: readonly StateColor[] = [
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
  'muted',
];

export function isStateColor(value: unknown): value is StateColor {
  return STATE_COLORS.some((color) => color === value);
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
  /** Colour of the bar across the top of the card. */
  readonly color: StateColor;
  /** Free text about this state. */
  readonly description: string;
  /** Host-owned passthrough. The component never reads or interprets it. */
  readonly data: JsonObject;
}

/** An action a transition can be triggered by, as returned by the action provider. */
export interface ActionDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
}

/**
 * The event that fires a transition. The name is denormalized, so the graph
 * renders without the catalog — exactly like {@link SideEffect.name}.
 */
export interface TransitionTrigger {
  readonly id: string;
  readonly name: string;
}

export interface Transition {
  readonly id: string;
  /**
   * Identity of this edge. Several edges can share a trigger and be told apart
   * by their guards, so this is not the same thing as {@link Transition.trigger}.
   */
  readonly name: string;
  /** Id of the source {@link StateNode}, or `null` for a creation transition. */
  readonly from: string | null;
  /** Id of the target {@link StateNode}. */
  readonly to: string;
  /** The event that fires this edge, or `null` when none has been chosen. */
  readonly trigger: TransitionTrigger | null;
  /** Opaque condition expression. The component never parses or evaluates it. */
  readonly guard: string;
  /** Opaque permission the actor needs. The component never interprets it. */
  readonly requiredPermission: string;
  /** Free text about this transition. */
  readonly description: string;
  /**
   * Where the transition card sits, relative to the point the editor picks on
   * the edge. `{ x: 0, y: 0 }` keeps it on the edge, following the states.
   */
  readonly labelOffset: Point;
  /** Side effects that run around the transition itself. */
  readonly effects: SideEffectHooks;
  /** Host-owned passthrough. The component never reads or interprets it. */
  readonly data: JsonObject;
}

export interface StateMachine {
  readonly states: readonly StateNode[];
  readonly transitions: readonly Transition[];
  /** Ids of the states the machine can start in. */
  readonly initialStateIds: readonly string[];
  /** Ids of the states that end the machine. A state may be both initial and final. */
  readonly finalStateIds: readonly string[];
  /** Host-owned passthrough. The component never reads or interprets it. */
  readonly data: JsonObject;
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

/** Addresses one state or one transition. */
export type ElementRef =
  | { readonly kind: 'state'; readonly id: string }
  | { readonly kind: 'transition'; readonly id: string };

export type Selection = ElementRef | null;

/**
 * Supplies the catalog of side effects the user can attach.
 * Injected by the host so the component never owns fetching/auth concerns.
 */
export type SideEffectProvider = () => MaybePromise<readonly SideEffectDefinition[]>;

/**
 * Supplies the catalog a transition's trigger is picked from. Injected the same
 * way as {@link SideEffectProvider}; without one the trigger is free text.
 */
export type ActionProvider = () => MaybePromise<readonly ActionDefinition[]>;

/** Verdict of a {@link GuardValidator}. */
export type GuardValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Checks a guard expression on the host's behalf. The expression language
 * belongs to the host: the component only ever hands the text over and renders
 * whatever comes back.
 */
export type GuardValidator = (expression: string) => MaybePromise<GuardValidation>;

/** Where a waiting state's fan-out leads, and which state it leaves from. */
export interface FanOut {
  readonly stateId: string;
  /** Key of the machine the children are governed by, from `state.data`. */
  readonly childMachine: string;
}

/**
 * Takes the user to the machine a state fans out to.
 *
 * Injected like {@link ActionProvider} and {@link GuardValidator}: the canvas
 * draws one version of one machine, a fan-out crosses into another, and where
 * that lives is the host's business. Without one the band still names the
 * machine — it just does not offer to go there, because a link that leads
 * nowhere is worse than no link.
 */
export type FanOutHandler = (fanOut: FanOut) => void;

/** Describes what changed in a machine, carried by the `state-machine-change` event. */
export type MachineChange =
  | { readonly kind: 'state-add'; readonly stateId: string }
  | { readonly kind: 'state-remove'; readonly stateId: string }
  | { readonly kind: 'state-rename'; readonly stateId: string }
  | { readonly kind: 'state-move'; readonly stateId: string }
  | { readonly kind: 'state-color'; readonly stateId: string }
  /** A key of `state.data` the component owns — the fan-out a state waits on. */
  | { readonly kind: 'state-data'; readonly stateId: string }
  | { readonly kind: 'transition-add'; readonly transitionId: string }
  | { readonly kind: 'transition-remove'; readonly transitionId: string }
  | { readonly kind: 'transition-rename'; readonly transitionId: string }
  | { readonly kind: 'transition-move'; readonly transitionId: string }
  | { readonly kind: 'transition-trigger'; readonly transitionId: string }
  | { readonly kind: 'transition-guard'; readonly transitionId: string }
  | { readonly kind: 'transition-permission'; readonly transitionId: string }
  | { readonly kind: 'transition-reorder'; readonly transitionId: string }
  | { readonly kind: 'description'; readonly ref: ElementRef }
  | { readonly kind: 'side-effects-change'; readonly ref: SideEffectListRef }
  | { readonly kind: 'layout' }
  | { readonly kind: 'initial-states-change' }
  | { readonly kind: 'final-states-change' }
  | { readonly kind: 'replace' };
