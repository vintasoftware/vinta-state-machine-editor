# vinta-state-machine-editor

A framework-agnostic **Web Component** to create, edit and visualize state machines on a
pan/zoom canvas — including the ordered side effects that run around states and transitions.

- Plain custom element (`<state-machine-editor>`) — works with React, Vue, Angular, Svelte or no framework at all.
- **One runtime dependency.** The graph itself is hand-written — Shadow DOM, HTML nodes and SVG
  edges, no canvas bitmap; [CodeMirror 6](https://codemirror.net) backs the JSON parameters editor.
- Strict TypeScript: no `any`, no type assertions, no non-null assertions — enforced by lint **and** a test that scans `src/`.
- Side effects are ordered lists; a chip on the canvas shows the first name with a count badge for the rest, and opens a dialog for the full list.
- Transitions carry a trigger, a guard and a required permission — all opaque, all the host's to define.
- Everything the component does not model rides along in a host-owned `data` blob it never reads.

```bash
npm install vinta-state-machine-editor
```

## Quick start

```html
<!-- theme is optional: it defaults to "dark". -->
<state-machine-editor id="editor" theme="light" style="height: 600px"></state-machine-editor>

<script type="module">
  import 'vinta-state-machine-editor/register';

  const editor = document.querySelector('#editor');

  // Catalog of side effects the user can attach — injected, so auth/fetching stays yours.
  editor.sideEffectProvider = async () => {
    const response = await fetch('/api/side-effects');
    return response.json(); // [{ id, name, description? }]
  };

  // Optional, same shape: the catalog a transition's trigger is picked from.
  editor.actionProvider = async () => (await fetch('/api/actions')).json();

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

Both of those imports are bare specifiers and need a bundler. If your host serves JavaScript
verbatim out of a static directory, use the single-file build instead — see
[No build step](#no-build-step).

## Interactions

| Action | Gesture |
| --- | --- |
| Create a state | **Add state** in the toolbar, or `editor.addState()` |
| Move a state | Drag its header |
| Move a transition | Drag the transition card's header — the edge bends to keep passing through it. Drop it back on the edge to return to automatic placement |
| Create a transition | Drag the round **→** handle onto another state (drop it on the same state for a self transition) |
| Create a *creation* transition | Press **+ New record starts here** under an initial state card's toggles — the row appears only while the state is marked initial |
| Add another creation transition | Drag the start bar's **→** handle onto a state |
| Reach a card's tools | Hover the card or select it — the **✎ ⚙ ✕** rail (plus the colour swatch on a state) appears just above it, and stays put long enough to be clicked |
| Rename | Tap the **✎** button in the card's rail (or double-click the name, or press `F2` with it selected), then **✓** to save / **✕** to discard — `Enter` and `Escape` work too |
| Edit properties | Press **⚙** in a state or transition card's rail, or call `openProperties(ref)` |
| Reorder the edges leaving a state | Open a transition's **⚙** and use **↑** / **↓** under *Order* |
| Reorder the outcomes of one action | Drag the **⠿** grip on a decision card's row, or focus it and press `Alt` + `↑`/`↓` |
| Edit one outcome | Click its row on the decision card — name, guard, permission and side effects open in place |
| Open a side effect list | Click any chip |
| Reorder side effects | Drag the **⠿** handle in the dialog, or focus it and press `Alt` + `↑`/`↓` |
| Turn a side effect off | Uncheck the box on its row in the dialog — it stays attached and configured |
| Edit side effect parameters | Press **{ }** on a row in the dialog, then use the nested form or the JSON tab |
| Colour a state | Press the round swatch in the card's rail and pick one of the six |
| Mark initial / final | Toggle **▶ Initial** / **◉ Final** at the bottom of a state card |
| Mark a state as waiting on a batch | Toggle **⑂ Waiting** beside them — the card grows a band naming the fan-out |
| Follow a fan-out | Click **FANS OUT TO** in the band — the editor emits `state-machine-fan-out` and the host navigates |
| Remove | Click **✕** in the card's rail, or select it and press `Delete` |
| Undo / redo | Toolbar **↶** / **↷**, or `Ctrl`/`⌘` + `Z` and `Ctrl`/`⌘` + `Shift` + `Z` (`Ctrl` + `Y` redoes too) |
| Copy / paste | Select a state or transition, then toolbar **Copy** / **Paste**, or `Ctrl`/`⌘` + `C` and `Ctrl`/`⌘` + `V` |
| Organize the layout | **Organize** in the toolbar — it asks first, since every position on the canvas is replaced — or `editor.organize()`, which does not ask |
| Pan | Drag the background, scroll, or move two fingers together |
| Zoom | Pinch (trackpad or touch), toolbar `−` / `+` / `Fit`, or `Ctrl`/`⌘` + scroll (20 % … 300 %) |
| Switch the theme | Toolbar **☀** / **☾**, or `editor.theme = 'light'` / `editor.toggleTheme()` |

## Data model

Everything is plain JSON and deeply readonly — the component never mutates the object you pass in.

```ts
interface StateMachine {
  states: StateNode[];
  transitions: Transition[];
  initialStateIds: string[]; // states the machine can start in
  finalStateIds: string[]; // states that end the machine
  data: JsonObject; // host-owned passthrough, never read by the component
}

interface StateNode {
  id: string;
  name: string;
  position: { x: number; y: number }; // world coordinates; omit it and the editor lays the graph out
  onEnter: SideEffectHooks; // around entering the state
  onLeave: SideEffectHooks; // around leaving the state
  color: StateColor; // 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted'
  description: string;
  data: JsonObject;
}

interface Transition {
  id: string;
  name: string; // the edge's identity — several edges can share a trigger
  from: string | null; // state id, or null for a creation transition
  to: string; // state id
  trigger: { id: string; name: string } | null; // the event that fires it
  guard: string; // opaque condition expression, never parsed here
  requiredPermission: string; // opaque, same treatment
  description: string;
  labelOffset: { x: number; y: number }; // {0,0} = let the editor place it
  effects: SideEffectHooks; // around the transition itself
  data: JsonObject;
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
  enabled: boolean; // false: attached and configured, but it does not run
  description: string;
  data: JsonObject;
}
```

Every field added after the first release defaults when absent, so documents written
against an older version keep parsing: `description`, `guard` and `requiredPermission`
default to `''`, `trigger` to `null`, `enabled` to `true`, and `data` to `{}`. A field
that *is* present but has the wrong type is a validation error rather than a silent
fallback.

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

### What a chip shows

A chip is one line as wide as the card allows, so it shows the **first** side effect's name and
lets a list longer than that speak through two markers, both CSS pseudo-elements outside that line:

- A **count badge** floating on the chip's leading edge, in the gutter beside the hook's label,
  whenever the list holds more than one — `3` means three attached, the shown name included. A
  written *“and 2 more”* was the first thing the elision took, which is exactly the part saying the
  list is longer than it looks; floating the number costs the name no width at all. One side effect
  gets no badge, since its name is the whole story.
- The `{ }` marker on the trailing edge when at least one side effect in the list carries
  parameters.

Neither enters the chip's text, and the numbers reach assistive technology through the chip's
`aria-label` (`… 3 side effects, 2 with parameters. Open list.`). Hovering shows the whole list,
numbered, with parameters inline. For hosts rendering their own summary in prose, where there is
room for the sentence, `formatSideEffectSummary` still returns `"sendEmail and 2 more"`;
`formatSideEffectHead` is what the chips use.

### Turning a side effect off

Each attachment carries an `enabled` flag and a `description`, editable from the checkbox and
the note field on its row in the dialog. A disabled side effect stays attached, keeps its order
and keeps its parameters — it simply does not run. That is the point: switching one off is not
the same edit as detaching it, and flipping it back must not lose what it was configured with.

A disabled row renders muted and struck through in the dialog. On the canvas the chip **counts it
and marks it** rather than hiding it: the count badge stays the number of attachments, the label
reads `sendEmail (off)` when the one it shows is disabled, and the tooltip marks every disabled
entry with `— disabled`. Excluding them would make the chip disagree with the dialog
that still lists them, and a list that quietly shrinks is the harder bug to notice.

A `SideEffectDefinition` from the catalog has no say over `enabled`: new attachments are always
enabled, and `defaultParams` remains the only thing the catalog seeds.

```js
setSideEffectEnabled(machine, ref, 'effect-1', false);
setSideEffectDescription(machine, ref, 'effect-1', 'paused during the migration');
```

### Transition attributes

A transition carries four first-class fields beyond its endpoints, all edited from the properties
dialog behind the **⚙** button on its card:

```ts
trigger: { id: string; name: string } | null; // the event that fires the edge
guard: string;                                // opaque condition expression
requiredPermission: string;                   // opaque
description: string;
```

`trigger` is not `name`. The name is the edge's *identity*; the trigger is what a user fires.
Several edges can share one trigger and be told apart by their guards, which is exactly the case
that makes a numeric priority field unnecessary — see [Ordering](#ordering) below.

`guard` and `requiredPermission` are opaque strings. The component never parses, evaluates or
interprets either: the expression language belongs to the host, and so does deciding what a
permission means.

On the canvas the card keeps the **name as its headline** and hangs the trigger and guard on a
second line (`⚡ pay` and `[order.total > 0]`). Putting the trigger on top was tempting — it is
what the user actually fires — but the headline is also the target of the existing inline rename
gesture, the trigger is nullable, and it does not identify the card. So the line you double-click
stays the line you rename.

#### The trigger catalog

Injected exactly like `sideEffectProvider`, so the component never owns fetching or auth:

```js
editor.actionProvider = async () => {
  const response = await fetch('/api/actions');
  return response.json(); // [{ id, name, description? }]
};
```

The payload is validated by `parseActionDefinitions`, mirroring `parseSideEffectDefinitions`.
**Without a provider the trigger is a free text field** rather than a picker, and the text becomes
both the `id` and the `name`. A trigger the catalog no longer returns is still offered in the
picker and preserved on save, so retiring an action server-side never silently drops it.

#### Validating guards

```js
editor.guardValidator = (expression) => {
  const errors = check(expression); // yours
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
};
```

Called on every edit — it may return a promise, and a slow answer that lands after a newer edit
is discarded. Errors are listed inline under the field. Absent means no validation at all.
Saving is never blocked: the component still refuses to interpret the expression, and the host
validates on save.

### Ordering

Where several edges leave the same state, **their order is their position in the `transitions`
array among their siblings**. There is deliberately no numeric priority field to keep in sync.

`outgoingTransitions(machine, from)` reads that group (`null` collects the creation edges), and
`moveTransition(machine, transitionId, index)` moves one within it. The siblings keep the slots
they held in the array, so nothing else shifts and every other relative order survives — as it
does through every other model helper, all of which rebuild with `map`/`filter`.

The UI exposes it as **↑** / **↓** under *Order* in a transition's properties dialog, with a
`2 of 3` readout naming the state the group leaves — and, for the edges that share an action, as
the rows of the decision card below.

### Decisions: several edges, one action

When two or more transitions share a `from` **and** a `trigger.id`, they are not several
unrelated edges: they are one decision the engine resolves by trying each in turn and taking the
first whose guard holds. The editor draws them as a single card.

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

- **Nothing is stored to make it work.** A group is derived from `from` and `trigger.id`;
  `groupTransitions(machine)` reads them all, `findGroupOf(machine, id)` reads one.
- **A group of one is the card this component has always drawn.** A graph that does not use the
  feature looks exactly as it did.
- **The rows are drawn in the order the engine tries them**, and the badge on each is that
  position — which is position in `transitions`. Display order and evaluation order are the same
  thing, so a row a person drops lands where they let go of it and the badges never disagree with
  the rows.
- **An edge with an empty guard is the fallback**, drawn as `else` and ruled off from the guards
  above it. In a graph that would publish it is already last: an unguarded edge always matches, so
  nothing can usefully follow it. Where it is not last, everything behind it is struck through and
  marked *unreachable* — which is exactly what sorting the `else` row to the bottom would have
  hidden.
- **Rows reorder** by dragging the grip, or with `Alt` + `Arrow Up` / `Arrow Down` on it. One drag
  is one undo step. `moveDecisionRow(machine, transitionId, index)` does the same on a plain
  machine, and edges leaving the same state under a *different* action keep their slots.
- **A row opens in place** onto that edge's name, guard, required permission, `before` / `after`
  side effects, properties dialog and remove button.

Reorders arrive as `transition-reorder`, and everything a row edits arrives as the change it
always did (`transition-rename`, `transition-guard`, `transition-permission`, …).

> **One card, one position.** `labelOffset` is stored per edge. The card sits at the **mean** of
> the points its members' edges would each put a card at, plus the mean of their offsets, and
> dragging it writes one offset back to every member — so a host reconciling the document should
> expect all the edges of a decision to carry the same `labelOffset`.
> `setDecisionLabelOffset(machine, transitionId, offset)` does it on a plain machine.
>
> A mean rather than the first member's answer, because the position must not depend on the order
> of the members: the rows are dragged to reorder them, and anchoring on whichever edge sorts
> first sends the card leaping across the canvas the moment that changes. A group of one reduces
> to exactly that member, so a lone edge card is unaffected.

### Waiting: a state that fans work out

A state can start a batch of child jobs, wait for all of them, and move the record on by itself
when they finish. That is structure — it changes what the state *is* — so the card says so:
a `⑂ Waiting` toggle beside `▶ Initial` and `◉ Final`, and a band **above** the hook lanes,
drawn apart from them because a fan-out is not something that runs.

```text
┌─────────────────────────────────────┐
│ ⑂ Processing                        │
├─────────────────────────────────────┤
│ FANS OUT TO   import_file.status    │
│ JOINS WITH    ⚡ import.finish       │
│ TIMEOUT       2h                    │
├─────────────────────────────────────┤
│ BEFORE·ENTER   reserveStock         │
├─────────────────────────────────────┤
│  ▶ Initial   ◉ Final   ⑂ Waiting    │
└─────────────────────────────────────┘
```

It rides in four keys of `state.data`:

```jsonc
"data": {
  "is_waiting": true,
  "join_action": "import.finish",         // an ActionType key, picked from the trigger catalog
  "child_machine": "import_file.status",  // optional, display only
  "timeout": "PT2H"                       // ISO 8601 duration, optional
}
```

- **A document without them renders exactly as it did before.** They are the only keys of `data`
  the component reads, and it touches nothing else in the blob.
- **A key of the wrong type is ignored**, not a validation error: `data` is the host's, and one
  bad value in it should not cost anybody their graph.
- **Turning the wait off drops `is_waiting` and keeps the other three**, so a toggle pressed by
  mistake costs nobody their setup. An empty value is removed rather than stored blank.
- **The band's lines open the state's properties dialog**, which edits all four under a *Waiting
  for a batch* section. The join action is a picker when an `actionProvider` is set, free text
  when it is not.
- **A line with nothing in it is left out** — except `JOINS WITH`, whose absence is the thing
  worth seeing: it is what closes the wait.
- **The timeout is shown in whole units**: `PT2H` reads as `2h`, `P1DT6H30M` as `1d 6h 30m`, and
  anything the editor cannot read is shown exactly as it was written. Days down to seconds only —
  months and years depend on when you start counting.

**The fan-out leaves the card.** `FANS OUT TO` is a link rather than a way into the dialog: it
emits `state-machine-fan-out` and stops there, and a short dashed stub is drawn leaving the card
into empty space so the fan-out reads as a direction and not only as text. The canvas draws one
version of one machine, and nesting spans machines — routing is the page's business.

```js
editor.addEventListener('state-machine-fan-out', (event) => {
  const { stateId, childMachine } = event.detail;
  location.href = '/admin/machines/' + childMachine + '/';
});
```

`editor.followFanOut(stateId)` does the same from code and returns `false` when the state names
no machine. The child machine itself stays editable from the card's **⚙** properties button.
There is deliberately no inline subgraph expansion and no drill-in breadcrumb: the canvas draws
one version, and solving nesting properly is separate work.

A waiting state is marked so it is findable while scanning a graph: a weave over its colour bar
and a dashed left edge. `color` is deliberately left alone — it is the author's choice and it
means something else.

```js
editor.toggleWaitingState('processing');
editor.setStateWaiting('processing', {
  isWaiting: true,
  joinAction: 'import.finish',
  childMachine: 'import_file.status',
  timeout: 'PT2H',
});
readWaiting(machine.states[0]); // { isWaiting: true, joinAction: 'import.finish', … }
```

Changes arrive as `state-data`.

### Counting towards a parent's batch

A child machine's state can count towards the batch its parent is waiting on. The engine runs
that as a **pair** of hooks — one on enter, one on leave — but it is one concept, so the card
draws it as one line of the same band:

```text
│ COUNTS AS     ✓ success             │
```

```jsonc
"data": { "counts_as": "success" }   // "success" | "failure" | absent
```

- **The key is the truth.** The editor never inspects the effect lists or matches a
  `definitionId` to decide any of this; the host translates `counts_as` into whatever hook rows
  it needs.
- **`◉ Final` drops the leave half**, and the control says so — `✓ success · on enter only`. A
  state listed in `finalStateIds` can never be left (the engine refuses the move), so its
  leave-side hook could never fire. Toggle `Final` back off and the pair is whole again.
- **A half configured pair renders broken**, with the reason inline. To know that, the editor
  needs one more key from the host:

  ```jsonc
  "data": { "counts_as": "success", "counts_as_partial": "enter" }
  ```

  `counts_as_partial` names the half the host found on its own. On a final state `"enter"` is
  exactly right and nothing is flagged; anywhere else it is a half configured pair, and
  `"leave"` alone is broken everywhere. Without `counts_as` the control is not drawn at all,
  whatever `counts_as_partial` says.
- The band appears for a state that only reports, even when it waits for nothing itself.

`countsAsStatus(state, isFinal)` is the pure helper behind it, and the outcome is editable under
*Counts as* in the state's properties dialog.

### Host-owned data

`StateMachine`, `StateNode`, `Transition` and `SideEffect` each carry a `data: JsonObject` that
the component parses, preserves and hands back — and never reads, interprets, validates the shape
of, or renders.

It exists because `parseStateMachine` whitelists keys and rebuilds every object, so anything a
host attached would otherwise be discarded on the first `state-machine-change`. The motivating
case: a Django backend needs a flag meaning *defer this side effect until the surrounding database
transaction commits* — real to that host, meaningless to any other.

```js
machine.transitions[0].data; // { deferUntilCommit: true }
```

Absent parses as `{}`; a non-object is a validation error with a path
(`machine.states[0].data must be a JSON object.`), exactly like `params`. The `create*` helpers
accept one and default to `{}`; every other helper carries it through untouched.

The one exception is the six keys of `state.data` that describe a
[waiting state](#waiting-a-state-that-fans-work-out) and the
[report it makes](#counting-towards-a-parents-batch) — `is_waiting`, `join_action`,
`child_machine`, `timeout`, `counts_as` and `counts_as_partial`. Those the component does read, does render and does write, and
edits to them arrive as a `state-data` change. Every other key, and every other object's `data`,
is carried through untouched and emits nothing; a host mutating one assigns `value`.

> Anything the component models itself belongs in a real field instead. `data` is the escape
> hatch for attributes this component has no concept of — not a place to shadow `guard`,
> `enabled` or `description`, which have their own fields, their own validation and their own
> change events.

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

### Creation transitions

`Transition.from` may be `null`. That means **creation**: the edge that takes a brand new record
into an initial state.

It exists because a record with no status yet resolves its available transitions as exactly the
null-source edges, so each one carries its own name, trigger, guard, required permission and side
effects — the authorization and routing for *who may create this record, under what condition, and
into which of several initial states*. Two guarded creation edges into different initial states
under different triggers is the case that forces it, and none of that is expressible as the target
state's `onEnter` side effects, which only run once the decision has already been made.

**It is not a dangling edge.** A single **start bar** — the UML initial pseudostate, drawn as a slim
vertical bar — is placed on the canvas, and every creation edge originates there. So every
transition card still sits on an edge with a real source and a real target: fanning, bending and
`labelOffset` all apply unchanged, with no null-source special case in the geometry layer.

It is a bar rather than a dot because a dot makes every creation edge leave from the same point,
so their lines emerge on top of each other and cross. The bar **reserves a slot per edge** (38 px
each, so it grows with them) and hands each edge its own anchor on the bar's right edge. Each edge
therefore starts on its own line, with real space between it and its neighbours. It is labelled
**Create** down its length, so the shape does not have to be guessed at, and never shrinks below
the height that label needs.

The bar keeps a whole transition card's width plus a margin between itself and the state it feeds.
That distance is derived from the measured card and node widths rather than hard-coded, so a coarse
pointer — where both grow — moves the bar out with them, and so does a host that restyles either.

The slots are **handed out in the order the edges are heading**, top to bottom. Two edges leaving a
common vertical line cross exactly when one starts above the other and ends below it, so that order
removes every crossing the layout is free to remove. What is left is edges heading for the same
place, which no ordering can separate — those get adjacent slots and the existing fan spreads their
cards.

The key is the height of each edge's **card**, not of its target state, because the edge is bent to
pass through its card: the card is what the line actually heads for. So dragging a creation card
past another swaps which slot each one leaves from, and so does dragging a state, since that moves
the cards with it. The assignment is recomputed on every render rather than stored, and it is
measured against a neutral point on the bar so that it never depends on the slots it is choosing.

That ordering is purely visual and has nothing to do with [Ordering](#ordering): the evaluation
order of the creation edges stays their position in `machine.transitions`, and reordering them there
does not move a single line.

The bar appears with the first creation edge and disappears with the last. It is not a state: it
never enters `states`, `initialStateIds` or `finalStateIds`, has no name, colour, side effects or
Initial/Final toggles, and cannot be selected or deleted. It is **placed, not persisted** —
deterministically, left of the leftmost state it feeds and centred on them vertically — so nothing
new has to be stored on the machine and no `creationOrigin` field was added.

Creating them:

- **+ New record starts here**, a full-width row under the **▶ Initial** / **◉ Final** /
  **⑂ Waiting** toggles, visible only while the state is marked initial. It sits on a line of its
  own rather than as a fourth pill among the toggles: adding an edge is not one more thing the
  state *is*, and the room lets the label say what the edge does instead of naming the kind of
  edge. There is nothing to drag from until the first edge exists, so the button is the way in.
  It creates the edge, brings the bar into existence, selects the new edge and starts inline
  rename — selecting it is the point, since the trigger and guard are filled in from there.
- Dragging the start bar's **→** handle onto a state, for every one after that. The handle sits
  just below the bar, so it never covers an edge leaving it.

Default names are unique across the **whole machine**, not per target state, because the backend
namespaces creation edges version-wide while ordinary edges are namespaced per source state:
pressing the button on two different cards gives you `create` and `create 2`.

The initial flag and the creation edges are independent, and stay that way:

- Marking a state initial does **not** create an edge. A state marked initial with no creation edges
  is the common, valid case — the flag alone is a field default for records created without going
  through a transition.
- Unmarking it does **not** delete the edges it has. Silent destruction on a toggle someone may flip
  straight back is worse than a temporarily invalid graph.
- Orphaned creation edges are left alone and are **not** styled as errors. An edge from the start
  node into a state with no ▶ marker is already visibly odd, and the host validates on save.
- The left-border entry arrow is suppressed on a state that has at least one creation edge, and kept
  for an initial state with none. The arrow means *can start here*, the edges mean *here is exactly
  how*; drawing both is redundant.
- Deleting a state deletes its creation edges along with its other edges.

Deliberately **out of scope**: the editor does not enforce that a creation edge targets a state in
`initialStateIds`, any more than it enforces that a final state has no outgoing edges. Those are
domain rules the host validates on save; the editor stays a rendering and data concern.

```js
editor.addCreationTransition('draft'); // what the + Creation button calls
editor.addTransition(null, 'draft'); // same edge, without the select-and-rename
creationTransitions(machine); // every null-source edge
```

### Laying out transitions

Transitions between the same pair of states are fanned apart automatically, in both directions, so
they never stack on top of each other. The fan spacing follows the measured card height.

A new transition's card is placed into free space rather than dropped wherever the midpoint lands.
The editor checks the spot against every state card and every transition card already on the canvas
and, if it is taken, steps out a card at a time — vertically first, since a card is much wider than
it is tall — until it finds room, giving up after a few rings rather than flinging the label away
from its own edge. When the spot is already free it is used untouched, so the card keeps automatic
placement. New states are placed the same way: at the middle of the view, nudged to the nearest
spot that covers nothing.

Dragging a transition card overrides that with a `labelOffset` relative to the automatic position —
relative, so the card keeps its arrangement when the states move. The edge is then reshaped to pass
through the card (`bendEdgeThrough` solves the Bézier control point for it), so a moved transition
never floats away from its own line. Dropping the card within 16 px of the automatic spot resets the
offset to `{ x: 0, y: 0 }`.

### Organizing the layout

**Organize** in the toolbar arranges every card into a readable graph: columns from left to right,
one per step away from where a record enters the machine, with the states inside a column ordered
so the edges between them cross as little as possible. It is the layered (Sugiyama) shape, minus
the parts a canvas this size does not need.

- **Where a column starts.** Column 0 holds the states a record can enter at: the ones a
  [creation transition](#creation-transitions) targets, or — with none — the ones listed in
  `initialStateIds`, or — with neither — the ones nothing transitions into. A machine that is one
  closed cycle has none of those, and starts from its first state rather than not being laid out.
- **Which column the rest land in.** How many transitions away from the nearest entry point they
  are. That is a breadth-first distance, not a longest path: a cycle is normal in a state machine,
  and a longest path is only defined on a graph without one. Self transitions and creation edges
  take no part — a self loop says nothing about which column its state belongs in, and the start
  bar is placed rather than laid out.
- **Which row.** A handful of barycentre sweeps, the classic crossing-reduction heuristic: each
  column is put in the order of the neighbours it has in the column beside it, down and then back
  up. Columns are centred on the tallest one, so a graph that widens and narrows again reads as a
  spine rather than as a staircase. Sub-graphs that share no transition are laid out separately and
  stacked, so an island never lands in the middle of the graph it has nothing to do with.
- **How far apart.** A gap — across *and* down — is a whole transition card plus a margin on either
  side of it. Across, that is the card sitting on the edge between two columns; down, it is the one
  an edge that skips a column, or a self loop, is nudged into. Every card is measured on its own
  rather than one measurement standing in for all of them: a state carrying a list of side effects
  renders several times the height of a bare one, and a column pitched on the short card would
  leave the tall ones nearly touching what is under them.
- **The transition cards** go back to automatic placement and are then nudged off each other, the
  same search a new transition's card goes through. A card the user dragged is deliberately not
  kept: its offset is relative to an edge that has just been redrawn somewhere else entirely, so
  keeping it would scatter the very cards this is meant to tidy.

The sizes come from the DOM rather than being assumed, so the arrangement follows whatever the
cards actually render at — including a `--sme-node-width` you overrode.

The toolbar button **asks before it runs**, and fits the view afterwards. Every position on the
canvas is replaced at once, including the ones placed by hand, and that is not an arrangement
anybody can reconstruct from memory — so it is worth a question, even though a single undo puts it
back. `organize()` asks nothing: a host calling it has its own reason to.

It runs **by itself** when a machine is assigned whose states all sit on the origin — a graph
authored anywhere but this editor: a backend that never stored coordinates, a fixture written by
hand. A missing `position` parses as `{ x: 0, y: 0 }`, so both spellings arrive as the same thing
and neither renders as a pile of cards on top of each other.

That automatic pass is the one time assigning `value` emits `state-machine-change`. The positions
are the editor's own work rather than the host's, and without the event they would be recomputed on
every load and never stored. It carries `{ kind: 'layout' }` and is not an undo step — the state
before it is the pile it just took apart, which is not somewhere to go back to. A host that echoes
the value back gets no second pass, since the cards are no longer on the origin.

```js
editor.organize(); // false when the machine is empty, read-only, or already laid out this way
await editor.confirmOrganize(); // …the toolbar's version: asks first, then fits the view
layoutPositions(machine, { nodeSize, labelSize }); // the same arrangement, as a Map of id → point
organizeMachine(machine, { nodeSize, labelSize }); // …applied, returning the machine when nothing moved
organizeMachine(machine, { nodeSize, labelSize, nodeSizes }); // …with the cards that render at their own size
isUnpositioned(machine); // what the automatic pass tests for
```

`nodeSizes` is a `Map` of state id → `{ width, height }`; anything missing from it falls back to
`nodeSize`.

## Element API

### Properties

| Property | Type | Notes |
| --- | --- | --- |
| `value` | `StateMachine` | Setting it validates the input (throws `StateMachineError`) and re-renders. Setting it does **not** emit `state-machine-change`, except for the one `layout` change a machine with no positions is [organized](#organizing-the-layout) with. The current `selection` is kept if the selected id still names a state (or transition) in the new machine, so a host inspector panel survives writing edits back. Assigning a *different* machine clears the undo history with it; assigning the one already in place — what a host echoing `state-machine-change` back does — leaves it alone. |
| `sideEffectProvider` | `() => MaybePromise<SideEffectDefinition[]>` | Catalog used by the dialog. Called every time a dialog opens. |
| `actionProvider` | `() => MaybePromise<ActionDefinition[]>` | Catalog the transition trigger is picked from. Without it the trigger is a free text field. |
| `guardValidator` | `(expression) => MaybePromise<{ ok: true } \| { ok: false, errors }>` | Called on every guard edit; errors render inline. Absent means no validation. |
| `readOnly` | `boolean` | Reflected to the `readonly` attribute. Chips still open the dialog, read-only. |
| `icons` | `Partial<EditorIcons> \| undefined` | Glyphs for the buttons and handles. A partial set replaces only what it names; reading it back gives the whole set, defaults filled in — see [Icons](#icons). |
| `strings` | `StringOverrides \| undefined` | Every word the editor says, grouped (`toolbar`, `state`, `dialog`, …). A partial set replaces only what it names and leaves the rest in English; reading it back gives the whole set — see [Translation](#translation). |
| `theme` | `'dark' \| 'light'` | Reflected to the `theme` attribute, which is what the CSS keys off. Defaults to `'dark'`; a value the element does not know reads back as the default. Never taken from the operating system — see [Theming](#theming). |
| `selection` | `{ kind: 'state' \| 'transition', id } \| null` | Survives a `value` assignment that keeps the selected element; becomes `null` if that element is gone, and only that drop emits `state-machine-selection-change`. |
| `viewport` | `{ x, y, scale }` | Pan/zoom state; assignable to restore a saved view. |
| `clipboard` | `{ kind: 'state', state } \| { kind: 'transition', transition } \| null` | The editor's own copy buffer, not the system one. Assignable, so a copy can move between two editors on the page or be seeded from storage. |
| `canUndo` | `boolean` | Read-only. Whether there is a recorded step to take back. |
| `canRedo` | `boolean` | Read-only. Whether an undone step is waiting to be put back. |

### Methods

`addState({ name?, position? })`, `addTransition(from, to, name?)` — `from` accepts `null` for a
creation transition — `addCreationTransition(stateId)`, `renameSelection()`, `zoomIn()`,
`zoomOut()`, `setZoom(scale)`, `zoomToFit(padding?)`,
`openSideEffects(ref): Promise<boolean>`, `openProperties(ref): Promise<boolean>` where `ref` is
`{ kind: 'state' | 'transition', id }`, `undo()`, `redo()`, `clearHistory()`,
`copySelection()`, `copy(ref)`, `paste()`, `organize()`,
`confirmOrganize(): Promise<boolean>`, `toggleTheme(): 'dark' | 'light'` — switches to the other
scheme and returns it, which is what the toolbar's button calls.

### Events

| Event | Detail |
| --- | --- |
| `state-machine-change` | `{ value, change, transient }` — `change` says what happened (`state-move`, `side-effects-change`, …); `transient: true` marks the intermediate frames of a drag. |
| `state-machine-selection-change` | `{ selection }` |
| `state-machine-theme-change` | `{ theme }` — fires when the scheme actually changes, including the switch the toolbar's own button makes. Setting `theme` to the scheme already in force stays quiet. |
| `state-machine-fan-out` | `{ stateId, childMachine }` — someone followed a waiting state's **Fans out to** link. The editor never navigates itself. |

They all bubble and are `composed`, so they cross shadow boundaries.

`change.kind` is one of `state-add`, `state-remove`, `state-rename`, `state-move`, `state-color`,
`transition-add`, `transition-remove`, `transition-rename`, `transition-move`,
`transition-trigger`, `transition-guard`, `transition-permission`, `transition-reorder`,
`description`, `side-effects-change`, `state-data`, `initial-states-change`,
`final-states-change`, `layout` and `replace`. `description` carries a `ref` (`{ kind, id }`) since both states and transitions have
one; every other transition kind carries a `transitionId`. `describeChange(change)` turns any of
them into a label for an undo stack.

Saving the properties dialog emits **one event per field that actually changed** — three edits in
one dialog arrive as three events, in field order — so a host can react granularly rather than
diffing the whole machine. Fields left alone emit nothing.

### Copy and paste

Select a state or a transition and copy it with the toolbar's **Copy** or `Ctrl`/`⌘` + `C`; paste
with **Paste** or `Ctrl`/`⌘` + `V`. `copySelection()`, `copy(ref)` and `paste()` do the same from
code — `paste()` returns the `{ kind, id }` of what it made, or `null` when there was nothing to
paste.

The clipboard is the editor's own buffer, exposed as the assignable `clipboard` property. It holds
the element itself rather than a copy of it — everything in the model is deeply readonly, so an
entry cannot drift once taken — and the copying proper happens on paste, which is the only moment
that knows what to call the result and where to put it. Since it is a property, a host can hand one
editor's clipboard to another, or restore one from storage. It is *not* the system clipboard:
copying here does not overwrite what the user copied elsewhere, and pasting does not read it.

What a paste makes is a new element:

- Fresh ids, for the element and for every side effect attached to it. The attachment ids name
  *that* attachment rather than the catalog definition behind it, which the copy still points at.
- A name marked as a copy and made unique — `Draft` → `Draft copy` → `Draft copy 2`. A suffix
  already there is replaced rather than stacked.
- Everything else: colour, description, side effects, guard, trigger, required permission, and the
  host's own `data`.
- For a state, a position a step off the original and then clear of every card already on the
  canvas; for a transition, the same two endpoints and a card placed the way a new edge's is.

A copied state does **not** bring the initial/final roles along. Those lists belong to the machine
rather than to the card, and a paste should not quietly give the machine a second entry point.
Copying a state does not copy the transitions touching it either — the selection is one element.

A paste is one `state-add` or `transition-add`, and one undo step. Copying changes nothing, so it
records nothing. Copy works in read-only mode, where the paste that would put it back does not.
Pasting a transition needs both of its endpoints to still exist, so the button is disabled — and
`paste()` returns `null` — when the machine no longer has them.

### Undo and redo

The editor keeps its own history: the toolbar's **↶** / **↷**, `Ctrl`/`⌘` + `Z` and
`Ctrl`/`⌘` + `Shift` + `Z` (plus `Ctrl` + `Y`, where Windows apps put redo), and the `undo()` /
`redo()` methods all walk the same stack. `canUndo` and `canRedo` say whether there is anywhere
to walk to, and the buttons name the step they would take — *Undo move state*, *Redo change
transition guard* — from `describeChange`.

One step is one thing the user did, not one event the host saw:

- A drag is a single step. The transient frames it emits move the machine without recording
  anything; the final, non-transient commit records the gesture as a whole.
- One properties dialog save is a single step, however many fields it changed — it still emits one
  `state-machine-change` per field.
- Shortcuts are ignored inside text fields, while a dialog is open, and in read-only mode, where
  both buttons are disabled.

A step emits one `state-machine-change` of kind `replace`, with `transient: false` — the whole
machine is swapped, so no narrower kind would be honest. Nothing else about a step is special: a
host that persists on every change already handles it.

The last 100 steps are kept. Since every helper in the model layer returns a new machine that
shares everything it did not touch, a step costs one reference rather than a copy.

Assigning `value` a different machine replaces the document and clears the history with it.
Assigning the machine already in place does not, so the React-style round trip — take
`event.detail.value`, store it, hand it back — leaves undo working. Hosts that own their own
history (or that treat the current machine as a freshly loaded document) call `clearHistory()`.

### Pure helpers

The model layer is exported and framework-free, so hosts can build undo stacks, validation or
server-side rendering on top of it: `addState`, `updateState`, `removeState`, `addTransition`,
`updateTransition`, `removeTransition`, `getSideEffects`, `setSideEffects`, `addSideEffect`,
`removeSideEffect`, `moveSideEffect`, `setSideEffectEnabled`, `setSideEffectDescription`,
`setTransitionTrigger`, `setTransitionGuard`, `setTransitionPermission`,
`setTransitionDescription`, `setStateDescription`, `outgoingTransitions`, `creationTransitions`,
`moveTransition`, `uniqueTransitionName`, `parseStateMachine`, `parseActionDefinitions`,
`assertStateMachine`, `uniqueName`, `uniqueStateName`, the clipboard helpers (`copyElement`,
`canPaste`, `duplicateState`, `duplicateTransition`, `copyName`), the history helpers backing the
editor's own stack (`createHistory`,
`recordHistory`, `undoHistory`, `redoHistory`, `canUndo`, `canRedo`, `pendingUndo`, `pendingRedo`,
`HISTORY_LIMIT`), the layout helpers (`layoutPositions`, `organizeMachine`, `isUnpositioned`), plus
the geometry helpers (`computeEdgeGeometry`, `fitViewport`, `zoomBy`, …).

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

## No build step

`vinta-state-machine-editor/register` imports CodeMirror by bare specifier, so it needs a bundler
(or an import map) to resolve. Hosts that serve files verbatim out of a static directory — the
Django admin, Rails' `public/`, a plain nginx root — have neither: the component loads fine and
then throws `Failed to resolve module specifier "@codemirror/commands"` the moment someone opens a
side effect's **JSON** tab.

`vinta-state-machine-editor/bundled` is that same registration in a single self-contained file.
Every dependency is inlined and the lazy CodeMirror chunk is flattened in, so it resolves nothing
at runtime and issues no request of its own.

Copy one file out of the package:

```bash
cp node_modules/vinta-state-machine-editor/dist/bundled.js static/vendor/
```

Then point a plain module script at it:

```html
<state-machine-editor id="editor" style="height: 600px"></state-machine-editor>

<script type="module">
  import './vendor/bundled.js'; // Django: "{% static 'vendor/bundled.js' %}"

  const editor = document.querySelector('#editor');
  editor.sideEffectProvider = async () => (await fetch('/api/side-effects')).json();
  editor.value = machine;
  editor.addEventListener('state-machine-change', (event) => {
    if (!event.detail.transient) save(event.detail.value);
  });
</script>
```

`dist/bundled.js` is the only file to copy. There is no sibling chunk and no source map to 404 on,
and the URL it is served from does not matter.

The element API is identical — the page above is the [Quick start](#quick-start) with a relative
path in place of the bare specifier. Everything else in this README applies unchanged.

### What it costs

| | `./register` (bundler) | `./bundled` (no bundler) |
| --- | --- | --- |
| Files to serve | your bundler's output | `bundled.js`, and nothing else |
| Loaded up front | 111.3 kB → **31.4 kB gzipped** | 445.7 kB → **139.5 kB gzipped** |
| Loaded on first **JSON** tab | 339.4 kB → 110.1 kB gzipped | — already there |
| Total over the wire | 450.7 kB → 141.5 kB gzipped | 445.7 kB → 139.5 kB gzipped |

Roughly the same bytes overall — the split column also carries the demo page's own code — and the
difference is *when*. The bundler route keeps CodeMirror out of the initial
download and fetches it on first use. The bundled route pays for it up front, every load, even for
the sessions that never open a JSON tab.

That is the deliberate trade. Keeping the split would have meant emitting a second file with a
stable name and asking every host to copy it too — a step that is easy to miss, and whose failure
mode is a runtime error in one tab of one dialog rather than a broken build. One file cannot be
half-deployed. If the eager 139 kB matters more to you than that, use a bundler and the `./register`
export, which is unchanged and still code-split.

## Theming

The component ships a dark and a light scheme, and the host picks which one:

```html
<state-machine-editor theme="light"></state-machine-editor>
```

```ts
editor.theme = 'light'; // reflected to the attribute
editor.theme; // 'light'
editor.toggleTheme(); // 'dark'
```

`theme` is `dark` when nothing says otherwise, and a value the element does not recognize —
`theme="system"`, say — renders as that default while staying in the DOM as written, the way an
unknown `type` on an `<input>` does.

The editor deliberately **never reads `prefers-color-scheme`**. It is a component inside someone
else's page, and a page that is light all the way through has no use for a canvas that turns dark
on its own. A host that *does* want to follow the operating system asks for it explicitly:

```ts
const media = matchMedia('(prefers-color-scheme: dark)');
const follow = () => {
  editor.theme = media.matches ? 'dark' : 'light';
};
follow();
media.addEventListener('change', follow);
```

The toolbar's **☀** / **☾** button switches the scheme from inside the editor — it stays enabled
in read-only mode, since looking is not editing — and every switch, from the button or from the
host, arrives as `state-machine-theme-change`:

```ts
editor.addEventListener('state-machine-theme-change', (event) => {
  localStorage.setItem('editor-theme', event.detail.theme);
});
```

The dialogs carry shadow roots of their own, so the editor hands its scheme down to them as it
opens them; they also take a `theme` attribute directly, for a host driving one on its own.

## Icons

Every glyph the editor draws on a button or a handle is replaceable, through the `icons`
property. A partial set replaces only what it names and leaves the rest alone:

```ts
editor.icons = { rename: '📝', remove: '🗑' };
editor.icons.properties; // '⚙' — still the default
```

Reading `icons` back gives the whole set with the defaults filled in. Assigning `undefined` puts
them all back.

An icon is one of three things:

| Form | Example | Drawn as |
| --- | --- | --- |
| A string | `'📝'` | Plain **text**, never markup: an icon set is often data from somewhere else, and a component that parsed it as HTML would run that somewhere else's scripts. |
| A DOM node | `svgElement` | The node, **copied** for each button that carries it — the canvas draws `rename` once per card, and a node can only be in one place. Your own node is left untouched. |
| A function | `() => makeIcon()` | Called once per button, and what it returns is used as it is. This is the form to use when the icon has to be built fresh — bound to a framework, or carrying per-button state. |

So an SVG icon set looks like this:

```ts
const icon = (path) => () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.innerHTML = `<path d="${path}" fill="currentColor" />`;
  return svg;
};

