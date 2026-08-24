import { SideEffectsDialogElement } from './ui/side-effects-dialog.js';
import { StateMachineEditorElement } from './ui/state-machine-editor.js';

export type {
  SelectionChangeDetail,
  SelectionChangeEvent,
  StateMachineChangeDetail,
  StateMachineChangeEvent,
  StateMachineEditorEventMap,
} from './events.js';
export { SELECTION_CHANGE_EVENT, STATE_MACHINE_CHANGE_EVENT } from './events.js';
export type { EdgeGeometry } from './geometry/edge.js';
export {
  bendEdgeThrough,
  bendSelfEdgeThrough,
  borderPoint,
  computeEdgeGeometry,
  computeSelfEdgeGeometry,
  curvatureFor,
} from './geometry/edge.js';
export type { Viewport } from './geometry/viewport.js';
export {
  boundsOf,
  clampScale,
  createViewport,
  fitViewport,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  toScreen,
  toWorld,
  zoomBy,
  zoomTo,
} from './geometry/viewport.js';
export { insertItem, moveItem } from './model/array.js';
export { StateMachineError } from './model/errors.js';
export { createId } from './model/id.js';
export type { JsonPath, JsonTextResult, JsonType } from './model/json.js';
export {
  appendEntry,
  coerceTo,
  countParams,
  defaultValueFor,
  emptyParams,
  formatJson,
  formatJsonInline,
  getAtPath,
  hasParams,
  isJsonArray,
  isJsonObject,
  JSON_TYPES,
  jsonTypeOf,
  parseParamsText,
  removeAtPath,
  renameKeyAtPath,
  setAtPath,
  toJsonObject,
  toJsonValue,
} from './model/json.js';
export {
  addSideEffect,
  addState,
  addTransition,
  createEmptyMachine,
  createSideEffect,
  createState,
  createTransition,
  describeChange,
  emptyHooks,
  findState,
  findTransition,
  getSideEffects,
  isFinalState,
  isInitialState,
  moveSideEffect,
  removeSideEffect,
  removeState,
  removeTransition,
  setFinalStates,
  setInitialStates,
  setSideEffectParams,
  setSideEffects,
  siblingTransitions,
  toggleFinalState,
  toggleInitialState,
  updateSideEffects,
  updateState,
  updateTransition,
} from './model/machine.js';
export type { ParseResult } from './model/parse.js';
export {
  assertStateMachine,
  parseSideEffectDefinitions,
  parseStateMachine,
} from './model/parse.js';
export type * from './types.js';
export { SIDE_EFFECT_PHASES, STATE_ROLES, STATE_TRIGGERS } from './types.js';
export type { JsonFormOptions } from './ui/json-form.js';
export { JsonFormEditor } from './ui/json-form.js';
export type { JsonToken, JsonTokenKind } from './ui/json-highlight.js';
export { renderHighlight, tokenizeJson } from './ui/json-highlight.js';
export type { JsonTextEditorOptions } from './ui/json-text-editor.js';
export { JsonTextEditor } from './ui/json-text-editor.js';
export { describeSideEffectList, shortHookLabel } from './ui/labels.js';
export { computeDropIndex } from './ui/reorder.js';
export {
  countWithParams,
  EMPTY_SIDE_EFFECTS_LABEL,
  formatSideEffectSummary,
  formatSideEffectTitle,
  listHasParams,
} from './ui/side-effect-summary.js';
export type { SideEffectsDialogOptions } from './ui/side-effects-dialog.js';
export { formatParamsBadge, SideEffectsDialogElement } from './ui/side-effects-dialog.js';
export { StateMachineEditorElement } from './ui/state-machine-editor.js';

let dialogRegistered = false;
let editorRegistered = false;

/**
 * Registers the custom elements. Safe to call multiple times.
 *
 * @param tagName - overrides the editor tag name; the dialog is registered as
 *   `<tagName>-side-effects-dialog` so it never clashes with the default names.
 */
export function defineStateMachineEditor(
  tagName: string = StateMachineEditorElement.tagName,
): void {
  const registry = globalThis.customElements;
  if (registry === undefined) {
    return;
  }
  const dialogTagName =
    tagName === StateMachineEditorElement.tagName
      ? SideEffectsDialogElement.tagName
      : `${tagName}-side-effects-dialog`;
  if (!dialogRegistered && registry.get(dialogTagName) === undefined) {
    registry.define(dialogTagName, SideEffectsDialogElement);
    dialogRegistered = true;
  }
  if (!editorRegistered && registry.get(tagName) === undefined) {
    registry.define(tagName, StateMachineEditorElement);
    editorRegistered = true;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'state-machine-editor': StateMachineEditorElement;
    'state-machine-side-effects-dialog': SideEffectsDialogElement;
  }
}
