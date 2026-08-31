import { afterEach, describe, expect, it } from 'vitest';
import { type ConfirmDialogElement, defineStateMachineEditor } from '../src/index.js';
import { fireKey, queryButton, queryOne, shadowOf } from './helpers.js';

function mountDialog(): ConfirmDialogElement {
  defineStateMachineEditor();
  const dialog = document.createElement('state-machine-confirm-dialog');
  document.body.append(dialog);
  return dialog;
}

const QUESTION = { title: 'Organize the layout?', message: 'Every card is moved.' } as const;

afterEach(() => {
  document.body.replaceChildren();
});

describe('confirm dialog', () => {
  it('asks the question it was given', () => {
    const dialog = mountDialog();
    void dialog.open({ ...QUESTION, confirmLabel: 'Organize' });
    const root = shadowOf(dialog);

    expect(queryOne(root, '.title').textContent).toBe('Organize the layout?');
    expect(queryOne(root, '[data-confirm="message"]').textContent).toBe('Every card is moved.');
    expect(queryButton(root, '[data-confirm="confirm"]').textContent).toBe('Organize');
    expect(queryButton(root, '[data-confirm="cancel"]').textContent).toBe('Cancel');
  });

  it('resolves true when the confirm button is pressed', async () => {
    const dialog = mountDialog();
    const answer = dialog.open(QUESTION);
    queryButton(shadowOf(dialog), '[data-confirm="confirm"]').click();

    await expect(answer).resolves.toBe(true);
  });

  it('resolves false when it is cancelled', async () => {
    const dialog = mountDialog();
    const answer = dialog.open(QUESTION);
    queryButton(shadowOf(dialog), '[data-confirm="cancel"]').click();

    await expect(answer).resolves.toBe(false);
  });

  it('takes Escape as a no', async () => {
    const dialog = mountDialog();
    const answer = dialog.open(QUESTION);
    fireKey(queryOne(shadowOf(dialog), '.panel'), 'Escape');

    await expect(answer).resolves.toBe(false);
  });

  it('takes a press on the backdrop as a no', async () => {
    const dialog = mountDialog();
    const answer = dialog.open(QUESTION);
    queryOne(shadowOf(dialog), '.backdrop').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );

    await expect(answer).resolves.toBe(false);
  });

  it('ignores a press that started inside the panel', () => {
    const dialog = mountDialog();
    let settled = false;
    void dialog.open(QUESTION).then(() => {
      settled = true;
    });
    queryOne(shadowOf(dialog), '.panel').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );

    expect(settled).toBe(false);
  });

  it('focuses cancel, so the destructive button is pressed on purpose', () => {
    const dialog = mountDialog();
    void dialog.open(QUESTION);

    expect(shadowOf(dialog).activeElement).toBe(
      queryButton(shadowOf(dialog), '[data-confirm="cancel"]'),
    );
  });
});
