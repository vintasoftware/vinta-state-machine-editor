import type {
  FanOutEvent,
  SelectionChangeEvent,
  StateMachineChangeEvent,
  StateMachineEditorEventMap,
  ThemeChangeEvent,
} from '../events.js';
import {
  FAN_OUT_EVENT,
  SELECTION_CHANGE_EVENT,
  STATE_MACHINE_CHANGE_EVENT,
  THEME_CHANGE_EVENT,
} from '../events.js';
import {
  bendEdgeThrough,
  bendSelfEdgeThrough,
  computeEdgeGeometry,
  computeSelfEdgeGeometry,
  creationAnchorPoint,
  curvatureFor,
  type EdgeGeometry,
  orderCreationAnchors,
} from '../geometry/edge.js';
import { isUnpositioned, organizeMachine } from '../geometry/layout.js';
import { boxAround, findFreeLabelSpot } from '../geometry/placement.js';
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
  type ClipboardEntry,
  canPaste,
  copyElement,
  copyName,
  duplicateState,
  duplicateTransition,
} from '../model/clipboard.js';
import {
  type DecisionRow,
  decisionRows,
  groupTransitions,
  isDecision,
  moveDecisionRow,
  setDecisionLabelOffset,
  type TransitionGroup,
} from '../model/groups.js';
import {
  canRedo,
  canUndo,
  createHistory,
  type History,
  type HistoryStep,
  pendingRedo,
  pendingUndo,
  recordHistory,
  redoHistory,
  undoHistory,
} from '../model/history.js';
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
  uniqueStateName,
  uniqueTransitionName,
  updateState,
  updateTransition,
} from '../model/machine.js';
import { assertStateMachine } from '../model/parse.js';
import { decisionIssues, type StateIssue, stateIssues } from '../model/validation.js';
import {
  type CountsAsStatus,
  countsAsStatus,
  emptyWaitingConfig,
  parseDuration,
  readWaiting,
  setWaiting,
  toggleWaiting,
  type WaitingConfig,
} from '../model/waiting.js';
import type {
  ActionProvider,
  ElementRef,
  FanOutHandler,
  GuardValidation,
  GuardValidator,
  MachineChange,
  Point,
  Rect,
  Selection,
  SideEffectListRef,
  SideEffectPhase,
  SideEffectProvider,
  Size,
  StateColor,
  StateMachine,
  StateNode,
  StateRole,
  StateTrigger,
  Transition,
  TransitionTrigger,
} from '../types.js';
import { SIDE_EFFECT_PHASES, STATE_COLORS } from '../types.js';
import { ConfirmDialogElement } from './confirm-dialog.js';
import { createButton, createElement, createSvgElement, isInteractiveTarget } from './dom.js';
import {
  clearIcon,
  createIconButton,
  DEFAULT_ICONS,
  type EditorIcons,
  hasIcon,
  type IconName,
  type IconOverrides,
  mergeIcons,
  refreshIcons,
  setIcon,
} from './icons.js';
import {
  describeElement,
  describeSideEffectList,
  describeSource,
  historyLabel,
  shortHookLabel,
} from './labels.js';
import type { OrderContext, PropertiesDraft } from './properties-dialog.js';
import { PropertiesDialogElement } from './properties-dialog.js';
import { ReorderController } from './reorder.js';
import {
  countWithParams,
  formatSideEffectHead,
  formatSideEffectTitle,
} from './side-effect-summary.js';
import { SideEffectsDialogElement } from './side-effects-dialog.js';
import {
  DEFAULT_STRINGS,
  type EditorStrings,
  mergeStrings,
  type StringOverrides,
} from './strings.js';
import { editorStyles } from './styles.js';
import {
  applyTheme,
  DEFAULT_THEME,
  type EditorTheme,
  normalizeTheme,
  otherTheme,
  THEME_ATTRIBUTE,
} from './theme.js';

const FALLBACK_NODE_WIDTH = 248;
const FALLBACK_NODE_HEIGHT = 152;
const ZOOM_STEP = 1.25;
const GRID_SIZE = 24;
/**
 * What the theme toggle shows, keyed by the scheme in force. Both the icon and
 * the label name the scheme the press *switches to*, which is the thing the
 * user is deciding about.
 */
const THEME_TOGGLE: Readonly<
  Record<
    EditorTheme,
    { readonly icon: IconName; readonly label: (strings: EditorStrings) => string }
  >
> = {
  dark: { icon: 'lightTheme', label: (strings) => strings.toolbar.themeLight },
  light: { icon: 'darkTheme', label: (strings) => strings.toolbar.themeDark },
};
/** How long after the last viewport change the canvas is considered settled. */
const TRANSFORM_SETTLE_MS = 180;
/** Dropping a transition card this close to its edge snaps it back to automatic placement. */
const LABEL_SNAP_DISTANCE = 16;
const FALLBACK_LABEL_SPACING = 160;
/** How far the dashed fan-out stub reaches past the card, and how far it drops. */
const FAN_OUT_REACH = 52;
const FAN_OUT_DROP = 34;
/** How far the start arrow reaches left of an initial state, and how far down it sits. */
const START_MARKER_REACH = 42;
const START_MARKER_Y = 20;
/** Thickness of the start bar every creation edge leaves from. */
const START_BAR_WIDTH = 34;
/** Vertical room reserved per creation edge, so no two leave the bar together. */
const START_BAR_SLOT = 38;
/** Floor on the bar's height. Tall enough for the label to read, whatever it holds. */
const START_BAR_MIN_HEIGHT = 120;
/** Clear space demanded between a creation card and both the bar and its target. */
const CREATION_CARD_MARGIN = 56;
/** Card size assumed before the DOM has been measured. */
const FALLBACK_LABEL_WIDTH = 186;
const FALLBACK_LABEL_HEIGHT = 72;
/** How far the search for a free spot may wander before giving up. */
const PLACEMENT_RINGS = 6;
/** How far a pasted state starts out from the one it was copied from. */
const PASTE_OFFSET = 24;

/**
 * Clear space the automatic layout leaves around the block it draws, so the
 * cards do not start hard against the toolbar in a freshly fitted view.
 */
const LAYOUT_ORIGIN: Point = { x: 40, y: 40 };

const EMPTY_GEOMETRY: EdgeGeometry = {
  path: '',
  source: { x: 0, y: 0 },
  target: { x: 0, y: 0 },
  label: { x: 0, y: 0 },
  arrowAngle: 0,
};

/** The lines of the waiting band, top to bottom. */
type BandField = 'child' | 'join' | 'timeout' | 'counts';

const BAND_FIELDS: readonly BandField[] = ['child', 'join', 'timeout', 'counts'];

type HookKey = `${StateTrigger}:${SideEffectPhase}`;

const HOOK_KEYS: readonly HookKey[] = [
  'enter:before',
  'enter:after',
  'leave:before',
  'leave:after',
];

/**
 * A hook chip. The label lives in a child of its own so the button itself does
 * not have to clip: the ellipsis belongs to the name, and the count badge hangs
 * off the chip's leading edge, outside it.
 */
interface ChipView {
  readonly button: HTMLButtonElement;
  readonly label: HTMLElement;
}

/** One line of the band: what it names, and what the state says about it. */
interface BandRowView {
  readonly root: HTMLButtonElement;
  readonly label: HTMLElement;
  readonly value: HTMLElement;
}

interface StateView {
  readonly root: HTMLElement;
  /** Colour bar across the top of the card. */
  readonly bar: HTMLElement;
  /** Structure, not side effects: the batch this state fans out and waits for. */
  readonly band: HTMLElement;
  readonly bandRows: ReadonlyMap<BandField, BandRowView>;
  /** Inline complaint about a report pair that arrived with one half missing. */
  readonly bandError: HTMLElement;
  /** Advisory stripes: what a publish would refuse, said where it happened. */
  readonly stripes: HTMLElement;
  readonly waitingButton: HTMLButtonElement;
  readonly colorButton: HTMLButtonElement;
  readonly palette: HTMLElement;
  readonly swatches: ReadonlyMap<StateColor, HTMLButtonElement>;
  /** Entry arrow drawn to the left of a state the machine can start in. */
  readonly startMarker: SVGGElement;
  /** Dashed stub leaving a waiting card, so the fan-out reads as a direction. */
  readonly fanOutStub: SVGGElement;
  readonly roleButtons: ReadonlyMap<StateRole, HTMLButtonElement>;
  readonly header: HTMLElement;
  readonly name: HTMLElement;
  /** Rail of card tools, floating clear of the card so the name keeps the header. */
  readonly actions: HTMLElement;
  readonly renameButton: HTMLButtonElement;
  readonly propertiesButton: HTMLButtonElement;
  readonly removeButton: HTMLButtonElement;
  readonly linkHandle: HTMLButtonElement;
  /** Row holding {@link StateView.creationButton}; hidden with it. */
  readonly creation: HTMLElement;
  /** Creates a creation transition into this state; only shown while it is initial. */
  readonly creationButton: HTMLButtonElement;
  readonly chips: ReadonlyMap<HookKey, ChipView>;
}

interface TransitionView {
  readonly card: HTMLElement;
  readonly name: HTMLElement;
  /** Rail of card tools, floating clear of the card so the name keeps the header. */
  readonly actions: HTMLElement;
  readonly renameButton: HTMLButtonElement;
  readonly propertiesButton: HTMLButtonElement;
  readonly removeButton: HTMLButtonElement;
  /** Secondary line: the trigger that fires this edge and the guard that gates it. */
  readonly meta: HTMLElement;
  readonly trigger: HTMLElement;
  readonly guard: HTMLElement;
  readonly chips: ReadonlyMap<SideEffectPhase, ChipView>;
  /** Whatever the host's guard validator refuses, said on the card itself. */
  readonly stripes: HTMLElement;
}

/** One outcome of a decision card, with the panel it opens underneath it. */
interface DecisionRowView {
  readonly root: HTMLElement;
  readonly handle: HTMLButtonElement;
  /** The order badge, or the fallback glyph on the unguarded row. */
  readonly order: HTMLElement;
  readonly summary: HTMLButtonElement;
  /** The guard, or the word standing in for it on the fallback row. */
  readonly outcome: HTMLElement;
  readonly target: HTMLElement;
  readonly flag: HTMLElement;
  readonly panel: HTMLElement;
  readonly nameInput: HTMLInputElement;
  readonly guardInput: HTMLInputElement;
  readonly permissionInput: HTMLInputElement;
  readonly chips: ReadonlyMap<SideEffectPhase, ChipView>;
  readonly propertiesButton: HTMLButtonElement;
  readonly removeButton: HTMLButtonElement;
  /** Whatever the host's guard validator refuses, said under the row itself. */
  readonly stripes: HTMLElement;
}

/** Several edges leaving one state under one action, drawn as one card. */
interface DecisionView {
  readonly card: HTMLElement;
  readonly header: HTMLElement;
  readonly action: HTMLElement;
  readonly count: HTMLElement;
  readonly list: HTMLElement;
  readonly reorder: ReorderController;
  readonly rows: Map<string, DecisionRowView>;
  /** Advisory stripes about the decision as a whole, chiefly a missing fallback. */
  readonly stripes: HTMLElement;
}

/**
 * The card standing for one {@link TransitionGroup}: the classic edge card when
 * the group holds a single edge, the decision card when it holds several.
 */
type CardView =
  | { readonly kind: 'single'; readonly transitionId: string; readonly view: TransitionView }
  | { readonly kind: 'decision'; readonly view: DecisionView };

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

function sameWaiting(a: WaitingConfig, b: WaitingConfig): boolean {
  return (
    a.isWaiting === b.isWaiting &&
    a.joinAction === b.joinAction &&
    a.childMachine === b.childMachine &&
    a.timeout === b.timeout &&
    a.countsAs === b.countsAs
  );
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

type HistoryCommand = 'undo' | 'redo';

/**
 * Which history command a key press asks for, if any. `Ctrl`+`Y` is in there
 * because that is where Windows apps put redo; `Alt` is not ours to claim.
 */
function historyShortcut(event: KeyboardEvent): HistoryCommand | undefined {
  if (event.altKey || !(event.metaKey || event.ctrlKey)) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }
  return key === 'y' && !event.shiftKey ? 'redo' : undefined;
}

type ClipboardCommand = 'copy' | 'paste';

/** Which clipboard command a key press asks for, if any. */
function clipboardShortcut(event: KeyboardEvent): ClipboardCommand | undefined {
  if (event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey)) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  if (key === 'c') {
    return 'copy';
  }
  return key === 'v' ? 'paste' : undefined;
}

/** Apple keyboards spell the modifiers with symbols, so the hints differ. */
function isApplePlatform(): boolean {
  const agent = globalThis.navigator?.userAgent;
  return agent !== undefined && /Mac|iPhone|iPad|iPod/.test(agent);
}

/** How to print a shortcut in a control's tooltip, for this keyboard. */
function shortcutHint(key: string, shift = false): string {
  if (isApplePlatform()) {
    return `${shift ? '\u21e7' : ''}\u2318${key}`;
  }
  return `Ctrl+${shift ? 'Shift+' : ''}${key}`;
}

/** A hook chip and the label inside it, appended to `parent`. */
function createChip(parent: ParentNode): ChipView {
  const button = createButton({ className: 'chip', parent, attrs: { part: 'chip' } });
  return { button, label: createElement('span', { className: 'chip__label', parent: button }) };
}

/**
 * A list of advisory stripes, appended to `parent`. Empty and hidden until a
 * card has something to complain about.
 */
