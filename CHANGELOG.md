# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Edges leaving one state under one action are drawn as a single decision card.** The library
  behind this editor resolves several such edges by trying each in order and taking the first
  whose guard holds — one choice with several outcomes. As N separate cards, nothing on the
  canvas said they were related, in what order they were tried, or which one was the fallback.

  Two or more transitions sharing a `from` **and** a `trigger.id` now share one card: the action
  in the header, one numbered row per outcome, each naming its guard and the state it lands on.
  An edge with an empty guard is the fallback, drawn as an `else` row and ruled off from the
  guards above it. In a graph that would publish it is already last — an unguarded edge always
  matches, so nothing can usefully follow it — and where it is not, everything behind it is
  struck through and marked *unreachable*.

  Rows are drawn in the order the engine tries them, the `else` row included. Sorting it to the
  bottom regardless was tried and taken out again: it made a dragged row land somewhere other than
  where it was let go of, and it hid the very thing that made the rows behind it dead.

  ```text
  ┌──────────────────────────────────────────────┐
  │ ⚡ finish                          4 outcomes │
  ├──────────────────────────────────────────────┤
  │ 1  reason is timeout            →  Timed out │
  │ 2  failed == 0                  →  Completed │
  │ 3  succeeded > 0                →  Partial   │
  │ ──────────────────────────────────────────── │
  │ ⌄  else                         →  Failed    │
  └──────────────────────────────────────────────┘
  ```

  A group of one renders exactly as it always did, so a graph that does not use this looks
  unchanged. Nothing is stored to make it work: a group is derived from `from` and `trigger.id`,
  and evaluation order stays what it has always been — position in the `transitions` array.

- **Rows reorder by drag or from the keyboard**, with `Alt` + `Arrow Up`/`Arrow Down` on a row's
  grip. A whole drag folds into one undoable step. Because ordering is positional, a move is a
  move inside `transitions`: the outcome lands on the slot the row it displaces was holding, and
  edges leaving the same state under a *different* action keep theirs.

- **Each row opens in place** onto the edge's name, guard, required permission, `before`/`after`
  side effect chips, its properties dialog and its remove button — everything a single edge card
  offers today.

- New model helpers, all pure and exported: `groupTransitions`, `groupKeyOf`, `findGroupOf`,
  `isDecision`, `decisionRows`, `moveDecisionRow` and `setDecisionLabelOffset`.

- New `decision` string group, and two new icons: `expand` and `fallback`.

- **A state can say it fans work out and waits for it**, through a `⑂ Waiting` toggle beside
  `▶ Initial` and `◉ Final`. When it is on, the card grows a band **above** the hook lanes,
  styled apart from them because a fan-out is structure — what the state *is* — and not something
  that runs:

  ```text
  ┌─────────────────────────────────────┐
  │ ⑂ Processing                        │
  ├─────────────────────────────────────┤
  │ FANS OUT TO   import_file.status    │
  │ JOINS WITH    ⚡ import.finish       │
  │ TIMEOUT       2h                    │
  ├─────────────────────────────────────┤
  │ BEFORE·ENTER   reserveStock         │
  └─────────────────────────────────────┘
  ```

  It is read off and written back to four keys of `state.data`, which the Django side sends:

  ```jsonc
  "data": {
    "is_waiting": true,
    "join_action": "import.finish",         // an ActionType key
    "child_machine": "import_file.status",  // optional, display only
    "timeout": "PT2H"                       // ISO 8601 duration, optional
  }
  ```

  A document with none of those keys renders exactly as it did before. A key set to the wrong
  type is ignored rather than failing the document — `data` is the host's, and one bad value in
  it should not cost anybody their graph.

- **A waiting state is findable while scanning a large graph.** Its colour bar gains a weave and
  its card a dashed left edge. `color` is deliberately untouched: it is the author's choice and
  it means something else.

- **The properties dialog of a state edits the fan-out**, under a *Waiting for a batch* section:
  the toggle, the join action (picked from the action catalog when the host supplies one, free
  text otherwise), the child machine and the timeout. Every line of the band opens it.

- A timeout is shown in whole units — `PT2H` reads as `2h`, `P1DT6H30M` as `1d 6h 30m` — through
  `waiting.duration`, which a translated host replaces like any other string. A timeout the
  editor cannot read is shown exactly as it was written.

- New model helpers: `readWaiting`, `setWaiting`, `toggleWaiting`, `isWaitingState`,
  `emptyWaitingConfig`, `parseDuration` and `WAITING_KEYS`. New element methods
  `toggleWaitingState(stateId)` and `setStateWaiting(stateId, config)`.

- New `waiting` string group, and a `waiting` icon (`⑂`).

- **The report a child state makes to its parent's batch is one control**, in the same band:

  ```text
  │ COUNTS AS     ✓ success             │
  ```

  The engine runs it as a *pair* of hooks — one on enter, one on leave — but it is one concept,
  and drawn as two unrelated chips in two different lanes nothing said they belonged together.

  It is driven by `state.data.counts_as` (`"success"` | `"failure"` | absent), **never** by
  matching a handler key in the effect lists. The Django side translates the key into the hook
  rows; the editor stores the key and nothing else.

