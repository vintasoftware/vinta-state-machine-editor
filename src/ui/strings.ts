/**
 * Every word the editor puts in front of a person, in one place.
 *
 * The component ships English and knows nothing about locales: picking one is
 * the host's job, exactly as picking a theme is. A page that speaks another
 * language assigns its own set through `strings`, from whatever translation
 * machinery it already runs — this package takes on no dependency to do it.
 *
 * A string that never changes is a string. One that has values filled into it
 * is a **function** taking them, rather than a template with a placeholder
 * syntax of its own: there is no second language to learn, the parameters are
 * named and typed, and the sentence can decide things a template cannot —
 * plural forms above all, which English gets wrong for most of the world.
 */

import type { MachineChange, SideEffectPhase, StateColor, StateTrigger } from '../types.js';

/** What the two halves of a copy or paste label are called in prose. */
export type ElementKind = 'state' | 'transition';

/**
 * Everything the editor and its dialogs say, grouped by where it belongs.
 *
 * Within a group a string is named after what it **means**, not where it sits,
 * so replacing one covers every place it is used: one `card.toolsLabel` names
 * the tool rail above a state card and above an edge card alike.
 */
export interface EditorStrings {
  readonly toolbar: {
    /** Accessible name of the toolbar itself. */
    readonly label: string;
    readonly addState: string;
    /** Undo with nothing to take back: the bare verb. */
    readonly undo: string;
    readonly redo: string;
    /** Undo naming what it would take back, from the `change` group. */
    readonly undoChange: (params: { readonly change: string }) => string;
    readonly redoChange: (params: { readonly change: string }) => string;
    /** Copy with nothing selected. */
    readonly copy: string;
    /** Copy naming what is selected, from the `kind` group. */
    readonly copyKind: (params: { readonly kind: string }) => string;
    readonly paste: string;
    readonly pasteKind: (params: { readonly kind: string }) => string;
    /** A control's tooltip: what it does, then how to reach it from the keyboard. */
    readonly shortcut: (params: { readonly label: string; readonly shortcut: string }) => string;
    readonly organize: string;
    readonly organizeLabel: string;
    readonly zoomOut: string;
    readonly zoomIn: string;
    readonly zoomReset: string;
    readonly zoomLevel: (params: { readonly percent: number }) => string;
    readonly fit: string;
    readonly fitLabel: string;
    /** Shown while the dark theme is on: the press switches to light. */
    readonly themeLight: string;
    readonly themeDark: string;
  };

  readonly canvas: {
    readonly empty: string;
  };

  /** What a state and a transition are called in prose. */
  readonly kind: Readonly<Record<ElementKind, string>>;

  /** Chrome a state card and an edge card share. */
  readonly card: {
    readonly toolsLabel: (params: { readonly name: string }) => string;
  };

  readonly state: {
    readonly rename: string;
    readonly properties: string;
    readonly remove: string;
    readonly link: string;
    readonly nameLabel: string;
    /** The colour button, naming the colour in force from the `color` group. */
    readonly colorLabel: (params: { readonly color: string }) => string;
    readonly colorTitle: (params: { readonly color: string }) => string;
    readonly paletteLabel: (params: { readonly name: string }) => string;
    readonly roleInitial: string;
    readonly roleFinal: string;
    /*
     * Four whole sentences rather than a verb glued to a noun: which word moves
     * where when the role changes is the sentence's business, and in several
     * languages it is not the first one.
     */
    readonly markInitial: (params: { readonly name: string }) => string;
    readonly unmarkInitial: (params: { readonly name: string }) => string;
    readonly markFinal: (params: { readonly name: string }) => string;
    readonly unmarkFinal: (params: { readonly name: string }) => string;
    readonly creationAdd: string;
    readonly creationTitle: string;
    readonly creationLabel: (params: { readonly name: string }) => string;
  };

  /** What each colour of the palette is called. */
  readonly color: Readonly<Record<StateColor, string>>;

  /** The inline name editor, on a state card and an edge card alike. */
  readonly rename: {
    readonly title: string;
    readonly save: string;
    readonly saveTitle: string;
    readonly cancel: string;
    readonly cancelTitle: string;
  };

