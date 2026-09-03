import { ConfirmDialogElement } from './ui/confirm-dialog.js';
import { PropertiesDialogElement } from './ui/properties-dialog.js';
import { SideEffectsDialogElement } from './ui/side-effects-dialog.js';
import { StateMachineEditorElement } from './ui/state-machine-editor.js';

export type {
  FanOutDetail,
  FanOutEvent,
  SelectionChangeDetail,
  SelectionChangeEvent,
  StateMachineChangeDetail,
  StateMachineChangeEvent,
  StateMachineEditorEventMap,
  ThemeChangeDetail,
  ThemeChangeEvent,
} from './events.js';
export {
  FAN_OUT_EVENT,
  SELECTION_CHANGE_EVENT,
  STATE_MACHINE_CHANGE_EVENT,
  THEME_CHANGE_EVENT,
} from './events.js';
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
  COPY_SUFFIX,
  canPaste,
  copyElement,
  copyName,
  duplicateState,
  duplicateTransition,
} from './model/clipboard.js';
export { StateMachineError } from './model/errors.js';
export type { DecisionRow, TransitionGroup } from './model/groups.js';
export {
  decisionRows,
  findGroupOf,
  groupKeyOf,
  groupTransitions,
  isDecision,
  moveDecisionRow,
  setDecisionLabelOffset,
} from './model/groups.js';
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
export type { JsonPath, JsonTextMessages, JsonTextResult, JsonType } from './model/json.js';
export {
  appendEntry,
  coerceTo,
  countParams,
  DEFAULT_JSON_TEXT_MESSAGES,
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
export type { DecisionIssue, StateIssue } from './model/validation.js';
export {
  DECISION_ISSUES,
  decisionIssues,
  STATE_ISSUES,
  stateIssues,
} from './model/validation.js';
export type {
  CountsAs,
  CountsAsHalf,
  CountsAsStatus,
  DurationParts,
  WaitingConfig,
} from './model/waiting.js';
export {
  COUNTS_AS,
  countsAsStatus,
  emptyWaitingConfig,
  isCountsAs,
  isCountsAsHalf,
  isWaitingState,
  isZeroDuration,
  parseDuration,
  readCountsAs,
  readCountsAsPartial,
  readWaiting,
  setWaiting,
  toggleWaiting,
  WAITING_KEYS,
} from './model/waiting.js';
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
export type {
  EditorIcons,
  Icon,
  IconButtonOptions,
  IconContent,
  IconName,
  IconOverrides,
} from './ui/icons.js';
export {
  clearIcon,
  createIconButton,
  DEFAULT_ICONS,
  hasIcon,
  ICON_NAMES,
  isIconName,
  mergeIcons,
  refreshIcons,
  setIcon,
} from './ui/icons.js';
export type { JsonFormOptions } from './ui/json-form.js';
export { JsonFormEditor } from './ui/json-form.js';
// JsonTextEditor is deliberately not re-exported: a static export here would pull
// CodeMirror into every bundle, defeating the dialog's dynamic import of it.
export type { SideEffectListLabels } from './ui/labels.js';
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
export {
  DEFAULT_ADD_PLACEHOLDER,
  formatParamsBadge,
  SideEffectsDialogElement,
} from './ui/side-effects-dialog.js';
export { StateMachineEditorElement } from './ui/state-machine-editor.js';
export type {
  EditorStrings,
  ElementKind,
  GroupOverrides,
  StringGroup,
  StringOverrides,
} from './ui/strings.js';
export {
  DEFAULT_STRINGS,
  isStringGroup,
  mergeStrings,
  STRING_GROUPS,
} from './ui/strings.js';
export type { EditorTheme } from './ui/theme.js';
export {
  applyTheme,
  DEFAULT_THEME,
  EDITOR_THEMES,
  isEditorTheme,
  normalizeTheme,
  otherTheme,
  THEME_ATTRIBUTE,
  themeOf,
} from './ui/theme.js';

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