- **Toggling `◉ Final` visibly drops the leave half**, live: the control reads
  `✓ success · on enter only`. A state listed in `finalStateIds` can never be left — the engine
  refuses the move — so its leave-side hook could never fire.

- **A half configured pair renders broken**, struck in the danger colour with the reason inline
  under the band. That needs one key from the host, `state.data.counts_as_partial`
  (`"enter"` | `"leave"`), naming the half it found on its own: without it the editor would have
  to go matching handler keys, which is exactly what it must not do. It is an error on any state
  that can be left, and `"leave"` on its own is an error everywhere.

- The band is drawn for a state that only reports, even when it waits for nothing itself.

- **The fan-out leaves the card.** `FANS OUT TO` is a link that emits a new
  `state-machine-fan-out` event — `{ stateId, childMachine }`, bubbling and composed — rather
  than navigating itself. The canvas draws one version of one machine and a fan-out crosses into
  another, so routing, permissions and what "that machine's editor" even means belong to the page
  around it:

  ```js
  editor.addEventListener('state-machine-fan-out', (event) => {
    location.href = '/admin/machines/' + event.detail.childMachine + '/';
  });
  ```

  `editor.followFanOut(stateId)` does the same from code, and returns `false` when the state
  names no machine. The child machine stays editable from the card's properties button.

- **A short dashed stub is drawn leaving a waiting card**, so the fan-out reads as a direction
  and not only as text. It points at empty space on purpose — the machine it leads to is not on
  this canvas — and is drawn in the accent colour rather than the edge colour, so it never reads
  as a transition that has lost its target. There is no stub where no child machine is named.
  Inline subgraph expansion and drill-in breadcrumbs are deliberately out of scope.

- New `fanOut` icon (`↗`).

- **Inline validation stripes.** The backend already refuses these at publish time; the stripes
  say *where*, on the card that has the problem, while the person who caused it is still looking
  at it:

  | Where | Stripe |
  | --- | --- |
  | A decision card with no unguarded row | no fallback — if every guard fails the record is stuck here |
  | A waiting state with no edge under its `join_action` | nothing leaves this state when the work finishes |
  | A terminal state with an outgoing edge | terminal states cannot be left, so these edges never fire |
  | A guard the host's `guardValidator` refuses | the guard's own error, on the card and on the decision row |

  They are **advisory**: nothing here blocks an edit, refuses a document or rewrites anything, and
  a graph is allowed to be halfway built.

- Guard verdicts are cached by the expression itself, so a canvas full of cards asks the
  `guardValidator` once per distinct guard rather than once per card per frame. A validator that
  throws says nothing rather than putting its own crash on a card. Assigning a new validator
  clears the cache.

- New pure helpers `stateIssues(machine, state)` and `decisionIssues(group)`, a new `issue`
  string group, and a `warning` icon (`⚠`).

  A stripe on a state card keeps clear of the toggles under it: hard against them it read like one
  more thing to press rather than a note about the card.

### Changed

- **The creation button moved out of the toggles row onto a line of its own**, and says what it
  does: `+ New record starts here` rather than `+ Creation`. Three toggles fill that line, and a
  fourth control squeezed in beside them elided every label to a couple of letters. Adding an edge
  is not one more thing the state *is*, either — on its own row it has the room for a sentence.
  `state.creationAdd` carries the new wording; the class name `node__create` is unchanged.

- **The role toggles wrap instead of clipping.** A pill is never squeezed below the width of the
  word inside it, so a translated set with a long word for *Waiting* pushes it onto a second line
  rather than showing `Wait…`.

- **`state.data` is no longer entirely opaque.** The component now owns four keys inside it —
  and nothing else. Edits to them arrive as a new `state-data` change, and `updateState` takes a
  `data` patch.

- `PropertiesDraft` gained a `waiting` field. `emptyPropertiesDraft()` fills it in, so a host
  building a draft from that helper needs no change; one building the object literally does.

- The properties dialog asks the `ActionProvider` **once** per opening, however many pickers the
  panel holds.

- `labelOffset` is stored per edge, and a decision has one card. The card sits at the **mean** of
  the points its members' edges would each put a card at, plus the mean of their offsets, and
  dragging it writes one offset back to every member. A host reconciling the document back into
  rows should expect every edge of a decision to carry the same `labelOffset`; a member that later
  leaves the group therefore starts out where the card it belonged to was standing.

  It is a mean rather than the first member's answer because **the position must not depend on the
  order of the members**. The rows are dragged to reorder them, and anchoring on whichever edge
  happened to be first sent the card leaping across the canvas the moment that changed. A mean is
  symmetric, so no reordering can move it, and it lands in the middle of the fan instead of on one
  arm of it. A group of one reduces to exactly that member, so a lone edge card is unaffected.

- Every edge of a decision is bent through the single card they share, so the curves meet at it
  and fan out from there to the states they land on.

## [0.8.0] - 2026-09-01

### Added