editor.icons = { rename: icon(PENCIL), remove: icon(CROSS), properties: icon(GEAR) };
```

Icons can be set at any time. The toolbar is built in the constructor, long before a host gets to
assign anything, and the cards outlive every render — so nothing is rebuilt when the set changes:
each icon is redrawn where it stands, and the dialogs are handed the new set as they open.

### The set

Icons are named after what they **mean**, not where they sit, so replacing one covers every place
it is drawn: one `remove` serves the state cards, the transition cards, the side effect rows and
the JSON parameter fields.

| Name | Default | Where |
| --- | --- | --- |
| `undo` / `redo` | ↶ ↷ | Toolbar |
| `zoomOut` / `zoomIn` | − + | Toolbar |
| `lightTheme` / `darkTheme` | ☀ ☾ | Toolbar; each names the scheme its press switches **to** |
| `rename` | ✎ | State and transition cards |
| `properties` | ⚙ | State and transition cards |
| `remove` | ✕ | Cards, side effect rows, JSON parameter fields |
| `confirm` / `cancel` | ✓ ✕ | The inline rename editor |
| `link` | → | The handle dragged from one card to another, and from the start bar |
| `initial` / `final` | ▶ ◉ | The role pills on a state card |
| `waiting` | ⑂ | The role pill marking a state that waits for a batch |
| `fanOut` | ↗ | The link following a fan-out into the child machine |
| `add` | + | Leads `Creation`, `Add side effect`, `Add item` and `Add field` |
| `dragHandle` | ⠿ | The grip a side effect or a decision row is reordered by |
| `params` | `{ }` | The button holding a side effect's JSON parameters |
| `expand` | ⌄ | Opens one row of a decision card onto the edge behind it |
| `fallback` | ⌄ | Marks the unguarded row of a decision card |
| `moveUp` / `moveDown` | ↑ ↓ | Transition order, in the properties dialog |

An icon that leads a label keeps that label: replacing `initial` turns `▶ Initial` into
`→ Initial`, it does not lose the word. Accessible names and tooltips are unaffected throughout —
they are written out in full and never depend on the glyph.

The dialogs take an `icons` property of their own, for a host driving one directly rather than
through the editor:

```ts
const dialog = new SideEffectsDialogElement();
dialog.icons = { dragHandle: '≡' };
```

One marker is not an icon: the `{ }` a canvas chip shows when its list carries parameters is drawn
in CSS, which can hold text and nothing else. It follows `--sme-params-marker`:

```css
state-machine-editor { --sme-params-marker: '{…}'; }
```

## Translation

Every word the editor and its dialogs put in front of a person comes out of one object, and a host
replaces as much of it as it likes through the `strings` property. There is no locale registry and
no dependency: picking a language is the host's job, exactly as picking a theme is.

Strings are grouped by where they belong, and a partial set replaces only what it names — in the
group it names, and in every other group:

```ts
editor.strings = {
  toolbar: { addState: 'Adicionar estado' },
  state: { remove: 'Remover estado' },
  organize: { confirm: 'Organizar' },
};
editor.strings.toolbar.paste; // 'Paste' — still English
editor.strings.dialog.save; // 'Save' — a group left alone keeps all of it
```

Reading `strings` back gives the whole set with the defaults filled in; assigning `undefined` puts
them all back. A key a group does not have is ignored, so a translation file that has fallen behind
the package cannot smuggle anything in.

### Two kinds of string

A string that never changes is a **string**. One that has values filled into it is a **function**
taking them:

```ts
editor.strings = {
  state: {
    remove: 'Remover estado',
    creationLabel: ({ name }) => `Adicionar uma transição de criação para “${name}”`,
  },
  properties: {
    orderReadout: ({ index, total }) => `${index} de ${total}`,
  },
};
```

There is deliberately no placeholder syntax. A `{name}` mini-language would be a second thing to
learn and a second thing to escape — and it could not express the cases below anyway. The
parameters are named and **typed**, so your editor completes them and the compiler catches a
misspelling.

### What that buys you

**Plurals.** Polish and Russian need three forms, Arabic six, and no template syntax without a
library behind it is going to pick between them. A function hands the decision to your own
`Intl.PluralRules`, or to the i18n library you already run:

```ts
const plural = new Intl.PluralRules('ru');
const FORMS = { one: 'элемент', few: 'элемента', many: 'элементов', other: 'элементов' };

