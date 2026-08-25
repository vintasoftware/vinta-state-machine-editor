/** Design tokens shared by the editor and the dialog. */
export const tokens: string = `
  :host {
    --sme-font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --sme-surface: #ffffff;
    --sme-surface-muted: #f4f5f7;
    --sme-canvas: #f8f9fb;
    --sme-grid: #e3e6ec;
    --sme-border: #d7dbe3;
    --sme-text: #16181d;
    --sme-text-muted: #666f7d;
    --sme-accent: #3d63dd;
    --sme-accent-soft: #e7edff;
    --sme-danger: #c62f3a;
    --sme-edge: #8b93a3;
    --sme-radius: 10px;
    --sme-code-key: #8250df;
    --sme-code-string: #0a7c42;
    --sme-code-number: #b3541e;
    --sme-code-keyword: #0550ae;
    --sme-code-punctuation: #6b7280;
    --sme-code-invalid: #c62f3a;
    --sme-code-selection: rgba(61, 99, 221, 0.28);
    --sme-color-neutral: #64748b;
    --sme-color-info: #3b82f6;
    --sme-color-success: #16a34a;
    --sme-color-warning: #d97706;
    --sme-color-danger: #dc2626;
    --sme-color-muted: #cbd5e1;
    --sme-shadow: 0 1px 2px rgba(16, 24, 40, 0.08), 0 8px 24px rgba(16, 24, 40, 0.08);
    --sme-node-width: 248px;
    color-scheme: light dark;
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --sme-surface: #1b1e25;
      --sme-surface-muted: #22262f;
      --sme-canvas: #14161b;
      --sme-grid: #23262e;
      --sme-border: #333844;
      --sme-text: #eef1f6;
      --sme-text-muted: #9aa3b2;
      --sme-accent: #7d9bff;
      --sme-accent-soft: #26304a;
      --sme-danger: #ff8080;
      --sme-edge: #6d7688;
      --sme-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.35);
      --sme-code-key: #c8a8ff;
      --sme-code-string: #7ee2a8;
      --sme-code-number: #ffb27a;
      --sme-code-keyword: #8ab4ff;
      --sme-code-punctuation: #8b93a3;
      --sme-code-invalid: #ff8080;
      --sme-code-selection: rgba(125, 155, 255, 0.32);
      --sme-color-neutral: #94a3b8;
      --sme-color-info: #60a5fa;
      --sme-color-success: #4ade80;
      --sme-color-warning: #fbbf24;
      --sme-color-danger: #f87171;
      --sme-color-muted: #475569;
    }
  }

  * { box-sizing: border-box; }

  /* Keeps the hidden property working for elements with an explicit display. */
  [hidden] { display: none !important; }

  button {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  button:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--sme-accent);
    outline-offset: 2px;
  }
`;