- **Every word the editor says is the host's to replace**, through a `strings` property. There is
  no locale registry and no dependency added: picking a language is the host's job, exactly as
  picking a theme is, and a page that speaks another one hands down its own set from whatever
  translation machinery it already runs.

  Strings are grouped by where they belong, and a partial set replaces only what it names — in the
  group it names, and in every group it does not:

  ```ts
  editor.strings = {
    toolbar: { addState: 'Adicionar estado' },
    state: { remove: 'Remover estado' },
  };
  editor.strings.toolbar.paste; // 'Paste' — still English
  editor.strings.dialog.save; // 'Save' — a group left alone keeps all of it
  ```

  Reading `strings` back gives the whole set with the defaults filled in; assigning `undefined`
  puts them all back. A key a group does not have is ignored, so a translation file that has
  fallen behind the package cannot smuggle anything into the set.

- **A string that never varies is a string; one that takes values is a function.** There is
  deliberately no `{placeholder}` syntax — it would be a second language to learn and a second
  thing to escape, and it could not express what the sentences below need anyway. The parameters
  are named and typed, so an editor completes them and the compiler catches a misspelling:

  ```ts
  editor.strings = {
    properties: { orderReadout: ({ index, total }) => `${index} de ${total}` },
    state: { creationLabel: ({ name }) => `Adicionar uma transição de criação para “${name}”` },
  };
  ```

  That is what makes real plural rules possible. Polish and Russian need three forms and Arabic
  six, and no template syntax without a library behind it is going to choose between them; a
  function hands the decision to the host's own `Intl.PluralRules`, or to the i18n library it
  already has:

  ```ts
  const plural = new Intl.PluralRules('ru');
  const FORMS = { one: 'элемент', few: 'элемента', many: 'элементов', other: 'элементов' };

  editor.strings = {
    json: { itemCount: ({ count }) => `${count} ${FORMS[plural.select(count)]}` },
  };
  ```

  It is also what keeps word order out of the component's hands. Nothing is built by gluing a verb
  to a noun, because where the verb goes is the sentence's business — English puts it first,
  Japanese last:

  ```ts
  editor.strings = {
    toolbar: { undoChange: ({ change }) => `${change} を元に戻す` },
    change: { 'state-add': '状態の追加' },
  };
  // aria-label: 状態の追加 を元に戻す
  ```

  The same reasoning decides where a branch lives. A row's parameters toggle receives `expanded`
  as a boolean rather than being two keys the component has already chosen between, the parameters
  badge receives `count: 0` rather than having an empty variant of its own, and a name's quotation
  marks belong to `source.state` rather than to the component.

- **Twenty-four groups**, listed by `STRING_GROUPS`, with the English in `DEFAULT_STRINGS` —
  the practical starting point for a translation. `toolbar`, `canvas`, `kind`, `card`, `state`,
  `color`, `rename`, `transition`, `startNode`, `source`, `chip`, `phase`, `trigger`,
  `triggerVerb`, `sideEffect`, `sideEffects`, `row`, `params`, `properties`, `change`, `dialog`,
  `organize`, `json` and `seed`. Five of them — `change`, `color`, `phase`, `trigger` and `kind` —
  are keyed by the model's own values, so `strings.change[change.kind]` is a direct lookup rather
  than a name to map through.

  Within a group a string is named after what it means rather than where it sits, so replacing one
  covers every place it is drawn: one `card.toolsLabel` names the tool rail above a state card and
  above an edge card alike.

  Strings can be set at any time. The toolbar is relabelled where it stands, the cards are rebuilt
  — a one-time cost at setup — and the dialogs are handed the new set as they open. Each dialog
  also takes a `strings` property of its own, for a host driving one directly.

- **Four strings that write into the machine**, in a group of their own and marked as such. The
  `seed` group holds the names new elements are born with — `stateName`, `transitionName`,
  `creationName` and `copySuffix` — and those are saved into the machine the host round-trips, not
  merely drawn over it. Translating them translates the data, which is usually what a localized
  editor wants:

  ```ts
  editor.strings = { seed: { stateName: ({ index }) => `Estado ${index}` } };
  editor.addState().name; // 'Estado 1'
  ```

  A host whose backend keys off the name `create` for creation transitions should leave
  `seed.creationName` alone.

- `mergeStrings`, `isStringGroup`, `DEFAULT_STRINGS` and `STRING_GROUPS`, with the
  `EditorStrings`, `StringOverrides`, `GroupOverrides`, `StringGroup` and `ElementKind` types.

- `parseParamsText` takes the three messages it can produce, so the JSON parameters tab reports a
  malformed value in the host's language. `DEFAULT_JSON_TEXT_MESSAGES` holds the English and the
  `JsonTextMessages` type describes the shape. `JSON.parse`'s own syntax errors are passed through
  untouched: they name the position the text broke at, which is the useful part, and translating
  them is the runtime's job.

- `copyName` takes the suffix to append, so a pasted copy is named in the host's language. The
  suffix already on a name is still replaced rather than stacked, and any characters `RegExp`
  reads as syntax are escaped, so a suffix can be any words at all. `COPY_SUFFIX` holds the
  English default.

- The label helpers all take an optional trailing `EditorStrings`, so a host rendering its own
  panel beside the canvas can describe an element in the same words the editor uses:
  `describeSideEffectList`, `describeElement`, `describeSource`, `shortHookLabel`,
  `formatSideEffectHead`, `formatSideEffectSummary`, `formatSideEffectTitle` and
  `formatParamsBadge`. Left out, every one of them stays in English exactly as before.

