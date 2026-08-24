# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vintasoftware/vinta-state-machine-editor/releases/tag/v0.1.0