  readonly transition: {
    readonly rename: string;
    readonly properties: string;
    readonly remove: string;
    readonly nameLabel: string;
    /** The trigger line under an edge's name, glyph included. */
    readonly trigger: (params: { readonly name: string }) => string;
    readonly triggerTitle: (params: { readonly name: string }) => string;
    readonly guard: (params: { readonly guard: string }) => string;
    readonly guardTitle: (params: { readonly guard: string }) => string;
  };

  /** The UML initial pseudostate every creation transition leaves from. */
  readonly startNode: {
    /** Written down the bar, so nobody has to guess what it is. */
    readonly label: string;
    readonly title: string;
    readonly link: string;
    readonly summary: (params: { readonly label: string; readonly count: number }) => string;
  };

  /** What to call a transition's source in prose. */
  readonly source: {
    /** A creation edge, which leaves the start bar rather than a state. */
    readonly start: string;
    /** Any other edge. This is also where a name's quotation marks live. */
    readonly state: (params: { readonly name: string }) => string;
  };

  /** The side effect chips on a card. */
  readonly chip: {
    /** What an empty chip offers, after its `add` icon. */
    readonly add: string;
    readonly empty: string;
    /** The chip's accessible name, `description` coming from `sideEffects`. */
    readonly label: (params: {
      readonly description: string;
      readonly count: number;
      readonly withParams: number;
    }) => string;
    /** A hook row's label on a state card. */
    readonly hookLabel: (params: { readonly phase: string; readonly trigger: string }) => string;
  };

  readonly phase: Readonly<Record<SideEffectPhase, string>>;
  readonly trigger: Readonly<Record<StateTrigger, string>>;
  /** The same triggers as verbs, for `sideEffects.stateTitle`. */
  readonly triggerVerb: Readonly<Record<StateTrigger, string>>;

  readonly sideEffect: {
    /** One that stays attached but does not run. */
    readonly disabled: (params: { readonly name: string }) => string;
    /** A collapsed list in prose: the first one, then how many follow. */
    readonly summary: (params: { readonly head: string; readonly count: number }) => string;
    /** One line of a chip's tooltip. `params` is the inline JSON, or empty. */
    readonly titleEntry: (params: {
      readonly index: number;
      readonly name: string;
      readonly params: string;
      readonly disabled: boolean;
    }) => string;
  };

  readonly sideEffects: {
    /** Heading the dialog opens with, for a state's list. */
    readonly stateTitle: (params: { readonly phase: string; readonly verb: string }) => string;
    readonly stateDescription: (params: {
      readonly phase: string;
      readonly verb: string;
      readonly name: string;
    }) => string;
    readonly transitionTitle: (params: { readonly phase: string }) => string;
    readonly transitionDescription: (params: {
      readonly phase: string;
      readonly name: string;
    }) => string;
    readonly listLabel: string;
    readonly empty: string;
    readonly selectLabel: string;
    readonly add: string;
    readonly placeholder: string;
    readonly noCatalog: string;
    readonly loading: string;
    readonly invalidCatalog: (params: { readonly errors: string }) => string;
    readonly loadFailed: (params: { readonly reason: string }) => string;
    readonly pickOne: string;
    /** A catalog entry that carries a description of its own. */
    readonly catalogOption: (params: {
      readonly name: string;
      readonly description: string;
    }) => string;
  };

  /** One row of the side effects dialog. */
  readonly row: {
    readonly reorderLabel: (params: {
      readonly name: string;
      readonly index: number;
      readonly total: number;
    }) => string;
    readonly reorderTitle: string;
    readonly enabledLabel: (params: { readonly name: string }) => string;
    readonly enabledTitle: string;
    readonly paramsLabel: (params: {
      readonly name: string;
      readonly count: number;
      readonly expanded: boolean;
    }) => string;
    readonly paramsTitle: string;
    readonly remove: (params: { readonly name: string }) => string;
    readonly descriptionLabel: (params: { readonly name: string }) => string;
    readonly descriptionPlaceholder: string;
  };

  /** The JSON parameters panel a row opens. */
  readonly params: {
    readonly editorLabel: (params: { readonly name: string }) => string;
    readonly jsonLabel: (params: { readonly name: string }) => string;
    readonly modeForm: string;
    readonly modeJson: string;
    /** The toggle on a row: the icon, and how many parameters are set. */
    readonly badge: (params: { readonly count: number }) => string;
  };