- `SideEffectListLabels` and `DEFAULT_ADD_PLACEHOLDER` are now exported.

### Changed

- **`historyLabel` takes `'undo' | 'redo'` where it used to take `'Undo' | 'Redo'`.** It used to
  build `Undo add state` by lowercasing the first character of the change and appending it to the
  verb, which is an English trick: German capitalizes nouns, and the word order is wrong in
  Japanese. The verb is now a string of its own and the change is handed to a function, so both
  are the translation's to place. Callers pass the lowercase form:

  ```ts
  historyLabel('undo', pendingUndo(history));
  ```

  The English output is unchanged, so a host that only renders the result needs no other edit.

- The literals the editor used to draw are gone from the components and live in `DEFAULT_STRINGS`.
  `EMPTY_SIDE_EFFECTS_LABEL`, `DISABLED_MARKER` and `START_NODE_LABEL` still export the same
  English they always did, and remain the values the helpers fall back to.

- Validation issues from `parseStateMachine` stay in English on purpose. They describe the host's
  own payload and name its field paths — `machine.states[0].name must be a non-empty string` —
  which makes them diagnostics for whoever wrote that payload rather than copy for whoever is
  looking at the canvas.

## [0.7.0] - 2026-08-31

### Added

- **A theme the host picks.** The editor renders dark or light on demand, through a `theme`
  attribute and the matching property:

  ```html
  <state-machine-editor theme="light"></state-machine-editor>
  ```

  It is `dark` when nothing says otherwise, and a value the element does not recognize —
  `theme="system"`, say — renders as that default while staying in the DOM as written, the way an
  unknown `type` on an `<input>` does. The property reflects to the attribute, which is what the
  CSS keys off, so a host can read the scheme back off the element it set.

- **A toolbar button that switches it.** **☀** / **☾**, at the end of the row, named after the
  scheme the press moves *to*. It stays enabled while the editor is read-only: looking is not
  editing. `toggleTheme(): 'dark' | 'light'` is the same switch from code, and returns the scheme
  it moved to.

- `state-machine-theme-change`, carrying `{ theme }`. Without it a host has no way to hear about a
  choice the user made inside the component, so a picker of its own would drift out of step with
  the toolbar. It fires on a real change only — assigning the scheme already in force stays quiet.

- The three dialogs each take a `theme` attribute of their own. They carry shadow roots the
  editor's `:host` tokens cannot reach by inheritance, so the editor hands its scheme down as it
  opens them; the attribute is there for a host driving a dialog on its own.

- **Every icon is the host's to replace**, through an `icons` property. A partial set replaces only
  what it names and leaves the rest at their defaults, so swapping one glyph does not mean
  restating the other eighteen:

  ```ts
  editor.icons = { rename: '📝', remove: '🗑' };
  editor.icons.properties; // '⚙' — still the default
  ```

  An icon is a string, drawn as plain text; a DOM node the host builds — an `<svg>`, an `<img>` —
  copied for each button that carries it; or a function returning a fresh one per button. Strings
  are never parsed as markup: an icon set is often data from somewhere else, and that somewhere
  else does not get to run scripts on the page. Reading `icons` back gives the whole set with the
  defaults filled in; assigning `undefined` puts them all back.

  The nineteen names are `undo`, `redo`, `zoomOut`, `zoomIn`, `lightTheme`, `darkTheme`, `rename`,
  `properties`, `remove`, `confirm`, `cancel`, `link`, `initial`, `final`, `add`, `dragHandle`,
  `params`, `moveUp` and `moveDown` — named after what they mean rather than where they sit, so one
  `remove` covers the cards, the side effect rows and the JSON parameter fields alike. An icon that
  leads a label keeps it: replacing `initial` turns `▶ Initial` into `→ Initial`, it does not lose
  the word, and accessible names and tooltips never depended on the glyph in the first place.

  Icons can be set at any time. The toolbar is built in the constructor, long before a host gets to
  assign anything, and the cards outlive every render — so nothing is rebuilt: each icon is redrawn
  where it stands, and the dialogs are handed the new set as they open. The side effects and
  properties dialogs take an `icons` property of their own, for a host driving one directly.

- Every icon sits in a `part="icon"` span, so a replaced set can be sized or coloured from outside
  the shadow root: `state-machine-editor::part(icon) { … }`. The one marker that is not an icon —
  the `{ }` a canvas chip shows when its list carries parameters — is drawn in CSS, which can hold
  text and nothing else, and follows a new `--sme-params-marker` custom property.

### Changed

- **The editor no longer follows `prefers-color-scheme`.** It used to flip with the operating
  system's setting; the palette is now the host's `theme` alone, and dark unless the host says
  otherwise. It is a component inside someone else's page, and a page that is light all the way
  through has no use for a canvas that turns dark on its own — that is the embedding page's call to
  make, not the operating system's.

  A host that wants the old behaviour asks for it:

  ```ts
  const media = matchMedia('(prefers-color-scheme: dark)');
  const follow = () => {
    editor.theme = media.matches ? 'dark' : 'light';
  };
  follow();
  media.addEventListener('change', follow);
  ```

  Hosts already overriding the custom properties are unaffected: an override set on the element
  still wins in both schemes. To keep a different one per scheme, key it off the same attribute the
  component does — `state-machine-editor[theme='light'] { … }`.