editor.strings = {
  json: { itemCount: ({ count }) => `${count} ${FORMS[plural.select(count)]}` },
};
```

**Word order.** Nothing is assembled by gluing a verb to a noun, because where the verb goes is the
sentence's business — English puts it first, Japanese last. The undo control hands its change to a
function rather than appending it:

```ts
editor.strings = {
  toolbar: { undoChange: ({ change }) => `${change} を元に戻す` },
  change: { 'state-add': '状態の追加' },
};
// aria-label: 状態の追加 を元に戻す
```

**Branches the sentence should own.** A row's parameters toggle receives `expanded` as a boolean
rather than being two separate keys the component has already chosen between, and the parameters
badge receives `count: 0` rather than having an empty variant of its own:

```ts
editor.strings = {
  row: {
    paramsLabel: ({ name, count, expanded }) =>
      `${expanded ? 'Ocultar' : 'Editar'} ${count} par. de ${name}`,
  },
  params: { badge: ({ count }) => (count === 0 ? '{ }' : `{ } ${count}`) },
};
```

The same applies to the quotation marks a name is wrapped in (`source.state`) and to the words the
model's own enums read as in prose — `phase.before`, `trigger.enter`, `kind.transition` and
`color.success` are groups keyed by the model value, so nothing is looked up by a string name.

### Loading a translation as data

The strings that take no values are plain data, so they round-trip through JSON — which is what
lets the bulk of a translation come straight from whatever backend you already run. The
parametrized ones are functions, so they live in code beside it:

```ts
const response = await fetch(`/i18n/editor.${locale}.json`);
const flat = await response.json();
editor.strings = { ...flat, json: { ...flat.json, itemCount: countItems } };
```

### The groups

`STRING_GROUPS` lists them, and `DEFAULT_STRINGS` holds the English, which is the practical
starting point for a translation file:

```ts
import { DEFAULT_STRINGS, STRING_GROUPS } from 'vinta-state-machine-editor';
```

| Group | Covers |
| --- | --- |
| `toolbar` | Add state, undo/redo, copy/paste, organize, zoom, fit, theme |
| `canvas` | The empty canvas |
| `kind` | `state` / `transition`, as the copy and paste labels name them |
| `card` | The tool rail above a state card and an edge card alike |
| `state` | A state card: tools, roles, the colour button |
| `color` | The six palette colours, keyed by the model value |
| `rename` | The inline name editor and its two buttons |
| `transition` | An edge card: tools, the trigger and guard lines |
| `decision` | The card several edges under one action share, and its rows |
| `waiting` | The batch a state waits on: the toggle, the band, the dialog's fields |
| `startNode` | The bar every creation edge leaves from |
| `source` | What to call a transition's source — including a name's quotation marks |
| `chip` | The side effect chips on a card |
| `phase` / `trigger` / `triggerVerb` | `before`/`after`, `enter`/`leave`, and the same as verbs |
| `sideEffect` | A side effect in prose: disabled, collapsed, in a tooltip |
| `sideEffects` | The side effects dialog, and the headings it opens with |
| `row` | One row of that dialog |
| `params` | The JSON parameters panel a row opens |
| `properties` | The properties dialog: every field, hint and status message |
| `change` | One per kind of change, for the undo and redo labels |
| `dialog` | Save, cancel, close, confirm |
| `organize` | The organize question |
| `json` | The nested parameter form, and the parser's own complaints |
| `seed` | See below |

Within a group a string is named after what it **means**, not where it sits, so replacing one
covers every place it is used: one `card.toolsLabel` names the rail above a state card and above an
edge card.

Strings can be set at any time. The toolbar is relabelled where it stands; the cards are rebuilt,
which costs nothing at setup, and the dialogs are handed the new set as they open. They also take a
`strings` property of their own, for a host driving one directly:

```ts
const dialog = new SideEffectsDialogElement();
dialog.strings = { sideEffects: { empty: 'Nenhum efeito ainda.' } };
```

### Four strings that write into the machine

The `seed` group is not labels drawn over the data — these are the names new elements are **born
with**, and they are saved into the machine your host round-trips. Translating them translates the
data, which is usually what a localized editor wants:

```ts
editor.strings = {
  seed: { stateName: ({ index }) => `Estado ${index}`, copySuffix: 'cópia' },
};
editor.addState().name; // 'Estado 1'
```

If your backend keys off the name `create` for creation transitions, leave `seed.creationName`
alone; everything else in the group is safe to translate.

### What is not covered

- **Validation issues from `parseStateMachine`** — `machine.states[0].name must be a non-empty
  string` and friends describe *your* payload, name its field paths, and are meant for whoever
  wrote it. They stay in English.
- **`JSON.parse`'s own syntax errors** in the JSON parameters tab. They name the position the text
  broke at, which is the useful part, and translating them is the runtime's job. The three
  structural complaints around them — `json.invalid`, `json.notJsonValues`, `json.notObject` — are
  yours.
- **Right-to-left layout.** `dir` is a CSS concern, not a wording one; nothing here stops you
  setting it on the host element, but the stylesheet does not yet mirror.

## Styling

Both schemes are built out of the same CSS custom properties, all overridable from the host:

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

An override set on the element wins in both schemes. To keep a scheme of your own on each, key the
overrides off the same attribute the component does:

```css
state-machine-editor[theme='light'] { --sme-accent: #7c3aed; }
state-machine-editor[theme='dark'] { --sme-accent: #b38cff; }
```

Exposed shadow parts: `viewport`, `toolbar`, `state`, `transition`, `card-actions`, `start-node`, `edge`, `chip`, `icon`.

Every icon sits in its own `part="icon"` span, so a host can size or colour a replaced icon set
from outside the shadow root:

```css
state-machine-editor::part(icon) { color: #7c3aed; }
```

The canvas sets `touch-action: none`, so touch gestures reach the component instead of scrolling
the page. Pinch is handled from raw pointer events (two fingers) and from `wheel` events with
`ctrlKey`, which is how every browser reports a trackpad pinch.

Under `@media (pointer: coarse)` every hit target grows — icon buttons and the link handle go from
22 px to 32 px, chips, form fields and dialog rows gain padding, and `--sme-node-width` goes to
288 px so the three grown pills in a state card's roles row still fit on one line — so the editor
stays usable with a fingertip.
Every gesture has a tappable equivalent: renaming has its **✎** / **✓** / **✕** buttons, reordering
side effects has `Alt` + arrows alongside the drag handle, and zoom has toolbar buttons.

## Development

Development needs Node 22.22 or newer (jsdom and rolldown both require it); the published package
itself is browser-only and has no Node requirement.

Consumers install CodeMirror transitively (`@codemirror/state`, `view`, `commands`, `language`,
`lang-json`, `lint` and `@lezer/highlight`). The dialog reaches it through a dynamic `import()`, and
nothing else in the package references it, so bundlers put it in its own chunk that is fetched the
first time someone opens the JSON tab. In this repo's demo build that is 111 kB up front (31 kB
gzipped) with CodeMirror's 339 kB in a separate chunk. Hosts without a bundler take the
[other route](#no-build-step) instead.

```bash
npm install
npm run dev            # interactive demo at http://localhost:5173
npm test               # vitest
npm run coverage
npm run lint           # biome (lint + format check)
npm run typecheck      # tsc --noEmit
npm run build          # dist/: tsc output, then dist/bundled.js
npm run verify:bundled # assert dist/bundled.js resolves nothing at runtime
```

`npm run build` is two steps. `tsc` emits the module graph that `.` and `./register` point at,
then [`vite.bundled.config.ts`](vite.bundled.config.ts) adds the single-file `./bundled` export
beside it — different entry, different filenames, so neither overwrites the other.
`npm run verify:bundled` re-reads that file and fails if a bare specifier or a second chunk ever
comes back; CI and `prepublishOnly` both run it, since that breakage is invisible until it reaches
a host.

`npm run dev` serves [`dev/`](dev/): a full order-fulfilment machine, a fake side-effect endpoint
with latency, a read-only toggle, a live event log and the live JSON value.

### Strictness

`tsconfig.json` runs with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`erasableSyntaxOnly` and friends. On top of that:

- Biome fails the build on `noUnsafeTypeAssertion` (bans every `as` except `as const`),
  `noExplicitAny`, `noNonNullAssertion` and `noTsIgnore`.
- [`test/source-hygiene.test.ts`](test/source-hygiene.test.ts) parses every file in `src/`, blanks
  out comments and literals, and fails if a type assertion, `any` or `!` assertion sneaks in. It
  also scans `src/ui/` for a user-facing label written straight into a `text:`, `title`,
  `aria-label`, `placeholder` or `textContent`, so a new control cannot quietly land back in
  English — see [Translation](#translation).

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
