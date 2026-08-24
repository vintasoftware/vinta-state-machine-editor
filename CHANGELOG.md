# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