## [0.6.0] - 2026-08-31

### Added

- **Organize asks before it runs.** The toolbar's **Organize** now opens a confirmation: it replaces
  every position on the canvas at once, including the ones placed by hand, and that is not an
  arrangement anybody can reconstruct from memory. A single undo still puts it back. Cancel, Escape
  and a press on the backdrop are all a no, and focus opens on **Cancel** so the button that moves
  everything is pressed on purpose.

  `organize()` is unchanged and asks nothing — a host calling it has its own reason to. The new
  `confirmOrganize(): Promise<boolean>` is what the button does: ask, organize, fit the view.

- `ConfirmDialogElement` (`<state-machine-confirm-dialog>`), registered alongside the other two by
  `defineStateMachineEditor` and exported for a host that wants the same question elsewhere.

- `LayoutOptions.nodeSizes`: the size of individual cards, keyed by state id, for the ones that do
  not render at `nodeSize`.

### Changed

- **The automatic layout leaves room.** Cards used to land close enough together to read as one
  crowded block. A gap is now a whole transition card plus a margin on either side of it in *both*
  directions — across, that is the card sitting on the edge between two columns; down, it is the one
  an edge that skips a column, or a self loop, is nudged into. Disconnected sub-graphs clear each
  other by more than they used to as well.

- **Every card is measured on its own.** A state carrying a list of side effects renders several
  times the height of a bare one, and the layout pitched every row on a single measurement — so the
  tall cards ended up nearly touching what sat under them. Rows are now stacked by each card's own
  height, and columns spread by the widest card in them.

- **A machine that arrives without positions is laid out after its first render** rather than before
  it, so that pass measures the real cards instead of falling back to an assumed size. Both passes
  happen in one turn, so the pile on the origin is still never painted.

- A card nudged clear of another one now keeps a wider gap from it (28 px, was 12), so a card that
  had to move reads as having been given room rather than as having just missed.

## [0.5.0] - 2026-08-30

### Added

- **Automatic layout.** A new **Organize** button in the toolbar, and an `organize()` method behind
  it, arrange every card into a readable graph: columns from left to right, one per step away from
  where a record enters the machine, with the states inside a column ordered so the edges between
  them cross as little as possible. It is the layered (Sugiyama) shape, minus the parts a canvas
  this size does not need.

  Column 0 holds the states a record can enter at — the ones a creation edge targets, or, with
  none, the ones in `initialStateIds`, or, with neither, the ones nothing transitions into. Every
  other state sits as many columns along as it is transitions from the nearest of those. That is a
  breadth-first distance rather than a longest path: a cycle is normal in a state machine, and a
  longest path is only defined on a graph without one, so a machine that is one closed cycle is
  laid out from its first state instead of not being laid out at all. Self transitions and creation
  edges take no part in the ranking — a self loop says nothing about which column its state belongs
  in, and the start bar is placed rather than laid out.

  Rows come from a handful of barycentre sweeps, the classic crossing-reduction heuristic. Columns
  are centred on the tallest one, so a graph that widens and narrows again reads as a spine rather
  than as a staircase, and sub-graphs sharing no transition are laid out separately and stacked, so
  an island never lands in the middle of the graph it has nothing to do with. Columns are spread by
  a whole transition card's width plus a margin — both measured from the DOM rather than assumed —
  so the cards between two columns have room to be read.

  Transition cards go back to automatic placement and are then nudged off each other, the same
  search a brand new card goes through. A card the user dragged is deliberately not kept: its offset
  is relative to an edge that has just been redrawn somewhere else, so keeping it would scatter the
  very cards the command is meant to tidy. The toolbar button fits the view afterwards; `organize()`
  does not, so a host can organize without taking the user's viewport away from them.

- **A machine with no layout is organized on arrival.** Assigning a `value` whose states all sit on
  the origin — a graph authored anywhere but this editor: a backend that never stored coordinates, a
  fixture written by hand — lays it out before it is ever drawn, instead of rendering it as one pile
  of cards.

  That pass is the one time assigning `value` emits `state-machine-change`. The positions are the
  editor's own work rather than the host's, and without the event they would be recomputed on every
  load and never stored. It carries the new `{ kind: 'layout' }` and is not an undo step — the state
  before it is the pile it just took apart. A host echoing the value back gets no second pass, since
  the cards are no longer on the origin.

- `src/geometry/layout.ts`: `layoutPositions`, `organizeMachine` and `isUnpositioned` — pure,
  DOM-free (the caller measures the cards and hands the sizes in) and exported, so a host can draw
  the same arrangement somewhere the component is not.

### Changed

- A state's `position` is now **optional** in the parsed input. A backend that only models states
  and transitions has no coordinates to send, and rejecting it forced every host to invent some. A
  missing position reads as `{ x: 0, y: 0 }`, which is exactly what the automatic layout looks for.
  A position that is present and malformed is still an error.
- `MachineChange` gains the `layout` kind. `describeChange` names it *Organize layout*, so the undo
  button reads *Undo organize layout* like every other step.

## [0.4.0] - 2026-08-24

### Added

