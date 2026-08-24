# vinta-state-machine-editor

A framework-agnostic **Web Component** to create, edit and visualize state machines on a
pan/zoom canvas — including the ordered side effects that run around states and transitions.

- Plain custom element (`<state-machine-editor>`) — works with React, Vue, Angular, Svelte or no framework at all.
- **One runtime dependency.** The graph itself is hand-written — Shadow DOM, HTML nodes and SVG
  edges, no canvas bitmap; [CodeMirror 6](https://codemirror.net) backs the JSON parameters editor.
- Strict TypeScript: no `any`, no type assertions, no non-null assertions — enforced by lint **and** a test that scans `src/`.
- Side effects are ordered lists; the UI collapses them to `"sendEmail and 2 more"` and opens a dialog for the full list.

```bash
npm install vinta-state-machine-editor
```

## Quick start

```html
<state-machine-editor id="editor" style="height: 600px"></state-machine-editor>

<script type="module">
  import 'vinta-state-machine-editor/register';

  const editor = document.querySelector('#editor');

  // Catalog of side effects the user can attach — injected, so auth/fetching stays yours.
  editor.sideEffectProvider = async () => {
    const response = await fetch('/api/side-effects');
    return response.json(); // [{ id, name, description? }]
  };

  editor.value = {
    states: [
      {
        id: 'draft',
        name: 'Draft',
        position: { x: 80, y: 120 },
        onEnter: { before: [], after: [] },
        onLeave: { before: [], after: [] },
      },
      {
        id: 'paid',
        name: 'Paid',
        position: { x: 520, y: 120 },
        onEnter: { before: [], after: [] },
        onLeave: { before: [], after: [] },
      },
    ],
    transitions: [
      { id: 'pay', name: 'pay', from: 'draft', to: 'paid', effects: { before: [], after: [] } },
    ],
  };

  editor.addEventListener('state-machine-change', (event) => {
    if (event.detail.transient) return; // mid-drag frame, wait for the committed change
    save(event.detail.value);
  });
</script>
```

`import 'vinta-state-machine-editor/register'` defines the elements for you. To choose the tag
name yourself, import `defineStateMachineEditor` from the package root instead:

```js
import { defineStateMachineEditor } from 'vinta-state-machine-editor';

defineStateMachineEditor('order-flow-editor');
```

## Interactions

| Action | Gesture |
| --- | --- |
| Create a state | **Add state** in the toolbar, or `editor.addState()` |
| Move a state | Drag its header |
| Move a transition | Drag the transition card's header — the edge bends to keep passing through it. Drop it back on the edge to return to automatic placement |
| Create a transition | Drag the round **→** handle onto another state (drop it on the same state for a self transition) |
| Rename | Tap the **✎** button beside the name (or double-click the name, or press `F2` with it selected), then **✓** to save / **✕** to discard — `Enter` and `Escape` work too |
| Open a side effect list | Click any chip |
| Reorder side effects | Drag the **⠿** handle in the dialog, or focus it and press `Alt` + `↑`/`↓` |
| Edit side effect parameters | Press **{ }** on a row in the dialog, then use the nested form or the JSON tab |
| Colour a state | Press the round swatch in the card header and pick one of the six |
| Mark initial / final | Toggle **▶ Initial** / **◉ Final** at the bottom of a state card |
| Remove | Click **✕** on the card, or select it and press `Delete` |
| Pan | Drag the background, scroll, or move two fingers together |
| Zoom | Pinch (trackpad or touch), toolbar `−` / `+` / `Fit`, or `Ctrl`/`⌘` + scroll (20 % … 300 %) |

## Data model

Everything is plain JSON and deeply readonly — the component never mutates the object you pass in.

```ts
interface StateMachine {
  states: StateNode[];
  transitions: Transition[];
  initialStateIds: string[]; // states the machine can start in
  finalStateIds: string[]; // states that end the machine
}

interface StateNode {
  id: string;
  name: string;
  position: { x: number; y: number }; // world coordinates, unaffected by zoom
  onEnter: SideEffectHooks; // around entering the state
  onLeave: SideEffectHooks; // around leaving the state
  color: StateColor; // 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted'
}

interface Transition {
  id: string;
  name: string;
  from: string; // state id
  to: string; // state id
  labelOffset: { x: number; y: number }; // {0,0} = let the editor place it
  effects: SideEffectHooks; // around the transition itself
}

interface SideEffectHooks {
  before: SideEffect[]; // order matters and is preserved
  after: SideEffect[];
}

interface SideEffect {
  id: string; // id of this attachment
  definitionId: string; // id in the catalog
  name: string; // denormalized, so the graph renders without the catalog
  params: JsonObject; // arbitrary JSON handed to the side effect when it runs
}
```

Each state therefore owns four ordered lists (`enter · before`, `enter · after`, `leave · before`,
`leave · after`) and each transition owns two (`before`, `after`). Every list is addressed by a
`SideEffectListRef`:

```ts
{ kind: 'state', stateId: 'draft', trigger: 'enter' | 'leave', phase: 'before' | 'after' }
{ kind: 'transition', transitionId: 'pay', phase: 'before' | 'after' }
```

### Side effect parameters

Every attached side effect carries a `params` JSON object, editable two ways from the same panel:

- **Form** — a nested editor over the actual JSON. Each entry exposes its key, its type
  (`string`, `number`, `boolean`, `null`, `object`, `array`) and its value; objects and arrays
  recurse into indented rows of their own.
- **JSON** — the same value as text, syntax highlighted. It validates as you type, and refuses to
  switch back to the form while it does not parse, so a half-finished edit is never silently
  dropped.

The JSON tab is [CodeMirror 6](https://codemirror.net), configured for a small document: syntax
highlighting, bracket matching, auto indentation, undo history and inline parse errors from
`jsonParseLinter`. It is mounted with `root` set to the component's shadow root, so its stylesheet
lands there rather than in the host document, and its colours are CSS custom properties
(`--sme-code-key`, `--sme-code-string`, …) so it follows the light and dark themes without being
rebuilt. Programmatic fills are marked `addToHistory: false`, so undo only ever walks back the
user's own edits.

`JsonTextEditor` is intentionally absent from the package's main entry point: re-exporting it there
would make the import static again and pull CodeMirror into every bundle. Import it from
`vinta-state-machine-editor/dist/ui/json-text-editor.js` if you need it directly.

The catalog can prefill them: a definition with `defaultParams` seeds the parameters of every side
effect attached from it.

```js
editor.sideEffectProvider = async () => [
  { id: 'charge-card', name: 'chargeCard', defaultParams: { capture: true, retries: 3 } },
];
```

A chip on the canvas shows a small `{ }` marker when at least one side effect in its list has
parameters — the marker is a CSS pseudo-element, so it never enters the chip's text. The count
reaches assistive technology through the chip's `aria-label`, and hovering shows each side effect
with its parameters inline.

The helpers behind all of this are exported and pure, so hosts can reuse them: `setAtPath`,
`removeAtPath`, `renameKeyAtPath`, `appendEntry`, `coerceTo`, `jsonTypeOf`, `parseParamsText`,
`toJsonObject`, plus `setSideEffectParams` on the model.

### State colours

Each state carries a semantic colour, drawn as a bar across the top of its card and editable from
the round swatch in the card header:

```ts
type StateColor = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';
```

They are names, not hex values, so the palette follows the theme: each maps to a
`--sme-color-<name>` custom property with a light and a dark value, overridable from the host.

```css
state-machine-editor {
  --sme-color-success: #047857;
  --sme-color-danger: #b91c1c;
}
```

`editor.setStateColor('paid', 'success')` sets one programmatically, `setStateColor` does the same
on a plain machine, and changes arrive as `state-color`. States without a colour parse as
`neutral`; an unknown name is a validation error rather than a silent fallback.

### Initial and final states

Both are machine-level lists of state ids, so a machine can have several entry points, several end
states, and a state that is both. Marking is editable per state with the **▶ Initial** / **◉ Final**
toggles on each card; initial states get an entry arrow drawn into their left border and final
states a double outline, following the usual UML shorthand.

The lists are validated: an id must name a state that exists, and duplicates are rejected. Deleting
a state removes it from both lists.

```js
editor.toggleInitialState('draft');
editor.setFinalStates(['paid', 'cancelled']);
editor.value.initialStateIds; // ['draft']
```

Changes arrive as `initial-states-change` / `final-states-change`.

### Laying out transitions

Transitions between the same pair of states are fanned apart automatically, in both directions, so
they never stack on top of each other. The fan spacing follows the measured card height.

Dragging a transition card overrides that with a `labelOffset` relative to the automatic position —
relative, so the card keeps its arrangement when the states move. The edge is then reshaped to pass
through the card (`bendEdgeThrough` solves the Bézier control point for it), so a moved transition
never floats away from its own line. Dropping the card within 16 px of the automatic spot resets the
offset to `{ x: 0, y: 0 }`.

## Element API

### Properties

| Property | Type | Notes |
| --- | --- | --- |
| `value` | `StateMachine` | Setting it validates the input (throws `StateMachineError`) and re-renders. Setting it does **not** emit `state-machine-change`. |
| `sideEffectProvider` | `() => MaybePromise<SideEffectDefinition[]>` | Catalog used by the dialog. Called every time a dialog opens. |
| `readOnly` | `boolean` | Reflected to the `readonly` attribute. Chips still open the dialog, read-only. |
| `selection` | `{ kind: 'state' \| 'transition', id } \| null` | |
| `viewport` | `{ x, y, scale }` | Pan/zoom state; assignable to restore a saved view. |

### Methods

`addState({ name?, position? })`, `addTransition(from, to, name?)`, `renameSelection()`,
`zoomIn()`, `zoomOut()`, `setZoom(scale)`, `zoomToFit(padding?)`,
`openSideEffects(ref): Promise<boolean>`.

### Events

| Event | Detail |
| --- | --- |
| `state-machine-change` | `{ value, change, transient }` — `change` says what happened (`state-move`, `side-effects-change`, …); `transient: true` marks the intermediate frames of a drag. |
| `state-machine-selection-change` | `{ selection }` |

Both bubble and are `composed`, so they cross shadow boundaries.

### Pure helpers

The model layer is exported and framework-free, so hosts can build undo stacks, validation or
server-side rendering on top of it: `addState`, `updateState`, `removeState`, `addTransition`,
`updateTransition`, `removeTransition`, `getSideEffects`, `setSideEffects`, `addSideEffect`,
`removeSideEffect`, `moveSideEffect`, `parseStateMachine`, `assertStateMachine`, plus the geometry
helpers (`computeEdgeGeometry`, `fitViewport`, `zoomBy`, …).

## Framework usage

```jsx
// React 19+ (earlier versions need a ref to set object properties)
import 'vinta-state-machine-editor/register';

<state-machine-editor
  ref={(el) => { if (el) { el.value = machine; el.sideEffectProvider = fetchCatalog; } }}
  onstate-machine-change={(e) => setMachine(e.detail.value)}
/>
```

```html
<!-- Vue -->
<state-machine-editor
  :value.prop="machine"
  :sideEffectProvider.prop="fetchCatalog"
  @state-machine-change="onChange"
/>
```

For Angular, add `CUSTOM_ELEMENTS_SCHEMA` and bind with `[value]`/`(state-machine-change)`.

## Styling

The component ships a self-contained light/dark theme driven by CSS custom properties, all
overridable from the host:

```css
state-machine-editor {
  height: 100%;
  --sme-accent: #7c3aed;
  --sme-surface: #fff;
  --sme-canvas: #fafafa;
  --sme-node-width: 260px;
  --sme-radius: 12px;
}
```

Exposed shadow parts: `viewport`, `toolbar`, `state`, `transition`, `edge`, `chip`.

The canvas sets `touch-action: none`, so touch gestures reach the component instead of scrolling
the page. Pinch is handled from raw pointer events (two fingers) and from `wheel` events with
`ctrlKey`, which is how every browser reports a trackpad pinch.

Under `@media (pointer: coarse)` every hit target grows — icon buttons and the link handle go from
22 px to 32 px, chips and dialog rows gain padding — so the editor stays usable with a fingertip.
Every gesture has a tappable equivalent: renaming has its **✎** / **✓** / **✕** buttons, reordering
side effects has `Alt` + arrows alongside the drag handle, and zoom has toolbar buttons.

## Development

Development needs Node 22.22 or newer (jsdom and rolldown both require it); the published package
itself is browser-only and has no Node requirement.

Consumers install CodeMirror transitively (`@codemirror/state`, `view`, `commands`, `language`,
`lang-json`, `lint` and `@lezer/highlight`). The dialog reaches it through a dynamic `import()`, and
nothing else in the package references it, so bundlers put it in its own chunk that is fetched the
first time someone opens the JSON tab. In this repo's demo build that is 67 kB up front (19 kB
gzipped) with CodeMirror's 339 kB in a separate chunk.

```bash
npm install
npm run dev        # interactive demo at http://localhost:5173
npm test           # vitest
npm run coverage
npm run lint       # biome (lint + format check)
npm run typecheck  # tsc --noEmit
npm run build      # dist/ (ESM + .d.ts)
```

`npm run dev` serves [`dev/`](dev/): a full order-fulfilment machine, a fake side-effect endpoint
with latency, a read-only toggle, a live event log and the live JSON value.

### Strictness

`tsconfig.json` runs with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`erasableSyntaxOnly` and friends. On top of that:

- Biome fails the build on `noUnsafeTypeAssertion` (bans every `as` except `as const`),
  `noExplicitAny`, `noNonNullAssertion` and `noTsIgnore`.
- [`test/source-hygiene.test.ts`](test/source-hygiene.test.ts) parses every file in `src/`, blanks
  out comments and literals, and fails if a type assertion, `any` or `!` assertion sneaks in.

Untrusted input (the `value` property, the provider payload) goes through runtime validators in
[`src/model/parse.ts`](src/model/parse.ts) that narrow `unknown` with real checks instead of casts.

Pre-commit hooks run Biome over staged files via husky + lint-staged.

## Publishing

Two routes, and they differ in one respect worth knowing:

**From CI (recommended).** Push a tag and cut a GitHub Release; the workflow checks the tag matches
`package.json`, runs lint, typecheck and tests, then publishes. It passes `--provenance`, so the
release carries a signed attestation linking it to the commit and workflow that built it. This needs
an `NPM_TOKEN` secret on the repository's `npm` environment.

**From a laptop.** `npm publish` works, without provenance.

```bash
npm publish --dry-run   # inspect the tarball first
npm publish
```

Provenance is generated from the CI provider's OIDC token, so it simply cannot be produced locally —
npm fails with `Automatic provenance generation not supported for provider: null`. That is why
`--provenance` lives in the workflow rather than in `publishConfig`, which would apply it to every
publish including local ones.

## License

MIT © Vinta Software
