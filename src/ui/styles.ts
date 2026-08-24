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
    will-change: transform;
  }

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
    position: absolute;
    width: var(--sme-node-width);
    background: var(--sme-surface);
    border: 1px solid var(--sme-border);
    border-radius: var(--sme-radius);
    box-shadow: var(--sme-shadow);
    user-select: none;
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
    display: block;
    width: 100%;
    text-align: left;
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px dashed var(--sme-border);
    color: var(--sme-text-muted);
    background: var(--sme-surface-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip.is-filled {
    border-style: solid;
    border-color: transparent;
    background: var(--sme-accent-soft);
    color: var(--sme-text);
    font-weight: 500;
  }

  .chip:disabled { cursor: default; }

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

  .edge-card .hooks { padding: 6px 8px 8px; }
  .edge-card .hook { grid-template-columns: 46px 1fr; }

  .toolbar {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
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

  /*
   * Touch and pen: grow every hit target. 22px icons are comfortable with a
   * mouse and far too small for a fingertip.
   */
  @media (pointer: coarse) {
    .icon-button { width: 32px; height: 32px; font-size: 15px; }
    .node__role { padding: 7px 8px; font-size: 12px; }
    .node__header { padding: 10px; gap: 10px; }
    .node__link { width: 32px; height: 32px; right: -16px; font-size: 15px; }
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

  .list { list-style: none; display: grid; gap: 6px; margin: 0; padding: 0; }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    background: var(--sme-surface-muted);
    border: 1px solid var(--sme-border);
    border-radius: 8px;
  }

  .list.is-reordering .row { transition: transform 120ms ease; }

  .row__handle { cursor: grab; color: var(--sme-text-muted); touch-action: none; }

  @media (pointer: coarse) {
    .row { padding: 11px 12px; gap: 12px; }
    .row__handle,
    .row__remove { width: 32px; height: 32px; font-size: 16px; }
    .button { padding: 11px 18px; }
    .add select { padding: 10px; }
  }
  .row__order { font-size: 11px; color: var(--sme-text-muted); font-variant-numeric: tabular-nums; }
  .row__name { flex: 1; font-size: 13px; }

  .row__remove {
    color: var(--sme-text-muted);
    font-size: 13px;
    width: 22px;
    height: 22px;
    border-radius: 6px;
  }

  .row__remove:hover { color: var(--sme-danger); background: var(--sme-surface); }

  .empty { margin: 0; font-size: 13px; color: var(--sme-text-muted); }

  .add { display: flex; gap: 8px; align-items: center; }
  .add select { flex: 1; min-width: 0; padding: 6px; border-radius: 8px; border: 1px solid var(--sme-border); background: var(--sme-surface); color: inherit; font: inherit; }

  .status { margin: 0; font-size: 12px; color: var(--sme-text-muted); }
  .status.is-error { color: var(--sme-danger); }

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
