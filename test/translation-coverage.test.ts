import { afterEach, describe, expect, it } from 'vitest';
import type { GuardValidation, StateMachine, StringOverrides } from '../src/index.js';
import { createState, createTransition, DEFAULT_STRINGS } from '../src/index.js';
import { flush, mountEditor, queryButton, shadowOf } from './helpers.js';

/*
 * Every word the editor puts in front of a person has to be replaceable through
 * `strings`. A key that exists in the set but is never read at the place it
 * describes is invisible to a translator: the English keeps showing through and
 * nothing says why.
 *
 * So rather than reading the source and hoping, this renders the surfaces with
 * every string of the three new groups replaced by a marker of its own, and
 * insists on finding every one of those markers on screen. A key that is not
 * wired up fails here, and a key added later without a marker fails the count
 * check below.
 */
function marker(key: string): string {
  return `⟦${key}⟧`;
}

const DECISION: StringOverrides['decision'] = {
  outcomes: () => marker('decision.outcomes'),
  label: () => marker('decision.label'),
  fallback: marker('decision.fallback'),
  fallbackTitle: marker('decision.fallbackTitle'),
  orderTitle: () => marker('decision.orderTitle'),
  dead: marker('decision.dead'),
  deadTitle: marker('decision.deadTitle'),
  target: () => marker('decision.target'),
  targetTitle: () => marker('decision.targetTitle'),
  rowLabel: () => marker('decision.rowLabel'),
  reorderLabel: () => marker('decision.reorderLabel'),
  reorderTitle: marker('decision.reorderTitle'),
  fieldsLabel: () => marker('decision.fieldsLabel'),
  fieldName: marker('decision.fieldName'),
};

/*
 * The composing ones keep their parameters, so a string that only ever reaches
 * the screen through another — `outcome` inside `pair`, `half` inside
 * `brokenError` — is proved reachable too rather than being swallowed.
 */
const WAITING: StringOverrides['waiting'] = {
  role: marker('waiting.role'),
  mark: () => marker('waiting.mark'),
  unmark: () => marker('waiting.unmark'),
  bandLabel: () => marker('waiting.bandLabel'),
  fansOut: marker('waiting.fansOut'),
  fansOutLink: () => marker('waiting.fansOutLink'),
  fansOutTitle: () => marker('waiting.fansOutTitle'),
  stubLabel: () => marker('waiting.stubLabel'),
  joinsWith: marker('waiting.joinsWith'),
  timeout: marker('waiting.timeout'),
  countsAs: marker('waiting.countsAs'),
  outcome: {
    success: marker('waiting.outcome.success'),
    failure: marker('waiting.outcome.failure'),
  },
  pair: ({ outcome }) => `${marker('waiting.pair')}${outcome}`,
  pairTitle: marker('waiting.pairTitle'),
  enterOnly: ({ outcome }) => `${marker('waiting.enterOnly')}${outcome}`,
  enterOnlyTitle: marker('waiting.enterOnlyTitle'),
  broken: ({ outcome }) => `${marker('waiting.broken')}${outcome}`,
  brokenError: ({ half }) => `${marker('waiting.brokenError')}${half}`,
  half: { enter: marker('waiting.half.enter'), leave: marker('waiting.half.leave') },
  unset: marker('waiting.unset'),
  rowLabel: () => marker('waiting.rowLabel'),
  action: () => marker('waiting.action'),
  duration: () => marker('waiting.duration'),
  section: marker('waiting.section'),
  fieldWaiting: marker('waiting.fieldWaiting'),
  waitingHint: marker('waiting.waitingHint'),
  fieldJoin: marker('waiting.fieldJoin'),
  joinHint: marker('waiting.joinHint'),
  joinPlaceholder: marker('waiting.joinPlaceholder'),
  fieldChild: marker('waiting.fieldChild'),
  childPlaceholder: marker('waiting.childPlaceholder'),
  childHint: marker('waiting.childHint'),
  fieldTimeout: marker('waiting.fieldTimeout'),
  timeoutPlaceholder: marker('waiting.timeoutPlaceholder'),
  timeoutHint: marker('waiting.timeoutHint'),
  fieldCounts: marker('waiting.fieldCounts'),
  countsHint: marker('waiting.countsHint'),
  countsNone: marker('waiting.countsNone'),
};

