# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

- `npm run build` is now two steps: `tsc` emits the module graph, then `vite.bundled.config.ts`
  adds `dist/bundled.js` beside it. Different entry, different filenames, so neither overwrites the
  other — the `.` and `./register` exports are unchanged, and bundler consumers keep the
  tree-shakeable build where CodeMirror stays in its own lazily fetched chunk. The new export
  trades that split away: its 408.1 kB (130.7 kB gzipped) is eager, paid on every load even by
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

[Unreleased]: https://github.com/vintasoftware/vinta-state-machine-editor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/vintasoftware/vinta-state-machine-editor/releases/tag/v0.1.0