  readonly properties: {
    /** Heading the dialog opens with. */
    readonly title: (params: { readonly name: string }) => string;
    readonly stateDescription: (params: { readonly name: string }) => string;
    readonly transitionDescription: (params: {
      readonly source: string;
      readonly target: string;
    }) => string;
    readonly fieldTrigger: string;
    readonly triggerHint: string;
    readonly triggerPlaceholder: string;
    readonly triggerNone: string;
    readonly actionsLoading: string;
    readonly actionsInvalid: (params: { readonly errors: string }) => string;
    readonly actionsLoadFailed: (params: { readonly reason: string }) => string;
    readonly fieldGuard: string;
    readonly guardLabel: string;
    readonly guardPlaceholder: string;
    readonly fieldPermission: string;
    readonly permissionPlaceholder: string;
    readonly fieldDescription: string;
    readonly fieldOrder: string;
    readonly orderHint: (params: { readonly source: string }) => string;
    readonly orderReadout: (params: { readonly index: number; readonly total: number }) => string;
    readonly moveUp: string;
    readonly moveDown: string;
  };

  /** What an undo or redo would take back, one per kind of change. */
  readonly change: Readonly<Record<MachineChange['kind'], string>>;

  readonly dialog: {
    readonly save: string;
    readonly cancel: string;
    /** Replaces cancel while the editor is read-only: there is nothing to discard. */
    readonly close: string;
    readonly confirm: string;
  };

  readonly organize: {
    readonly title: string;
    readonly message: string;
    readonly confirm: string;
  };

  /** The nested parameter form, and what the JSON tab says when it will not parse. */
  readonly json: {
    readonly empty: string;
    readonly addItem: string;
    readonly addField: string;
    readonly keyLabel: (params: { readonly label: string }) => string;
    readonly typeLabel: (params: { readonly label: string }) => string;
    readonly valueLabel: (params: { readonly label: string }) => string;
    readonly removeLabel: (params: { readonly label: string }) => string;
    /** The position of an array entry, which is not editable the way a key is. */
    readonly indexLabel: (params: { readonly label: string }) => string;
    readonly itemCount: (params: { readonly count: number }) => string;
    readonly fieldCount: (params: { readonly count: number }) => string;
    readonly nullValue: string;
    readonly invalid: string;
    readonly notJsonValues: string;
    readonly notObject: string;
  };

  /*
   * Unlike everything above, these four do not merely label the view: they are
   * the names new elements are born with, and they are saved into the machine
   * the host round-trips. Translating them translates the *data* — which is
   * usually what a localized editor wants, but it is a deliberate choice, and a
   * host that keys off `create` server-side should leave that one alone.
   */
  readonly seed: {
    /** A new state, `index` being how many there already are, plus one. */
    readonly stateName: (params: { readonly index: number }) => string;
    readonly transitionName: string;
    readonly creationName: string;
    /** Appended to a copy, as in `Draft copy`. */
    readonly copySuffix: string;
  };
}