const ISSUE: StringOverrides['issue'] = {
  label: marker('issue.label'),
  noFallback: marker('issue.noFallback'),
  noJoinEdge: marker('issue.noJoinEdge'),
  zeroTimeout: marker('issue.zeroTimeout'),
  terminalHasExit: marker('issue.terminalHasExit'),
  guard: ({ message }) => `${marker('issue.guard')}${message}`,
};

const OVERRIDES: StringOverrides = { decision: DECISION, waiting: WAITING, issue: ISSUE };

/** Every marker that should be findable, flattened out of the sets above. */
function markersOf(group: string, values: object): readonly string[] {
  return Object.keys(values).flatMap((key) => {
    const value = Reflect.get(values, key);
    if (value !== null && typeof value === 'object') {
      return markersOf(`${group}.${key}`, value);
    }
    return [marker(`${group}.${key}`)];
  });
}

/**
 * Everything a person can read: the text on screen, plus the three attributes
 * the editor writes prose into.
 *
 * The stylesheet is skipped. It is a text node like any other as far as the DOM
 * is concerned, and the prose in its comments is not something anybody reads
 * off the canvas.
 */
function readable(root: ParentNode): string {
  const parts: string[] = [];
  for (const element of root.querySelectorAll('*')) {
    if (element.localName === 'style' || element.localName === 'script') {
      continue;
    }
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.nodeValue ?? '');
      }
    }
    for (const name of ['title', 'aria-label', 'placeholder']) {
      parts.push(element.getAttribute(name) ?? '');
    }
  }
  return parts.join('\n');
}

const FINISH = { id: 'batch.finish', name: 'finish' };
const RETRY = { id: 'batch.retry', name: 'retry' };

/**
 * One machine holding every surface at once: a decision whose fallback is not
 * last (so both the `else` row and the dead rows behind it draw), a second
 * decision with no fallback at all, a state that waits, a state that waits
 * badly, and the three shapes a report pair can take.
 */