export const editorStyles: string = `
  ${tokens}

  :host {
    display: block;
    position: relative;
    min-height: 320px;
    font-family: var(--sme-font);
    color: var(--sme-text);
    background: var(--sme-canvas);
    overflow: hidden;
  }

  :host([hidden]) { display: none; }

  .viewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    background-image:
      linear-gradient(to right, var(--sme-grid) 1px, transparent 1px),
      linear-gradient(to bottom, var(--sme-grid) 1px, transparent 1px);
    background-size: var(--sme-grid-size, 24px) var(--sme-grid-size, 24px);
    background-position: var(--sme-grid-offset-x, 0) var(--sme-grid-offset-y, 0);
    cursor: grab;
  }

  .viewport.is-panning { cursor: grabbing; }
  .viewport.is-pinching { cursor: zoom-in; }

  .world {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
  }

  /*
   * will-change promotes the world to its own compositor layer, which makes a
   * gesture cheap but freezes the layer's raster: zooming then scales that
   * bitmap and the text goes soft. It is therefore only hinted while a gesture
   * is running, and dropped afterwards so the browser re-renders text at the
   * settled scale.
   */
  .world.is-transforming { will-change: transform; }

  .edges {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
  }

  .edge {
    fill: none;
    stroke: var(--sme-edge);
    stroke-width: 1.75;
  }

  .edge.is-selected { stroke: var(--sme-accent); stroke-width: 2.5; }
  .edge--preview { stroke-dasharray: 6 5; stroke: var(--sme-accent); }
  .arrow { fill: var(--sme-edge); }

  .node {
    --sme-state-color: var(--sme-color-neutral);
    position: absolute;
    width: var(--sme-node-width);
    background: var(--sme-surface);
    border: 1px solid var(--sme-border);
    border-radius: var(--sme-radius);
    box-shadow: var(--sme-shadow);
    user-select: none;
  }

  .node[data-color='info'] { --sme-state-color: var(--sme-color-info); }
  .node[data-color='success'] { --sme-state-color: var(--sme-color-success); }
  .node[data-color='warning'] { --sme-state-color: var(--sme-color-warning); }
  .node[data-color='danger'] { --sme-state-color: var(--sme-color-danger); }
  .node[data-color='muted'] { --sme-state-color: var(--sme-color-muted); }

  .node__bar {
    height: 5px;
    border-radius: calc(var(--sme-radius) - 1px) calc(var(--sme-radius) - 1px) 0 0;
    background: var(--sme-state-color);
  }

  .node.is-selected { border-color: var(--sme-accent); box-shadow: 0 0 0 2px var(--sme-accent-soft), var(--sme-shadow); }

  /* Final states get the double outline UML uses for an end state. */
  .node.is-final {
    outline: 2px solid var(--sme-border);
    outline-offset: 3px;
  }

  .node.is-final.is-selected { outline-color: var(--sme-accent); }

  .start-marker__dot { fill: var(--sme-text); }
  .start-marker__line { stroke: var(--sme-text); stroke-width: 1.75; }

  /*
   * The start pseudostate, drawn as a slim vertical bar rather than a dot: every
   * creation edge leaves it from a slot of its own, so they need room to spread
   * instead of all radiating out of one point. Its height is set inline, from
   * the number of edges.
   */
  .start-node {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    border-radius: 999px;
    background: var(--sme-text);
    box-shadow: 0 0 0 3px var(--sme-canvas);
    user-select: none;
  }

  /*
   * Down the bar, not across it, so the label costs no horizontal room. The
   * clipping lives here rather than on the bar: overflow on the bar would also
   * clip the handle hanging below it, dragging it back on top of this text.
   */
  .start-node__label {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    max-height: 100%;
    overflow: hidden;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--sme-canvas);
  }

  /*
   * Clear of the bar's bottom edge and its halo, so it covers neither the label
   * nor an edge leaving the bar.
   *
   * Two classes on purpose: .node__link is declared further down this sheet at
   * the same specificity, so a single class here loses the cascade and its
   * top/right pin the handle back inside the bar, on top of the label.
   */
  .start-node .start-node__link {
    top: auto;
    right: auto;
    bottom: -34px;
    left: 6px;
  }
  .node.is-link-target { border-color: var(--sme-accent); }

  .node__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--sme-border);
    cursor: grab;
  }

  .node__header.is-dragging { cursor: grabbing; }

  .node__name {
    flex: 1;
    font-weight: 600;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name-edit {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .icon-button--confirm { color: var(--sme-accent); }
  .icon-button--confirm:hover { color: var(--sme-accent); }

  .name-input {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-weight: 600;
    font-size: 14px;
    color: inherit;
    background: var(--sme-surface-muted);
    border: 1px solid var(--sme-accent);
    border-radius: 6px;
    padding: 2px 6px;
  }

  .hooks { display: grid; gap: 4px; padding: 8px 10px 10px; }

  .hook { display: grid; grid-template-columns: 84px 1fr; align-items: center; gap: 8px; }

  .hook__label {
    font-size: 9.5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--sme-text-muted);
  }

  .chip {
    display: flex;
    align-items: center;
    position: relative;
    width: 100%;
    /*
     * The chip is a grid item, and a grid item's automatic minimum size is its
     * min-content width — the whole unwrapped name — which pushes the column,
     * and the card with it, wider than the card is allowed to be. Clipping used
     * to resolve that minimum to zero for free; now that the badge needs the
     * chip not to clip, the zero has to be asked for.
     */
    min-width: 0;
    text-align: left;
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px dashed var(--sme-border);
    color: var(--sme-text-muted);
    background: var(--sme-surface-muted);
  }

  /*
   * The elision lives on the label rather than on the chip, so the chip itself
   * does not clip: the count badge hangs off its leading edge, outside the box.
   */
  .chip__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /*
   * Marks a list where at least one side effect receives parameters. It is taken
   * out of flow: as a float it could not share a line with a label that already
   * fills the chip, so it dropped onto a second line and grew the card.
   */
  .chip[data-has-params] { padding-right: 24px; }

  .chip[data-has-params]::after {
    content: '{ }';
    position: absolute;
    top: 50%;
    right: 7px;
    transform: translateY(-50%);
    font-size: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--sme-accent);
    opacity: 0.9;
  }

  /*
   * How many side effects the list holds, once it holds more than one. A written
   * count is the first thing the chip's single line elides — exactly the part
   * saying the list is longer than it looks — so it floats on the chip's leading
   * edge instead, in the gutter next to the hook's own label, where it costs the
   * name no room at all. One side effect gets no badge: its name is the whole
   * story already.
   */
  .chip[data-many]::before {
    content: attr(data-count);
    position: absolute;
    top: 50%;
    /* A hair inside the border: the hook's own label sits 8px away, and the
       badge should not crowd it on the state cards, where that label is long. */
    left: 1px;
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 700;
    line-height: 14px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    color: var(--sme-text-muted);
    background: var(--sme-surface);
    box-shadow: inset 0 0 0 1px var(--sme-border);
  }

  .chip.is-filled {
    border-style: solid;
    border-color: transparent;
    background: var(--sme-accent-soft);
    color: var(--sme-text);
    font-weight: 500;
  }

  .chip:disabled { cursor: default; }

  /*
   * Both cards keep their tools in a rail floating above the card rather than in
   * the header: a state card had four hit targets sharing that line with the
   * name and a transition card three, and the name was what gave way. Out of
   * flow, the rail costs the name nothing.
   *
   * It surfaces on hover, while the card is selected — which is what a tap gives
   * touch — and whenever it holds focus, so the keyboard path stays unbroken.
   *
   * Anything the pointer can see it can reach:
   *
   *  - The rail hangs a transparent bridge across the gap over the card, so the
   *    walk from card to rail never crosses ground that belongs to neither and
   *    the hover never breaks. The rail is the card's own child, so standing on
   *    it keeps the card hovered however far outside the card's box it sits.
   *  - Leaving the card starts a grace period rather than a fade, so a pointer
   *    that wanders off the side and back arrives to find the rail still there.
   *  - The rail stops taking clicks on the same beat that it finishes fading,
   *    rather than the moment the pointer leaves, so nothing on screen is ever
   *    dead to a click. It goes out through pointer-events and not through
   *    visibility, which would take the buttons out of the tab order and strand
   *    the :focus-within that brings the rail back for the keyboard.
   */
  .card-actions {
    --sme-rail-gap: 6px;
    --sme-rail-fade: 120ms;
    --sme-rail-grace: 260ms;
    position: absolute;
    right: 0;
    bottom: calc(100% + var(--sme-rail-gap));
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    background: var(--sme-surface);
    border: 1px solid var(--sme-border);
    border-radius: 9px;
    box-shadow: var(--sme-shadow);
    opacity: 0;
    pointer-events: none;
    /*
     * pointer-events is a discrete property: the delay is the whole point of
     * transitioning it, and allow-discrete is what lets it be transitioned at
     * all. Where that is unsupported the flip is immediate, which is only the
     * grace period going unclaimed — the bridge below covers the walk that
     * matters without it.
     */
    transition:
      opacity var(--sme-rail-fade) ease var(--sme-rail-grace),
      pointer-events 0s linear calc(var(--sme-rail-grace) + var(--sme-rail-fade));
    transition-behavior: allow-discrete;
  }

  /* The bridge. Inert with the rail, so it never sits over an idle card. */
  .card-actions::after {
    content: '';
    position: absolute;
    top: 100%;
    right: 0;
    left: 0;
    height: calc(var(--sme-rail-gap) + 2px);
  }

  .node:hover > .card-actions,
  .node.is-selected > .card-actions,
  .edge-card:hover > .card-actions,
  .edge-card.is-selected > .card-actions,
  .card-actions:focus-within {
    opacity: 1;
    pointer-events: auto;
    transition:
      opacity var(--sme-rail-fade) ease 0s,
      pointer-events 0s linear 0s;
  }

  /* Keeps the grace period, drops the fade. */
  @media (prefers-reduced-motion: reduce) {
    .card-actions { --sme-rail-fade: 0s; }
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    color: var(--sme-text-muted);
    font-size: 13px;
    line-height: 1;
  }

  .icon-button:hover { background: var(--sme-surface-muted); color: var(--sme-text); }
  .node__remove:hover,
  .edge-card__remove:hover { color: var(--sme-danger); }

  .node__color {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
  }

  .node__color::before {
    content: '';
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--sme-state-color);
    box-shadow: 0 0 0 1px var(--sme-border);
  }

  .node__color:hover { background: var(--sme-surface-muted); }

  /* Opens above the rail, under the colour button it belongs to. */
  .node__palette {
    position: absolute;
    right: 0;
    bottom: calc(100% + 42px);
    z-index: 3;
    display: grid;
    grid-template-columns: repeat(3, 22px);
    gap: 8px;
    padding: 9px;
    background: var(--sme-surface);
    border: 1px solid var(--sme-border);
    border-radius: 9px;
    box-shadow: var(--sme-shadow);
  }

  .palette__option {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--sme-border);
  }

  .palette__option:hover { transform: scale(1.12); }

  .palette__option.is-selected {
    box-shadow: 0 0 0 2px var(--sme-surface), 0 0 0 4px var(--sme-accent);
  }

  .palette__option--neutral { background: var(--sme-color-neutral); }
  .palette__option--info { background: var(--sme-color-info); }
  .palette__option--success { background: var(--sme-color-success); }
  .palette__option--warning { background: var(--sme-color-warning); }
  .palette__option--danger { background: var(--sme-color-danger); }
  .palette__option--muted { background: var(--sme-color-muted); }

  .node__roles {
    display: flex;
    gap: 6px;
    padding: 0 10px 10px;
  }

  .node__role {
    flex: 1;
    padding: 3px 6px;
    font-size: 10px;
    letter-spacing: 0.03em;
    border: 1px solid var(--sme-border);
    border-radius: 999px;
    color: var(--sme-text-muted);
    background: var(--sme-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .node__role:hover:not(:disabled) { border-color: var(--sme-accent); color: var(--sme-text); }

  .node__role.is-on {
    border-color: transparent;
    background: var(--sme-accent-soft);
    color: var(--sme-text);
    font-weight: 600;
  }

  .node__role:disabled { cursor: default; opacity: 0.75; }
  .node__role:disabled:not(.is-on) { opacity: 0.4; }

  .node__create {
    flex: none;
    padding: 3px 8px;
    font-size: 10px;
    letter-spacing: 0.03em;
    border: 1px dashed var(--sme-border);
    border-radius: 999px;
    color: var(--sme-text-muted);
    background: var(--sme-surface);
    white-space: nowrap;
  }

  .node__create:hover:not(:disabled) { border-color: var(--sme-accent); color: var(--sme-text); }
  .node__create:disabled { cursor: default; opacity: 0.4; }

  .node__link {
    position: absolute;
    top: 8px;
    right: -11px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--sme-accent);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    box-shadow: var(--sme-shadow);
    cursor: crosshair;
  }

  .edge-card {
    position: absolute;
    width: 186px;
    transform: translate(-50%, -50%);
    background: var(--sme-surface);
    border: 1px solid var(--sme-border);
    border-radius: var(--sme-radius);
    box-shadow: var(--sme-shadow);
    user-select: none;
  }

  .edge-card.is-selected { border-color: var(--sme-accent); box-shadow: 0 0 0 2px var(--sme-accent-soft), var(--sme-shadow); }

  .edge-card__header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--sme-border);
    cursor: grab;
  }

  .edge-card__header.is-dragging { cursor: grabbing; }

  .edge-card__name {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .edge-card.is-creation { border-style: dashed; }

  .edge-card__meta {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 8px 0;
    min-width: 0;
  }

  .edge-card__trigger,
  .edge-card__guard {
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .edge-card__trigger { flex: none; max-width: 60%; color: var(--sme-accent); font-weight: 600; }

  .edge-card__guard {
    flex: 1;
    min-width: 0;
    color: var(--sme-text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .edge-card .hooks { padding: 6px 8px 8px; }
  .edge-card .hook { grid-template-columns: 46px 1fr; }

  .toolbar {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    /* Nine controls outgrow a phone; wrapping keeps them all reachable rather
       than running the last of them off the edge of the canvas. */
    flex-wrap: wrap;
    max-width: calc(100% - 24px);
    gap: 6px;
    padding: 6px;
    background: var(--sme-surface);
    border: 1px solid var(--sme-border);
    border-radius: var(--sme-radius);
    box-shadow: var(--sme-shadow);
    z-index: 2;
  }

  .toolbar button {
    min-width: 30px;
    height: 30px;
    padding: 0 10px;
    border-radius: 7px;
    font-size: 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .toolbar button:hover:not(:disabled) { background: var(--sme-surface-muted); }
  .toolbar button:disabled { opacity: 0.45; cursor: not-allowed; }
  .toolbar__zoom { min-width: 56px; font-variant-numeric: tabular-nums; }
  /* The arrows sit small for their em box, so they need a size of their own. */
  .toolbar__history { font-size: 16px; line-height: 1; }

  /*
   * Touch and pen: grow every hit target. 22px icons are comfortable with a
   * mouse and far too small for a fingertip.
   */
  @media (pointer: coarse) {
    /* The header is the name alone now, but the roles row still lines up three
       grown-up pills, so the card keeps the width they need. */
    :host { --sme-node-width: 288px; }
    .icon-button { width: 32px; height: 32px; font-size: 15px; }
    .node__role { padding: 7px 8px; font-size: 12px; }
    .node__create { padding: 7px 10px; font-size: 12px; }
    .node__color { width: 32px; height: 32px; }
    .node__color::before { width: 16px; height: 16px; }
    .card-actions { gap: 4px; padding: 4px; border-radius: 11px; }
    /* Clears the taller rail. */
    .node__palette { grid-template-columns: repeat(3, 32px); gap: 10px; bottom: calc(100% + 54px); }
    .palette__option { width: 32px; height: 32px; }
    .node__header { padding: 10px; gap: 6px; }
    .node__link { width: 32px; height: 32px; right: -16px; font-size: 15px; }
    .start-node .start-node__link { top: auto; right: auto; bottom: -46px; left: 4px; }
    .start-node { width: 40px; }
    .start-node__label { font-size: 13px; }
    .chip { padding: 8px 10px; font-size: 13px; }
    .hook { grid-template-columns: 84px 1fr; gap: 10px; }
    .toolbar button { min-width: 40px; height: 40px; }
    .edge-card { width: 210px; }
  }

  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--sme-text-muted);
    font-size: 14px;
    pointer-events: none;
  }
`;

