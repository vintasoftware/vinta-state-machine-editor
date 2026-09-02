import { afterEach, describe, expect, it } from 'vitest';
import type { FanOutEvent } from '../src/index.js';
import { createState, type JsonObject, type StateMachine } from '../src/index.js';
import { mountEditor, queryButton, queryOne, querySvg, shadowOf } from './helpers.js';

function fanOutMachine(data: JsonObject = {}): StateMachine {
  return {
    states: [
      createState({
        id: 'processing',
        name: 'Processing',
        position: { x: 0, y: 0 },
        data: {
          is_waiting: true,
          join_action: 'import.finish',
          child_machine: 'import_file.status',
          ...data,
        },
      }),
    ],
    transitions: [],
    initialStateIds: [],
    finalStateIds: [],
    data: {},
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('following a fan-out', () => {
  it('asks the host to go there rather than going itself', () => {
    const editor = mountEditor();
    editor.value = fanOutMachine();
    const seen: { stateId: string; childMachine: string }[] = [];
    editor.addEventListener('state-machine-fan-out', (event: FanOutEvent) => {
      seen.push(event.detail);
    });
    queryButton(shadowOf(editor), '.band__row--child').click();
    expect(seen).toEqual([{ stateId: 'processing', childMachine: 'import_file.status' }]);
    // Nothing about the document changed: this is navigation, not an edit.
    expect(editor.value.states[0]?.data['child_machine']).toBe('import_file.status');
  });

  it('crosses the shadow boundary, so the page around it can listen', () => {
    const editor = mountEditor();
    editor.value = fanOutMachine();
    let heard = 0;
    document.addEventListener('state-machine-fan-out', () => {
      heard += 1;
    });
    expect(editor.followFanOut('processing')).toBe(true);
    expect(heard).toBe(1);
  });

  it('says nothing when there is no machine to go to', () => {
    const editor = mountEditor();
    editor.value = fanOutMachine({ child_machine: '' });
    let heard = 0;
    editor.addEventListener('state-machine-fan-out', () => {
      heard += 1;
    });
    expect(editor.followFanOut('processing')).toBe(false);
    expect(editor.followFanOut('nope')).toBe(false);
    expect(heard).toBe(0);
  });

  it('names where the line goes rather than what it holds', () => {
    const editor = mountEditor();
    editor.value = fanOutMachine();
    const row = queryButton(shadowOf(editor), '.band__row--child');
    expect(row.getAttribute('aria-label')).toContain('import_file.status');
    expect(row.title).toContain('import_file.status');
    expect(queryOne(row, '.band__go')).toBeTruthy();
  });

  it('draws a dashed stub leaving the card', () => {
    const editor = mountEditor();
    editor.value = fanOutMachine();
    const stub = querySvg(shadowOf(editor), '.fan-out-stub');
    expect(stub.style.display).toBe('');
    const line = querySvg(stub, '.fan-out-stub__line');
    expect(line.getAttribute('d')?.startsWith('M ')).toBe(true);
    expect(stub.getAttribute('aria-label')).toContain('import_file.status');
  });

  it('draws no stub where there is nowhere to point', () => {
    const editor = mountEditor();
    editor.value = fanOutMachine({ child_machine: '' });
    expect(querySvg(shadowOf(editor), '.fan-out-stub').style.display).toBe('none');
    editor.value = {
      states: [createState({ id: 'a', name: 'A', position: { x: 0, y: 0 } })],
      transitions: [],
      initialStateIds: [],
      finalStateIds: [],
      data: {},
    };
    expect(querySvg(shadowOf(editor), '.fan-out-stub').style.display).toBe('none');
  });

  it('keeps the stub even while the editor is read-only', () => {
    const editor = mountEditor();
    editor.value = fanOutMachine();
    editor.readOnly = true;
    expect(querySvg(shadowOf(editor), '.fan-out-stub').style.display).toBe('');
    let heard = 0;
    editor.addEventListener('state-machine-fan-out', () => {
      heard += 1;
    });
    queryButton(shadowOf(editor), '.band__row--child').click();
    expect(heard).toBe(1);
  });
});
