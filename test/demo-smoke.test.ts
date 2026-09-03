import { describe, expect, it } from 'vitest';
import { defineStateMachineEditor } from '../src/index.js';
import { queryAll, queryOne, shadowOf } from './helpers.js';

/* Both are set in the component's own stylesheet, which jsdom does not apply. */
const NODE_WIDTH = 248;
const DECISION_WIDTH = 268;

/**
 * The demo page is the only place the whole feature set is assembled at once,
 * so it is worth knowing it still draws — a broken example is the first thing
 * anybody sees.
 */
describe('the dev demo machine', () => {
  it('draws every surface the fan-out work added', async () => {
    defineStateMachineEditor();
    document.body.innerHTML = `
      <state-machine-editor id="editor"></state-machine-editor>
      <pre id="json"></pre><div id="log"></div><span id="event-count"></span>
      <input id="readonly" type="checkbox" />
      <select id="theme"><option value="dark"></option></select>
      <select id="icons"><option value="default"></option></select>
      <button id="fit"></button><button id="reset"></button>
      <button id="unpositioned"></button><button id="clear"></button>
    `;
    await import('../dev/main.js');
    const editor = document.querySelector('#editor');
    if (editor === null) {
      throw new Error('No editor.');
    }
    const root = shadowOf(editor);
    expect(queryAll(root, '.edge-card--decision')).toHaveLength(1);
    expect(queryAll(root, '.decision__row')).toHaveLength(4);
    expect(queryAll(root, '.decision__row.is-fallback')).toHaveLength(1);
    expect(queryAll(root, '.node.is-waiting')).toHaveLength(1);
    expect(queryAll(root, '.band:not([hidden]) .band__row--counts:not([hidden])')).toHaveLength(2);
    // The decision card belongs in the empty channel between the state that
    // fans out and the column of outcomes it fans out to — the one place on the
    // example canvas nothing else can drift into.
    const card = queryOne(root, '.edge-card--decision');
    const centre = Number.parseInt(card.style.left, 10);
    const processing = queryOne(root, '.node[data-state-id="processing"]');
    const outcome = queryOne(root, '.node[data-state-id="imported"]');
    const channel = {
      left: Number.parseInt(processing.style.left, 10) + NODE_WIDTH,
      right: Number.parseInt(outcome.style.left, 10),
    };
    expect(centre - DECISION_WIDTH / 2).toBeGreaterThan(channel.left);
    expect(centre + DECISION_WIDTH / 2).toBeLessThan(channel.right);

    // One stripe on purpose: `refund` leaves `paid`, which is a final state.
    const stripes = queryAll(root, '.stripes:not([hidden])');
    expect(stripes).toHaveLength(1);
    expect(stripes[0]?.textContent).toContain('cannot be left');
  });
});