/** What the editor says when the host names nothing. */
export const DEFAULT_STRINGS: EditorStrings = {
  toolbar: {
    label: 'Editor tools',
    addState: 'Add state',
    undo: 'Undo',
    redo: 'Redo',
    undoChange: ({ change }) => `Undo ${change}`,
    redoChange: ({ change }) => `Redo ${change}`,
    copy: 'Copy',
    copyKind: ({ kind }) => `Copy ${kind}`,
    paste: 'Paste',
    pasteKind: ({ kind }) => `Paste ${kind}`,
    shortcut: ({ label, shortcut }) => `${label} (${shortcut})`,
    organize: 'Organize',
    organizeLabel: 'Organize layout',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    zoomReset: 'Reset zoom to 100%',
    zoomLevel: ({ percent }) => `${percent}%`,
    fit: 'Fit',
    fitLabel: 'Zoom to fit',
    themeLight: 'Switch to the light theme',
    themeDark: 'Switch to the dark theme',
  },

  canvas: {
    empty: 'No states yet — use “Add state” to start.',
  },

  kind: {
    state: 'state',
    transition: 'transition',
  },

  card: {
    toolsLabel: ({ name }) => `Tools for “${name}”`,
  },

  state: {
    rename: 'Rename state',
    properties: 'State properties',
    remove: 'Remove state',
    link: 'Drag to another state to create a transition',
    nameLabel: 'State name',
    colorLabel: ({ color }) => `Colour: ${color}. Pick another.`,
    colorTitle: ({ color }) => `Colour: ${color}`,
    paletteLabel: ({ name }) => `Colour of “${name}”`,
    roleInitial: 'Initial',
    roleFinal: 'Final',
    markInitial: ({ name }) => `Mark “${name}” as an initial state`,
    unmarkInitial: ({ name }) => `Unmark “${name}” as an initial state`,
    markFinal: ({ name }) => `Mark “${name}” as a final state`,
    unmarkFinal: ({ name }) => `Unmark “${name}” as a final state`,
    creationAdd: 'Creation',
    creationTitle: 'Add a transition that creates a record in this state',
    creationLabel: ({ name }) => `Add a creation transition into “${name}”`,
  },

  color: {
    neutral: 'neutral',
    info: 'info',
    success: 'success',
    warning: 'warning',
    danger: 'danger',
    muted: 'muted',
  },

  rename: {
    title: 'Rename (F2)',
    save: 'Save name',
    saveTitle: 'Save (Enter)',
    cancel: 'Cancel renaming',
    cancelTitle: 'Cancel (Escape)',
  },

  transition: {
    rename: 'Rename transition',
    properties: 'Transition properties',
    remove: 'Remove transition',
    nameLabel: 'Transition name',
    trigger: ({ name }) => `⚡ ${name}`,
    triggerTitle: ({ name }) => `Trigger: ${name}`,
    guard: ({ guard }) => `[${guard}]`,
    guardTitle: ({ guard }) => `Guard: ${guard}`,
  },

  startNode: {
    label: 'Create',
    title: 'Every transition leaving here creates a record',
    link: 'Drag to a state to create a creation transition',
    summary: ({ label, count }) =>
      `${label}: ${count} creation transition${count === 1 ? '' : 's'}`,
  },

  source: {
    start: 'the start',
    state: ({ name }) => `“${name}”`,
  },

  chip: {
    add: 'Add side effect',
    empty: 'No side effects',
    label: ({ description, count, withParams }) =>
      `${description} ${count} side effect${count === 1 ? '' : 's'}` +
      `${withParams > 0 ? `, ${withParams} with parameters` : ''}. Open list.`,
    hookLabel: ({ phase, trigger }) => `${phase} · ${trigger}`,
  },

  phase: {
    before: 'before',
    after: 'after',
  },

  trigger: {
    enter: 'enter',
    leave: 'leave',
  },

  triggerVerb: {
    enter: 'entering',
    leave: 'leaving',
  },

  sideEffect: {
    disabled: ({ name }) => `${name} (off)`,
    summary: ({ head, count }) => `${head} and ${count} more`,
    titleEntry: ({ index, name, params, disabled }) =>
      `${index}. ${name}${params}${disabled ? ' — disabled' : ''}`,
  },

  sideEffects: {
    stateTitle: ({ phase, verb }) => `Side effects · ${phase} ${verb}`,
    stateDescription: ({ phase, verb, name }) => `Runs ${phase} ${verb} the state “${name}”.`,
    transitionTitle: ({ phase }) => `Side effects · ${phase} transition`,
    transitionDescription: ({ phase, name }) => `Runs ${phase} the transition “${name}”.`,
    listLabel: 'Side effects, in execution order',
    empty: 'No side effects yet.',
    selectLabel: 'Side effect to add',
    add: 'Add',
    placeholder: 'Select a side effect…',
    noCatalog: 'No side effect catalog was provided.',
    loading: 'Loading side effects…',
    invalidCatalog: ({ errors }) => `Invalid side effect catalog: ${errors}`,
    loadFailed: ({ reason }) => `Could not load side effects: ${reason}`,
    pickOne: 'Pick a side effect to add.',
    catalogOption: ({ name, description }) => `${name} — ${description}`,
  },

  row: {
    reorderLabel: ({ name, index, total }) =>
      `Reorder ${name}. Position ${index} of ${total}. Use Alt with arrow keys to move.`,
    reorderTitle: 'Drag to reorder, or press Alt + Arrow Up/Down',
    enabledLabel: ({ name }) => `Run ${name}`,
    enabledTitle: 'Run this side effect',
    paramsLabel: ({ name, count, expanded }) =>
      `${expanded ? 'Hide' : 'Edit'} parameters of ${name}, ${count} set`,
    paramsTitle: 'JSON parameters',
    remove: ({ name }) => `Remove ${name}`,
    descriptionLabel: ({ name }) => `Description of ${name}`,
    descriptionPlaceholder: 'Description',
  },

  params: {
    editorLabel: ({ name }) => `Parameter editor for ${name}`,
    jsonLabel: ({ name }) => `Parameters of ${name} as JSON`,
    modeForm: 'Form',
    modeJson: 'JSON',
    badge: ({ count }) => (count === 0 ? '{ }' : `{ } ${count}`),
  },

  properties: {
    title: ({ name }) => `Properties · ${name}`,
    stateDescription: ({ name }) => `Attributes of the state “${name}”.`,
    transitionDescription: ({ source, target }) =>
      `Attributes of the transition from ${source} to ${target}.`,
    fieldTrigger: 'Trigger',
    triggerHint: 'No action catalog was provided, so the trigger is free text.',
    triggerPlaceholder: 'e.g. pay',
    triggerNone: 'No trigger',
    actionsLoading: 'Loading actions…',
    actionsInvalid: ({ errors }) => `Invalid action catalog: ${errors}`,
    actionsLoadFailed: ({ reason }) => `Could not load actions: ${reason}`,
    fieldGuard: 'Guard',
    guardLabel: 'Guard expression',
    guardPlaceholder: 'Condition the host evaluates',
    fieldPermission: 'Required permission',
    permissionPlaceholder: 'e.g. orders.pay',
    fieldDescription: 'Description',
    fieldOrder: 'Order',
    orderHint: ({ source }) => `Edges leaving ${source} are evaluated in this order.`,
    orderReadout: ({ index, total }) => `${index} of ${total}`,
    moveUp: 'Move earlier',
    moveDown: 'Move later',
  },

  change: {
    'state-add': 'add state',
    'state-remove': 'remove state',
    'state-rename': 'rename state',
    'state-move': 'move state',
    'state-color': 'change state colour',
    'transition-add': 'add transition',
    'transition-remove': 'remove transition',
    'transition-rename': 'rename transition',
    'transition-move': 'move transition',
    'transition-trigger': 'change transition trigger',
    'transition-guard': 'change transition guard',
    'transition-permission': 'change required permission',
    'transition-reorder': 'reorder transitions',
    description: 'change description',
    'side-effects-change': 'change side effects',
    layout: 'organize layout',
    'initial-states-change': 'change initial states',
    'final-states-change': 'change final states',
    replace: 'replace machine',
  },

  dialog: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    confirm: 'Confirm',
  },

  organize: {
    title: 'Organize the layout?',
    message:
      'Every card is moved onto the automatic layout. The positions on the canvas now — including the ones you dragged — are lost, though a single undo brings them back.',
    confirm: 'Organize',
  },

  json: {
    empty: 'No parameters.',
    addItem: 'Add item',
    addField: 'Add field',
    keyLabel: ({ label }) => `Name of parameter ${label}`,
    typeLabel: ({ label }) => `Type of ${label}`,
    valueLabel: ({ label }) => `Value of ${label}`,
    removeLabel: ({ label }) => `Remove ${label}`,
    indexLabel: ({ label }) => `${label}:`,
    itemCount: ({ count }) => (count === 1 ? '1 item' : `${count} items`),
    fieldCount: ({ count }) => (count === 1 ? '1 field' : `${count} fields`),
    nullValue: 'null',
    invalid: 'Invalid JSON.',
    notJsonValues: 'Parameters must contain only JSON values.',
    notObject: 'Parameters must be a JSON object, for example {"to": "user"}.',
  },

  seed: {
    stateName: ({ index }) => `State ${index}`,
    transitionName: 'transition',
    creationName: 'create',
    copySuffix: 'copy',
  },
};

