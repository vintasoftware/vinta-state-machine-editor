import { isHtmlElement } from './dom.js';

/**
 * Index the dragged row should land on, given the vertical centers of every row
 * and the current pointer position.
 */
export function computeDropIndex(centers: readonly number[], pointerY: number): number {
  if (centers.length === 0) {
    return 0;
  }
  let index = 0;
  for (const center of centers) {
    if (pointerY > center) {
      index += 1;
    }
  }
  return Math.min(index, centers.length - 1);
}

export interface ReorderOptions {
  /** Container holding the rows. */
  readonly list: HTMLElement;
  /** Selector matching each row; rows must carry a numeric `data-index`. */
  readonly rowSelector: string;
  /** Selector matching the drag handle inside a row. */
  readonly handleSelector: string;
  readonly onReorder: (from: number, to: number) => void;
  /**
   * Called once when the gesture ends, whatever it moved. A list backed by a
   * draft has nothing to do here; one backed by the document uses it to fold the
   * whole drag into a single undoable step.
   */
  readonly onDrop?: (() => void) | undefined;
}

function readIndex(element: Element): number | undefined {
  const raw = element.getAttribute('data-index');
  if (raw === null) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Pointer driven drag & drop reordering for a vertical list. */
export class ReorderController {
  readonly #options: ReorderOptions;
  #activeIndex: number | undefined;

  constructor(options: ReorderOptions) {
    this.#options = options;
    /*
     * Capture phase: a row is free to stop the press from bubbling — one that
     * selects what it holds has every reason to — and the grip inside it must
     * still start a drag. Nothing downstream is disturbed by seeing it first;
     * the press is only claimed once it lands on a handle.
     */
    this.#options.list.addEventListener('pointerdown', this.#onPointerDown, { capture: true });
  }

  destroy(): void {
    this.#options.list.removeEventListener('pointerdown', this.#onPointerDown, { capture: true });
    this.#stop();
  }

  get dragging(): boolean {
    return this.#activeIndex !== undefined;
  }

  #rowCenters(): readonly number[] {
    const centers: number[] = [];
    for (const row of this.#options.list.querySelectorAll(this.#options.rowSelector)) {
      const rect = row.getBoundingClientRect();
      centers.push(rect.top + rect.height / 2);
    }
    return centers;
  }

  #onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!isHtmlElement(target)) {
      return;
    }
    const handle = target.closest(this.#options.handleSelector);
    if (handle === null) {
      return;
    }
    const row = handle.closest(this.#options.rowSelector);
    if (row === null) {
      return;
    }
    const index = readIndex(row);
    if (index === undefined) {
      return;
    }
    event.preventDefault();
    this.#activeIndex = index;
    this.#options.list.classList.add('is-reordering');
    const doc = this.#options.list.ownerDocument;
    doc.addEventListener('pointermove', this.#onPointerMove);
    doc.addEventListener('pointerup', this.#onPointerUp);
    doc.addEventListener('pointercancel', this.#onPointerUp);
  };

  #onPointerMove = (event: PointerEvent): void => {
    const from = this.#activeIndex;
    if (from === undefined) {
      return;
    }
    const to = computeDropIndex(this.#rowCenters(), event.clientY);
    if (to !== from) {
      this.#activeIndex = to;
      this.#options.onReorder(from, to);
    }
  };

  #onPointerUp = (): void => {
    this.#stop();
  };

  #stop(): void {
    if (this.#activeIndex === undefined) {
      return;
    }
    this.#activeIndex = undefined;
    this.#options.list.classList.remove('is-reordering');
    const doc = this.#options.list.ownerDocument;
    doc.removeEventListener('pointermove', this.#onPointerMove);
    doc.removeEventListener('pointerup', this.#onPointerUp);
    doc.removeEventListener('pointercancel', this.#onPointerUp);
    this.#options.onDrop?.();
  }
}
