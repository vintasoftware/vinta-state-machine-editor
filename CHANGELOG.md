# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vintasoftware/vinta-state-machine-editor/releases/tag/v0.1.0