/** Name of every group, in declaration order. */
export type StringGroup = keyof EditorStrings;

/** The strings of one group a host names, with the rest left as they were. */
export type GroupOverrides<T> = { readonly [K in keyof T]?: T[K] | undefined };

/**
 * A host's strings: the groups it names, and within each the strings it names,
 * with everything else left in English.
 *
 * Every entry also admits `undefined` — spreading a host's own optional config
 * produces exactly that, and it should read as "not named", not as an error.
 */
export type StringOverrides = {
  readonly [G in StringGroup]?: GroupOverrides<EditorStrings[G]> | undefined;
};

/**
 * One group merged: an entry left out — or set to `undefined`, which is what
 * spreading a host's own optional fields produces — keeps its English default.
 *
 * A key the group does not have is ignored rather than added, so a stale
 * translation file cannot smuggle anything into the set.
 */
function mergeGroup<T extends object>(base: T, overrides: GroupOverrides<T> | undefined): T {
  if (overrides === undefined) {
    return base;
  }
  const named: Partial<T> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && Object.hasOwn(base, key)) {
      Object.defineProperty(named, key, { value, enumerable: true });
    }
  }
  return { ...base, ...named };
}

/**
 * A full set from a partial one, so a host translating one label never has to
 * restate the rest.
 *
 * The groups are spelled out rather than looped over: the compiler then checks
 * that every one of them is carried across, and a group added to
 * {@link EditorStrings} without a line here does not compile.
 */