function createStripes(parent: ParentNode): HTMLElement {
  const list = createElement('div', { className: 'stripes', parent, attrs: { role: 'list' } });
  list.hidden = true;
  return list;
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
  static readonly observedAttributes: readonly string[] = ['readonly', THEME_ATTRIBUTE];

  readonly #shadow: ShadowRoot;
  readonly #viewportElement: HTMLElement;
  readonly #world: HTMLElement;
  readonly #svg: SVGSVGElement;
  readonly #edgeLayer: SVGGElement;
  readonly #previewPath: SVGPathElement;
  readonly #emptyState: HTMLElement;
  readonly #zoomLabel: HTMLButtonElement;
  readonly #addStateButton: HTMLButtonElement;
  readonly #undoButton: HTMLButtonElement;
  readonly #redoButton: HTMLButtonElement;
  readonly #copyButton: HTMLButtonElement;
  readonly #pasteButton: HTMLButtonElement;
  readonly #organizeButton: HTMLButtonElement;
  readonly #themeButton: HTMLButtonElement;
  readonly #toolbar: HTMLElement;
  readonly #zoomOutButton: HTMLButtonElement;
  readonly #zoomInButton: HTMLButtonElement;
  readonly #fitButton: HTMLButtonElement;
  readonly #stateViews = new Map<string, StateView>();
  /** The curve of every edge, keyed by transition id. Cards are keyed by group. */
  readonly #edgePaths = new Map<string, SVGPathElement>();
  /** One card per {@link TransitionGroup}, keyed by the group's own key. */
  readonly #cardViews = new Map<string, CardView>();
  /** The groups of the machine as it stands, rebuilt at the top of every render. */
  #groups: readonly TransitionGroup[] = [];
  /** Which group each transition belongs to, so geometry never rescans the array. */
  #groupOf: ReadonlyMap<string, TransitionGroup> = new Map();
  /** The decision row open for editing, if any, keyed by the transition it edits. */
  #expandedRow: string | undefined;
  /** The outcome a reorder drag is carrying, so its frames fold into one step. */
  #reordering: string | undefined;

  #machine: StateMachine = createEmptyMachine();
  #history: History = createHistory();
  /**
   * The machine as of the last recorded step. Transient commits — the frames of
   * a drag — move `#machine` without moving this, so a whole gesture folds into
   * the single undo step its final commit records.
   */
  #historyBase: StateMachine = this.#machine;
  /** Set while several commits are being folded into one step. */
  #batch: { readonly base: StateMachine; readonly change: MachineChange | undefined } | undefined;
  /** The element last copied, kept per editor rather than per page. */
  #clipboard: ClipboardEntry | null = null;
  #viewport: Viewport = createViewport();
  #selection: Selection = null;
  #provider: SideEffectProvider | undefined;
  #actionProvider: ActionProvider | undefined;
  #guardValidator: GuardValidator | undefined;
  #fanOutHandler: FanOutHandler | undefined;
  /** What the host's validator said about each guard, keyed by the expression. */
  readonly #guardChecks = new Map<string, GuardValidation | 'pending'>();
  /** The start bar, present only while the machine has a creation edge. */
  #startNode: StartNodeView | undefined;
  /** Slot each creation edge leaves the bar from. Rebuilt on every render. */
  #creationAnchors: ReadonlyMap<string, Point> = new Map();
  #readOnly = false;
  #theme: EditorTheme = DEFAULT_THEME;
  #icons: EditorIcons = DEFAULT_ICONS;
  #strings: EditorStrings = DEFAULT_STRINGS;
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
  #confirmDialog: ConfirmDialogElement | undefined;
  /**
   * The open inline name editors, keyed by the state or transition they edit.
   * Several can be open at once: an edit only ends when its own save or cancel
   * is pressed, so starting one elsewhere must not throw the first one away.
   */
  readonly #renameEditors = new Map<string, HTMLInputElement>();

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
    });

    // The toolbar is built once, here. Its wording is written by
    // `#applyStrings`, so a set assigned later reaches it without a rebuild.
    this.#toolbar = createElement('div', {
      className: 'toolbar',
      parent: this.#shadow,
      attrs: { part: 'toolbar', role: 'toolbar' },
    });
    this.#addStateButton = createButton({
      className: 'toolbar__add',
      parent: this.#toolbar,
    });
    this.#undoButton = createIconButton(this.#icons, 'undo', {
      className: 'toolbar__history',
      parent: this.#toolbar,
    });
    this.#redoButton = createIconButton(this.#icons, 'redo', {
      className: 'toolbar__history',
      parent: this.#toolbar,
    });
    this.#copyButton = createButton({ className: 'toolbar__copy', parent: this.#toolbar });
    this.#pasteButton = createButton({ className: 'toolbar__paste', parent: this.#toolbar });
    this.#organizeButton = createButton({
      className: 'toolbar__organize',
      parent: this.#toolbar,
    });
    this.#zoomOutButton = createIconButton(this.#icons, 'zoomOut', { parent: this.#toolbar });
    this.#zoomLabel = createButton({ className: 'toolbar__zoom', parent: this.#toolbar });
    this.#zoomInButton = createIconButton(this.#icons, 'zoomIn', { parent: this.#toolbar });
    this.#fitButton = createButton({ parent: this.#toolbar });
    // Last in the row: the theme is a property of the view, not of the machine,
    // and it stays available while the editor is read-only.
    this.#themeButton = createIconButton(this.#icons, THEME_TOGGLE[this.#theme].icon, {
      className: 'toolbar__theme',
      parent: this.#toolbar,
    });
    this.#applyStrings();

    this.#addStateButton.addEventListener('click', () => {
      this.addState();
    });
    this.#undoButton.addEventListener('click', () => {
      this.undo();
    });
    this.#redoButton.addEventListener('click', () => {
      this.redo();
    });
    this.#copyButton.addEventListener('click', () => {
      this.copySelection();
    });
    this.#pasteButton.addEventListener('click', () => {
      this.paste();
    });
    this.#organizeButton.addEventListener('click', () => {
      void this.confirmOrganize();
    });
    this.#themeButton.addEventListener('click', () => {
      this.toggleTheme();
    });
    this.#zoomOutButton.addEventListener('click', () => this.zoomOut());
    this.#zoomInButton.addEventListener('click', () => this.zoomIn());
    this.#fitButton.addEventListener('click', () => this.zoomToFit());
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
    // The default is written out rather than left implied, so a host reading
    // the attribute back — to persist the choice, say — always finds a scheme
    // there. A value the element does not know is left alone: it renders as the
    // default, exactly like an unknown `type` on an `<input>`.
    if (!this.hasAttribute(THEME_ATTRIBUTE)) {
      applyTheme(this, DEFAULT_THEME);
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
      return;
    }
    if (name === THEME_ATTRIBUTE) {
      const theme = normalizeTheme(next);
      // Two spellings of the same scheme — the attribute going from absent to
      // `dark`, say — are not a change worth announcing.
      if (theme === this.#theme) {
        return;
      }
      this.#theme = theme;
      this.#render();
      this.#emitThemeChange(theme);
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
   *
   * Assigning a *different* machine replaces the document, so the undo history
   * is cleared with it — there is nothing sensible for undo to put back once
   * the host has swapped what is being edited. Assigning the machine already in
   * place, which is what a host echoing `state-machine-change` back does, leaves
   * the history untouched.
   */
  get value(): StateMachine {
    return this.#machine;
  }

  set value(machine: StateMachine) {
    // A host handing back the machine it just received from
    // `state-machine-change` is not replacing the document — that is the same
    // edit coming home — so the identity check keeps undo alive for every host
    // that renders the editor from its own state. It is made against the input,
    // before validation rebuilds it into a machine of its own.
    const echoed = machine === this.#machine;
    const parsed = assertStateMachine(machine);
    if (!echoed) {
      this.#history = createHistory();
    }
    this.#machine = parsed;
    const dropped = this.#selection !== null && !selectionExists(this.#machine, this.#selection);
    if (dropped) {
      this.#selection = null;
    }
    this.#render();
    // A graph that arrives with no layout at all gets one, so the pile of cards
    // on the origin is never what the user sees. It is laid out *after* that
    // first render and drawn again: the cards have to exist to be measured, and
    // a layout pitched on the fallback size would crowd every card that is
    // taller than it. Both passes are one turn, so the pile is never painted.
    const next = isUnpositioned(parsed) ? this.#organized(parsed) : parsed;
    if (next !== parsed) {
      this.#machine = next;
      this.#render();
    }
    if (!echoed) {
      this.#historyBase = next;
    }
    // The positions are the editor's own work rather than the host's, so they
    // are announced: without this the layout would be recomputed on every load
    // and never stored. It is not an undo step — there is nothing sensible to
    // put back, the state before it being the pile this just took apart.
    if (next !== parsed) {
      this.#emitChange(next, { kind: 'layout' }, false);
    }
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
    // The verdicts belong to the validator that gave them.
    this.#guardChecks.clear();
    this.#render();
  }

  /**
   * Takes the user to the machine a waiting state fans out to.
   *
   * Injected like {@link StateMachineEditorElement.actionProvider}: the canvas
   * draws one version of one machine, a fan-out crosses into another, and where
   * that lives — routing, permissions, what "that machine's editor" even means —
   * belongs to the page around it.
   *
   * ```js
   * editor.fanOutHandler = ({ childMachine }) => {
   *   location.href = `/admin/machines/${childMachine}/`;
   * };
   * ```
   *
   * Setting one is what makes the band's **Fans out to** line a link. Without
   * it the line still names the machine and still opens the state's properties,
   * but it does not offer to go anywhere: a link that leads nowhere cannot be
   * told apart from one whose navigation failed.
   *
   * `state-machine-fan-out` fires alongside it, for hosts already listening.
   */
  get fanOutHandler(): FanOutHandler | undefined {
    return this.#fanOutHandler;
  }

  set fanOutHandler(handler: FanOutHandler | undefined) {
    this.#fanOutHandler = handler;
    this.#render();
  }

  get readOnly(): boolean {
    return this.#readOnly;
  }

  set readOnly(value: boolean) {
    this.toggleAttribute('readonly', value);
    this.#readOnly = value;
    this.#render();
  }

  /**
   * The colour scheme, reflected to the `theme` attribute. `'dark'` is what a
   * host that never sets it gets: the editor deliberately ignores the operating
   * system's preference, so an embedding page — not the machine it runs on —
   * decides what the canvas looks like.
   *
   * Assigning anything else than `'dark'` or `'light'` falls back to the
   * default, and so does an attribute the element does not recognize.
   */
  get theme(): EditorTheme {
    return this.#theme;
  }

  set theme(value: EditorTheme) {
    // The attribute is the source of truth — the CSS keys off it — and writing
    // it runs `attributeChangedCallback`, which normalizes and re-renders.
    applyTheme(this, value);
  }

  /**
   * The glyphs drawn on the editor's buttons and handles — the pencil that
   * renames, the arrow dragged between two cards, and so on.
   *
   * Assigning a partial set replaces only what it names and leaves every other
   * icon at its default, so a host swapping one glyph does not have to restate
   * the other eighteen. Assigning `undefined` puts them all back.
   *
   * An icon is a string, drawn as plain text, or a DOM node the host builds —
   * an `<svg>`, an `<img>` — or a function returning a fresh one per button.
   * A node given directly is copied for each button that carries it, so one
   * `<svg>` can stand for every rename button on the canvas.
   *
   * ```js
   * editor.icons = { rename: '📝', remove: closeSvg, link: () => makeArrow() };
   * ```
   *
   * The reading passes the whole set back, defaults included. The dialogs are
   * handed it as they open, so it reaches their rows and order controls too.
   */
  get icons(): EditorIcons {
    return this.#icons;
  }

  set icons(overrides: IconOverrides | undefined) {
    this.#icons = mergeIcons(overrides);
    // The toolbar is built in the constructor, long before a host can assign
    // this, and the cards outlive every render — so nothing is rebuilt here.
    // Each icon remembers which one it is, and is redrawn where it stands.
    refreshIcons(this.#shadow, this.#icons);
    for (const dialog of [this.#dialog, this.#propertiesDialog]) {
      if (dialog !== undefined) {
        dialog.icons = this.#icons;
      }
    }
  }

  /**
   * Every word the editor and its dialogs put in front of a person.
   *
   * Assigning a partial set replaces only what it names and leaves the rest in
   * English, so a host translating one label does not have to restate the other
   * hundred and fifty. Assigning `undefined` puts them all back.
   *
   * A string that never changes is a string; one with values filled into it is
   * a function taking them, so there is no placeholder syntax to learn and the
   * sentence can decide things a template cannot — plural forms above all.
   *
   * ```js
   * editor.strings = {
   *   toolbar: { addState: 'Adicionar estado' },
   *   json: { itemCount: ({ count }) => t('items', { count }) },
   * };
   * ```
   *
   * The reading passes the whole set back, defaults included. The dialogs are
   * handed it as they open, so it reaches their fields and rows too.
   */
  get strings(): EditorStrings {
    return this.#strings;
  }

  set strings(overrides: StringOverrides | undefined) {
    this.#strings = mergeStrings(overrides);
    this.#applyStrings();
    // Unlike an icon, a label is written onto whichever part of an element it
    // belongs to — text here, `title` there, `aria-label` elsewhere — so there
    // is nothing uniform to walk. The cards carry labels written when they were
    // built, so they are thrown away and rebuilt from the new set instead.
    this.#discardViews();
    this.#render();
    for (const dialog of [this.#dialog, this.#propertiesDialog, this.#confirmDialog]) {
      if (dialog !== undefined) {
        dialog.strings = this.#strings;
      }
    }
  }

  /** Writes the wording onto the parts built once, in the constructor. */
  #applyStrings(): void {
    const text = this.#strings.toolbar;
    this.#emptyState.textContent = this.#strings.canvas.empty;
    this.#toolbar.setAttribute('aria-label', text.label);
    this.#addStateButton.textContent = text.addState;
    this.#organizeButton.textContent = text.organize;
    this.#organizeButton.setAttribute('aria-label', text.organizeLabel);
    this.#zoomOutButton.setAttribute('aria-label', text.zoomOut);
    this.#zoomInButton.setAttribute('aria-label', text.zoomIn);
    this.#zoomLabel.setAttribute('aria-label', text.zoomReset);
    this.#fitButton.textContent = text.fit;
    this.#fitButton.setAttribute('aria-label', text.fitLabel);
  }

  /**
   * Throws away every card, so the next render builds them again. Any open
   * rename goes with them: its input lives inside the card it edits.
   */
  #discardViews(): void {
    for (const view of this.#stateViews.values()) {
      view.root.remove();
      view.startMarker.remove();
      view.fanOutStub.remove();
    }
    this.#stateViews.clear();
    for (const path of this.#edgePaths.values()) {
      path.remove();
    }
    this.#edgePaths.clear();
    for (const entry of this.#cardViews.values()) {
      this.#destroyCard(entry);
    }
    this.#cardViews.clear();
    this.#startNode?.root.remove();
    this.#startNode = undefined;
    this.#renameEditors.clear();
  }

  /** Switches between the two schemes, which is what the toolbar's button does. */
  toggleTheme(): EditorTheme {
    const next = otherTheme(this.#theme);
    this.theme = next;
    return next;
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
      name:
        options.name ?? this.#strings.seed.stateName({ index: this.#machine.states.length + 1 }),
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
      name ??
      (from === null
        ? uniqueTransitionName(this.#machine, this.#strings.seed.creationName)
        : this.#strings.seed.transitionName);
    const draft = createTransition({ from, to, name: label });
    // Placed against a machine that already holds it, so its own siblings and
    // its slot on the start bar are part of the geometry it is measured against.
    const transition: Transition = {
      ...draft,
      labelOffset: this.#freeLabelOffset(addTransition(this.#machine, draft), draft),
    };
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

  /**
   * Marks (or unmarks) a state as one that fans work out and waits for it.
   *
   * Unmarking keeps the join action, the child machine and the timeout on the
   * state: a toggle pressed by mistake should not cost anyone their setup.
   */
  toggleWaitingState(stateId: string): void {
    if (this.#readOnly) {
      return;
    }
    this.#commit(toggleWaiting(this.#machine, stateId), { kind: 'state-data', stateId });
  }

  /** Replaces the whole fan-out configuration of a state. */
  setStateWaiting(stateId: string, config: WaitingConfig): void {
    this.#commit(setWaiting(this.#machine, stateId, config), { kind: 'state-data', stateId });
  }

  /**
   * Asks the host to go to the machine a state fans out to, by emitting
   * `state-machine-fan-out`. Returns `false` when the state names no machine.
   *
   * The canvas draws one version of one machine and a fan-out crosses into
   * another, so the component says where the user wants to go and stops there:
   * routing, permissions and what "that machine's editor" even means all belong
   * to the page around it. This is what the band's **Fans out to** line does.
   */
  followFanOut(stateId: string): boolean {
    const state = findState(this.#machine, stateId);
    if (state === undefined) {
      return false;
    }
    const childMachine = readWaiting(state).childMachine;
    if (childMachine.length === 0) {
      return false;
    }
    this.#fanOutHandler?.({ stateId, childMachine });
    const event: FanOutEvent = new CustomEvent(FAN_OUT_EVENT, {
      detail: { stateId, childMachine },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
    return true;
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

  /**
   * The element on the clipboard, if any. It is the editor's own buffer, not
   * the system one, and it is per element: assign it to move a copy between two
   * editors on the page, or to seed one from storage.
   */
  get clipboard(): ClipboardEntry | null {
    return this.#clipboard;
  }

  set clipboard(entry: ClipboardEntry | null) {
    this.#clipboard = entry;
    this.#render();
  }

  /** Copies the selected element. Returns `false` when nothing is selected. */
  copySelection(): boolean {
    const selection = this.#selection;
    return selection !== null && this.copy(selection);
  }

  /** Copies one element. Returns `false` when it is not in the machine. */
  copy(ref: ElementRef): boolean {
    const entry = copyElement(this.#machine, ref);
    if (entry === undefined) {
      return false;
    }
    this.clipboard = entry;
    return true;
  }

  /**
   * Puts a copy of the clipboard into the machine and selects it, as one
   * undoable step. Returns what was pasted, or `null` when the clipboard is
   * empty or holds a transition whose endpoints are no longer there.
   *
   * The copy is a new element: fresh ids for it and for every side effect
   * attached to it, a name marked as a copy and made unique, and — for a state
   * — a position clear of everything already on the canvas. A copied state does
   * not bring the initial/final roles along; those belong to the machine rather
   * than to the card, and a second entry point is not something a paste should
   * introduce quietly.
   */
  paste(): ElementRef | null {
    const entry = this.#clipboard;
    if (entry === null || !canPaste(this.#machine, entry)) {
      return null;
    }
    const ref =
      entry.kind === 'state' ? this.#pasteState(entry.state) : this.#pasteEdge(entry.transition);
    this.#setSelection(ref);
    return ref;
  }

  /** Whether there is a recorded step to take back. */
  get canUndo(): boolean {
    return canUndo(this.#history);
  }

  /** Whether an undone step is waiting to be put back. */
  get canRedo(): boolean {
    return canRedo(this.#history);
  }

  /**
   * Takes the last change back, emitting one `state-machine-change` of kind
   * `replace` — the whole machine is swapped, not one field of it. Returns
   * `false` when there was nothing to undo.
   */
  undo(): boolean {
    return this.#travel(undoHistory(this.#history, this.#machine));
  }

  /** Puts the last undone change back. Returns `false` when there was none. */
  redo(): boolean {
    return this.#travel(redoHistory(this.#history, this.#machine));
  }

  /**
   * Forgets every recorded step, keeping the machine as it stands. Hosts that
   * own their own history, or that treat the current machine as a fresh
   * document (a save, a load), call this to start counting again.
   */
  clearHistory(): void {
    this.#history = createHistory();
    this.#historyBase = this.#machine;
    this.#render();
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
      creationTransitions(this.#machine).length > 0 ? [...rects, this.#startBarRect()] : rects,
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
   * Arranges every card into a readable layout: columns left to right, one per
   * step away from where a record enters the machine, with the states of a
   * column ordered to keep the edges between them from crossing. Recorded as a
   * single undo step, and announced as one `layout` change.
   *
   * Cards the user dragged are *not* preserved. A transition's offset is
   * relative to an edge that has just been redrawn somewhere else entirely, so
   * keeping it would scatter the very cards this is meant to tidy; the cards
   * are put back on their edges and then nudged off each other.
   *
   * Returns `false` when there is nothing to do — an empty machine, a read-only
   * editor, or a machine already laid out exactly this way. The view is left
   * where it is: the toolbar's **Organize** fits it, the method does not, so a
   * host can organize without taking the user's viewport away from them.
   */
  organize(): boolean {
    if (this.#readOnly || this.#machine.states.length === 0) {
      return false;
    }
    const next = this.#organized(this.#machine);
    if (next === this.#machine) {
      return false;
    }
    this.#commit(next, { kind: 'layout' });
    return true;
  }

  /**
   * Asks first, then organizes: what the toolbar's **Organize** does.
   *
   * Every card the user placed by hand is moved, and the arrangement they had
   * is not something they can reconstruct from memory — so unlike every other
   * command here it is worth a question, even though one undo puts it back.
   * The view is fitted afterwards: the whole point of pressing the button is to
   * look at the result, which may well have moved off screen.
   *
   * Resolves `false` when the user cancelled, and when there was nothing to do.
   */
  async confirmOrganize(): Promise<boolean> {
    if (this.#readOnly || this.#machine.states.length === 0) {
      return false;
    }
    const dialog = this.#ensureConfirmDialog();
    const confirmed = await dialog.open({
      title: this.#strings.organize.title,
      message: this.#strings.organize.message,
      confirmLabel: this.#strings.organize.confirm,
      strings: this.#strings,
    });
    dialog.remove();
    if (!confirmed || !this.organize()) {
      return false;
    }
    this.zoomToFit();
    return true;
  }

  /**
   * Opens the side effects dialog for a list.
   * Resolves with `true` when the user saved, `false` when they cancelled.
   */
  async openSideEffects(ref: SideEffectListRef): Promise<boolean> {
    const dialog = this.#ensureDialog();
    const labels = describeSideEffectList(this.#machine, ref, this.#strings);
    const result = await dialog.open({
      title: labels.title,
      description: labels.description,
      effects: getSideEffects(this.#machine, ref),
      provider: this.#provider,
      readOnly: this.#readOnly,
      icons: this.#icons,
      strings: this.#strings,
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
    const labels = describeElement(this.#machine, ref, this.#strings);
    const result = await dialog.open({
      title: labels.title,
      description: labels.description,
      kind: ref.kind,
      values: before,
      actionProvider: this.#actionProvider,
      guardValidator: this.#guardValidator,
      order: ref.kind === 'transition' ? this.#orderContextFor(ref.id) : undefined,
      readOnly: this.#readOnly,
      icons: this.#icons,
      strings: this.#strings,
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

  /** True while either dialog sits in the shadow tree, which is to say: is open. */
  #dialogOpen(): boolean {
    return (
      this.#dialog?.isConnected === true ||
      this.#propertiesDialog?.isConnected === true ||
      this.#confirmDialog?.isConnected === true
    );
  }

  #ensureDialog(): SideEffectsDialogElement {
    const dialog = this.#dialog ?? new SideEffectsDialogElement();
    this.#dialog = dialog;
    return this.#openInShadow(dialog);
  }

  #ensureConfirmDialog(): ConfirmDialogElement {
    const dialog = this.#confirmDialog ?? new ConfirmDialogElement();
    this.#confirmDialog = dialog;
    return this.#openInShadow(dialog);
  }

  #ensurePropertiesDialog(): PropertiesDialogElement {
    const dialog = this.#propertiesDialog ?? new PropertiesDialogElement();
    this.#propertiesDialog = dialog;
    return this.#openInShadow(dialog);
  }

  /**
   * Puts a dialog in the shadow tree under the editor's own theme. Appending one
   * already there moves it back to the end, which is where a modal belongs.
   */
  #openInShadow<
    T extends SideEffectsDialogElement | PropertiesDialogElement | ConfirmDialogElement,
  >(dialog: T): T {
    dialog.theme = this.#theme;
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
            waiting: readWaiting(state),
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
      waiting: emptyWaitingConfig(),
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
      sourceLabel: describeSource(this.#machine, transition.from, this.#strings),
    };
  }

  /**
   * Writes the dialog's result back, one field at a time: hosts asked for
   * granular changes, so a save that touched three fields emits three events.
   */
  #applyProperties(ref: ElementRef, before: PropertiesDraft, after: PropertiesDraft): void {
    this.#asOneStep(() => {
      this.#writeProperties(ref, before, after);
    });
  }

  #writeProperties(ref: ElementRef, before: PropertiesDraft, after: PropertiesDraft): void {
    if (ref.kind === 'state') {
      if (after.description !== before.description) {
        this.#commit(setStateDescription(this.#machine, ref.id, after.description), {
          kind: 'description',
          ref,
        });
      }
      if (!sameWaiting(before.waiting, after.waiting)) {
        this.#commit(setWaiting(this.#machine, ref.id, after.waiting), {
          kind: 'state-data',
          stateId: ref.id,
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
    if (!transient) {
      this.#recordStep(next, change);
    }
    this.#machine = next;
    this.#render();
    this.#emitChange(next, change, transient);
  }

  #emitChange(value: StateMachine, change: MachineChange, transient: boolean): void {
    const event: StateMachineChangeEvent = new CustomEvent(STATE_MACHINE_CHANGE_EVENT, {
      detail: { value, change, transient },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  /**
   * Files one undoable step, from the last stable machine to `next`. A batch in
   * progress swallows it: the first change it sees names the whole batch, and
   * {@link StateMachineEditorElement.#asOneStep} records it on the way out.
   */
  #recordStep(next: StateMachine, change: MachineChange): void {
    const batch = this.#batch;
    if (batch !== undefined) {
      if (batch.change === undefined) {
        this.#batch = { base: batch.base, change };
      }
      return;
    }
    this.#history = recordHistory(this.#history, { machine: this.#historyBase, change });
    this.#historyBase = next;
  }

  /**
   * Folds every commit `run` makes into a single undo step. Saving the
   * properties dialog emits one change event per edited field on purpose, but
   * one save is still one thing the user did, and one undo should take all of
   * it back.
   */
  #asOneStep(run: () => void): void {
    if (this.#batch !== undefined) {
      run();
      return;
    }
    const base = this.#historyBase;
    this.#batch = { base, change: undefined };
    try {
      run();
    } finally {
      const batch = this.#batch;
      this.#batch = undefined;
      const change = batch?.change;
      if (change !== undefined) {
        this.#history = recordHistory(this.#history, { machine: base, change });
      }
      this.#historyBase = this.#machine;
    }
  }

  /** Moves to where a history step lands, announcing it as a whole-machine swap. */
  #travel(step: HistoryStep | undefined): boolean {
    if (step === undefined) {
      return false;
    }
    this.#history = step.history;
    this.#historyBase = step.machine;
    this.#machine = step.machine;
    const dropped = this.#selection !== null && !selectionExists(step.machine, this.#selection);
    if (dropped) {
      this.#selection = null;
    }
    this.#render();
    this.#emitChange(step.machine, { kind: 'replace' }, false);
    if (dropped) {
      this.#emitSelectionChange(null);
    }
    return true;
  }

  #setSelection(selection: Selection): void {
    if (sameSelection(this.#selection, selection)) {
      return;
    }
    this.#selection = selection;
    this.#render();
    this.#emitSelectionChange(selection);
  }

  #emitThemeChange(theme: EditorTheme): void {
    const event: ThemeChangeEvent = new CustomEvent(THEME_CHANGE_EVENT, {
      detail: { theme },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
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

  /**
   * Where a new state goes: the middle of the view, nudged to the nearest spot
   * that covers nothing. This used to cascade every card 24px down and right of
   * the last, which stacked them almost on top of each other and drifted off
   * screen; searching for real free space puts each one somewhere usable.
   */
  #defaultStatePosition(): Point {
    const size = this.#nodeSize();
    const center = toWorld(this.#viewport, this.#viewportCenter());
    const spot = findFreeLabelSpot(center, size, this.#occupiedRects(), PLACEMENT_RINGS);
    return {
      x: Math.round(spot.x - size.width / 2),
      y: Math.round(spot.y - size.height / 2),
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

  /**
   * Rect a transition leaves from: a state card, or — for a creation edge — the
   * single slot it owns on the start bar.
   *
   * The slot is handed back as a zero-size rect, which `borderPoint` resolves to
   * the point itself. The whole geometry layer therefore keeps working on rects
   * and needs no idea that a bar exists.
   */
  #sourceRect(transition: Transition): Rect | undefined {
    if (transition.from === null) {
      // Measuring the bar again per edge would re-read layout for nothing: the
      // slot is already known, and the fallback only runs before the first render.
      const slot = this.#creationAnchors.get(transition.id);
      const anchor = slot ?? creationAnchorPoint(this.#startBarRect(), 0, 1);
      return { x: anchor.x, y: anchor.y, width: 0, height: 0 };
    }
    const state = findState(this.#machine, transition.from);
    return state === undefined ? undefined : this.#rectFor(state);
  }

  /**
   * How far left of the state it feeds the bar has to sit for the creation card
   * to fit between the two with room to spare.
   *
   * The card does not land half way. A quadratic's midpoint is
   * `(start + 2·control + end) / 4`, and the control point is the midpoint of
   * the two *centres* — which for a zero-size source is pulled towards the
   * target. Solving that for a gap `g` puts the card `g/2 - barWidth/2 -
   * nodeWidth/8` short of the target, so clearing a whole card plus a margin on
   * each side needs `g >= card + 2·margin + barWidth + nodeWidth/4`.
   *
   * Both widths are measured rather than assumed, so a coarse pointer — where
   * the card and the node both grow — moves the bar out with them, and so does
   * a host that restyles either.
   */
  #startBarGap(): number {
    const card = this.#anyCard()?.offsetWidth || FALLBACK_LABEL_WIDTH;
    const [stateView] = this.#stateViews.values();
    const node = stateView?.root.offsetWidth || FALLBACK_NODE_WIDTH;
    return Math.round(card + CREATION_CARD_MARGIN * 2 + START_BAR_WIDTH + node / 4);
  }

  /**
   * Where the start bar sits and how tall it is. It is placed rather than
   * persisted: left of the leftmost state it feeds, centred on them vertically,
   * and grown to reserve a slot per creation edge. Deterministic, so nothing new
   * has to be stored on the machine.
   */
  #startBarRect(): Rect {
    const height = Math.max(
      START_BAR_MIN_HEIGHT,
      creationTransitions(this.#machine).length * START_BAR_SLOT,
    );
    const targets: Rect[] = [];
    for (const transition of creationTransitions(this.#machine)) {
      const state = findState(this.#machine, transition.to);
      if (state !== undefined) {
        targets.push(this.#rectFor(state));
      }
    }
    const [first] = targets;
    if (first === undefined) {
      return { x: 0, y: 0, width: START_BAR_WIDTH, height };
    }
    const left = Math.min(...targets.map((rect) => rect.x));
    const middle =
      targets.reduce((total, rect) => total + rect.y + rect.height / 2, 0) / targets.length;
    return {
      x: Math.round(left - this.#startBarGap()),
      y: Math.round(middle - height / 2),
      width: START_BAR_WIDTH,
      height,
    };
  }

  /**
   * Hands each creation edge its slot on the bar, ordered by how high its target
   * sits so the lines fan out instead of crossing. Rebuilt on every render, so
   * dragging a state reshuffles the slots under it.
   *
   * This is purely visual and has nothing to do with the evaluation order of the
   * edges, which stays their position in `machine.transitions`.
   */
  #computeCreationAnchors(creation: readonly Transition[], bar: Rect): ReadonlyMap<string, Point> {
    const order = orderCreationAnchors(
      creation.map((transition) => ({
        id: transition.id,
        labelY: this.#neutralLabelY(transition, bar),
      })),
    );
    const anchors = new Map<string, Point>();
    order.forEach((id, index) => {
      anchors.set(id, creationAnchorPoint(bar, index, order.length));
    });
    return anchors;
  }

  /**
   * Height a creation edge's card sits at, measured from the *middle* of the
   * bar rather than from the edge's own slot.
   *
   * The slot is what this feeds into, so reading the card's real position would
   * make the ordering depend on its own result. Anchoring every edge at the same
   * neutral point breaks that: with no card moved it reduces to the order of the
   * targets, and a card the user has dragged still moves its key by exactly the
   * offset they dragged it.
   */
  #neutralLabelY(transition: Transition, bar: Rect): number {
    const target = findState(this.#machine, transition.to);
    const middle = bar.y + bar.height / 2;
    if (target === undefined) {
      return middle + transition.labelOffset.y;
    }
    const neutral: Rect = { x: bar.x + bar.width, y: middle, width: 0, height: 0 };
    const curvature = curvatureFor(this.#fanIndexOf(transition), this.#labelSpacing());
    const auto = computeEdgeGeometry(neutral, this.#rectFor(target), curvature);
    return auto.label.y + transition.labelOffset.y;
  }

  /** Rect a link preview drags out of, which has no transition to anchor on yet. */
  #linkSourceRect(fromId: string | null): Rect | undefined {
    if (fromId === null) {
      return this.#startBarRect();
    }
    const state = findState(this.#machine, fromId);
    return state === undefined ? undefined : this.#rectFor(state);
  }

  /** Size a transition card renders at, measured where the DOM allows it. */
  #labelSize(): Size {
    const card = this.#anyCard();
    return {
      width: card?.offsetWidth || FALLBACK_LABEL_WIDTH,
      height: card?.offsetHeight || FALLBACK_LABEL_HEIGHT,
    };
  }

  /** Any transition card that has rendered, to measure the breed against. */
  #anyCard(): HTMLElement | undefined {
    const [entry] = this.#cardViews.values();
    return entry?.view.card;
  }

  #nodeSize(): Size {
    const [view] = this.#stateViews.values();
    return {
      width: view?.root.offsetWidth || FALLBACK_NODE_WIDTH,
      height: view?.root.offsetHeight || FALLBACK_NODE_HEIGHT,
    };
  }

  /**
   * Size of every state card that has rendered, keyed by id.
   *
   * A card grows with what it holds — one carrying a list of side effects is
   * several times the height of a bare one — so the layout is given each card
   * rather than one measurement standing in for all of them. Cards that have not
   * rendered are left out, and fall back to `#nodeSize()` there.
   */
  #nodeSizes(): ReadonlyMap<string, Size> {
    const sizes = new Map<string, Size>();
    for (const [id, view] of this.#stateViews) {
      const width = view.root.offsetWidth;
      const height = view.root.offsetHeight;
      if (width > 0 && height > 0) {
        sizes.set(id, { width, height });
      }
    }
    return sizes;
  }

  /**
   * Everything already drawn that a newly placed card or node should not land
   * on: the state cards, and every transition card at the point it actually
   * sits. Read from the geometry rather than the DOM, so it is right even
   * before the new element has rendered once.
   */
  #occupiedRects(exceptTransitionId?: string): readonly Rect[] {
    const rects: Rect[] = this.#machine.states.map((state) => this.#rectFor(state));
    const size = this.#labelSize();
    // One rect per card, so a decision's several edges do not each reserve the
    // same spot — and excusing one edge excuses the whole card it shares.
    for (const group of this.#groups) {
      const holds = group.transitions.some((transition) => transition.id === exceptTransitionId);
      if (!holds) {
        rects.push(boxAround(this.#cardPointFor(group), size));
      }
    }
    return rects;
  }

  /**
   * Reads a value with `machine` temporarily in place.
   *
   * Placing a brand new transition needs the geometry of a machine that already
   * contains it — its siblings, its slot on the start bar. Threading a machine
   * argument through every geometry helper would buy nothing, since nothing
   * renders in between and the swap is undone before anything else can observe it.
   */
  #withMachine<T>(machine: StateMachine, read: () => T): T {
    const previousMachine = this.#machine;
    const previousAnchors = this.#creationAnchors;
    const previousGroups = this.#groups;
    const previousIndex = this.#groupOf;
    this.#machine = machine;
    this.#indexGroups(machine);
    const creation = creationTransitions(machine);
    this.#creationAnchors =
      creation.length > 0
        ? this.#computeCreationAnchors(creation, this.#startBarRect())
        : new Map();
    try {
      return read();
    } finally {
      this.#machine = previousMachine;
      this.#creationAnchors = previousAnchors;
      this.#groups = previousGroups;
      this.#groupOf = previousIndex;
    }
  }

  /**
   * Offset that keeps a new transition's card off the cards already on the
   * canvas. Zero when the spot it would take is free, which is the usual case —
   * the editor should not invent an offset it does not need, since a non-zero
   * one opts the card out of automatic placement for good.
   */
  #freeLabelOffset(machine: StateMachine, transition: Transition): Point {
    return this.#withMachine(machine, () => {
      const anchor = this.#autoLabelPoint(transition);
      const spot = findFreeLabelSpot(anchor, this.#labelSize(), this.#occupiedRects(transition.id));
      return { x: Math.round(spot.x - anchor.x), y: Math.round(spot.y - anchor.y) };
    });
  }

  /**
   * `machine` laid out: the states on the automatic grid, then every transition
   * card placed clear of the cards around it.
   *
   * Returns `machine` itself when nothing moved, so both callers can tell an
   * already-tidy graph from one that has just been rearranged.
   */
  #organized(machine: StateMachine): StateMachine {
    const laid = organizeMachine(machine, {
      nodeSize: this.#nodeSize(),
      nodeSizes: this.#nodeSizes(),
      labelSize: this.#labelSize(),
      origin: LAYOUT_ORIGIN,
    });
    return this.#placeLabels(laid);
  }

  /**
   * Nudges every transition card off whatever it landed on, one at a time, each
   * measured against the cards already placed. The layout leaves a card's width
   * between two columns, so most keep the automatic placement the reflow just
   * handed back to them; the ones that do not are the edges that skip a column.
   */
  #placeLabels(machine: StateMachine): StateMachine {
    let next = machine;
    // Placed per card rather than per edge: a decision's members share one, and
    // nudging each of them in turn would walk that single card across the canvas.
    for (const group of groupTransitions(machine)) {
      const leader = group.transitions[0];
      if (leader === undefined) {
        continue;
      }
      const offset = this.#freeLabelOffset(next, leader);
      if (offset.x !== 0 || offset.y !== 0) {
        next = setDecisionLabelOffset(next, leader.id, offset);
      }
    }
    return next;
  }

  /** Adds a copy of `state` and reports where it landed. */
  #pasteState(state: StateNode): ElementRef {
    const copy = duplicateState(state, {
      name: uniqueStateName(this.#machine, copyName(state.name, this.#strings.seed.copySuffix)),
      position: this.#pastePosition(state.position),
    });
    this.#commit(addState(this.#machine, copy), { kind: 'state-add', stateId: copy.id });
    return { kind: 'state', id: copy.id };
  }

  /**
   * Where a pasted card goes: a step off the original, then clear of whatever
   * that lands on — which is usually the original itself.
   */
  #pastePosition(origin: Point): Point {
    const size = this.#nodeSize();
    const center = {
      x: origin.x + PASTE_OFFSET + size.width / 2,
      y: origin.y + PASTE_OFFSET + size.height / 2,
    };
    const spot = findFreeLabelSpot(center, size, this.#occupiedRects(), PLACEMENT_RINGS);
    return { x: Math.round(spot.x - size.width / 2), y: Math.round(spot.y - size.height / 2) };
  }

  /** Adds a copy of `transition` between the same two states. */
  #pasteEdge(transition: Transition): ElementRef {
    const draft = duplicateTransition(transition, {
      name: uniqueTransitionName(
        this.#machine,
        copyName(transition.name, this.#strings.seed.copySuffix),
      ),
      labelOffset: { x: 0, y: 0 },
    });
    // Placed against a machine that already holds it, exactly as a brand new
    // edge is, so its own siblings and the original's card are in the way.
    const copy: Transition = {
      ...draft,
      labelOffset: this.#freeLabelOffset(addTransition(this.#machine, draft), draft),
    };
    this.#commit(addTransition(this.#machine, copy), {
      kind: 'transition-add',
      transitionId: copy.id,
    });
    return { kind: 'transition', id: copy.id };
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
    this.#indexGroups(this.#machine);
    this.#renderStates();
    this.#renderStartNode();
    this.#renderTransitions();
    this.#applyViewport();
    this.#emptyState.hidden = this.#machine.states.length > 0;
    this.#addStateButton.disabled = this.#readOnly;
    this.#renderHistoryButtons();
    this.#renderClipboardButtons();
    this.#renderTheme();
    this.#organizeButton.disabled = this.#readOnly || this.#machine.states.length === 0;
  }

  /**
   * Names the theme toggle after the scheme it switches to, and hands the
   * scheme down to the dialogs — they carry shadow roots of their own, so the
   * tokens on the editor's `:host` never reach them by inheritance.
   */
  #renderTheme(): void {
    const { icon, label } = THEME_TOGGLE[this.#theme];
    if (!hasIcon(this.#themeButton, icon)) {
      setIcon(this.#themeButton, this.#icons, icon);
    }
    const text = label(this.#strings);
    this.#themeButton.setAttribute('aria-label', text);
    this.#themeButton.title = text;
    for (const dialog of [this.#dialog, this.#propertiesDialog, this.#confirmDialog]) {
      if (dialog !== undefined) {
        dialog.theme = this.#theme;
      }
    }
  }

  /**
   * Keeps the copy/paste pair named after what they hold. Copying takes nothing
   * away, so it stays available read-only; the paste that would put it back
   * does not.
   */
  #renderClipboardButtons(): void {
    const selection = this.#selection;
    const entry = this.#clipboard;
    const text = this.#strings.toolbar;
    const kinds = this.#strings.kind;
    const copyLabel =
      selection === null ? text.copy : text.copyKind({ kind: kinds[selection.kind] });
    this.#copyButton.disabled = selection === null;
    this.#copyButton.textContent = text.copy;
    this.#copyButton.setAttribute('aria-label', copyLabel);
    this.#copyButton.title = this.#shortcutLabel(copyLabel, 'C');
    const pasteLabel = entry === null ? text.paste : text.pasteKind({ kind: kinds[entry.kind] });
    this.#pasteButton.disabled = this.#readOnly || !canPaste(this.#machine, entry);
    this.#pasteButton.textContent = text.paste;
    this.#pasteButton.setAttribute('aria-label', pasteLabel);
    this.#pasteButton.title = this.#shortcutLabel(pasteLabel, 'V');
  }

  /** A control's tooltip: what it does, then how to reach it from the keyboard. */
  #shortcutLabel(label: string, key: string, shift = false): string {
    return this.#strings.toolbar.shortcut({ label, shortcut: shortcutHint(key, shift) });
  }

  /** Keeps the undo/redo pair disabled and named after what they would do. */
  #renderHistoryButtons(): void {
    const pending: readonly [HistoryCommand, HTMLButtonElement, MachineChange | undefined][] = [
      ['undo', this.#undoButton, pendingUndo(this.#history)],
      ['redo', this.#redoButton, pendingRedo(this.#history)],
    ];
    for (const [command, button, change] of pending) {
      const label = historyLabel(command, change, this.#strings);
      button.disabled = this.#readOnly || change === undefined;
      button.setAttribute('aria-label', label);
      button.title = this.#shortcutLabel(label, 'Z', command === 'redo');
    }
  }

  #applyViewport(): void {
    const { x, y, scale } = this.#viewport;
    this.#world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    this.#viewportElement.style.setProperty('--sme-grid-size', `${GRID_SIZE * scale}px`);
    this.#viewportElement.style.setProperty('--sme-grid-offset-x', `${x % (GRID_SIZE * scale)}px`);
    this.#viewportElement.style.setProperty('--sme-grid-offset-y', `${y % (GRID_SIZE * scale)}px`);
    this.#zoomLabel.textContent = this.#strings.toolbar.zoomLevel({
      percent: Math.round(scale * 100),
    });
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
        view.fanOutStub.remove();
        this.#stateViews.delete(id);
        // Any open name editor left the DOM with the card it was inside.
        this.#renameEditors.delete(id);
      }
    }
  }

  /**
   * The start bar exists only while a creation edge does. It is not a state: it
   * never enters `states`, has no name, colour or roles, and cannot be selected
   * or deleted.
   */
  #renderStartNode(): void {
    const creation = creationTransitions(this.#machine);
    if (creation.length === 0) {
      this.#startNode?.root.remove();
      this.#startNode = undefined;
      this.#creationAnchors = new Map();
      return;
    }
    const view = this.#startNode ?? this.#createStartNode();
    this.#startNode = view;
    const rect = this.#startBarRect();
    view.root.style.left = `${rect.x}px`;
    view.root.style.top = `${rect.y}px`;
    view.root.style.height = `${rect.height}px`;
    view.root.setAttribute(
      'aria-label',
      this.#strings.startNode.summary({
        label: this.#strings.startNode.label,
        count: creation.length,
      }),
    );
    view.linkHandle.hidden = this.#readOnly;
    // Before the transitions render, so each one can read its own slot.
    this.#creationAnchors = this.#computeCreationAnchors(creation, rect);
  }

  #createStartNode(): StartNodeView {
    const root = createElement('div', {
      className: 'start-node',
      parent: this.#world,
      attrs: { part: 'start-node', title: this.#strings.startNode.title },
    });
    // Written down the bar rather than across it, so naming it costs no width.
    createElement('span', {
      className: 'start-node__label',
      parent: root,
      text: this.#strings.startNode.label,
    });
    const linkHandle = createIconButton(this.#icons, 'link', {
      className: 'node__link start-node__link',
      parent: root,
      attrs: { 'aria-label': this.#strings.startNode.link },
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
    /*
     * The tools ride in a rail floating above the card rather than in the header
     * beside the name: four hit targets and a name shared one line, which left
     * the name a couple of characters. The rail costs the card no width at all.
     */
    const actions = createElement('div', {
      className: 'card-actions',
      parent: root,
      attrs: { part: 'card-actions', role: 'toolbar' },
    });
    const colorButton = createButton({
      className: 'node__color',
      parent: actions,
      attrs: { 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
    });
    colorButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#togglePalette(stateId);
    });
    const renameButton = createIconButton(this.#icons, 'rename', {
      className: 'icon-button node__rename',
      parent: actions,
      attrs: {
        'aria-label': this.#strings.state.rename,
        title: this.#strings.rename.title,
      },
    });
    const propertiesButton = createIconButton(this.#icons, 'properties', {
      className: 'icon-button node__properties',
      parent: actions,
      attrs: {
        'aria-label': this.#strings.state.properties,
        title: this.#strings.state.properties,
      },
    });
    propertiesButton.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.openProperties({ kind: 'state', id: stateId });
    });
    const removeButton = createIconButton(this.#icons, 'remove', {
      className: 'icon-button node__remove',
      parent: actions,
      attrs: { 'aria-label': this.#strings.state.remove },
    });
    /*
     * Above the hook lanes and styled apart from them: a fan-out is not
     * something that runs, it is what the state is. Empty and hidden until the
     * state says it waits.
     */
    const band = createElement('div', { className: 'band', parent: root });
    band.hidden = true;
    const bandRows = new Map<BandField, BandRowView>();
    for (const field of BAND_FIELDS) {
      const row = createButton({
        className: `band__row band__row--${field}`,
        parent: band,
        attrs: { 'data-band': field },
      });
      const label = createElement('span', { className: 'band__label', parent: row });
      const value = createElement('span', { className: 'band__value', parent: row });
      /*
       * The fan-out line leaves for another machine rather than editing this
       * one, so it is a link and not a way into the dialog. The child machine
       * is still editable from the card's own properties button.
       */
      if (field === 'child') {
        setIcon(
          createElement('span', { className: 'band__go', parent: row }),
          this.#icons,
          'fanOut',
        );
      }
      row.addEventListener('click', (event) => {
        event.stopPropagation();
        // Only a host that can take them somewhere turns this into a link; with
        // nobody to route it, the line behaves like the rest of the band.
        if (field === 'child' && this.#fanOutHandler !== undefined) {
          this.followFanOut(stateId);
          return;
        }
        void this.openProperties({ kind: 'state', id: stateId });
      });
      bandRows.set(field, { root: row, label, value });
    }
    // Sits under the band's own lines: a half configured report is an invalid
    // graph, and the place to say so is where the half is drawn.
    const bandError = createElement('p', { className: 'band__error', parent: band });
    bandError.hidden = true;

    const hooks = createElement('div', { className: 'hooks', parent: root });
    const chips = new Map<HookKey, ChipView>();
    for (const key of HOOK_KEYS) {
      const ref = hookRef(stateId, key);
      const row = createElement('div', { className: 'hook', parent: hooks });
      createElement('span', {
        className: 'hook__label',
        parent: row,
        text: shortHookLabel(ref, this.#strings),
      });
      const chip = createChip(row);
      chip.button.addEventListener('click', (event) => {
        event.stopPropagation();
        void this.openSideEffects(hookRef(stateId, key));
      });
      chips.set(key, chip);
    }
    const palette = createElement('div', {
      className: 'node__palette',
      parent: root,
      attrs: {
        role: 'listbox',
        'aria-label': this.#strings.state.paletteLabel({ name: stateId }),
      },
    });
    palette.hidden = true;
    const swatches = new Map<StateColor, HTMLButtonElement>();
    for (const color of STATE_COLORS) {
      const label = this.#strings.color[color];
      const option = createButton({
        className: `palette__option palette__option--${color}`,
        parent: palette,
        attrs: { role: 'option', 'data-color': color, title: label, 'aria-label': label },
      });
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#pickColor(stateId, color);
      });
      swatches.set(color, option);
    }

    const stripes = createStripes(root);

    const roles = createElement('div', { className: 'node__roles', parent: root });
    const roleButtons = new Map<StateRole, HTMLButtonElement>();
    for (const role of ['initial', 'final'] as const) {
      const button = createIconButton(this.#icons, role, {
        className: `node__role node__role--${role}`,
        parent: roles,
        label: role === 'initial' ? this.#strings.state.roleInitial : this.#strings.state.roleFinal,
        attrs: { 'aria-pressed': 'false' },
      });
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#toggleRole(stateId, role);
      });
      roleButtons.set(role, button);
    }

    const waitingButton = createIconButton(this.#icons, 'waiting', {
      className: 'node__role node__role--waiting',
      parent: roles,
      label: this.#strings.waiting.role,
      attrs: { 'aria-pressed': 'false' },
    });
    waitingButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleWaitingState(stateId);
    });

    /*
     * A row of its own under the toggles, rather than a fourth pill among them.
     * Three toggles already fill that line, and this is not a fourth thing the
     * state *is* — it adds an edge — so it gets the room to say so in words.
     *
     * Only reachable while the state is initial: the start pseudo-node does not
     * exist until a creation edge does, so there is nothing to drag from yet.
     */
    const creation = createElement('div', { className: 'node__creation', parent: root });
    const creationButton = createIconButton(this.#icons, 'add', {
      className: 'node__create',
      parent: creation,
      label: this.#strings.state.creationAdd,
      attrs: { title: this.#strings.state.creationTitle },
    });
    creationButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!this.#readOnly) {
        this.addCreationTransition(stateId);
      }
    });

    /*
     * A short dashed stub into empty space. The machine the work goes to is not
     * on this canvas — one version of one machine is — so it points at nothing
     * in particular on purpose: it says there is a direction, and the band's
     * link says where.
     */
    const fanOutStub = createSvgElement('g', {
      className: 'fan-out-stub',
      parent: this.#edgeLayer,
    });
    createSvgElement('path', { className: 'fan-out-stub__line', parent: fanOutStub });
    createSvgElement('circle', { className: 'fan-out-stub__end', parent: fanOutStub });

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

    const linkHandle = createIconButton(this.#icons, 'link', {
      className: 'node__link',
      parent: root,
      attrs: { 'aria-label': this.#strings.state.link },
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
      band,
      bandRows,
      bandError,
      stripes,
      waitingButton,
      colorButton,
      palette,
      swatches,
      header,
      name,
      actions,
      renameButton,
      propertiesButton,
      removeButton,
      linkHandle,
      creation,
      creationButton,
      chips,
      startMarker,
      fanOutStub,
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
    const editing = this.#renameEditors.has(state.id);
    view.name.hidden = editing;
    // The rename editor carries its own save and cancel, so the rail would only
    // repeat the tools it disables — it steps aside for the length of the edit.
    view.actions.hidden = editing;
    view.actions.setAttribute('aria-label', this.#strings.card.toolsLabel({ name: state.name }));
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
    this.#updateWaitingBand(view, state);
    const text = this.#strings.issue;
    const named: Readonly<Record<StateIssue, string>> = {
      'no-join-edge': text.noJoinEdge,
      'terminal-has-exit': text.terminalHasExit,
    };
    this.#writeStripes(
      view.stripes,
      stateIssues(this.#machine, state).map((issue) => named[issue]),
    );
  }

  /**
   * Rewrites a card's stripes, and only when they have actually changed: the
   * render loop runs on every frame of a drag, and rebuilding four nodes per
   * card per frame to say the same thing would be work for nothing.
   */
  #writeStripes(list: HTMLElement, messages: readonly string[]): void {
    const written = messages.join('\n');
    list.hidden = messages.length === 0;
    if (list.getAttribute('data-messages') === written) {
      return;
    }
    list.setAttribute('data-messages', written);
    list.setAttribute('aria-label', this.#strings.issue.label);
    list.replaceChildren();
    for (const message of messages) {
      const stripe = createElement('p', {
        className: 'stripe',
        parent: list,
        attrs: { role: 'listitem' },
      });
      setIcon(
        createElement('span', { className: 'stripe__icon', parent: stripe }),
        this.#icons,
        'warning',
      );
      createElement('span', { className: 'stripe__text', parent: stripe, text: message });
    }
  }

  /**
   * What the host's validator says about a guard, cached by the expression
   * itself so a canvas full of cards asks once per distinct guard.
   *
   * The first sighting of an expression starts the check and reads as clean;
   * the verdict lands later and redraws. Without a validator, guards are never
   * checked — the expression language belongs to the host.
   */
  #guardErrorsFor(guard: string): readonly string[] {
    const validator = this.#guardValidator;
    if (validator === undefined || guard.trim().length === 0) {
      return [];
    }
    const found = this.#guardChecks.get(guard);
    if (found === undefined) {
      this.#guardChecks.set(guard, 'pending');
      void this.#checkGuard(validator, guard);
      return [];
    }
    return found === 'pending' || found.ok ? [] : found.errors;
  }

  async #checkGuard(validator: GuardValidator, guard: string): Promise<void> {
    let verdict: GuardValidation = { ok: true };
    try {
      verdict = await validator(guard);
    } catch {
      // A validator that threw has said nothing about the guard, and a stripe
      // reading like the host's own error message would be a lie.
      verdict = { ok: true };
    }
    if (this.#guardValidator !== validator) {
      return;
    }
    this.#guardChecks.set(guard, verdict);
    this.#render();
  }

  /**
   * The band, and the toggle that puts it there.
   *
   * A row with nothing in it is left out rather than shown empty — except the
   * join action, whose absence is the thing worth seeing: it is what closes the
   * wait, and without it the record stops here.
   */
  #updateWaitingBand(view: StateView, state: StateNode): void {
    const text = this.#strings.waiting;
    const config = readWaiting(state);
    view.waitingButton.classList.toggle('is-on', config.isWaiting);
    view.waitingButton.setAttribute('aria-pressed', config.isWaiting ? 'true' : 'false');
    view.waitingButton.disabled = this.#readOnly;
    view.waitingButton.setAttribute(
      'aria-label',
      config.isWaiting ? text.unmark({ name: state.name }) : text.mark({ name: state.name }),
    );

    view.root.classList.toggle('is-waiting', config.isWaiting);
    // A state that reports into its parent's batch is not itself waiting for
    // one, and it still has something to say — so the band is not the toggle's.
    const status = countsAsStatus(state, isFinalState(this.#machine, state.id));
    view.band.hidden = !config.isWaiting && status.kind === 'none';
    this.#updateFanOutStub(view, state, config);
    if (view.band.hidden) {
      return;
    }
    view.band.setAttribute('aria-label', text.bandLabel({ name: state.name }));
    this.#updateBandRows(view, state, config, status);
    view.bandError.hidden = status.kind !== 'broken';
    view.bandError.textContent =
      status.kind === 'broken' ? text.brokenError({ half: text.half[status.half] }) : '';
  }

  /** Writes the band's lines, and hides the ones this state has nothing to say on. */
  #updateBandRows(
    view: StateView,
    state: StateNode,
    config: WaitingConfig,
    status: CountsAsStatus,
  ): void {
    const text = this.#strings.waiting;
    const counts = this.#countsAsLine(status);
    const lines: Readonly<Record<BandField, { readonly label: string; readonly value: string }>> = {
      child: { label: text.fansOut, value: config.isWaiting ? config.childMachine : '' },
      join: {
        label: text.joinsWith,
        value: config.joinAction.length === 0 ? '' : text.action({ name: config.joinAction }),
      },
      timeout: {
        label: text.timeout,
        value: config.isWaiting ? this.#formatTimeout(config.timeout) : '',
      },
      counts: { label: text.countsAs, value: counts.value },
    };
    for (const [field, row] of view.bandRows) {
      const line = lines[field];
      const shown = this.#bandRowShown(field, config, status, line.value);
      row.root.hidden = !shown;
      if (!shown) {
        continue;
      }
      const missing = line.value.length === 0;
      row.label.textContent = line.label;
      row.value.textContent = missing ? text.unset : line.value;
      row.root.classList.toggle('is-unset', missing);
      row.root.classList.toggle('is-broken', field === 'counts' && status.kind === 'broken');
      // The fan-out line goes somewhere rather than editing something, so it
      // names where instead of what it holds — but only when a host has said it
      // can take them there.
      const linked = field === 'child' && this.#fanOutHandler !== undefined;
      row.root.classList.toggle('band__row--link', linked);
      const named = linked
        ? {
            label: text.fansOutLink({ machine: config.childMachine, name: state.name }),
            title: text.fansOutTitle({ machine: config.childMachine }),
          }
        : {
            label: text.rowLabel({
              field: line.label,
              value: row.value.textContent ?? '',
              name: state.name,
            }),
            title: field === 'counts' ? counts.title : '',
          };
      row.root.setAttribute('aria-label', named.label);
      row.root.title = named.title;
    }
  }

  /**
   * The dashed stub leaving a waiting card. Drawn only where there is somewhere
   * to go: a fan-out with no machine named has no direction to show.
   */
  #updateFanOutStub(view: StateView, state: StateNode, config: WaitingConfig): void {
    const shown = config.isWaiting && config.childMachine.length > 0;
    view.fanOutStub.style.display = shown ? '' : 'none';
    if (!shown) {
      return;
    }
    const rect = this.#rectFor(state);
    const start = { x: rect.x + rect.width, y: rect.y + rect.height - 18 };
    const end = { x: start.x + FAN_OUT_REACH, y: start.y + FAN_OUT_DROP };
    const line = view.fanOutStub.firstElementChild;
    const dot = view.fanOutStub.lastElementChild;
    if (line !== null) {
      line.setAttribute('d', `M ${start.x} ${start.y} Q ${end.x} ${start.y} ${end.x} ${end.y}`);
    }
    if (dot !== null) {
      dot.setAttribute('cx', String(end.x));
      dot.setAttribute('cy', String(end.y));
      dot.setAttribute('r', '3.5');
    }
    view.fanOutStub.setAttribute(
      'aria-label',
      this.#strings.waiting.stubLabel({ name: state.name, machine: config.childMachine }),
    );
  }

  /**
   * Whether a line of the band is drawn.
   *
   * A line with nothing in it is left out, with two exceptions: the join action,
   * whose absence is the thing worth seeing — it is what closes the wait — and
   * the report, which is only ever drawn when there is one.
   */
  #bandRowShown(
    field: BandField,
    config: WaitingConfig,
    status: CountsAsStatus,
    value: string,
  ): boolean {
    if (field === 'counts') {
      return status.kind !== 'none';
    }
    if (!config.isWaiting) {
      return false;
    }
    return field === 'join' || value.length > 0;
  }

  /**
   * The report pair as one line. A final state can never be left, so its leave
   * half could never fire: the control drops it and says which half is left.
   */
  #countsAsLine(status: CountsAsStatus): {
    readonly value: string;
    readonly title: string;
  } {
    const text = this.#strings.waiting;
    if (status.kind === 'none') {
      return { value: '', title: '' };
    }
    const outcome = text.outcome[status.countsAs];
    if (status.kind === 'enter-only') {
      return { value: text.enterOnly({ outcome }), title: text.enterOnlyTitle };
    }
    if (status.kind === 'broken') {
      return {
        value: text.broken({ outcome }),
        title: text.brokenError({ half: text.half[status.half] }),
      };
    }
    return { value: text.pair({ outcome }), title: text.pairTitle };
  }

  /** A timeout in whole units when it is a duration, and verbatim when it is not. */
  #formatTimeout(timeout: string): string {
    if (timeout.length === 0) {
      return '';
    }
    const parts = parseDuration(timeout);
    return parts === undefined ? timeout : this.#strings.waiting.duration(parts);
  }

  #updateStateColor(view: StateView, state: StateNode): void {
    view.root.setAttribute('data-color', state.color);
    const open = this.#paletteFor === state.id && !this.#readOnly;
    view.colorButton.hidden = this.#readOnly;
    view.colorButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    const text = this.#strings.state;
    const color = this.#strings.color[state.color];
    view.colorButton.setAttribute('aria-label', text.colorLabel({ color }));
    view.colorButton.title = text.colorTitle({ color });
    view.palette.hidden = !open;
    view.palette.setAttribute('aria-label', text.paletteLabel({ name: state.name }));
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
      // Four whole sentences rather than a verb glued to a noun: which word
      // moves where when the role changes is the sentence's business, and in
      // several languages it is not the first one.
      const named = { name: state.name };
      const text = this.#strings.state;
      const initialLabel = on ? text.unmarkInitial(named) : text.markInitial(named);
      const finalLabel = on ? text.unmarkFinal(named) : text.markFinal(named);
      button.setAttribute('aria-label', role === 'initial' ? initialLabel : finalLabel);
    }

    // The flag and the creation edges are independent: marking a state initial
    // never creates an edge, and unmarking it never deletes one. The row goes
    // with the button, so a card that cannot offer it keeps its height.
    view.creation.hidden = !initial;
    view.creationButton.hidden = !initial;
    view.creationButton.disabled = this.#readOnly;
    view.creationButton.setAttribute(
      'aria-label',
      this.#strings.state.creationLabel({ name: state.name }),
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

  #updateChip(chip: ChipView, ref: SideEffectListRef): void {
    const effects = getSideEffects(this.#machine, ref);
    const button = chip.button;
    // Only the offer to add one leads with an icon; a list that has something in
    // it leads with the first side effect's name, and read-only says so plainly.
    const addLabel = this.#strings.chip.add;
    if (effects.length === 0 && !this.#readOnly) {
      if (!hasIcon(chip.label, 'add', addLabel)) {
        setIcon(chip.label, this.#icons, 'add', addLabel);
      }
    } else {
      clearIcon(chip.label);
      chip.label.textContent = formatSideEffectHead(effects, undefined, this.#strings);
    }
    button.classList.toggle('is-filled', effects.length > 0);
    button.title = formatSideEffectTitle(effects, this.#strings);
    const labels = describeSideEffectList(this.#machine, ref, this.#strings);
    // Both markers are drawn in CSS, outside the line the name is elided on, so
    // neither takes room from it.
    const withParams = countWithParams(effects);
    button.toggleAttribute('data-has-params', withParams > 0);
    button.setAttribute(
      'aria-label',
      this.#strings.chip.label({
        description: labels.description,
        count: effects.length,
        withParams,
      }),
    );
    button.setAttribute('data-count', String(effects.length));
    button.toggleAttribute('data-many', effects.length > 1);
  }

  #renderTransitions(): void {
    this.#renderEdgePaths();
    this.#renderCards();
  }

  /**
   * The curves, one per transition. They outlive the cards: a decision draws
   * one card for several edges, and every one of those edges still needs a line
   * of its own to reach the state it lands on.
   */
  #renderEdgePaths(): void {
    const alive = new Set<string>();
    for (const transition of this.#machine.transitions) {
      alive.add(transition.id);
      const path = this.#edgePaths.get(transition.id) ?? this.#createEdgePath(transition.id);
      this.#edgePaths.set(transition.id, path);
      path.setAttribute('d', this.#pathGeometryFor(transition).path);
      path.classList.toggle('is-selected', this.#isSelectedTransition(transition.id));
    }
    for (const [id, path] of this.#edgePaths) {
      if (!alive.has(id)) {
        path.remove();
        this.#edgePaths.delete(id);
        this.#renameEditors.delete(id);
        if (this.#expandedRow === id) {
          this.#expandedRow = undefined;
        }
      }
    }
  }

  #createEdgePath(transitionId: string): SVGPathElement {
    return createSvgElement('path', {
      className: 'edge',
      parent: this.#edgeLayer,
      attrs: { 'marker-end': 'url(#sme-arrow)', part: 'edge', 'data-transition-id': transitionId },
    });
  }

  /**
   * One card per group. A group of one is the edge card this component has
   * always drawn; a group of several is the decision card, and swapping between
   * the two is a rebuild rather than a patch — they share no structure.
   */
  #renderCards(): void {
    const alive = new Set<string>();
    for (const group of this.#groups) {
      alive.add(group.key);
      let entry = this.#cardViews.get(group.key);
      if (entry !== undefined && (entry.kind === 'decision') !== isDecision(group)) {
        this.#destroyCard(entry);
        this.#cardViews.delete(group.key);
        entry = undefined;
      }
      if (entry === undefined) {
        entry = this.#createCard(group);
        this.#cardViews.set(group.key, entry);
      }
      if (entry.kind === 'decision') {
        this.#updateDecisionView(entry.view, group);
        continue;
      }
      const transition = group.transitions[0];
      if (transition !== undefined) {
        this.#updateTransitionView(entry.view, transition);
      }
    }
    for (const [key, entry] of this.#cardViews) {
      if (!alive.has(key)) {
        this.#destroyCard(entry);
        this.#cardViews.delete(key);
      }
    }
  }

  #createCard(group: TransitionGroup): CardView {
    if (isDecision(group)) {
      return { kind: 'decision', view: this.#createDecisionView(group) };
    }
    const transitionId = group.transitions[0]?.id ?? group.key;
    return { kind: 'single', transitionId, view: this.#createTransitionView(transitionId) };
  }

  #destroyCard(entry: CardView): void {
    if (entry.kind === 'decision') {
      entry.view.reorder.destroy();
      entry.view.card.remove();
      return;
    }
    entry.view.card.remove();
    this.#renameEditors.delete(entry.transitionId);
  }

  #isSelectedTransition(transitionId: string): boolean {
    return this.#selection?.kind === 'transition' && this.#selection.id === transitionId;
  }

  #createTransitionView(transitionId: string): TransitionView {
    const card = createElement('div', {
      className: 'edge-card',
      parent: this.#world,
      attrs: { part: 'transition', 'data-transition-id': transitionId },
    });
    const header = createElement('div', { className: 'edge-card__header', parent: card });
    const name = createElement('span', { className: 'edge-card__name', parent: header });
    // Above the card, like a state's: these cards are narrower still, so the
    // name needs every pixel of the header it can keep.
    const actions = createElement('div', {
      className: 'card-actions',
      parent: card,
      attrs: { part: 'card-actions', role: 'toolbar' },
    });
    const renameButton = createIconButton(this.#icons, 'rename', {
      className: 'icon-button edge-card__rename',
      parent: actions,
      attrs: {
        'aria-label': this.#strings.transition.rename,
        title: this.#strings.rename.title,
      },
    });
    const propertiesButton = createIconButton(this.#icons, 'properties', {
      className: 'icon-button edge-card__properties',
      parent: actions,
      attrs: {
        'aria-label': this.#strings.transition.properties,
        title: this.#strings.transition.properties,
      },
    });
    propertiesButton.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.openProperties({ kind: 'transition', id: transitionId });
    });
    const removeButton = createIconButton(this.#icons, 'remove', {
      className: 'icon-button edge-card__remove',
      parent: actions,
      attrs: { 'aria-label': this.#strings.transition.remove },
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
    const chips = new Map<SideEffectPhase, ChipView>();
    for (const phase of ['before', 'after'] as const) {
      const row = createElement('div', { className: 'hook', parent: hooks });
      createElement('span', {
        className: 'hook__label',
        parent: row,
        text: this.#strings.phase[phase],
      });
      const chip = createChip(row);
      chip.button.addEventListener('click', (event) => {
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

    const stripes = createStripes(card);

    return {
      card,
      name,
      actions,
      renameButton,
      propertiesButton,
      removeButton,
      meta,
      trigger,
      guard,
      chips,
      stripes,
    };
  }

  #updateTransitionView(view: TransitionView, transition: Transition): void {
    const selected = this.#isSelectedTransition(transition.id);
    view.card.classList.toggle('is-selected', selected);
    // Both breeds of card are placed the same way, so the point a drag measures
    // its grip against is the point the card is actually drawn at.
    const point = this.#cardOriginFor(transition);
    view.card.style.left = `${point.x}px`;
    view.card.style.top = `${point.y}px`;
    view.name.textContent = transition.name;
    view.card.classList.toggle('is-creation', transition.from === null);
    const editing = this.#renameEditors.has(transition.id);
    view.name.hidden = editing;
    view.actions.hidden = editing;
    view.actions.setAttribute(
      'aria-label',
      this.#strings.card.toolsLabel({ name: transition.name }),
    );
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
    this.#writeStripes(view.stripes, this.#guardMessages(transition.guard));
  }

  /** The host's complaints about one guard, worded through the string set. */
  #guardMessages(guard: string): readonly string[] {
    const text = this.#strings.issue;
    return this.#guardErrorsFor(guard).map((message) => text.guard({ message }));
  }

  #updateTransitionMeta(view: TransitionView, transition: Transition): void {
    const trigger = transition.trigger;
    view.trigger.hidden = trigger === null;
    const text = this.#strings.transition;
    view.trigger.textContent = trigger === null ? '' : text.trigger({ name: trigger.name });
    view.trigger.title = trigger === null ? '' : text.triggerTitle({ name: trigger.name });
    const guarded = transition.guard.length > 0;
    const guard = transition.guard;
    view.guard.hidden = !guarded;
    view.guard.textContent = guarded ? text.guard({ guard }) : '';
    view.guard.title = guarded ? text.guardTitle({ guard }) : '';
    view.meta.hidden = trigger === null && !guarded;
  }

  // -- decision cards -------------------------------------------------------

  /**
   * The card several edges leaving one state under one action share.
   *
   * The header behaves exactly like a single edge's — it names the action and it
   * is what the card is dragged by — and the outcomes sit under it as a list,
   * numbered in the order the engine tries them.
   */
  #createDecisionView(group: TransitionGroup): DecisionView {
    const key = group.key;
    const card = createElement('div', {
      className: 'edge-card edge-card--decision',
      parent: this.#world,
      attrs: { part: 'transition', 'data-group-key': key },
    });
    const header = createElement('div', { className: 'edge-card__header', parent: card });
    const action = createElement('span', {
      className: 'edge-card__name decision__action',
      parent: header,
    });
    const count = createElement('span', { className: 'decision__count', parent: header });
    const list = createElement('ol', { className: 'decision', parent: card });
    const reorder = new ReorderController({
      list,
      rowSelector: '.decision__row',
      handleSelector: '.decision__handle',
      onReorder: (from, to) => this.#reorderDecision(key, from, to, true),
      onDrop: () => this.#endDecisionReorder(),
    });

    card.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      const leader = this.#groupByKey(key)?.transitions[0];
      if (leader !== undefined) {
        this.#setSelection({ kind: 'transition', id: leader.id });
      }
    });
    header.addEventListener('pointerdown', (event) => {
      const leader = this.#groupByKey(key)?.transitions[0];
      if (leader !== undefined) {
        this.#onLabelPointerDown(event, leader.id);
      }
    });

    const stripes = createStripes(card);

    return { card, header, action, count, list, reorder, rows: new Map(), stripes };
  }

  #groupByKey(key: string): TransitionGroup | undefined {
    return this.#groups.find((group) => group.key === key);
  }

  #updateDecisionView(view: DecisionView, group: TransitionGroup): void {
    const point = this.#cardPointFor(group);
    view.card.style.left = `${point.x}px`;
    view.card.style.top = `${point.y}px`;
    view.card.classList.toggle(
      'is-selected',
      group.transitions.some((transition) => this.#isSelectedTransition(transition.id)),
    );
    view.card.classList.toggle('is-creation', group.from === null);
    const text = this.#strings;
    const name = group.triggerName ?? '';
    const count = group.transitions.length;
    view.action.textContent = text.transition.trigger({ name });
    view.action.title = text.transition.triggerTitle({ name });
    view.count.textContent = text.decision.outcomes({ count });
    view.card.setAttribute('aria-label', text.decision.label({ action: name, count }));
    view.header.style.cursor = this.#readOnly ? 'default' : 'grab';

    const rows = decisionRows(group);
    const alive = new Set<string>();
    rows.forEach((row, index) => {
      const id = row.transition.id;
      alive.add(id);
      const rowView = view.rows.get(id) ?? this.#createDecisionRow(view, id);
      view.rows.set(id, rowView);
      this.#updateDecisionRow(rowView, row, index, rows.length);
    });
    for (const [id, rowView] of view.rows) {
      if (!alive.has(id)) {
        rowView.root.remove();
        view.rows.delete(id);
      }
    }
    this.#orderDecisionRows(view, rows);
    this.#writeStripes(
      view.stripes,
      decisionIssues(group).map(() => this.#strings.issue.noFallback),
    );
  }

  /**
   * Walks the list once and moves only what is out of place, so a row holding
   * focus — a guard being typed into, a handle being driven from the keyboard —
   * is left exactly where it stands whenever the order has not changed.
   *
   * Display order is evaluation order, so a dropped row lands where it was let
   * go of and the badge beside it agrees with the position it now holds.
   */
  #orderDecisionRows(view: DecisionView, rows: readonly DecisionRow[]): void {
    let cursor = view.list.firstElementChild;
    for (const row of rows) {
      const rowView = view.rows.get(row.transition.id);
      if (rowView === undefined) {
        continue;
      }
      if (cursor === rowView.root) {
        cursor = cursor.nextElementSibling;
        continue;
      }
      view.list.insertBefore(rowView.root, cursor);
    }
  }

  #createDecisionRow(view: DecisionView, transitionId: string): DecisionRowView {
    const text = this.#strings;
    const root = createElement('li', {
      className: 'decision__row',
      parent: view.list,
      attrs: { 'data-transition-id': transitionId },
    });
    const line = createElement('div', { className: 'decision__line', parent: root });
    const handle = createIconButton(this.#icons, 'dragHandle', {
      className: 'decision__handle',
      parent: line,
      attrs: { title: text.decision.reorderTitle },
    });
    handle.addEventListener('keydown', (event) => this.#onDecisionHandleKey(event, transitionId));
    const order = createElement('span', { className: 'decision__order', parent: line });
    const summary = createButton({
      className: 'decision__summary',
      parent: line,
      attrs: { 'aria-expanded': 'false' },
    });
    const outcome = createElement('span', { className: 'decision__outcome', parent: summary });
    const target = createElement('span', { className: 'decision__target', parent: summary });
    const flag = createElement('span', { className: 'decision__flag', parent: line });
    summary.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#toggleDecisionRow(transitionId);
    });

    const panel = createElement('div', { className: 'decision__panel', parent: root });
    panel.hidden = true;
    const nameInput = this.#createRowField(panel, 'name', text.decision.fieldName, undefined);
    const guardInput = this.#createRowField(
      panel,
      'guard',
      text.properties.fieldGuard,
      text.properties.guardPlaceholder,
    );
    const permissionInput = this.#createRowField(
      panel,
      'permission',
      text.properties.fieldPermission,
      text.properties.permissionPlaceholder,
    );
    nameInput.addEventListener('change', () => {
      const value = nameInput.value.trim();
      const current = findTransition(this.#machine, transitionId);
      if (current === undefined || value.length === 0 || value === current.name) {
        return;
      }
      this.#commit(updateTransition(this.#machine, transitionId, { name: value }), {
        kind: 'transition-rename',
        transitionId,
      });
    });
    guardInput.addEventListener('change', () => {
      if (findTransition(this.#machine, transitionId)?.guard === guardInput.value) {
        return;
      }
      this.#commit(setTransitionGuard(this.#machine, transitionId, guardInput.value), {
        kind: 'transition-guard',
        transitionId,
      });
    });
    permissionInput.addEventListener('change', () => {
      if (
        findTransition(this.#machine, transitionId)?.requiredPermission === permissionInput.value
      ) {
        return;
      }
      this.#commit(setTransitionPermission(this.#machine, transitionId, permissionInput.value), {
        kind: 'transition-permission',
        transitionId,
      });
    });

    const hooks = createElement('div', { className: 'hooks', parent: panel });
    const chips = new Map<SideEffectPhase, ChipView>();
    for (const phase of SIDE_EFFECT_PHASES) {
      const hookRow = createElement('div', { className: 'hook', parent: hooks });
      createElement('span', {
        className: 'hook__label',
        parent: hookRow,
        text: this.#strings.phase[phase],
      });
      const chip = createChip(hookRow);
      chip.button.addEventListener('click', (event) => {
        event.stopPropagation();
        void this.openSideEffects({ kind: 'transition', transitionId, phase });
      });
      chips.set(phase, chip);
    }

    const tools = createElement('div', {
      className: 'decision__tools',
      parent: panel,
      attrs: { role: 'toolbar' },
    });
    const propertiesButton = createIconButton(this.#icons, 'properties', {
      className: 'icon-button decision__properties',
      parent: tools,
      attrs: {
        'aria-label': text.transition.properties,
        title: text.transition.properties,
      },
    });
    propertiesButton.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.openProperties({ kind: 'transition', id: transitionId });
    });
    const removeButton = createIconButton(this.#icons, 'remove', {
      className: 'icon-button decision__remove',
      parent: tools,
      attrs: { 'aria-label': text.transition.remove },
    });
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#commit(removeTransition(this.#machine, transitionId), {
        kind: 'transition-remove',
        transitionId,
      });
    });

    const stripes = createStripes(root);

    root.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.#setSelection({ kind: 'transition', id: transitionId });
    });

    return {
      root,
      stripes,
      handle,
      order,
      summary,
      outcome,
      target,
      flag,
      panel,
      nameInput,
      guardInput,
      permissionInput,
      chips,
      propertiesButton,
      removeButton,
    };
  }

  /** A labelled text field of the panel a decision row opens. */
  #createRowField(
    parent: ParentNode,
    field: string,
    label: string,
    placeholder: string | undefined,
  ): HTMLInputElement {
    const row = createElement('label', { className: 'decision__field', parent });
    createElement('span', { className: 'decision__field-label', parent: row, text: label });
    const attrs: Record<string, string> = { 'data-field': field };
    if (placeholder !== undefined) {
      attrs['placeholder'] = placeholder;
    }
    return createElement('input', { className: 'decision__input', parent: row, attrs });
  }

  #updateDecisionRow(view: DecisionRowView, row: DecisionRow, index: number, total: number): void {
    const text = this.#strings;
    const transition = row.transition;
    const expanded = this.#expandedRow === transition.id;
    // Every unguarded row reads as `else`; only the first one is reachable, and
    // that is what the rule-off and the strike-through are for.
    const outcome =
      transition.guard.trim().length === 0 ? text.decision.fallback : transition.guard;
    const targetName = findState(this.#machine, transition.to)?.name ?? transition.to;

    view.root.setAttribute('data-index', String(index));
    view.root.classList.toggle('is-fallback', row.isFallback);
    view.root.classList.toggle('is-dead', row.isDead);
    view.root.classList.toggle('is-expanded', expanded);
    view.root.classList.toggle('is-selected', this.#isSelectedTransition(transition.id));

    if (row.isFallback) {
      if (!hasIcon(view.order, 'fallback')) {
        setIcon(view.order, this.#icons, 'fallback');
      }
      view.order.title = text.decision.orderTitle({ index: row.order, total });
    } else {
      clearIcon(view.order);
      view.order.textContent = String(row.order);
      view.order.title = '';
    }

    view.outcome.textContent = outcome;
    view.outcome.title = row.isFallback
      ? text.decision.fallbackTitle
      : text.transition.guardTitle({ guard: transition.guard });
    view.target.textContent = text.decision.target({ name: targetName });
    view.target.title = text.decision.targetTitle({ name: targetName });
    view.flag.hidden = !row.isDead;
    view.flag.textContent = row.isDead ? text.decision.dead : '';
    view.flag.title = row.isDead ? text.decision.deadTitle : '';

    view.summary.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    view.summary.setAttribute(
      'aria-label',
      text.decision.rowLabel({
        outcome,
        target: text.decision.target({ name: targetName }),
        index: row.order,
        total,
        expanded,
      }),
    );
    view.handle.disabled = this.#readOnly;
    view.handle.setAttribute(
      'aria-label',
      text.decision.reorderLabel({ outcome, index: index + 1, total }),
    );

    view.panel.hidden = !expanded;
    view.panel.setAttribute('aria-label', text.decision.fieldsLabel({ name: transition.name }));
    this.#writeRowField(view.nameInput, transition.name, text.transition.nameLabel);
    this.#writeRowField(view.guardInput, transition.guard, text.properties.guardLabel);
    this.#writeRowField(
      view.permissionInput,
      transition.requiredPermission,
      text.properties.fieldPermission,
    );
    view.removeButton.hidden = this.#readOnly;
    for (const phase of SIDE_EFFECT_PHASES) {
      const chip = view.chips.get(phase);
      if (chip !== undefined) {
        this.#updateChip(chip, { kind: 'transition', transitionId: transition.id, phase });
      }
    }
    this.#writeStripes(view.stripes, this.#guardMessages(transition.guard));
  }

  /**
   * Writes a field of the open panel. A field the caret is in is left alone:
   * every commit re-renders, and half typed text must survive its own edit.
   */
  #writeRowField(input: HTMLInputElement, value: string, label: string): void {
    input.setAttribute('aria-label', label);
    input.readOnly = this.#readOnly;
    if (this.#shadow.activeElement !== input) {
      input.value = value;
    }
  }

  #toggleDecisionRow(transitionId: string): void {
    this.#expandedRow = this.#expandedRow === transitionId ? undefined : transitionId;
    this.#setSelection({ kind: 'transition', id: transitionId });
    this.#render();
  }

  /** Opens a row and puts the caret in its name — a decision's rename gesture. */
  #expandDecisionRow(transitionId: string): void {
    this.#expandedRow = transitionId;
    this.#render();
    const view = this.#decisionRowView(transitionId);
    view?.nameInput.focus();
    view?.nameInput.select();
  }

  #decisionRowView(transitionId: string): DecisionRowView | undefined {
    for (const entry of this.#cardViews.values()) {
      if (entry.kind === 'decision') {
        const row = entry.view.rows.get(transitionId);
        if (row !== undefined) {
          return row;
        }
      }
    }
    return undefined;
  }

  /**
   * Moves one outcome. Every frame of a drag is transient, so the whole gesture
   * folds into the single step {@link #endDecisionReorder} records on drop; a
   * keyboard move is one step on its own.
   */
  #reorderDecision(key: string, from: number, to: number, transient: boolean): void {
    if (this.#readOnly) {
      return;
    }
    const group = this.#groupByKey(key);
    if (group === undefined) {
      return;
    }
    const rows = decisionRows(group);
    const moved = rows[from]?.transition;
    const target = rows[to]?.transition;
    if (moved === undefined || target === undefined || moved.id === target.id) {
      return;
    }
    const index = group.transitions.findIndex((candidate) => candidate.id === target.id);
    this.#reordering = moved.id;
    this.#commit(
      moveDecisionRow(this.#machine, moved.id, index),
      { kind: 'transition-reorder', transitionId: moved.id },
      transient,
    );
    if (!transient) {
      this.#reordering = undefined;
    }
  }

  /** Files the drag that just ended as one undoable step. */
  #endDecisionReorder(): void {
    const transitionId = this.#reordering;
    this.#reordering = undefined;
    if (transitionId !== undefined) {
      this.#commit(this.#machine, { kind: 'transition-reorder', transitionId }, false);
    }
  }

  #onDecisionHandleKey(event: KeyboardEvent, transitionId: string): void {
    if (!event.altKey || this.#readOnly) {
      return;
    }
    const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) {
      return;
    }
    const group = this.#groupOf.get(transitionId);
    if (group === undefined) {
      return;
    }
    const rows = decisionRows(group);
    const from = rows.findIndex((row) => row.transition.id === transitionId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= rows.length) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.#reorderDecision(group.key, from, to, false);
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
    const sourceRect = this.#sourceRect(transition);
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
    // Where the user dragged the card to: the automatic point plus their offset.
    return this.#bendThrough(transition, {
      x: auto.label.x + transition.labelOffset.x,
      y: auto.label.y + transition.labelOffset.y,
    });
  }

  /** The edge redrawn so its curve passes through a point the card holds. */
  #bendThrough(transition: Transition, through: Point): EdgeGeometry {
    const sourceRect = this.#sourceRect(transition);
    const target = findState(this.#machine, transition.to);
    if (sourceRect === undefined || target === undefined) {
      return EMPTY_GEOMETRY;
    }
    return transition.from === transition.to
      ? bendSelfEdgeThrough(sourceRect, this.#fanIndexOf(transition), through)
      : bendEdgeThrough(sourceRect, this.#rectFor(target), through);
  }

  /**
   * Where the card standing for `group` would sit if nobody had moved it: the
   * mean of the points its members' edges would each put a card at.
   *
   * The mean, rather than the first member's, because **the answer must not
   * depend on the order of the members**. The rows of a decision are dragged to
   * reorder them, and anchoring on whichever edge happened to be first sent the
   * card leaping across the canvas the moment that changed — the reorder looked
   * like it had thrown the card somewhere. A mean is symmetric, so no reordering
   * can move it, and it lands in the middle of the fan rather than on one arm of
   * it. A group of one reduces to exactly that member, which is what a lone edge
   * card has always done.
   */
  #autoCardPoint(group: TransitionGroup): Point {
    let x = 0;
    let y = 0;
    let counted = 0;
    for (const transition of group.transitions) {
      const auto = this.#autoGeometry(transition);
      if (auto !== undefined) {
        x += auto.label.x;
        y += auto.label.y;
        counted += 1;
      }
    }
    return counted === 0 ? { x: 0, y: 0 } : { x: x / counted, y: y / counted };
  }

  /**
   * How far the user has dragged the group's card off that point.
   *
   * Also a mean, and for the same reason. A drag writes one offset onto every
   * member — see {@link setDecisionLabelOffset} — so in the ordinary case every
   * term is the same value and the mean *is* that value, to the pixel. They only
   * differ while a member that was placed elsewhere is joining the group, and
   * then the card leans towards the crowd rather than snapping to whichever edge
   * sorts first.
   */
  #groupOffset(group: TransitionGroup): Point {
    let x = 0;
    let y = 0;
    for (const transition of group.transitions) {
      x += transition.labelOffset.x;
      y += transition.labelOffset.y;
    }
    const count = group.transitions.length;
    return count === 0 ? { x: 0, y: 0 } : { x: x / count, y: y / count };
  }

  /**
   * Where the card carrying `transition` sits — the group's card, since a
   * decision has one for all its members. Grabbing a card and drawing it both
   * go through this, so a drag never starts by teleporting the card to a point
   * only one of them believed in.
   */
  #cardOriginFor(transition: Transition): Point {
    const group = this.#groupOf.get(transition.id);
    return group === undefined ? this.#geometryFor(transition).label : this.#cardPointFor(group);
  }

  /** Where the card standing for `group` actually sits. */
  #cardPointFor(group: TransitionGroup): Point {
    const auto = this.#autoCardPoint(group);
    const offset = this.#groupOffset(group);
    return { x: Math.round(auto.x + offset.x), y: Math.round(auto.y + offset.y) };
  }

  /**
   * The curve one edge is drawn as. Every member of a decision is bent through
   * the single card they share, so the lines meet at it and fan out from there
   * to the states they land on.
   */
  #pathGeometryFor(transition: Transition): EdgeGeometry {
    const group = this.#groupOf.get(transition.id);
    if (group === undefined || !isDecision(group)) {
      return this.#geometryFor(transition);
    }
    return this.#bendThrough(transition, this.#cardPointFor(group));
  }

  /** Rebuilds the group index. Called wherever the machine in force changes. */
  #indexGroups(machine: StateMachine): void {
    const groups = groupTransitions(machine);
    const index = new Map<string, TransitionGroup>();
    for (const group of groups) {
      for (const transition of group.transitions) {
        index.set(transition.id, group);
      }
    }
    this.#groups = groups;
    this.#groupOf = index;
  }

  /**
   * How far apart parallel edges are fanned. A card sits at the midpoint of its
   * curve, which is half the curvature off the straight line, so the spacing is
   * twice the card height to keep neighbours from covering each other.
   */
  #labelSpacing(): number {
    const height = this.#anyCard()?.offsetHeight ?? 0;
    return Math.max((height + 16) * 2, FALLBACK_LABEL_SPACING);
  }

  /**
   * The point the card carrying `transition` would sit at if the user had not
   * moved it — the group's, so dragging a decision measures against the same
   * anchor the render draws from.
   */
  #autoLabelPoint(transition: Transition): Point {
    const group = this.#groupOf.get(transition.id);
    return group === undefined
      ? (this.#autoGeometry(transition)?.label ?? { x: 0, y: 0 })
      : this.#autoCardPoint(group);
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
    const card = this.#cardOriginFor(transition);
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
          setDecisionLabelOffset(this.#machine, drag.transitionId, offset),
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
          setDecisionLabelOffset(this.#machine, drag.transitionId, offset),
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
    const rect = this.#linkSourceRect(drag.fromId);
    if (rect === undefined) {
      return;
    }
    // The bar has no header to leave from, so the preview starts at its middle.
    const start = {
      x: rect.x + rect.width,
      y: drag.fromId === null ? rect.y + rect.height / 2 : rect.y + 16,
    };
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
    if (this.#handleEscape(event)) {
      return;
    }
    // A dialog is a modal of its own: while one is open every key belongs to it,
    // ⌘Z included, and nothing here should reach the canvas behind it.
    if (isInteractiveTarget(event.target) || this.#dialogOpen()) {
      return;
    }
    if (this.#handleClipboardKey(event) || this.#readOnly) {
      return;
    }
    if (this.#handleHistoryKey(event)) {
      return;
    }
    this.#handleSelectionKey(event);
  };

  /** Escape backs out of the gesture in progress, if there is one. */
  #handleEscape(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') {
      return false;
    }
    if (this.#drag?.kind === 'link') {
      this.#endDrag();
      return true;
    }
    if (this.#paletteFor !== undefined) {
      this.#closePalette();
      return true;
    }
    return false;
  }

  /**
   * Copying takes nothing away, so it works read-only too — unlike the paste
   * that would put it back. Either way the key is consumed: nothing else here
   * wants it, and the browser keeps it when there was nothing to do with it.
   */
  #handleClipboardKey(event: KeyboardEvent): boolean {
    const command = clipboardShortcut(event);
    if (command === undefined) {
      return false;
    }
    const done =
      command === 'copy' ? this.copySelection() : !this.#readOnly && this.paste() !== null;
    if (done) {
      event.preventDefault();
    }
    return true;
  }

  #handleHistoryKey(event: KeyboardEvent): boolean {
    const command = historyShortcut(event);
    if (command === undefined) {
      return false;
    }
    event.preventDefault();
    if (command === 'undo') {
      this.undo();
    } else {
      this.redo();
    }
    return true;
  }

  /** Rename and remove, both of which need something to act on. */
  #handleSelectionKey(event: KeyboardEvent): void {
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
  }

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
      ariaLabel: this.#strings.state.nameLabel,
      commit: (name) => {
        this.#commit(updateState(this.#machine, stateId, { name }), {
          kind: 'state-rename',
          stateId,
        });
      },
    });
  }

  /**
   * Renaming an edge that belongs to a decision opens its row instead of
   * swapping a label for an input: the name is a field of that panel, and the
   * card's own headline is the action every row of it shares.
   */
  #renameTransition(transitionId: string): void {
    const transition = findTransition(this.#machine, transitionId);
    if (transition === undefined || this.#readOnly) {
      return;
    }
    const group = this.#groupOf.get(transitionId);
    if (group !== undefined && isDecision(group)) {
      this.#expandDecisionRow(transitionId);
      return;
    }
    const entry = this.#cardViews.get(group?.key ?? '');
    if (entry === undefined || entry.kind !== 'single') {
      return;
    }
    const view = entry.view;
    this.#startRename({
      id: transitionId,
      label: view.name,
      current: transition.name,
      ariaLabel: this.#strings.transition.nameLabel,
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
   * The editor stays open until the user resolves it: Enter or save commits,
   * Escape or cancel discards, and clicking elsewhere does neither.
   */
  #startRename(options: {
    readonly id: string;
    readonly label: HTMLElement;
    readonly current: string;
    readonly ariaLabel: string;
    readonly commit: (name: string) => void;
  }): void {
    const open = this.#renameEditors.get(options.id);
    if (open !== undefined) {
      // Reopening the same editor would drop whatever has been typed into it.
      open.focus();
      open.select();
      return;
    }

    const editor = createElement('span', { className: 'name-edit' });
    const input = createElement('input', { className: 'name-input' });
    input.value = options.current;
    input.setAttribute('aria-label', options.ariaLabel);
    const save = createIconButton(this.#icons, 'confirm', {
      className: 'icon-button icon-button--confirm',
      attrs: {
        'aria-label': this.#strings.rename.save,
        title: this.#strings.rename.saveTitle,
      },
    });
    const cancel = createIconButton(this.#icons, 'cancel', {
      className: 'icon-button icon-button--cancel',
      attrs: {
        'aria-label': this.#strings.rename.cancel,
        title: this.#strings.rename.cancelTitle,
      },
    });
    editor.append(input, save, cancel);

    options.label.after(editor);
    this.#renameEditors.set(options.id, input);
    // The card's own render owns which of its parts an open editor hides, so
    // both ends of the gesture go through it rather than toggling by hand.
    this.#render();
    input.focus();
    input.select();

    const cleanup = (): void => {
      if (this.#renameEditors.get(options.id) !== input) {
        return;
      }
      this.#renameEditors.delete(options.id);
      editor.remove();
      this.#render();
    };

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
    input.addEventListener('pointerdown', (event) => event.stopPropagation());
    input.addEventListener('dblclick', (event) => event.stopPropagation());

    for (const button of [save, cancel]) {
      // Keep the caret in the field so a press on either button reads as part of
      // the same edit rather than moving focus out of it.
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