- **Copy and paste** for a state or a transition, from the toolbar's new **Copy** / **Paste**
  buttons, from `Ctrl`/`⌘` + `C` and `Ctrl`/`⌘` + `V`, and from the new `copySelection()`,
  `copy(ref)` and `paste()` methods. `paste()` returns the `{ kind, id }` of what it made, or `null`
  when there was nothing to paste. Both buttons are named after what they hold — *Copy transition*,
  *Paste state*.

  The clipboard is the editor's own buffer rather than the system one, exposed as the assignable
  `clipboard` property so a copy can move between two editors on the page or be seeded from storage.
  It holds the element itself rather than a copy of it — the model is deeply readonly, so an entry
  cannot drift once taken — and the copying proper happens on paste, the only moment that knows what
  to call the result and where to put it.

  A paste makes a genuinely new element: fresh ids for it and for every side effect attached to it
  (the attachment id names *that* attachment, not the catalog definition behind it, which the copy
  still points at), a name marked as a copy and made unique — `Draft copy`, then `Draft copy 2`,
  with a suffix already there replaced rather than stacked — and everything else carried across,
  the host's own `data` included. A pasted state lands a step off the original and then clear of
  every card already on the canvas; a pasted transition keeps both endpoints and has its card placed
  the way a new edge's is.

  A copied state does **not** bring the initial/final roles along: those lists belong to the machine
  rather than to the card, and a paste should not quietly give the machine a second entry point.

  A paste is one `state-add` or `transition-add` and one undo step; copying changes nothing and
  records nothing. Copy works in read-only mode, where the paste that would put it back does not,
  and pasting a transition whose endpoints have since been removed is refused rather than guessed at.
- A **count badge** on a side effect chip that holds more than one, floating on the chip's leading
  edge in the gutter beside the hook's label. A chip is one line as wide as the card allows, and the
  written *“and 2 more”* it used to end with was the first thing the elision took — exactly the part
  saying the list is longer than it looks. Floating the number puts it where nothing can push it
  off, and costs the name no width: the chip now shows the first side effect's name alone, with the
  full width to show it in. One side effect gets no badge, since its name is the whole story.

  Like the `{ }` parameters marker it sits beside, the badge is a CSS pseudo-element fed by the
  chip's `data-count`, so it never enters the chip's text; both numbers already reach assistive
  technology through the chip's `aria-label`.
- `src/model/clipboard.ts`: `copyElement`, `canPaste`, `duplicateState`, `duplicateTransition` and
  `copyName` — pure, testable without a DOM, and exported. `uniqueName` and `uniqueStateName` join
  `uniqueTransitionName` in `src/model/machine.ts`.

- **Undo and redo**, from the toolbar's new **↶** / **↷** buttons, from `Ctrl`/`⌘` + `Z` and
  `Ctrl`/`⌘` + `Shift` + `Z` (`Ctrl` + `Y` redoes too, where Windows apps put it), and from the new
  `undo()` / `redo()` methods. `canUndo` and `canRedo` report whether there is a step to take, and
  each button is named after the step it would take — *Undo move state* — through the existing
  `describeChange`.

  A step is one thing the user did rather than one event the host saw: the transient frames of a
  drag record nothing and the gesture folds into the single step its final commit records, and one
  properties dialog save is one step however many fields it touched, even though it still emits one
  `state-machine-change` per field. Taking a step emits one non-transient change of kind `replace`,
  since the whole machine is swapped and no narrower kind would be honest.

  The last 100 steps are kept as whole machine snapshots — every model helper already returns a new
  machine that shares everything it did not touch, so a step costs a reference rather than a copy,
  and no inverse has to be written, or kept correct, per change kind.
- `clearHistory()`, for hosts that own their own history or that treat the machine in place as a
  freshly loaded document.
- `src/model/history.ts`: `createHistory`, `recordHistory`, `undoHistory`, `redoHistory`, `canUndo`,
  `canRedo`, `pendingUndo`, `pendingRedo` and `HISTORY_LIMIT` — pure, testable without a DOM, and
  exported for hosts that want the same stack over their own state. `historyLabel` joins them in
  `src/ui/labels.ts`.

### Changed

- A card's tools — colour, rename, properties and remove on a state, rename, properties and remove
  on a transition — moved out of the card header into a **rail that floats above the card**. Four
  hit targets sharing a 248 px line with the name left the name a couple of characters before it
  ellipsised; the header is now the name alone. The rail is out of flow, so it costs no width, and
  it appears on hover, while the card is selected — which is what a tap gives touch — and whenever
  it holds focus, so it is still reachable by keyboard. Whatever is on screen can be clicked: the
  rail bridges the gap between itself and the card so the pointer never crosses dead ground on the
  way up, and it lingers for a moment after the pointer leaves rather than vanishing out from under
  it. It stands down for the length of an inline
  rename, whose editor carries its own save and cancel. The buttons keep their class names and the
  rail is exposed as the `card-actions` shadow part.
- Assigning `value` a **different** machine now clears the undo history with it: the document has
  been replaced, and there is nothing sensible left for undo to put back. Assigning the machine
  already in place — what a host echoing `state-machine-change` back does — leaves the history
  alone, so undo survives the React-style round trip.