export function mergeStrings(overrides: StringOverrides | undefined): EditorStrings {
  if (overrides === undefined) {
    return DEFAULT_STRINGS;
  }
  return {
    toolbar: mergeGroup(DEFAULT_STRINGS.toolbar, overrides.toolbar),
    canvas: mergeGroup(DEFAULT_STRINGS.canvas, overrides.canvas),
    kind: mergeGroup(DEFAULT_STRINGS.kind, overrides.kind),
    card: mergeGroup(DEFAULT_STRINGS.card, overrides.card),
    state: mergeGroup(DEFAULT_STRINGS.state, overrides.state),
    color: mergeGroup(DEFAULT_STRINGS.color, overrides.color),
    rename: mergeGroup(DEFAULT_STRINGS.rename, overrides.rename),
    transition: mergeGroup(DEFAULT_STRINGS.transition, overrides.transition),
    startNode: mergeGroup(DEFAULT_STRINGS.startNode, overrides.startNode),
    source: mergeGroup(DEFAULT_STRINGS.source, overrides.source),
    chip: mergeGroup(DEFAULT_STRINGS.chip, overrides.chip),
    phase: mergeGroup(DEFAULT_STRINGS.phase, overrides.phase),
    trigger: mergeGroup(DEFAULT_STRINGS.trigger, overrides.trigger),
    triggerVerb: mergeGroup(DEFAULT_STRINGS.triggerVerb, overrides.triggerVerb),
    sideEffect: mergeGroup(DEFAULT_STRINGS.sideEffect, overrides.sideEffect),
    sideEffects: mergeGroup(DEFAULT_STRINGS.sideEffects, overrides.sideEffects),
    row: mergeGroup(DEFAULT_STRINGS.row, overrides.row),
    params: mergeGroup(DEFAULT_STRINGS.params, overrides.params),
    properties: mergeGroup(DEFAULT_STRINGS.properties, overrides.properties),
    change: mergeGroup(DEFAULT_STRINGS.change, overrides.change),
    dialog: mergeGroup(DEFAULT_STRINGS.dialog, overrides.dialog),
    organize: mergeGroup(DEFAULT_STRINGS.organize, overrides.organize),
    json: mergeGroup(DEFAULT_STRINGS.json, overrides.json),
    seed: mergeGroup(DEFAULT_STRINGS.seed, overrides.seed),
  };
}

export function isStringGroup(value: string): value is StringGroup {
  return Object.hasOwn(DEFAULT_STRINGS, value);
}

/** Every group name, read off the defaults so the two can never drift apart. */
export const STRING_GROUPS: readonly StringGroup[] =
  Object.keys(DEFAULT_STRINGS).filter(isStringGroup);
