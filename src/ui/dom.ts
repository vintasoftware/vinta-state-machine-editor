export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly parent?: ParentNode;
  readonly attrs?: Readonly<Record<string, string>>;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function applyOptions(element: Element, options: ElementOptions | undefined): void {
  if (options === undefined) {
    return;
  }
  if (options.className !== undefined) {
    element.setAttribute('class', options.className);
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  if (options.attrs !== undefined) {
    for (const [name, value] of Object.entries(options.attrs)) {
      element.setAttribute(name, value);
    }
  }
  options.parent?.append(element);
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: ElementOptions,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  applyOptions(element, options);
  return element;
}

export function createButton(options?: ElementOptions): HTMLButtonElement {
  const button = createElement('button', options);
  button.type = 'button';
  return button;
}

export function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  options?: ElementOptions,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  applyOptions(element, options);
  return element;
}

export function isHtmlElement(value: EventTarget | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

/** True when the event started on an interactive control that handles it on its own. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!isHtmlElement(target)) {
    return false;
  }
  return target.closest('button, input, select, textarea, a[href]') !== null;
}

export function setToggleClass(element: Element, className: string, enabled: boolean): void {
  element.classList.toggle(className, enabled);
}

/** Focusable descendants, in DOM order. */
export function focusableElements(root: ParentNode): readonly HTMLElement[] {
  const selector = 'button:not([disabled]), [href], input, select, textarea, [tabindex]';
  const found: HTMLElement[] = [];
  for (const candidate of root.querySelectorAll(selector)) {
    if (isHtmlElement(candidate) && candidate.tabIndex >= 0) {
      found.push(candidate);
    }
  }
  return found;
}
