import { ConfirmDialogElement } from './ui/confirm-dialog.js';
import { PropertiesDialogElement } from './ui/properties-dialog.js';
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
export type { CreationAnchorInput, EdgeGeometry } from './geometry/edge.js';
export {
  bendEdgeThrough,
  bendSelfEdgeThrough,
  borderPoint,
  computeEdgeGeometry,
  computeSelfEdgeGeometry,
  creationAnchorPoint,
  curvatureFor,
  orderCreationAnchors,
} from './geometry/edge.js';
export type { LayoutOptions } from './geometry/layout.js';
export { isUnpositioned, layoutPositions, organizeMachine } from './geometry/layout.js';
export { boxAround, findFreeLabelSpot, rectsOverlap } from './geometry/placement.js';
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
export type { ClipboardEntry } from './model/clipboard.js';
export {
  canPaste,
  copyElement,
  copyName,
  duplicateState,
  duplicateTransition,
} from './model/clipboard.js';
export { StateMachineError } from './model/errors.js';
export type { History, HistoryEntry, HistoryStep } from './model/history.js';
export {
  canRedo,
  canUndo,
  createHistory,
  HISTORY_LIMIT,
  pendingRedo,
  pendingUndo,
  recordHistory,
  redoHistory,
  undoHistory,
} from './model/history.js';
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
  creationTransitions,
  describeChange,
  emptyHooks,
  findState,
  findTransition,
  getSideEffects,
  isFinalState,
  isInitialState,
  moveSideEffect,
  moveTransition,
  outgoingTransitions,
  removeSideEffect,
  removeState,
  removeTransition,
  setFinalStates,
  setInitialStates,
  setSideEffectDescription,
  setSideEffectEnabled,
  setSideEffectParams,
  setSideEffects,
  setStateColor,
  setStateDescription,
  setTransitionDescription,
  setTransitionGuard,
  setTransitionPermission,
  setTransitionTrigger,
  siblingTransitions,
  toggleFinalState,
  toggleInitialState,
  uniqueName,
  uniqueStateName,
  uniqueTransitionName,
  updateSideEffects,
  updateState,
  updateTransition,
} from './model/machine.js';
export type { ParseResult } from './model/parse.js';
export {
  assertStateMachine,
  parseActionDefinitions,
  parseSideEffectDefinitions,
  parseStateMachine,
} from './model/parse.js';
export type * from './types.js';
export {
  isStateColor,
  SIDE_EFFECT_PHASES,
  STATE_COLORS,
  STATE_ROLES,
  STATE_TRIGGERS,
} from './types.js';
export type { ConfirmDialogOptions } from './ui/confirm-dialog.js';
export { ConfirmDialogElement } from './ui/confirm-dialog.js';
export type { JsonFormOptions } from './ui/json-form.js';
export { JsonFormEditor } from './ui/json-form.js';
// JsonTextEditor is deliberately not re-exported: a static export here would pull
// CodeMirror into every bundle, defeating the dialog's dynamic import of it.
export {
  describeElement,
  describeSideEffectList,
  describeSource,
  historyLabel,
  START_NODE_LABEL,
  shortHookLabel,
} from './ui/labels.js';
export type {
  OrderContext,
  PropertiesDialogOptions,
  PropertiesDraft,
} from './ui/properties-dialog.js';
export {
  emptyPropertiesDraft,
  PropertiesDialogElement,
  triggerFromText,
} from './ui/properties-dialog.js';
export { computeDropIndex } from './ui/reorder.js';
export {
  countDisabled,
  countWithParams,
  DISABLED_MARKER,
  EMPTY_SIDE_EFFECTS_LABEL,
  formatSideEffectHead,
  formatSideEffectSummary,
  formatSideEffectTitle,
  listHasParams,
} from './ui/side-effect-summary.js';
export type { SideEffectsDialogOptions } from './ui/side-effects-dialog.js';
export { formatParamsBadge, SideEffectsDialogElement } from './ui/side-effects-dialog.js';
export { StateMachineEditorElement } from './ui/state-machine-editor.js';

let dialogRegistered = false;
let propertiesRegistered = false;
let confirmRegistered = false;
let editorRegistered = false;

/**
 * Registers the custom elements. Safe to call multiple times.
 *
 * @param tagName - overrides the editor tag name; the dialogs are registered as
 *   `<tagName>-side-effects-dialog`, `<tagName>-properties-dialog` and
 *   `<tagName>-confirm-dialog` so they never clash with the default names.
 */
export function defineStateMachineEditor(
  tagName: string = StateMachineEditorElement.tagName,
): void {
  const registry = globalThis.customElements;
  if (registry === undefined) {
    return;
  }
  const isDefaultTag = tagName === StateMachineEditorElement.tagName;
  const dialogTagName = isDefaultTag
    ? SideEffectsDialogElement.tagName
    : `${tagName}-side-effects-dialog`;
  const propertiesTagName = isDefaultTag
    ? PropertiesDialogElement.tagName
    : `${tagName}-properties-dialog`;
  const confirmTagName = isDefaultTag ? ConfirmDialogElement.tagName : `${tagName}-confirm-dialog`;
  if (!dialogRegistered && registry.get(dialogTagName) === undefined) {
    registry.define(dialogTagName, SideEffectsDialogElement);
    dialogRegistered = true;
  }
  if (!propertiesRegistered && registry.get(propertiesTagName) === undefined) {
    registry.define(propertiesTagName, PropertiesDialogElement);
    propertiesRegistered = true;
  }
  if (!confirmRegistered && registry.get(confirmTagName) === undefined) {
    registry.define(confirmTagName, ConfirmDialogElement);
    confirmRegistered = true;
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
    'state-machine-properties-dialog': PropertiesDialogElement;
    'state-machine-confirm-dialog': ConfirmDialogElement;
  }
}