- A chip's label moved into a `.chip__label` child, and the chip itself no longer clips its own
  overflow — the elision belongs to the name, and the badge hanging off the leading edge would have
  been cut off by it. `formatSideEffectHead` joins `formatSideEffectSummary` in
  `src/ui/side-effect-summary.ts`: the chips show the head, and the *“and 2 more”* summary stays
  exported unchanged for hosts rendering their own, in prose, where there is room for the sentence.
- Keyboard shortcuts on the canvas (`Delete`, `F2`, `Enter`, and now the history and clipboard
  pairs) are ignored while a dialog is open. A dialog is a modal of its own, so a key pressed inside
  it never reaches the canvas behind it.
- The toolbar wraps rather than running off the edge of the canvas. It carries nine controls now,
  which is more than a phone's width holds.

### Fixed

- An inline name edit now ends only where the user ends it. Losing focus used to save the pending
  text, which meant a click on the cancel button — or anywhere else on the canvas — renamed behind
  the user's back; the editor now stays open with whatever has been typed until Enter or the save
  button commits it, or Escape or the cancel button discards it. Starting a rename elsewhere leaves
  the first editor open instead of throwing it away, so several names can be in flight at once, and
  reopening an editor that is already open just returns the caret to it rather than resetting the
  text. Closing an editor also restores every part of the card it stood in for: the properties
  button used to stay hidden after a cancelled rename, since only a commit re-render brought it
  back.

## [0.3.0] - 2026-08-24

### Added

- New transitions and new states are placed into **free space**. Both used to appear wherever the
  geometry happened to put them: a new card on top of whatever already sat at that midpoint, and a
  new state 24 px down and right of the last, which stacked them almost on top of each other and
  drifted off screen. Both now step out to the nearest spot that covers nothing — vertically first
  for cards, since they are far wider than tall — and give up rather than wander so far that the
  label stops reading as part of its own edge. A spot that is already free is used untouched, so
  nothing gains a `labelOffset` it does not need. The placement is resolved before the machine is
  committed, so a host still sees a single `transition-add` rather than an add followed by a
  correcting move.
- The start bar is labelled **Create** down its length, so the shape does not have to be guessed at,
  and never shrinks below the height that label needs.
- Pure helpers, all testable without a DOM: `orderCreationAnchors` and `creationAnchorPoint` in
  `src/geometry/edge.ts`, and `findFreeLabelSpot`, `boxAround` and `rectsOverlap` in the new
  `src/geometry/placement.ts`.

### Changed

- The start pseudostate is drawn as a slim vertical **bar** rather than a dot, and reserves a 38 px
  slot per creation edge, so it grows with them. A dot made every creation edge leave from the same
  point, so their lines emerged on top of one another and crossed; the bar gives each edge an anchor
  of its own with real space between neighbours.
- Creation edges take their slot **in the order they are heading**, top to bottom. Two edges leaving
  a common vertical line cross exactly when one starts above the other and ends below it, so that
  order removes every crossing the layout is free to remove; edges heading for the same place cannot
  be separated by any ordering and keep relying on the existing fan.

  The key is the height of each edge's own **card**, not of its target state, because the edge is
  bent to pass through its card — the card is what the line actually heads for, and ordering by the
  target alone left crossings in place as soon as anyone moved a label. It is measured from a
  neutral point on the bar so the ordering never depends on the slots it is choosing, which is what
  keeps it from feeding back on itself mid-drag. Recomputed on every render, so moving either a card
  or a state reshuffles the slots under it. All of this is purely visual: the evaluation order of
  the edges is still their position in `machine.transitions`, and reordering them there moves no
  lines.
- The gap between the bar and the state it feeds is derived from the measured transition card and
  node widths, so a whole card plus a margin always fits between the two — and a coarse pointer,
  where both grow, moves the bar out with them. A card does not land half way along its edge, since
  the control point pulls it towards the target, so the gap solves for where the card actually ends
  up rather than assuming the midpoint.
- The demo machine is laid out on a regular grid — 620 px between columns, 520 px between rows —
  which leaves one clear card's width between any two state cards. Its labels no longer sit on the
  nodes or on each other.

### Fixed

- The start bar's **→** handle covered the **Create** label instead of hanging below the bar.
  `.node__link` is declared later in the same stylesheet at equal specificity, so its `top`/`right`
  won the cascade and, with `bottom`/`left` also set, the over-constrained box resolved back inside
  the bar. The handle is now scoped to two classes so source order cannot decide it.

## [0.2.0] - 2026-08-24

### Added

- Transitions carry first-class attributes: a `trigger` (`{ id, name } | null` — the event that
  fires the edge, distinct from `name`, which is its identity, since several edges can share a
  trigger and be told apart by their guards), an opaque `guard` expression, an opaque
  `requiredPermission`, and a `description`. States gained a `description` too. All of them are
  edited from a properties dialog behind the new **⚙** button on each card, or programmatically
  with `openProperties(ref)`. The component never parses, evaluates or interprets a guard or a
  permission: those languages belong to the host.
- `actionProvider` and `guardValidator`, injected alongside the existing `sideEffectProvider`. The
  first supplies the catalog the trigger is picked from (validated by `parseActionDefinitions`);
  without it the trigger is a free text field. The second checks a guard on every edit and its
  errors render inline; without it, guards are never validated.
