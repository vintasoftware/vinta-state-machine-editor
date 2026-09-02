import type {
  SelectionChangeEvent,
  StateMachineChangeEvent,
  StateMachineEditorEventMap,
  ThemeChangeEvent,
} from '../events.js';
import {
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
  Size,
  StateColor,
  StateMachine,
  StateNode,
  StateRole,
  StateTrigger,
  Transition,
  TransitionTrigger,
} from '../types.js';
import { STATE_COLORS } from '../types.js';
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
  /** Rail of card tools, floating clear of the card so the name keeps the header. */
  readonly actions: HTMLElement;
  readonly renameButton: HTMLButtonElement;
  readonly propertiesButton: HTMLButtonElement;
  readonly removeButton: HTMLButtonElement;
  readonly linkHandle: HTMLButtonElement;
  /** Creates a creation transition into this state; only shown while it is initial. */
  readonly creationButton: HTMLButtonElement;
  readonly chips: ReadonlyMap<HookKey, ChipView>;
}

interface TransitionView {
  readonly path: SVGPathElement;
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
  readonly #transitionViews = new Map<string, TransitionView>();

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
    }
    this.#stateViews.clear();
    for (const view of this.#transitionViews.values()) {
      view.path.remove();
      view.card.remove();
    }
    this.#transitionViews.clear();
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
    const [transitionView] = this.#transitionViews.values();
    const card = transitionView?.card.offsetWidth || FALLBACK_LABEL_WIDTH;
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
    const [view] = this.#transitionViews.values();
    return {
      width: view?.card.offsetWidth || FALLBACK_LABEL_WIDTH,
      height: view?.card.offsetHeight || FALLBACK_LABEL_HEIGHT,
    };
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
    for (const transition of this.#machine.transitions) {
      if (transition.id !== exceptTransitionId) {
        rects.push(boxAround(this.#geometryFor(transition).label, size));
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
    this.#machine = machine;
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
    for (const transition of machine.transitions) {
      const offset = this.#freeLabelOffset(next, transition);
      if (offset.x !== 0 || offset.y !== 0) {
        next = updateTransition(next, transition.id, { labelOffset: offset });
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

    // Only reachable while the state is initial: the start pseudo-node does not
    // exist until a creation edge does, so there is nothing to drag from yet.
    const creationButton = createIconButton(this.#icons, 'add', {
      className: 'node__create',
      parent: roles,
      label: this.#strings.state.creationAdd,
      attrs: { title: this.#strings.state.creationTitle },
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
    // never creates an edge, and unmarking it never deletes one.
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
        this.#renameEditors.delete(id);
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

    return {
      path,
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
    const sourceRect = this.#sourceRect(transition);
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
