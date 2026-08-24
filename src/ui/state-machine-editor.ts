import type {
  SelectionChangeEvent,
  StateMachineChangeEvent,
  StateMachineEditorEventMap,
} from '../events.js';
import { SELECTION_CHANGE_EVENT, STATE_MACHINE_CHANGE_EVENT } from '../events.js';
import {
  bendEdgeThrough,
  bendSelfEdgeThrough,
  computeEdgeGeometry,
  computeSelfEdgeGeometry,
  curvatureFor,
  type EdgeGeometry,
} from '../geometry/edge.js';
import {
  boundsOf,
  createViewport,
  distanceBetween,
  fitViewport,
  midpointOf,
  panBy,
  pinchScale,
  toWorld,
  type Viewport,
  wheelZoomFactor,
  zoomBy,
  zoomTo,
} from '../geometry/viewport.js';
import {
  addState,
  addTransition,
  createEmptyMachine,
  createState,
  createTransition,
  creationTransitions,
  findState,
  findTransition,
  getSideEffects,
  isFinalState,
  isInitialState,
  moveTransition,
  outgoingTransitions,
  removeState,
  removeTransition,
  setFinalStates,
  setInitialStates,
  setSideEffects,
  setStateDescription,
  setTransitionDescription,
  setTransitionGuard,
  setTransitionPermission,
  setTransitionTrigger,
  siblingTransitions,
  toggleFinalState,
  toggleInitialState,
  uniqueTransitionName,
  updateState,
  updateTransition,
} from '../model/machine.js';
import { assertStateMachine } from '../model/parse.js';
import type {
  ActionProvider,
  ElementRef,
  GuardValidator,
  MachineChange,
  Point,
  Rect,
  Selection,
  SideEffectListRef,
  SideEffectPhase,
  SideEffectProvider,
  StateColor,
  StateMachine,
  StateNode,
  StateRole,
  StateTrigger,
  Transition,
  TransitionTrigger,
} from '../types.js';
import { STATE_COLORS } from '../types.js';
import { createButton, createElement, createSvgElement, isInteractiveTarget } from './dom.js';
import {
  describeElement,
  describeSideEffectList,
  describeSource,
  shortHookLabel,
} from './labels.js';
import type { OrderContext, PropertiesDraft } from './properties-dialog.js';
import { PropertiesDialogElement } from './properties-dialog.js';
import {
  countWithParams,
  formatSideEffectSummary,
  formatSideEffectTitle,
} from './side-effect-summary.js';
import { SideEffectsDialogElement } from './side-effects-dialog.js';
import { editorStyles } from './styles.js';

const FALLBACK_NODE_WIDTH = 248;
const FALLBACK_NODE_HEIGHT = 152;
const ZOOM_STEP = 1.25;
const GRID_SIZE = 24;
const ADD_SIDE_EFFECT_LABEL = '+ Add side effect';
/** How long after the last viewport change the canvas is considered settled. */
const TRANSFORM_SETTLE_MS = 180;
/** Dropping a transition card this close to its edge snaps it back to automatic placement. */
const LABEL_SNAP_DISTANCE = 16;
const FALLBACK_LABEL_SPACING = 160;
/** How far the start arrow reaches left of an initial state, and how far down it sits. */
const START_MARKER_REACH = 42;
const START_MARKER_Y = 20;
/** Diameter of the start pseudo-node, used before the DOM has been measured. */
const START_NODE_SIZE = 18;
/** How far left of the leftmost state it feeds the start pseudo-node is placed. */
const START_NODE_GAP = 140;
/** Base name for a creation transition; made unique across the whole machine. */
const CREATION_NAME = 'create';

const EMPTY_GEOMETRY: EdgeGeometry = {
  path: '',
  source: { x: 0, y: 0 },
  target: { x: 0, y: 0 },
  label: { x: 0, y: 0 },
  arrowAngle: 0,
};

type HookKey = `${StateTrigger}:${SideEffectPhase}`;

const HOOK_KEYS: readonly HookKey[] = [
  'enter:before',
  'enter:after',
  'leave:before',
  'leave:after',
];

interface StateView {
  readonly root: HTMLElement;
  /** Colour bar across the top of the card. */
  readonly bar: HTMLElement;
  readonly colorButton: HTMLButtonElement;
  readonly palette: HTMLElement;
  readonly swatches: ReadonlyMap<StateColor, HTMLButtonElement>;
  /** Entry arrow drawn to the left of a state the machine can start in. */
  readonly startMarker: SVGGElement;
  readonly roleButtons: ReadonlyMap<StateRole, HTMLButtonElement>;
  readonly header: HTMLElement;
  readonly name: HTMLElement;
  readonly renameButton: HTMLButtonElement;
  readonly propertiesButton: HTMLButtonElement;
  readonly removeButton: HTMLButtonElement;
  readonly linkHandle: HTMLButtonElement;
  /** Creates a creation transition into this state; only shown while it is initial. */
  readonly creationButton: HTMLButtonElement;
  readonly chips: ReadonlyMap<HookKey, HTMLButtonElement>;
}

interface TransitionView {
  readonly path: SVGPathElement;
  readonly card: HTMLElement;
  readonly name: HTMLElement;
  readonly renameButton: HTMLButtonElement;
  readonly propertiesButton: HTMLButtonElement;
  readonly removeButton: HTMLButtonElement;
  /** Secondary line: the trigger that fires this edge and the guard that gates it. */
  readonly meta: HTMLElement;
  readonly trigger: HTMLElement;
  readonly guard: HTMLElement;
  readonly chips: ReadonlyMap<SideEffectPhase, HTMLButtonElement>;
}

/** The UML initial pseudostate every creation transition originates from. */
interface StartNodeView {
  readonly root: HTMLElement;
  readonly linkHandle: HTMLButtonElement;
}

/** A two finger pinch in progress. Anchored on the values captured when it started. */
interface PinchState {
  readonly pointers: readonly [number, number];
  readonly startDistance: number;
  readonly startCenter: Point;
  readonly startViewport: Viewport;
}

type DragState =
  | { readonly kind: 'pan'; readonly origin: Point; readonly viewport: Viewport }
  | {
      readonly kind: 'node';
      readonly stateId: string;
      readonly offset: Point;
      readonly moved: boolean;
    }
  | { readonly kind: 'link'; readonly fromId: string | null; readonly pointer: Point }
  | {
      readonly kind: 'label';
      readonly transitionId: string;
      readonly grab: Point;
      readonly moved: boolean;
    };

function hookRef(stateId: string, key: HookKey): SideEffectListRef {
  const [trigger, phase] = key.split(':');
  return {
    kind: 'state',
    stateId,
    trigger: trigger === 'leave' ? 'leave' : 'enter',
    phase: phase === 'after' ? 'after' : 'before',
  };
}

function sameTrigger(a: TransitionTrigger | null, b: TransitionTrigger | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.id === b.id && a.name === b.name;
}

function sameSelection(a: Selection, b: Selection): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.kind === b.kind && a.id === b.id;
}

/** Whether the selected id still names an element of `machine`. */
function selectionExists(machine: StateMachine, selection: Selection): boolean {
  if (selection === null) {
    return false;
  }
  return selection.kind === 'state'
    ? findState(machine, selection.id) !== undefined
    : findTransition(machine, selection.id) !== undefined;
}

function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * `<state-machine-editor>` — a framework agnostic canvas to create, edit and
 * visualize state machines, their transitions and their side effects.
 */
export class StateMachineEditorElement extends HTMLElement {
  static readonly tagName = 'state-machine-editor';
  static readonly observedAttributes: readonly string[] = ['readonly'];

  readonly #shadow: ShadowRoot;
  readonly #viewportElement: HTMLElement;
  readonly #world: HTMLElement;
  readonly #svg: SVGSVGElement;
  readonly #edgeLayer: SVGGElement;
  readonly #previewPath: SVGPathElement;
  readonly #emptyState: HTMLElement;
  readonly #zoomLabel: HTMLButtonElement;
  readonly #addStateButton: HTMLButtonElement;
  readonly #stateViews = new Map<string, StateView>();
  readonly #transitionViews = new Map<string, TransitionView>();