export const dialogStyles: string = `
  ${tokens}

  :host {
    display: contents;
    font-family: var(--sme-font);
  }

  .backdrop {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(12, 15, 20, 0.45);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: min(460px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 18px;
    color: var(--sme-text);
    background: var(--sme-surface);
    border: 1px solid var(--sme-border);
    border-radius: 14px;
    box-shadow: var(--sme-shadow);
  }

  .title { margin: 0; font-size: 16px; }
  .subtitle { margin: 2px 0 0; font-size: 12px; color: var(--sme-text-muted); }

  .list { list-style: none; display: grid; gap: 6px; margin: 0; padding: 0; min-width: 0; }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 7px 9px;
    background: var(--sme-surface-muted);
    border: 1px solid var(--sme-border);
    border-radius: 8px;
  }

  .list.is-reordering .row { transition: transform 120ms ease; }

  .row__handle { flex: none; cursor: grab; color: var(--sme-text-muted); touch-action: none; }

  .row__enabled { flex: none; margin: 0; accent-color: var(--sme-accent); }

  .row__description {
    margin: 0 9px 8px 9px;
    padding: 3px 6px;
    font: inherit;
    font-size: 11px;
    color: var(--sme-text-muted);
    background: var(--sme-surface);
    border: 1px solid var(--sme-border);
    border-radius: 6px;
  }

  /* Attached and configured, but it does not run: shown, and shown as off. */
  .row-item.is-disabled .row__name,
  .row-item.is-disabled .row__order { opacity: 0.5; text-decoration: line-through; }
  .row-item.is-disabled .row__params { opacity: 0.5; }

  @media (pointer: coarse) {
    .row { padding: 11px 12px; gap: 12px; }
    .row__params { padding: 7px 10px; font-size: 12px; }
    .jf-key,
    .jf-value,
    .jf-type { padding: 7px; font-size: 13px; }
    .params__editor .cm-scroller { font-size: 13px; }
    .row__handle,
    .row__remove { width: 32px; height: 32px; font-size: 16px; }
    .row__enabled { width: 20px; height: 20px; }
    .row__description { padding: 7px; font-size: 13px; }
    .button { padding: 11px 18px; }
    .add select { padding: 10px; }
  }
  .row__order {
    flex: none;
    font-size: 11px;
    color: var(--sme-text-muted);
    font-variant-numeric: tabular-nums;
  }

  /*
   * min-width lets the name shrink past its own text. Without it a long name
   * refuses to give ground, squeezing the badge until its label wraps and the
   * whole row grows a second line.
   */
  .row__name {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row__remove {
    flex: none;
    color: var(--sme-text-muted);
    font-size: 13px;
    width: 22px;
    height: 22px;
    border-radius: 6px;
  }

  .row__remove:hover { color: var(--sme-danger); background: var(--sme-surface); }

  .empty { margin: 0; font-size: 13px; color: var(--sme-text-muted); }

  .row-item {
    display: grid;
    gap: 6px;
    padding: 0;
    /* Grid items default to min-width: auto, which would let a long name push
       the whole row past the dialog and take the remove button with it. */
    min-width: 0;
    background: var(--sme-surface-muted);
    border: 1px solid var(--sme-border);
    border-radius: 8px;
  }

  .row__params {
    flex: none;
    white-space: nowrap;
    padding: 2px 7px;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    border: 1px solid var(--sme-border);
    border-radius: 999px;
    color: var(--sme-text-muted);
    background: var(--sme-surface);
  }

  .row__params.is-set {
    border-color: transparent;
    background: var(--sme-accent-soft);
    color: var(--sme-text);
  }

  .row__params.is-open { border-color: var(--sme-accent); }
  .row__params:hover { color: var(--sme-text); }

  .params {
    display: grid;
    gap: 8px;
    padding: 0 9px 10px;
    border-top: 1px dashed var(--sme-border);
    padding-top: 8px;
  }

  .params__modes { display: flex; gap: 4px; }

  .params__mode {
    padding: 3px 10px;
    font-size: 11px;
    border-radius: 999px;
    border: 1px solid var(--sme-border);
    color: var(--sme-text-muted);
    background: var(--sme-surface);
  }

  .params__mode[aria-selected='true'] {
    border-color: transparent;
    background: var(--sme-accent);
    color: #fff;
  }

  .params__form { display: grid; gap: 4px; }

  .jf-row { display: flex; align-items: center; gap: 4px; }

  .jf-key,
  .jf-value {
    min-width: 0;
    padding: 3px 6px;
    font: inherit;
    font-size: 12px;
    color: inherit;
    background: var(--sme-surface);
    border: 1px solid var(--sme-border);
    border-radius: 6px;
  }

  .jf-key { flex: 1 1 35%; }
  .jf-value { flex: 1 1 45%; }
  .jf-index { font-size: 11px; color: var(--sme-text-muted); min-width: 22px; }

  .jf-type {
    font: inherit;
    font-size: 11px;
    padding: 3px;
    color: var(--sme-text-muted);
    background: var(--sme-surface);
    border: 1px solid var(--sme-border);
    border-radius: 6px;
  }

  .jf-summary,
  .jf-null { flex: 1; font-size: 11px; color: var(--sme-text-muted); font-style: italic; }

  .jf-remove {
    width: 20px;
    height: 20px;
    border-radius: 5px;
    font-size: 11px;
    color: var(--sme-text-muted);
  }

  .jf-remove:hover { color: var(--sme-danger); background: var(--sme-surface); }

  .jf-add {
    justify-self: start;
    padding: 2px 8px;
    font-size: 11px;
    border-radius: 999px;
    border: 1px dashed var(--sme-border);
    color: var(--sme-text-muted);
  }

  .jf-add:hover { border-color: var(--sme-accent); color: var(--sme-text); }
  .jf-empty { margin: 0; font-size: 12px; color: var(--sme-text-muted); }

  .params__editor { display: grid; }

  .params__error { margin: 4px 0 0; font-size: 11px; color: var(--sme-danger); }

  .add { display: flex; gap: 8px; align-items: center; }
  .add select { flex: 1; min-width: 0; padding: 6px; border-radius: 8px; border: 1px solid var(--sme-border); background: var(--sme-surface); color: inherit; font: inherit; }

  .status { margin: 0; font-size: 12px; color: var(--sme-text-muted); }
  .status.is-error { color: var(--sme-danger); }

  .fields { display: grid; gap: 12px; }

  .field { display: grid; gap: 4px; min-width: 0; }

  .field__label {
    font-size: 10px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--sme-text-muted);
  }

  .field__control { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
  .field__hint { margin: 0; font-size: 11px; color: var(--sme-text-muted); }

  .field__input {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    font: inherit;
    font-size: 13px;
    color: inherit;
    background: var(--sme-surface);
    border: 1px solid var(--sme-border);
    border-radius: 8px;
  }

  .field__input--area { resize: vertical; font-family: inherit; }

  .field__errors {
    flex: 1 0 100%;
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }

  .field__error { font-size: 11px; color: var(--sme-danger); }

  .order__readout { font-size: 12px; color: var(--sme-text-muted); font-variant-numeric: tabular-nums; }

  .order__move {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 1px solid var(--sme-border);
    color: var(--sme-text-muted);
    background: var(--sme-surface);
  }

  .order__move:hover:not(:disabled) { color: var(--sme-text); border-color: var(--sme-accent); }
  .order__move:disabled { opacity: 0.4; cursor: not-allowed; }

  @media (pointer: coarse) {
    .field__input { padding: 10px; }
    .order__move { width: 34px; height: 34px; }
  }

  .footer { display: flex; justify-content: flex-end; gap: 8px; }

  .button {
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--sme-border);
    font-size: 13px;
    background: var(--sme-surface);
  }

  .button:hover:not(:disabled) { background: var(--sme-surface-muted); }
  .button:disabled { opacity: 0.5; cursor: not-allowed; }
  .button--primary { background: var(--sme-accent); border-color: var(--sme-accent); color: #fff; }
  .button--primary:hover:not(:disabled) { filter: brightness(1.06); background: var(--sme-accent); }
`;