function everything(): StateMachine {
  const waiting = {
    is_waiting: true,
    join_action: 'batch.finish',
    child_machine: 'import_file.status',
    timeout: 'PT2H',
  };
  return {
    states: [
      createState({ id: 'running', name: 'Running', position: { x: 0, y: 0 }, data: waiting }),
      // Waits for an action no edge answers, and names no machine: the band's
      // join line draws unset, and the card earns a stripe.
      createState({
        id: 'stalled',
        name: 'Stalled',
        position: { x: 0, y: 600 },
        data: { is_waiting: true, timeout: 'PT0S' },
      }),
      createState({ id: 'a', name: 'Landed', position: { x: 600, y: 0 } }),
      createState({ id: 'b', name: 'Missed', position: { x: 600, y: 200 } }),
      // A whole pair, an enter-only pair on a final state, and two broken ones.
      createState({
        id: 'reports',
        name: 'Reports',
        position: { x: 600, y: 400 },
        data: { counts_as: 'success' },
      }),
      createState({
        id: 'ended',
        name: 'Ended',
        position: { x: 600, y: 600 },
        data: { counts_as: 'failure' },
      }),
      createState({
        id: 'half',
        name: 'Half',
        position: { x: 600, y: 800 },
        data: { counts_as: 'success', counts_as_partial: 'enter' },
      }),
      createState({
        id: 'other-half',
        name: 'Other half',
        position: { x: 600, y: 1000 },
        data: { counts_as: 'failure', counts_as_partial: 'leave' },
      }),
    ],
    transitions: [
      // Unguarded first, so the two behind it are unreachable.
      createTransition({ id: 'f0', name: 'catch all', from: 'running', to: 'a', trigger: FINISH }),
      createTransition({
        id: 'f1',
        name: 'landed',
        from: 'running',
        to: 'a',
        trigger: FINISH,
        guard: 'failed == 0',
      }),
      createTransition({
        id: 'f2',
        name: 'missed',
        from: 'running',
        to: 'b',
        trigger: FINISH,
        guard: 'failed > 0',
      }),
      // A second decision, every row guarded: no fallback.
      createTransition({
        id: 'r1',
        name: 'retry once',
        from: 'running',
        to: 'a',
        trigger: RETRY,
        guard: 'attempts < 3',
      }),
      createTransition({
        id: 'r2',
        name: 'retry twice',
        from: 'running',
        to: 'b',
        trigger: RETRY,
        guard: 'attempts < 5',
      }),
      // Leaves a terminal state, which the engine refuses.
      createTransition({ id: 'out', name: 'again', from: 'ended', to: 'a' }),
    ],
    initialStateIds: ['running'],
    finalStateIds: ['ended'],
    data: {},
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('translating the fan-out surfaces', () => {
  it('has a marker for every string of every new group', () => {
    // A key added to the set without a marker here fails, rather than quietly
    // going untested.
    expect(Object.keys(DECISION)).toEqual(Object.keys(DEFAULT_STRINGS.decision));
    expect(Object.keys(WAITING)).toEqual(Object.keys(DEFAULT_STRINGS.waiting));
    expect(Object.keys(ISSUE)).toEqual(Object.keys(DEFAULT_STRINGS.issue));
  });

  it('reads every one of them off the set the host supplied', async () => {
    const editor = mountEditor();
    editor.strings = OVERRIDES;
    editor.guardValidator = (): GuardValidation => ({ ok: false, errors: ['bad guard'] });
    // The fan-out line is only a link, and only names where it goes, once a
    // host has said it can route it.
    editor.fanOutHandler = () => undefined;
    editor.value = everything();
    await flush();

    const root = shadowOf(editor);
    // The row panel, the only place the name field and its heading are drawn.
    queryButton(root, '.decision__row[data-transition-id="f1"] .decision__summary').click();
    // And the properties dialog, which owns the waiting fields.
    void editor.openProperties({ kind: 'state', id: 'running' });
    await flush();

    const dialog = root.querySelector('state-machine-properties-dialog');
    const shown = `${readable(root)}\n${dialog === null ? '' : readable(shadowOf(dialog))}`;

    const expected = [
      ...markersOf('decision', DECISION),
      ...markersOf('waiting', WAITING),
      ...markersOf('issue', ISSUE),
    ];
    const missing = expected.filter((each) => !shown.includes(each));
    expect(missing).toEqual([]);
  });

  it('leaves no English from those groups showing once they are replaced', async () => {
    const editor = mountEditor();
    editor.strings = OVERRIDES;
    editor.value = everything();
    await flush();
    // The markers come out first: a key's own name can contain the English it
    // replaced — `⟦decision.fieldName⟧` holds `Name` — and that is the marker
    // doing its job, not the default showing through.
    const shown = readable(shadowOf(editor)).replaceAll(/⟦[^⟧]*⟧/gu, '');

    // Every plain string of the three groups, which is the part a reader would
    // catch: a defaulted function is covered by the marker check above.
    const english = [
      ...Object.values(DEFAULT_STRINGS.decision),
      ...Object.values(DEFAULT_STRINGS.waiting),
      ...Object.values(DEFAULT_STRINGS.issue),
    ].flatMap((value) => (typeof value === 'string' && value.length > 2 ? [value] : []));
    const leaked = english.filter((value) => shown.includes(value));
    expect(leaked).toEqual([]);
  });
});