  #machine: StateMachine = createEmptyMachine();
  #viewport: Viewport = createViewport();
  #selection: Selection = null;
  #provider: SideEffectProvider | undefined;
  #actionProvider: ActionProvider | undefined;
  #guardValidator: GuardValidator | undefined;
  /** The start pseudo-node, present only while the machine has a creation edge. */
  #startNode: StartNodeView | undefined;
  #readOnly = false;
  #drag: DragState | undefined;
  #settleTimer: ReturnType<typeof setTimeout> | undefined;
  /** State whose colour palette is open, if any. */
  #paletteFor: string | undefined;
  /** Every pointer currently down on the canvas, in viewport-local coordinates. */
  readonly #pointers = new Map<number, Point>();
  #pinch: PinchState | undefined;
  #trackingPointers = false;
  #dialog: SideEffectsDialogElement | undefined;
  #propertiesDialog: PropertiesDialogElement | undefined;
  #renameCleanup: (() => void) | undefined;
  /** Id of the state or transition whose name is currently being edited. */
  #renamingId: string | undefined;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.append(createElement('style', { text: editorStyles }));

    this.#viewportElement = createElement('div', {
      className: 'viewport',
      parent: this.#shadow,
      attrs: { part: 'viewport' },
    });
    this.#world = createElement('div', { className: 'world', parent: this.#viewportElement });
    this.#svg = createSvgElement('svg', { className: 'edges', parent: this.#world });

    const defs = createSvgElement('defs', { parent: this.#svg });
    const marker = createSvgElement('marker', {
      parent: defs,
      attrs: {
        id: 'sme-arrow',
        viewBox: '0 0 10 10',
        refX: '9',
        refY: '5',
        markerWidth: '7',
        markerHeight: '7',
        orient: 'auto',
      },
    });
    createSvgElement('path', {
      className: 'arrow',
      parent: marker,
      attrs: { d: 'M 0 0 L 10 5 L 0 10 z' },
    });

    this.#edgeLayer = createSvgElement('g', { parent: this.#svg });
    this.#previewPath = createSvgElement('path', {
      className: 'edge edge--preview',
      parent: this.#svg,
    });
    this.#previewPath.style.display = 'none';

    this.#emptyState = createElement('div', {
      className: 'empty-state',
      parent: this.#shadow,
      text: 'No states yet — use “Add state” to start.',
    });

    const toolbar = createElement('div', {
      className: 'toolbar',
      parent: this.#shadow,
      attrs: { part: 'toolbar', role: 'toolbar', 'aria-label': 'Editor tools' },
    });
    this.#addStateButton = createButton({
      className: 'toolbar__add',
      parent: toolbar,
      text: 'Add state',
    });
    const zoomOut = createButton({
      parent: toolbar,
      text: '−',
      attrs: { 'aria-label': 'Zoom out' },
    });
    this.#zoomLabel = createButton({
      className: 'toolbar__zoom',
      parent: toolbar,
      text: '100%',
      attrs: { 'aria-label': 'Reset zoom to 100%' },
    });
    const zoomIn = createButton({ parent: toolbar, text: '+', attrs: { 'aria-label': 'Zoom in' } });
    const fit = createButton({
      parent: toolbar,
      text: 'Fit',
      attrs: { 'aria-label': 'Zoom to fit' },
    });

    this.#addStateButton.addEventListener('click', () => {
      this.addState();
    });
    zoomOut.addEventListener('click', () => this.zoomOut());
    zoomIn.addEventListener('click', () => this.zoomIn());
    fit.addEventListener('click', () => this.zoomToFit());
    this.#zoomLabel.addEventListener('click', () => this.setZoom(1));

    this.#viewportElement.addEventListener('pointerdown', this.#onTrackPointerDown, {
      capture: true,
    });
    this.#viewportElement.addEventListener('pointerdown', this.#onBackgroundPointerDown);
    this.#viewportElement.addEventListener('wheel', this.#onWheel, { passive: false });
    this.addEventListener('keydown', this.#onKeyDown);
  }

  // -- lifecycle ------------------------------------------------------------

  connectedCallback(): void {
    if (!this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', '0');
    }
    this.#render();
  }

  disconnectedCallback(): void {
    if (this.#settleTimer !== undefined) {
      clearTimeout(this.#settleTimer);
      this.#settleTimer = undefined;
    }
    this.#endDrag();
    this.#endPinch();
    this.#pointers.clear();
    this.#stopTrackingPointers();
  }

  attributeChangedCallback(name: string, _previous: string | null, next: string | null): void {
    if (name === 'readonly') {
      this.#readOnly = next !== null;
      this.#render();
    }
  }

  // -- public API -----------------------------------------------------------

  /**
   * The machine being edited. Setting it validates the input and re-renders.
   *
   * The selection survives the assignment as long as the selected id still
   * names an element of the new machine, so a host that renders its own
   * inspector panel can write edits back without the panel closing under the
   * user. A selection that no longer exists is dropped, and that drop is
   * announced with `state-machine-selection-change`.
   */
  get value(): StateMachine {
    return this.#machine;
  }

  set value(machine: StateMachine) {
    this.#machine = assertStateMachine(machine);
    const dropped = this.#selection !== null && !selectionExists(this.#machine, this.#selection);
    if (dropped) {
      this.#selection = null;
    }
    this.#render();
    if (dropped) {
      this.#emitSelectionChange(null);
    }
  }

  /** Supplies the catalog of side effects available in the dialog. */
  get sideEffectProvider(): SideEffectProvider | undefined {
    return this.#provider;
  }

  set sideEffectProvider(provider: SideEffectProvider | undefined) {
    this.#provider = provider;
  }

  /**
   * Supplies the catalog a transition's trigger is picked from. Without one the
   * properties dialog offers a free text field instead of a picker.
   */
  get actionProvider(): ActionProvider | undefined {
    return this.#actionProvider;
  }

  set actionProvider(provider: ActionProvider | undefined) {
    this.#actionProvider = provider;
  }

  /**
   * Checks guard expressions on the host's behalf. Errors are shown inline in
   * the properties dialog; without one, guards are never validated.
   */
  get guardValidator(): GuardValidator | undefined {
    return this.#guardValidator;
  }

  set guardValidator(validator: GuardValidator | undefined) {
    this.#guardValidator = validator;
  }

  get readOnly(): boolean {
    return this.#readOnly;
  }

  set readOnly(value: boolean) {
    this.toggleAttribute('readonly', value);
    this.#readOnly = value;
    this.#render();
  }

  get selection(): Selection {
    return this.#selection;
  }

  set selection(selection: Selection) {
    this.#setSelection(selection);
  }

  get viewport(): Viewport {
    return this.#viewport;
  }

  set viewport(viewport: Viewport) {
    this.#viewport = viewport;
    this.#applyViewport();
  }

  /** Adds a state, by default at the center of the visible area. */
  addState(options: { readonly name?: string; readonly position?: Point } = {}): StateNode {
    const position = options.position ?? this.#defaultStatePosition();
    const state = createState({
      name: options.name ?? `State ${this.#machine.states.length + 1}`,
      position,
    });
    this.#commit(addState(this.#machine, state), { kind: 'state-add', stateId: state.id });
    return state;
  }

  /**
   * Connects two states with a transition. `null` as the source makes it a
   * creation transition, drawn from the start pseudo-node.
   *
   * Creation edges are namespaced machine-wide by the backend rather than per
   * source state, so their default name is made unique across every transition.
   */
  addTransition(from: string | null, to: string, name?: string): Transition {
    const label =
      name ?? (from === null ? uniqueTransitionName(this.#machine, CREATION_NAME) : 'transition');
    const transition = createTransition({ from, to, name: label });
    this.#commit(addTransition(this.#machine, transition), {
      kind: 'transition-add',
      transitionId: transition.id,
    });
    return transition;
  }

  /**
   * Adds a creation transition into `stateId`, selects it and starts renaming
   * it — selecting is the point, since the trigger and guard are filled in from
   * the properties dialog of the selected edge.
   */
  addCreationTransition(stateId: string): Transition {
    const transition = this.addTransition(null, stateId);
    this.#setSelection({ kind: 'transition', id: transition.id });
    this.#renameTransition(transition.id);
    return transition;
  }

  /** Paints a state's colour bar. */
  setStateColor(stateId: string, color: StateColor): void {
    this.#commit(updateState(this.#machine, stateId, { color }), {
      kind: 'state-color',
      stateId,
    });
  }

  /** Marks (or unmarks) a state as one the machine can start in. */
  toggleInitialState(stateId: string): void {
    this.#commit(toggleInitialState(this.#machine, stateId), { kind: 'initial-states-change' });
  }

  /** Marks (or unmarks) a state as one that ends the machine. */
  toggleFinalState(stateId: string): void {
    this.#commit(toggleFinalState(this.#machine, stateId), { kind: 'final-states-change' });
  }

  /** Replaces the whole list of initial states. */
  setInitialStates(stateIds: readonly string[]): void {
    this.#commit(setInitialStates(this.#machine, stateIds), { kind: 'initial-states-change' });
  }

  /** Replaces the whole list of final states. */
  setFinalStates(stateIds: readonly string[]): void {
    this.#commit(setFinalStates(this.#machine, stateIds), { kind: 'final-states-change' });
  }

  /** Starts inline editing of the selected state or transition name. */
  renameSelection(): void {
    const selection = this.#selection;
    if (selection === null) {
      return;
    }
    if (selection.kind === 'state') {
      this.#renameState(selection.id);
      return;
    }
    this.#renameTransition(selection.id);
  }

  zoomIn(): void {
    this.#setViewport(zoomBy(this.#viewport, ZOOM_STEP, this.#viewportCenter()));
  }

  zoomOut(): void {
    this.#setViewport(zoomBy(this.#viewport, 1 / ZOOM_STEP, this.#viewportCenter()));
  }

  setZoom(scale: number): void {
    this.#setViewport(zoomTo(this.#viewport, scale, this.#viewportCenter()));
  }

  /** Fits every state in view. Does nothing when the machine is empty. */
  zoomToFit(padding = 56): void {
    const rects = this.#machine.states.map((state) => this.#rectFor(state));
    const bounds = boundsOf(
      creationTransitions(this.#machine).length > 0 ? [...rects, this.#startNodeRect()] : rects,
    );
    if (bounds === undefined) {
      return;
    }
    // A hidden, detached or not yet laid out canvas measures 0 (or nonsense) —
    // fitting against that would clamp the zoom to its minimum, so fall back to
    // the content's own size and land on a sane scale instead.
    const measured = {
      width: this.#viewportElement.clientWidth,
      height: this.#viewportElement.clientHeight,
    };
    const usable = measured.width > padding * 2 && measured.height > padding * 2;
    const size = usable
      ? measured
      : { width: bounds.width + padding * 2, height: bounds.height + padding * 2 };
    this.#setViewport(fitViewport(bounds, size, padding));
  }

  /**
   * Opens the side effects dialog for a list.
   * Resolves with `true` when the user saved, `false` when they cancelled.
   */
  async openSideEffects(ref: SideEffectListRef): Promise<boolean> {
    const dialog = this.#ensureDialog();
    const labels = describeSideEffectList(this.#machine, ref);
    const result = await dialog.open({
      title: labels.title,
      description: labels.description,
      effects: getSideEffects(this.#machine, ref),
      provider: this.#provider,
      readOnly: this.#readOnly,
    });
    dialog.remove();
    if (result === null) {
      return false;
    }
    this.#commit(setSideEffects(this.#machine, ref, result), {
      kind: 'side-effects-change',
      ref,
    });
    return true;
  }

  /**
   * Opens the properties dialog for a state or a transition.
   * Resolves with `true` when the user saved, `false` when they cancelled.
   */
  async openProperties(ref: ElementRef): Promise<boolean> {
    const before = this.#propertiesFor(ref);
    if (before === undefined) {
      return false;
    }
    const dialog = this.#ensurePropertiesDialog();
    const labels = describeElement(this.#machine, ref);
    const result = await dialog.open({
      title: labels.title,
      description: labels.description,
      kind: ref.kind,
      values: before,
      actionProvider: this.#actionProvider,
      guardValidator: this.#guardValidator,
      order: ref.kind === 'transition' ? this.#orderContextFor(ref.id) : undefined,
      readOnly: this.#readOnly,
    });
    dialog.remove();
    if (result === null) {
      return false;
    }
    this.#applyProperties(ref, before, result);
    return true;
  }

  override addEventListener<K extends keyof StateMachineEditorEventMap>(
    type: K,
    listener: (this: StateMachineEditorElement, event: StateMachineEditorEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener, options);
  }

  override removeEventListener<K extends keyof StateMachineEditorEventMap>(
    type: K,
    listener: (this: StateMachineEditorElement, event: StateMachineEditorEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, listener, options);
  }

  // -- internals ------------------------------------------------------------

  #ensureDialog(): SideEffectsDialogElement {
    const existing = this.#dialog;
    if (existing !== undefined) {
      this.#shadow.append(existing);
      return existing;
    }
    const dialog = new SideEffectsDialogElement();
    this.#dialog = dialog;
    this.#shadow.append(dialog);
    return dialog;
  }

  #ensurePropertiesDialog(): PropertiesDialogElement {
    const existing = this.#propertiesDialog;
    if (existing !== undefined) {
      this.#shadow.append(existing);
      return existing;
    }
    const dialog = new PropertiesDialogElement();
    this.#propertiesDialog = dialog;
    this.#shadow.append(dialog);
    return dialog;
  }

  /** Current values of the element addressed by `ref`, or `undefined` if it is gone. */
  #propertiesFor(ref: ElementRef): PropertiesDraft | undefined {
    if (ref.kind === 'state') {
      const state = findState(this.#machine, ref.id);
      return state === undefined
        ? undefined
        : {
            trigger: null,
            guard: '',
            requiredPermission: '',
            description: state.description,
            orderIndex: -1,
          };
    }
    const transition = findTransition(this.#machine, ref.id);
    if (transition === undefined) {
      return undefined;
    }
    return {
      trigger: transition.trigger,
      guard: transition.guard,
      requiredPermission: transition.requiredPermission,
      description: transition.description,
      orderIndex: outgoingTransitions(this.#machine, transition.from).findIndex(
        (candidate) => candidate.id === transition.id,
      ),
    };
  }

  #orderContextFor(transitionId: string): OrderContext | undefined {
    const transition = findTransition(this.#machine, transitionId);
    if (transition === undefined) {
      return undefined;
    }
    const siblings = outgoingTransitions(this.#machine, transition.from);
    return {
      index: siblings.findIndex((candidate) => candidate.id === transitionId),
      total: siblings.length,
      sourceLabel: describeSource(this.#machine, transition.from),
    };
  }

  /**
   * Writes the dialog's result back, one field at a time: hosts asked for
   * granular changes, so a save that touched three fields emits three events.
   */
  #applyProperties(ref: ElementRef, before: PropertiesDraft, after: PropertiesDraft): void {
    if (ref.kind === 'state') {
      if (after.description !== before.description) {
        this.#commit(setStateDescription(this.#machine, ref.id, after.description), {
          kind: 'description',
          ref,
        });
      }
      return;
    }
    const transitionId = ref.id;
    if (!sameTrigger(after.trigger, before.trigger)) {
      this.#commit(setTransitionTrigger(this.#machine, transitionId, after.trigger), {
        kind: 'transition-trigger',
        transitionId,
      });
    }
    if (after.guard !== before.guard) {
      this.#commit(setTransitionGuard(this.#machine, transitionId, after.guard), {
        kind: 'transition-guard',
        transitionId,
      });
    }
    if (after.requiredPermission !== before.requiredPermission) {
      this.#commit(setTransitionPermission(this.#machine, transitionId, after.requiredPermission), {
        kind: 'transition-permission',
        transitionId,
      });
    }
    if (after.description !== before.description) {
      this.#commit(setTransitionDescription(this.#machine, transitionId, after.description), {
        kind: 'description',
        ref,
      });
    }
    if (after.orderIndex !== before.orderIndex && after.orderIndex >= 0) {
      this.#commit(moveTransition(this.#machine, transitionId, after.orderIndex), {
        kind: 'transition-reorder',
        transitionId,
      });
    }
  }

  #commit(next: StateMachine, change: MachineChange, transient = false): void {
    this.#machine = next;
    this.#render();
    const event: StateMachineChangeEvent = new CustomEvent(STATE_MACHINE_CHANGE_EVENT, {
      detail: { value: next, change, transient },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  #setSelection(selection: Selection): void {
    if (sameSelection(this.#selection, selection)) {
      return;
    }
    this.#selection = selection;
    this.#render();
    this.#emitSelectionChange(selection);
  }

  #emitSelectionChange(selection: Selection): void {
    const event: SelectionChangeEvent = new CustomEvent(SELECTION_CHANGE_EVENT, {
      detail: { selection },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  #setViewport(viewport: Viewport): void {
    this.#viewport = viewport;
    this.#applyViewport();
    this.#markTransforming();
  }

  /**
   * Keeps the compositor hint on for the duration of a gesture only. Leaving it
   * on permanently keeps the layer's raster frozen, so zoomed text stays soft.
   */
  #markTransforming(): void {
    this.#world.classList.add('is-transforming');
    if (this.#settleTimer !== undefined) {
      clearTimeout(this.#settleTimer);
    }
    this.#settleTimer = setTimeout(() => {
      this.#settleTimer = undefined;
      this.#world.classList.remove('is-transforming');
    }, TRANSFORM_SETTLE_MS);
  }

  #viewportCenter(): Point {
    return {
      x: this.#viewportElement.clientWidth / 2,
      y: this.#viewportElement.clientHeight / 2,
    };
  }

  #defaultStatePosition(): Point {
    const center = toWorld(this.#viewport, this.#viewportCenter());
    const offset = this.#machine.states.length * 24;
    return {
      x: Math.round(center.x - FALLBACK_NODE_WIDTH / 2 + offset),
      y: Math.round(center.y - FALLBACK_NODE_HEIGHT / 2 + offset),
    };
  }

  #localPoint(event: { readonly clientX: number; readonly clientY: number }): Point {
    const rect = this.#viewportElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  #worldPoint(event: { readonly clientX: number; readonly clientY: number }): Point {
    return toWorld(this.#viewport, this.#localPoint(event));
  }

  #rectFor(state: StateNode): Rect {
    const view = this.#stateViews.get(state.id);
    return {
      x: state.position.x,
      y: state.position.y,
      width: view?.root.offsetWidth || FALLBACK_NODE_WIDTH,
      height: view?.root.offsetHeight || FALLBACK_NODE_HEIGHT,
    };
  }

  /** Rect of a transition's source: a state card, or the start pseudo-node. */
  #sourceRect(from: string | null): Rect | undefined {
    if (from === null) {
      return this.#startNodeRect();
    }
    const state = findState(this.#machine, from);
    return state === undefined ? undefined : this.#rectFor(state);
  }

  /**
   * Where the start pseudo-node sits. It is placed rather than persisted: left
   * of the leftmost state it feeds, centred on them vertically. Deterministic,
   * so nothing new has to be stored on the machine.
   */
  #startNodeRect(): Rect {
    const size = this.#startNode?.root.offsetWidth || START_NODE_SIZE;
    const targets: Rect[] = [];
    for (const transition of creationTransitions(this.#machine)) {
      const state = findState(this.#machine, transition.to);
      if (state !== undefined) {
        targets.push(this.#rectFor(state));
      }
    }
    const [first] = targets;
    if (first === undefined) {
      return { x: 0, y: 0, width: size, height: size };
    }
    const left = Math.min(...targets.map((rect) => rect.x));
    const middle =
      targets.reduce((total, rect) => total + rect.y + rect.height / 2, 0) / targets.length;
    return {
      x: Math.round(left - START_NODE_GAP),
      y: Math.round(middle - size / 2),
      width: size,
      height: size,
    };
  }

  #stateAt(point: Point): StateNode | undefined {
    for (let index = this.#machine.states.length - 1; index >= 0; index -= 1) {
      const state = this.#machine.states[index];
      if (state !== undefined && containsPoint(this.#rectFor(state), point)) {
        return state;
      }
    }
    return undefined;
  }

  // -- rendering ------------------------------------------------------------

  #render(): void {
    this.#renderStates();
    this.#renderStartNode();
    this.#renderTransitions();
    this.#applyViewport();
    this.#emptyState.hidden = this.#machine.states.length > 0;
    this.#addStateButton.disabled = this.#readOnly;
  }

  #applyViewport(): void {
    const { x, y, scale } = this.#viewport;
    this.#world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    this.#viewportElement.style.setProperty('--sme-grid-size', `${GRID_SIZE * scale}px`);
    this.#viewportElement.style.setProperty('--sme-grid-offset-x', `${x % (GRID_SIZE * scale)}px`);
    this.#viewportElement.style.setProperty('--sme-grid-offset-y', `${y % (GRID_SIZE * scale)}px`);
    this.#zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  }

  #renderStates(): void {
    const alive = new Set<string>();
    for (const state of this.#machine.states) {
      alive.add(state.id);
      const view = this.#stateViews.get(state.id) ?? this.#createStateView(state.id);
      this.#stateViews.set(state.id, view);
      this.#updateStateView(view, state);
    }
    for (const [id, view] of this.#stateViews) {
      if (!alive.has(id)) {
        view.root.remove();
        view.startMarker.remove();
        this.#stateViews.delete(id);
      }
    }
  }

  /**
   * The start pseudo-node exists only while a creation edge does. It is not a
   * state: it never enters `states`, has no name, colour or roles, and cannot
   * be selected or deleted.
   */
  #renderStartNode(): void {
    if (creationTransitions(this.#machine).length === 0) {
      this.#startNode?.root.remove();
      this.#startNode = undefined;
      return;
    }
    const view = this.#startNode ?? this.#createStartNode();
    this.#startNode = view;
    const rect = this.#startNodeRect();
    view.root.style.left = `${rect.x}px`;
    view.root.style.top = `${rect.y}px`;
    view.linkHandle.hidden = this.#readOnly;
  }

  #createStartNode(): StartNodeView {
    const root = createElement('div', {
      className: 'start-node',
      parent: this.#world,
      attrs: { part: 'start-node', title: 'Start' },
    });
    const linkHandle = createButton({
      className: 'node__link start-node__link',
      parent: root,
      text: '\u2192',
      attrs: { 'aria-label': 'Drag to a state to create a creation transition' },
    });
    linkHandle.addEventListener('pointerdown', (event) => this.#onLinkPointerDown(event, null));
    return { root, linkHandle };
  }

  #createStateView(stateId: string): StateView {
    const root = createElement('div', {
      className: 'node',
      parent: this.#world,
      attrs: { part: 'state', 'data-state-id': stateId },
    });
    const bar = createElement('div', {
      className: 'node__bar',
      parent: root,
      attrs: { 'aria-hidden': 'true' },
    });
    const header = createElement('div', { className: 'node__header', parent: root });
    const name = createElement('span', { className: 'node__name', parent: header });
    const colorButton = createButton({
      className: 'node__color',
      parent: header,
      attrs: { 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
    });
    colorButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#togglePalette(stateId);
    });
    const renameButton = createButton({
      className: 'icon-button node__rename',
      parent: header,
      text: '✎',
      attrs: { 'aria-label': 'Rename state', title: 'Rename (F2)' },
    });
    const propertiesButton = createButton({
      className: 'icon-button node__properties',
      parent: header,
      text: '⚙',
      attrs: { 'aria-label': 'State properties', title: 'Properties' },
    });
    propertiesButton.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.openProperties({ kind: 'state', id: stateId });
    });
    const removeButton = createButton({
      className: 'icon-button node__remove',
      parent: header,
      text: '✕',
      attrs: { 'aria-label': 'Remove state' },
    });
    const hooks = createElement('div', { className: 'hooks', parent: root });
    const chips = new Map<HookKey, HTMLButtonElement>();
    for (const key of HOOK_KEYS) {
      const ref = hookRef(stateId, key);
      const row = createElement('div', { className: 'hook', parent: hooks });
      createElement('span', { className: 'hook__label', parent: row, text: shortHookLabel(ref) });
      const chip = createButton({ className: 'chip', parent: row, attrs: { part: 'chip' } });
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        void this.openSideEffects(hookRef(stateId, key));
      });
      chips.set(key, chip);
    }
    const palette = createElement('div', {
      className: 'node__palette',
      parent: root,
      attrs: { role: 'listbox', 'aria-label': `Colour of ${stateId}` },
    });
    palette.hidden = true;
    const swatches = new Map<StateColor, HTMLButtonElement>();
    for (const color of STATE_COLORS) {
      const option = createButton({
        className: `palette__option palette__option--${color}`,
        parent: palette,
        attrs: { role: 'option', 'data-color': color, title: color, 'aria-label': color },
      });
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#pickColor(stateId, color);
      });
      swatches.set(color, option);
    }

    const roles = createElement('div', { className: 'node__roles', parent: root });
    const roleButtons = new Map<StateRole, HTMLButtonElement>();
    for (const role of ['initial', 'final'] as const) {
      const button = createButton({
        className: `node__role node__role--${role}`,
        parent: roles,
        text: role === 'initial' ? '▶ Initial' : '◉ Final',
        attrs: { 'aria-pressed': 'false' },
      });
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#toggleRole(stateId, role);
      });
      roleButtons.set(role, button);
    }

    // Only reachable while the state is initial: the start pseudo-node does not
    // exist until a creation edge does, so there is nothing to drag from yet.
    const creationButton = createButton({
      className: 'node__create',
      parent: roles,
      text: '+ Creation',
      attrs: { title: 'Add a transition that creates a record in this state' },
    });
    creationButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!this.#readOnly) {
        this.addCreationTransition(stateId);
      }
    });

    const startMarker = createSvgElement('g', {
      className: 'start-marker',
      parent: this.#edgeLayer,
    });
    createSvgElement('circle', { className: 'start-marker__dot', parent: startMarker });
    createSvgElement('line', {
      className: 'start-marker__line',
      parent: startMarker,
      attrs: { 'marker-end': 'url(#sme-arrow)' },
    });

    const linkHandle = createButton({
      className: 'node__link',
      parent: root,
      text: '→',
      attrs: { 'aria-label': 'Drag to another state to create a transition' },
    });

    root.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      // Pressing a different card dismisses an open palette; pressing this one
      // leaves it be, so its own button can toggle it shut on the click.
      if (this.#paletteFor !== undefined && this.#paletteFor !== stateId) {
        this.#closePalette();
      }
      this.#setSelection({ kind: 'state', id: stateId });
    });
    header.addEventListener('pointerdown', (event) => this.#onNodePointerDown(event, stateId));
    name.addEventListener('dblclick', () => this.#renameState(stateId));
    renameButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#renameState(stateId);
    });
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#commit(removeState(this.#machine, stateId), { kind: 'state-remove', stateId });
    });
    linkHandle.addEventListener('pointerdown', (event) => this.#onLinkPointerDown(event, stateId));

    return {
      root,
      bar,
      colorButton,
      palette,
      swatches,
      header,
      name,
      renameButton,
      propertiesButton,
      removeButton,
      linkHandle,
      creationButton,
      chips,
      startMarker,
      roleButtons,
    };
  }

  #updateStateView(view: StateView, state: StateNode): void {
    view.root.style.left = `${state.position.x}px`;
    view.root.style.top = `${state.position.y}px`;
    view.root.classList.toggle(
      'is-selected',
      this.#selection?.kind === 'state' && this.#selection.id === state.id,
    );
    view.name.textContent = state.name;
    const editing = this.#renamingId === state.id;
    view.name.hidden = editing;
    view.renameButton.hidden = this.#readOnly || editing;
    // Properties stay reachable read-only, exactly like the side effect chips.
    view.propertiesButton.hidden = editing;
    view.removeButton.hidden = this.#readOnly || editing;
    view.linkHandle.hidden = this.#readOnly;
    view.header.style.cursor = this.#readOnly ? 'default' : 'grab';
    for (const key of HOOK_KEYS) {
      const chip = view.chips.get(key);
      if (chip !== undefined) {
        this.#updateChip(chip, hookRef(state.id, key));
      }
    }
    this.#updateStateRoles(view, state);
    this.#updateStateColor(view, state);
  }

  #updateStateColor(view: StateView, state: StateNode): void {
    view.root.setAttribute('data-color', state.color);
    const open = this.#paletteFor === state.id && !this.#readOnly;
    view.colorButton.hidden = this.#readOnly;
    view.colorButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    view.colorButton.setAttribute('aria-label', `Colour: ${state.color}. Pick another.`);
    view.colorButton.title = `Colour: ${state.color}`;
    view.palette.hidden = !open;
    view.palette.setAttribute('aria-label', `Colour of “${state.name}”`);
    for (const [color, option] of view.swatches) {
      const selected = color === state.color;
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
      option.classList.toggle('is-selected', selected);
    }
  }

  #togglePalette(stateId: string): void {
    if (this.#readOnly) {
      return;
    }
    this.#paletteFor = this.#paletteFor === stateId ? undefined : stateId;
    this.#render();
  }

  #closePalette(): void {
    if (this.#paletteFor === undefined) {
      return;
    }
    this.#paletteFor = undefined;
    this.#render();
  }

  #pickColor(stateId: string, color: StateColor): void {
    this.#paletteFor = undefined;
    this.#commit(updateState(this.#machine, stateId, { color }), {
      kind: 'state-color',
      stateId,
    });
  }

  #updateStateRoles(view: StateView, state: StateNode): void {
    const initial = isInitialState(this.#machine, state.id);
    const final = isFinalState(this.#machine, state.id);
    const created = this.#machine.transitions.some(
      (transition) => transition.from === null && transition.to === state.id,
    );

    view.root.classList.toggle('is-initial', initial);
    view.root.classList.toggle('is-final', final);

    for (const [role, button] of view.roleButtons) {
      const on = role === 'initial' ? initial : final;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.disabled = this.#readOnly;
      const verb = on ? 'Unmark' : 'Mark';
      button.setAttribute(
        'aria-label',
        `${verb} “${state.name}” as ${role === 'initial' ? 'an initial' : 'a final'} state`,
      );
    }

    // The flag and the creation edges are independent: marking a state initial
    // never creates an edge, and unmarking it never deletes one.
    view.creationButton.hidden = !initial;
    view.creationButton.disabled = this.#readOnly;
    view.creationButton.setAttribute(
      'aria-label',
      `Add a creation transition into “${state.name}”`,
    );

    // A short arrow into the left border: the usual way of drawing a start
    // state. Redundant once the creation edges spell out how, so it is dropped
    // as soon as this state has one.
    view.startMarker.style.display = initial && !created ? '' : 'none';
    if (!initial || created) {
      return;
    }
    const rect = this.#rectFor(state);
    const y = rect.y + START_MARKER_Y;
    const dot = view.startMarker.firstElementChild;
    const line = view.startMarker.lastElementChild;
    if (dot !== null) {
      dot.setAttribute('cx', String(rect.x - START_MARKER_REACH));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', '6');
    }
    if (line !== null) {
      line.setAttribute('x1', String(rect.x - START_MARKER_REACH + 6));
      line.setAttribute('y1', String(y));
      line.setAttribute('x2', String(rect.x - 3));
      line.setAttribute('y2', String(y));
    }
  }

  #toggleRole(stateId: string, role: StateRole): void {
    if (this.#readOnly) {
      return;
    }
    this.#commit(
      role === 'initial'
        ? toggleInitialState(this.#machine, stateId)
        : toggleFinalState(this.#machine, stateId),
      { kind: role === 'initial' ? 'initial-states-change' : 'final-states-change' },
    );
  }

  #updateChip(chip: HTMLButtonElement, ref: SideEffectListRef): void {
    const effects = getSideEffects(this.#machine, ref);
    const emptyLabel = this.#readOnly ? 'No side effects' : ADD_SIDE_EFFECT_LABEL;
    chip.textContent = formatSideEffectSummary(effects, emptyLabel);
    chip.classList.toggle('is-filled', effects.length > 0);
    chip.title = formatSideEffectTitle(effects);
    const labels = describeSideEffectList(this.#machine, ref);
    // The `{ }` marker itself is drawn in CSS, so it stays out of textContent.
    const withParams = countWithParams(effects);
    chip.toggleAttribute('data-has-params', withParams > 0);
    chip.setAttribute(
      'aria-label',
      `${labels.description} ${effects.length} side effect${effects.length === 1 ? '' : 's'}` +
        `${withParams > 0 ? `, ${withParams} with parameters` : ''}. Open list.`,
    );
    chip.setAttribute('data-count', String(effects.length));
  }

  #renderTransitions(): void {
    const alive = new Set<string>();
    for (const transition of this.#machine.transitions) {
      alive.add(transition.id);
      const view =
        this.#transitionViews.get(transition.id) ?? this.#createTransitionView(transition.id);
      this.#transitionViews.set(transition.id, view);
      this.#updateTransitionView(view, transition);
    }
    for (const [id, view] of this.#transitionViews) {
      if (!alive.has(id)) {
        view.path.remove();
        view.card.remove();
        this.#transitionViews.delete(id);
      }
    }
  }

  #createTransitionView(transitionId: string): TransitionView {
    const path = createSvgElement('path', {
      className: 'edge',
      parent: this.#edgeLayer,
      attrs: { 'marker-end': 'url(#sme-arrow)', part: 'edge', 'data-transition-id': transitionId },
    });
    const card = createElement('div', {
      className: 'edge-card',
      parent: this.#world,
      attrs: { part: 'transition', 'data-transition-id': transitionId },
    });
    const header = createElement('div', { className: 'edge-card__header', parent: card });
    const name = createElement('span', { className: 'edge-card__name', parent: header });
    const renameButton = createButton({
      className: 'icon-button edge-card__rename',
      parent: header,
      text: '✎',
      attrs: { 'aria-label': 'Rename transition', title: 'Rename (F2)' },
    });
    const propertiesButton = createButton({
      className: 'icon-button edge-card__properties',
      parent: header,
      text: '⚙',
      attrs: { 'aria-label': 'Transition properties', title: 'Properties' },
    });
    propertiesButton.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.openProperties({ kind: 'transition', id: transitionId });
    });
    const removeButton = createButton({
      className: 'icon-button edge-card__remove',
      parent: header,
      text: '✕',
      attrs: { 'aria-label': 'Remove transition' },
    });
    /*
     * The name keeps the headline: it is the edge's identity, it is always
     * present, and it is what the inline rename gesture edits. The trigger —
     * nullable, and shared by every edge it fires — rides underneath with the
     * guard that tells those edges apart.
     */
    const meta = createElement('div', { className: 'edge-card__meta', parent: card });
    const trigger = createElement('span', { className: 'edge-card__trigger', parent: meta });
    const guard = createElement('span', { className: 'edge-card__guard', parent: meta });
    const hooks = createElement('div', { className: 'hooks', parent: card });
    const chips = new Map<SideEffectPhase, HTMLButtonElement>();
    for (const phase of ['before', 'after'] as const) {
      const row = createElement('div', { className: 'hook', parent: hooks });
      createElement('span', { className: 'hook__label', parent: row, text: phase });
      const chip = createButton({ className: 'chip', parent: row, attrs: { part: 'chip' } });
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        void this.openSideEffects({ kind: 'transition', transitionId, phase });
      });
      chips.set(phase, chip);
    }

    card.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.#setSelection({ kind: 'transition', id: transitionId });
    });
    header.addEventListener('pointerdown', (event) =>
      this.#onLabelPointerDown(event, transitionId),
    );
    name.addEventListener('dblclick', () => this.#renameTransition(transitionId));
    renameButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#renameTransition(transitionId);
    });
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#commit(removeTransition(this.#machine, transitionId), {
        kind: 'transition-remove',
        transitionId,
      });
    });

    return {
      path,
      card,
      name,
      renameButton,
      propertiesButton,
      removeButton,
      meta,
      trigger,
      guard,
      chips,
    };
  }

  #updateTransitionView(view: TransitionView, transition: Transition): void {
    const geometry = this.#geometryFor(transition);
    view.path.setAttribute('d', geometry.path);
    const selected = this.#selection?.kind === 'transition' && this.#selection.id === transition.id;
    view.path.classList.toggle('is-selected', selected);
    view.card.classList.toggle('is-selected', selected);
    // The curve is bent to pass through the card, so the label point is the card.
    view.card.style.left = `${geometry.label.x}px`;
    view.card.style.top = `${geometry.label.y}px`;
    view.name.textContent = transition.name;
    view.card.classList.toggle('is-creation', transition.from === null);
    const editing = this.#renamingId === transition.id;
    view.name.hidden = editing;
    view.renameButton.hidden = this.#readOnly || editing;
    view.propertiesButton.hidden = editing;
    view.removeButton.hidden = this.#readOnly || editing;
    this.#updateTransitionMeta(view, transition);
    for (const phase of ['before', 'after'] as const) {
      const chip = view.chips.get(phase);
      if (chip !== undefined) {
        this.#updateChip(chip, { kind: 'transition', transitionId: transition.id, phase });
      }
    }
  }

  #updateTransitionMeta(view: TransitionView, transition: Transition): void {
    const trigger = transition.trigger;
    view.trigger.hidden = trigger === null;
    view.trigger.textContent = trigger === null ? '' : `⚡ ${trigger.name}`;
    view.trigger.title = trigger === null ? '' : `Trigger: ${trigger.name}`;
    const guarded = transition.guard.length > 0;
    view.guard.hidden = !guarded;
    view.guard.textContent = guarded ? `[${transition.guard}]` : '';
    view.guard.title = guarded ? `Guard: ${transition.guard}` : '';
    view.meta.hidden = trigger === null && !guarded;
  }

  /** How many siblings a transition fans against, and which one it is. */
  #fanIndexOf(transition: Transition): number {
    const siblings = siblingTransitions(this.#machine, transition);
    return Math.max(
      siblings.findIndex((candidate) => candidate.id === transition.id),
      0,
    );
  }

  /**
   * Where the editor would draw the edge on its own. A creation edge is not a
   * special case here: its source is the start pseudo-node's rect, so fanning,
   * bending and label placement all apply unchanged.
   */
  #autoGeometry(transition: Transition): EdgeGeometry | undefined {
    const sourceRect = this.#sourceRect(transition.from);
    const target = findState(this.#machine, transition.to);
    if (sourceRect === undefined || target === undefined) {
      return undefined;
    }
    const index = this.#fanIndexOf(transition);
    if (transition.from === transition.to) {
      return computeSelfEdgeGeometry(sourceRect, index);
    }
    // The perpendicular flips with the edge direction, so a transition drawn the
    // other way round has to invert its curvature to land on its own side of the
    // pair instead of on top of a sibling. The start pseudo-node sorts first.
    const reversed = (transition.from ?? '') > transition.to;
    const curvature = curvatureFor(index, this.#labelSpacing()) * (reversed ? -1 : 1);
    return computeEdgeGeometry(sourceRect, this.#rectFor(target), curvature);
  }

  #geometryFor(transition: Transition): EdgeGeometry {
    const auto = this.#autoGeometry(transition);
    if (auto === undefined) {
      return EMPTY_GEOMETRY;
    }
    if (transition.labelOffset.x === 0 && transition.labelOffset.y === 0) {
      return auto;
    }
    const sourceRect = this.#sourceRect(transition.from);
    const target = findState(this.#machine, transition.to);
    if (sourceRect === undefined || target === undefined) {
      return auto;
    }
    // Where the user dragged the card to: the automatic point plus their offset.
    const through = {
      x: auto.label.x + transition.labelOffset.x,
      y: auto.label.y + transition.labelOffset.y,
    };
    return transition.from === transition.to
      ? bendSelfEdgeThrough(sourceRect, this.#fanIndexOf(transition), through)
      : bendEdgeThrough(sourceRect, this.#rectFor(target), through);
  }

  /**
   * How far apart parallel edges are fanned. A card sits at the midpoint of its
   * curve, which is half the curvature off the straight line, so the spacing is
   * twice the card height to keep neighbours from covering each other.
   */
  #labelSpacing(): number {
    const [view] = this.#transitionViews.values();
    const height = view?.card.offsetHeight ?? 0;
    return Math.max((height + 16) * 2, FALLBACK_LABEL_SPACING);
  }

  /** The point a transition card would sit at if the user had not moved it. */
  #autoLabelPoint(transition: Transition): Point {
    return this.#autoGeometry(transition)?.label ?? { x: 0, y: 0 };
  }

  // -- multi touch ----------------------------------------------------------

  /** Capture phase, so a second finger is seen even when it lands on a card. */
  #onTrackPointerDown = (event: PointerEvent): void => {
    this.#pointers.set(event.pointerId, this.#localPoint(event));
    this.#startTrackingPointers();
    if (this.#pointers.size === 2 && this.#pinch === undefined) {
      this.#beginPinch();
    }
  };

  #startTrackingPointers(): void {
    if (this.#trackingPointers) {
      return;
    }
    this.#trackingPointers = true;
    const doc = this.ownerDocument;
    doc.addEventListener('pointermove', this.#onTrackPointerMove, { capture: true });
    doc.addEventListener('pointerup', this.#onTrackPointerUp, { capture: true });
    doc.addEventListener('pointercancel', this.#onTrackPointerUp, { capture: true });
  }

  #stopTrackingPointers(): void {
    if (!this.#trackingPointers) {
      return;
    }
    this.#trackingPointers = false;
    const doc = this.ownerDocument;
    doc.removeEventListener('pointermove', this.#onTrackPointerMove, { capture: true });
    doc.removeEventListener('pointerup', this.#onTrackPointerUp, { capture: true });
    doc.removeEventListener('pointercancel', this.#onTrackPointerUp, { capture: true });
  }

  #onTrackPointerMove = (event: PointerEvent): void => {
    if (!this.#pointers.has(event.pointerId)) {
      return;
    }
    this.#pointers.set(event.pointerId, this.#localPoint(event));
    this.#applyPinch();
  };

  #onTrackPointerUp = (event: PointerEvent): void => {
    this.#pointers.delete(event.pointerId);
    if (this.#pinch !== undefined && this.#pointers.size < 2) {
      this.#endPinch();
    }
    if (this.#pointers.size === 0) {
      this.#stopTrackingPointers();
    }
  };

  #beginPinch(): void {
    const entries = [...this.#pointers.entries()];
    const first = entries[0];
    const second = entries[1];
    if (first === undefined || second === undefined) {
      return;
    }
    // A pinch supersedes whatever the first finger had started (pan, node, link).
    this.#endDrag();
    this.#pinch = {
      pointers: [first[0], second[0]],
      startDistance: distanceBetween(first[1], second[1]),
      startCenter: midpointOf(first[1], second[1]),
      startViewport: this.#viewport,
    };
    this.#viewportElement.classList.add('is-pinching');
  }

  #endPinch(): void {
    if (this.#pinch === undefined) {
      return;
    }
    this.#pinch = undefined;
    this.#viewportElement.classList.remove('is-pinching');
  }

  /**
   * Recomputed from the values captured when the pinch started rather than
   * accumulated frame by frame, so rounding never makes the canvas drift.
   */
  #applyPinch(): void {
    const pinch = this.#pinch;
    if (pinch === undefined) {
      return;
    }
    const [firstId, secondId] = pinch.pointers;
    const first = this.#pointers.get(firstId);
    const second = this.#pointers.get(secondId);
    if (first === undefined || second === undefined) {
      return;
    }
    const center = midpointOf(first, second);
    const scale = pinchScale(
      pinch.startViewport.scale,
      pinch.startDistance,
      distanceBetween(first, second),
    );
    const zoomed = zoomTo(pinch.startViewport, scale, pinch.startCenter);
    // Moving both fingers together pans, exactly like a one finger drag would.
    this.#setViewport(
      panBy(zoomed, center.x - pinch.startCenter.x, center.y - pinch.startCenter.y),
    );
  }

  // -- interactions ---------------------------------------------------------

  #onBackgroundPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.#pinch !== undefined || isInteractiveTarget(event.target)) {
      return;
    }
    this.#closePalette();
    this.#setSelection(null);
    this.#beginDrag({ kind: 'pan', origin: this.#localPoint(event), viewport: this.#viewport });
    this.#viewportElement.classList.add('is-panning');
  };

  #onNodePointerDown(event: PointerEvent, stateId: string): void {
    if (event.button !== 0 || this.#readOnly || this.#pinch !== undefined) {
      return;
    }
    if (isInteractiveTarget(event.target)) {
      return;
    }
    const state = findState(this.#machine, stateId);
    if (state === undefined) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this.#setSelection({ kind: 'state', id: stateId });
    const pointer = this.#worldPoint(event);
    this.#beginDrag({
      kind: 'node',
      stateId,
      offset: { x: pointer.x - state.position.x, y: pointer.y - state.position.y },
      moved: false,
    });
  }

  #onLabelPointerDown(event: PointerEvent, transitionId: string): void {
    if (event.button !== 0 || this.#readOnly || this.#pinch !== undefined) {
      return;
    }
    if (isInteractiveTarget(event.target)) {
      return;
    }
    const transition = findTransition(this.#machine, transitionId);
    if (transition === undefined) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this.#setSelection({ kind: 'transition', id: transitionId });
    const pointer = this.#worldPoint(event);
    const card = this.#geometryFor(transition).label;
    this.#beginDrag({
      kind: 'label',
      transitionId,
      grab: { x: pointer.x - card.x, y: pointer.y - card.y },
      moved: false,
    });
  }

  #onLinkPointerDown(event: PointerEvent, stateId: string | null): void {
    if (event.button !== 0 || this.#readOnly || this.#pinch !== undefined) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this.#beginDrag({ kind: 'link', fromId: stateId, pointer: this.#worldPoint(event) });
    this.#updatePreview();
  }

  #beginDrag(drag: DragState): void {
    this.#drag = drag;
    const doc = this.ownerDocument;
    doc.addEventListener('pointermove', this.#onPointerMove);
    doc.addEventListener('pointerup', this.#onPointerUp);
    doc.addEventListener('pointercancel', this.#onPointerCancel);
  }

  #endDrag(): void {
    const doc = this.ownerDocument;
    doc.removeEventListener('pointermove', this.#onPointerMove);
    doc.removeEventListener('pointerup', this.#onPointerUp);
    doc.removeEventListener('pointercancel', this.#onPointerCancel);
    this.#drag = undefined;
    this.#viewportElement.classList.remove('is-panning');
    this.#previewPath.style.display = 'none';
    for (const view of this.#stateViews.values()) {
      view.root.classList.remove('is-link-target');
    }
  }

  #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (drag === undefined) {
      return;
    }
    if (drag.kind === 'pan') {
      const current = this.#localPoint(event);
      this.#setViewport(panBy(drag.viewport, current.x - drag.origin.x, current.y - drag.origin.y));
      return;
    }
    if (drag.kind === 'node') {
      const pointer = this.#worldPoint(event);
      const position = {
        x: Math.round(pointer.x - drag.offset.x),
        y: Math.round(pointer.y - drag.offset.y),
      };
      this.#drag = { ...drag, moved: true };
      this.#commit(
        updateState(this.#machine, drag.stateId, { position }),
        { kind: 'state-move', stateId: drag.stateId },
        true,
      );
      return;
    }
    if (drag.kind === 'label') {
      const offset = this.#labelOffsetFor(drag, event);
      if (offset !== undefined) {
        this.#drag = { ...drag, moved: true };
        this.#commit(
          updateTransition(this.#machine, drag.transitionId, { labelOffset: offset }),
          { kind: 'transition-move', transitionId: drag.transitionId },
          true,
        );
      }
      return;
    }
    this.#drag = { ...drag, pointer: this.#worldPoint(event) };
    this.#updatePreview();
  };

  /**
   * Offset of the dragged card from where it would sit automatically. Dropping it
   * back near that spot snaps to zero, which hands placement back to the editor.
   */
  #labelOffsetFor(
    drag: { readonly transitionId: string; readonly grab: Point },
    event: { readonly clientX: number; readonly clientY: number },
  ): Point | undefined {
    const transition = findTransition(this.#machine, drag.transitionId);
    if (transition === undefined) {
      return undefined;
    }
    const pointer = this.#worldPoint(event);
    const anchor = this.#autoLabelPoint(transition);
    const offset = {
      x: Math.round(pointer.x - drag.grab.x - anchor.x),
      y: Math.round(pointer.y - drag.grab.y - anchor.y),
    };
    return Math.hypot(offset.x, offset.y) < LABEL_SNAP_DISTANCE ? { x: 0, y: 0 } : offset;
  }

  #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (drag === undefined) {
      return;
    }
    if (drag.kind === 'node' && drag.moved) {
      const state = findState(this.#machine, drag.stateId);
      if (state !== undefined) {
        this.#endDrag();
        this.#commit(
          updateState(this.#machine, drag.stateId, { position: state.position }),
          { kind: 'state-move', stateId: drag.stateId },
          false,
        );
        return;
      }
    }
    if (drag.kind === 'label' && drag.moved) {
      const offset = this.#labelOffsetFor(drag, event);
      this.#endDrag();
      if (offset !== undefined) {
        this.#commit(
          updateTransition(this.#machine, drag.transitionId, { labelOffset: offset }),
          { kind: 'transition-move', transitionId: drag.transitionId },
          false,
        );
      }
      return;
    }
    if (drag.kind === 'link') {
      const target = this.#stateAt(this.#worldPoint(event));
      this.#endDrag();
      if (target !== undefined) {
        this.addTransition(drag.fromId, target.id);
      }
      return;
    }
    this.#endDrag();
  };

  #onPointerCancel = (): void => {
    this.#endDrag();
  };

  #updatePreview(): void {
    const drag = this.#drag;
    if (drag === undefined || drag.kind !== 'link') {
      this.#previewPath.style.display = 'none';
      return;
    }
    const rect = this.#sourceRect(drag.fromId);
    if (rect === undefined) {
      return;
    }
    const start = { x: rect.x + rect.width, y: rect.y + Math.min(16, rect.height / 2) };
    this.#previewPath.setAttribute(
      'd',
      `M ${start.x} ${start.y} L ${drag.pointer.x} ${drag.pointer.y}`,
    );
    this.#previewPath.style.display = '';
    const hovered = this.#stateAt(drag.pointer);
    for (const [id, view] of this.#stateViews) {
      view.root.classList.toggle('is-link-target', hovered?.id === id);
    }
  }

  #onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const anchor = this.#localPoint(event);
    // A trackpad pinch arrives as a wheel event with ctrlKey set, in every browser.
    if (event.ctrlKey || event.metaKey) {
      this.#setViewport(
        zoomBy(this.#viewport, wheelZoomFactor(event.deltaY, event.deltaMode), anchor),
      );
      return;
    }
    this.#setViewport(panBy(this.#viewport, -event.deltaX, -event.deltaY));
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.#drag?.kind === 'link') {
      this.#endDrag();
      return;
    }
    if (event.key === 'Escape' && this.#paletteFor !== undefined) {
      this.#closePalette();
      return;
    }
    if (this.#readOnly || isInteractiveTarget(event.target)) {
      return;
    }
    const selection = this.#selection;
    if (selection === null) {
      return;
    }
    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault();
      this.renameSelection();
      return;
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') {
      return;
    }
    event.preventDefault();
    this.#selection = null;
    if (selection.kind === 'state') {
      this.#commit(removeState(this.#machine, selection.id), {
        kind: 'state-remove',
        stateId: selection.id,
      });
      return;
    }
    this.#commit(removeTransition(this.#machine, selection.id), {
      kind: 'transition-remove',
      transitionId: selection.id,
    });
  };

  // -- inline renaming ------------------------------------------------------

  #renameState(stateId: string): void {
    const state = findState(this.#machine, stateId);
    const view = this.#stateViews.get(stateId);
    if (state === undefined || view === undefined || this.#readOnly) {
      return;
    }
    this.#startRename({
      id: stateId,
      label: view.name,
      current: state.name,
      ariaLabel: 'State name',
      controls: [view.renameButton, view.removeButton],
      commit: (name) => {
        this.#commit(updateState(this.#machine, stateId, { name }), {
          kind: 'state-rename',
          stateId,
        });
      },
    });
  }

  #renameTransition(transitionId: string): void {
    const view = this.#transitionViews.get(transitionId);
    const transition = findTransition(this.#machine, transitionId);
    if (transition === undefined || view === undefined || this.#readOnly) {
      return;
    }
    this.#startRename({
      id: transitionId,
      label: view.name,
      current: transition.name,
      ariaLabel: 'Transition name',
      controls: [view.renameButton, view.removeButton],
      commit: (name) => {
        this.#commit(updateTransition(this.#machine, transitionId, { name }), {
          kind: 'transition-rename',
          transitionId,
        });
      },
    });
  }

  /**
   * Swaps the name for an input plus save/cancel buttons. The buttons exist so the
   * gesture works on touch, where there is no Enter key in reach and no Escape at all.
   */
  #startRename(options: {
    readonly id: string;
    readonly label: HTMLElement;
    readonly current: string;
    readonly ariaLabel: string;
    readonly controls: readonly HTMLElement[];
    readonly commit: (name: string) => void;
  }): void {
    this.#renameCleanup?.();
    this.#renamingId = options.id;

    const editor = createElement('span', { className: 'name-edit' });
    const input = createElement('input', { className: 'name-input' });
    input.value = options.current;
    input.setAttribute('aria-label', options.ariaLabel);
    const save = createButton({
      className: 'icon-button icon-button--confirm',
      text: '✓',
      attrs: { 'aria-label': 'Save name', title: 'Save (Enter)' },
    });
    const cancel = createButton({
      className: 'icon-button icon-button--cancel',
      text: '✕',
      attrs: { 'aria-label': 'Cancel renaming', title: 'Cancel (Escape)' },
    });
    editor.append(input, save, cancel);

    options.label.hidden = true;
    for (const control of options.controls) {
      control.hidden = true;
    }
    options.label.after(editor);
    input.focus();
    input.select();

    let finished = false;
    const cleanup = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      this.#renameCleanup = undefined;
      this.#renamingId = undefined;
      editor.remove();
      options.label.hidden = false;
      for (const control of options.controls) {
        control.hidden = this.#readOnly;
      }
    };
    this.#renameCleanup = cleanup;

    const confirm = (): void => {
      const name = input.value.trim();
      cleanup();
      if (name.length > 0 && name !== options.current) {
        options.commit(name);
      }
    };

    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        confirm();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cleanup();
      }
    });
    input.addEventListener('blur', confirm);
    input.addEventListener('pointerdown', (event) => event.stopPropagation());
    input.addEventListener('dblclick', (event) => event.stopPropagation());

    for (const button of [save, cancel]) {
      // Keep focus in the input so the blur handler does not commit before the
      // click lands — which would make Cancel save instead of discarding.
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    }
    save.addEventListener('click', (event) => {
      event.stopPropagation();
      confirm();
    });
    cancel.addEventListener('click', (event) => {
      event.stopPropagation();
      cleanup();
    });
  }
}