- Ordering for the edges leaving a state, exposed as **↑** / **↓** in a transition's properties
  dialog and as `outgoingTransitions` / `moveTransition` on the model. There is deliberately no
  numeric priority field: the order *is* the position in the `transitions` array among siblings,
  so there is nothing to keep in sync. Moving one keeps every other relative order intact.
- Per-attachment metadata on side effects: `enabled` (defaulting to `true`) and `description`,
  edited from a checkbox and a note field on each row of the dialog. A disabled side effect stays
  attached, ordered and configured — it just does not run, so flipping it back loses nothing. The
  canvas chip counts it and marks it (`sendEmail (off)`, `— disabled` in the tooltip) rather than
  hiding it, because a chip that disagrees with the dialog listing it is the harder bug to notice.
- Creation transitions: `Transition.from` may now be `null`, meaning the edge that takes a brand
  new record into an initial state, with its own name, trigger, guard, required permission and
  side effects. They render from a single **start pseudo-node** — the UML initial pseudostate, a
  small filled dot — so every card still sits on an edge with a real source and a real target and
  the geometry layer needs no null-source special case. The node is placed deterministically
  rather than persisted, appears with the first creation edge and disappears with the last, and is
  never a state: no name, colour, roles or selection. Create the first from **+ Creation** on an
  initial state's card, and the rest by dragging the node's **→** handle. The initial flag and the
  edges stay independent in both directions, and the left-border entry arrow is suppressed on a
  state that has a creation edge, since the edges already spell out how it starts.
- `data: JsonObject` on `StateMachine`, `StateNode`, `Transition` and `SideEffect`: an escape
  hatch for attributes this component does not model. `parseStateMachine` whitelists keys and
  rebuilds every object, so anything a host attached was previously discarded on the first
  `state-machine-change` — the motivating case being a Django backend carrying a "defer this side
  effect until the surrounding transaction commits" flag. The component never reads, interprets,
  validates the shape of, or renders it; there is no UI and no new `MachineChange` kind, since a
  host mutating it assigns `value`, which already emits nothing.
- New `MachineChange` kinds so hosts can react granularly: `transition-trigger`,
  `transition-guard`, `transition-permission`, `transition-reorder` and `description`. Saving the
  properties dialog emits one event per field that actually changed.
- New `vinta-state-machine-editor/bundled` export: the same element registration as `./register`,
  built as a single self-contained ES module with every dependency inlined. It resolves no bare
  specifiers and needs no import map, so a host that serves JavaScript verbatim out of a static
  directory — the Django admin, Rails' `public/`, a plain nginx root — can load it straight from
  `<script type="module">`. Such a host previously loaded the component fine and then threw
  `Failed to resolve module specifier "@codemirror/commands"` the moment someone opened a side
  effect's JSON tab, because the CodeMirror imports survive into `dist/` as bare specifiers. Copy
  `dist/bundled.js` and nothing else: the chunk the JSON tab normally fetches on first open is
  flattened in, so opening it issues no request at all. See
  [No build step](README.md#no-build-step).
- `npm run verify:bundled`, run by CI and by `prepublishOnly`, which re-reads the built file and
  fails if a bare specifier or a second chunk ever comes back. That breakage is invisible until it
  reaches a host, so it is asserted at build time rather than discovered in production.

### Changed

- Every new field defaults when absent, so documents written against 0.1.0 keep parsing:
  `description`, `guard` and `requiredPermission` to `''`, `trigger` to `null`, `enabled` to
  `true`, and `data` to `{}`. A field that *is* present with the wrong type is a validation error
  rather than a silent fallback, and `from` accepts only `null` for a creation edge — never an
  empty string, never a missing key.
- The transition card keeps the **name** as its headline and hangs the trigger and guard on a
  second line. The trigger is what a user fires and was the tempting choice for the headline, but
  that line is also the target of the existing inline rename gesture, the trigger is nullable, and
  it does not identify the card — so the line you double-click stays the line you rename.
- `npm run build` is now two steps: `tsc` emits the module graph, then `vite.bundled.config.ts`
  adds `dist/bundled.js` beside it. Different entry, different filenames, so neither overwrites the
  other — the `.` and `./register` exports are unchanged, and bundler consumers keep the
  tree-shakeable build where CodeMirror stays in its own lazily fetched chunk. The new export
  trades that split away: its 416.1 kB (130.6 kB gzipped) is eager, paid on every load even by
  sessions that never open a JSON tab, because a single file cannot be half-deployed by a host
  that has no way to know a second one exists.

### Fixed

- Assigning `value` no longer drops the current `selection`. The selection is kept whenever the
  selected id still names a state (or transition) in the new machine, so a host that renders its
  own inspector panel beside the canvas can write edits back to `value` without the panel closing
  under the user on every keystroke. A selection whose element is gone from the new machine still
  becomes `null`, and only that drop emits `state-machine-selection-change`; assigning `value`
  continues to not emit `state-machine-change`.

## [0.1.0] - 2026-08-24

Initial release.

[Unreleased]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vintasoftware/vinta-state-machine-editor/releases/tag/v0.1.0
