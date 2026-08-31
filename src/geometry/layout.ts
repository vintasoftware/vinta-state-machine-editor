import type { Point, Size, StateMachine, StateNode, Transition } from '../types.js';

/**
 * Automatic layout for a machine nobody has arranged by hand.
 *
 * The graph is drawn the way a state machine reads: left to right, one column
 * per step away from where a record enters. That is the layered (Sugiyama)
 * shape, minus the parts a canvas this size does not need — ranks come from a
 * breadth-first walk rather than a linear program, and the crossings are thinned
 * with barycentre sweeps rather than solved exactly.
 *
 * Everything here is pure and DOM-free: the caller measures the cards and hands
 * the sizes in, so the same layout can be computed in a test, on a server, or
 * before the component has rendered once.
 */

/**
 * Clear space demanded on each side of the transition cards between two layers.
 *
 * The same rule holds in both directions: a gap is a whole transition card plus
 * this margin on either side of it, so a card that lands between two state cards
 * — the usual case going across, an edge that skips a column or a self loop
 * going down — is read as sitting in a gap rather than as touching a neighbour.
 */
const COLUMN_MARGIN = 88;
/** Clear space above and below the transition cards between two stacked states. */
const ROW_MARGIN = 64;
/** Clear space between two disconnected sub-graphs, stacked one above the other. */
const COMPONENT_MARGIN = 160;
/** How many barycentre passes are made over the layers. */
const SWEEPS = 4;

export interface LayoutOptions {
  /** Size a state card renders at. Measured by the caller; this module is pure. */
  readonly nodeSize: Size;
  /**
   * Size a transition card renders at. Layers are spread far enough apart for
   * one to sit between them without covering either state it connects.
   */
  readonly labelSize: Size;
  /** Top-left corner of the block the layout is drawn into. Defaults to the origin. */
  readonly origin?: Point;
  /**
   * Size of individual cards, keyed by state id, for the ones that do not render
   * at `nodeSize`.
   *
   * A state card grows with what it holds — a list of side effects makes it two
   * or three times the height of a bare one — so a layout pitched on a single
   * measurement leaves the tall cards nearly touching the ones under them.
   * Anything missing here falls back to `nodeSize`.
   */
  readonly nodeSizes?: ReadonlyMap<string, Size>;
}

/**
 * Whether `machine` arrived without a layout: at least one state, and every one
 * of them sitting on the origin.
 *
 * That is what a graph authored anywhere but this editor looks like — a backend
 * that never stored coordinates, a fixture written by hand — and it renders as
 * a single pile of cards. Both spellings collapse to the same thing, because a
 * missing `position` parses as `{ x: 0, y: 0 }`.
 */
export function isUnpositioned(machine: StateMachine): boolean {
  return (
    machine.states.length > 0 &&
    machine.states.every((state) => state.position.x === 0 && state.position.y === 0)
  );
}

/** Edges that take part in the layout: the ones between two distinct states. */
function layoutEdges(machine: StateMachine): readonly Transition[] {
  // A creation edge hangs off the start bar, which is placed rather than laid
  // out, and a self transition loops back into its own card. Neither says
  // anything about which column a state belongs in.
  return machine.transitions.filter(
    (transition) => transition.from !== null && transition.from !== transition.to,
  );
}

interface Graph {
  readonly successors: ReadonlyMap<string, readonly string[]>;
  readonly predecessors: ReadonlyMap<string, readonly string[]>;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else if (!list.includes(value)) {
    // Two edges between the same pair are one relationship as far as the layout
    // is concerned; counting them twice would drag the barycentre towards them.
    list.push(value);
  }
}

function buildGraph(machine: StateMachine): Graph {
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const transition of layoutEdges(machine)) {
    if (transition.from === null) {
      continue;
    }
    push(successors, transition.from, transition.to);
    push(predecessors, transition.to, transition.from);
  }
  return { successors, predecessors };
}

function neighbours(map: ReadonlyMap<string, readonly string[]>, id: string): readonly string[] {
  return map.get(id) ?? [];
}

/**
 * The sub-graphs that share no edge, each in the order its states appear in the
 * machine. They are laid out independently and stacked, so an island never
 * lands in the middle of the graph it has nothing to do with.
 */
function components(machine: StateMachine, graph: Graph): readonly (readonly string[])[] {
  const seen = new Set<string>();
  const found: string[][] = [];
  for (const state of machine.states) {
    if (seen.has(state.id)) {
      continue;
    }
    const component: string[] = [];
    const queue = [state.id];
    seen.add(state.id);
    while (queue.length > 0) {
      const id = queue.shift() ?? '';
      component.push(id);
      for (const next of [
        ...neighbours(graph.successors, id),
        ...neighbours(graph.predecessors, id),
      ]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    // Back into machine order: the walk visits neighbours, not the array.
    const members = new Set(component);
    found.push(machine.states.map((node) => node.id).filter((id) => members.has(id)));
  }
  return found;
}

/**
 * Where a record enters this sub-graph: the states a creation edge targets, the
 * ones the machine is marked as starting in, and — failing both — the ones
 * nothing transitions into.
 */
function entryPoints(
  machine: StateMachine,
  graph: Graph,
  component: readonly string[],
): readonly string[] {
  const declared = component.filter(
    (id) =>
      machine.initialStateIds.includes(id) ||
      machine.transitions.some((transition) => transition.from === null && transition.to === id),
  );
  if (declared.length > 0) {
    return declared;
  }
  const sources = component.filter((id) => neighbours(graph.predecessors, id).length === 0);
  if (sources.length > 0) {
    return sources;
  }
  // A component that is one big cycle has neither; start it anywhere, and the
  // first state in the machine's own order is the least arbitrary anywhere.
  return component.slice(0, 1);
}

/**
 * Column index per state: how many steps it sits from the nearest entry point.
 *
 * A cycle is normal in a state machine, so this is a breadth-first distance
 * rather than a longest path — the latter is only defined on a DAG. States a
 * walk from the entry points cannot reach (they sit on a cycle of their own,
 * reachable only against the arrows) seed a walk of their own rather than being
 * dropped.
 */
function assignRanks(
  machine: StateMachine,
  graph: Graph,
  component: readonly string[],
): ReadonlyMap<string, number> {
  const ranks = new Map<string, number>();
  const queue: string[] = [];
  const seed = (ids: readonly string[]): void => {
    for (const id of ids) {
      if (!ranks.has(id)) {
        ranks.set(id, 0);
        queue.push(id);
      }
    }
  };
  seed(entryPoints(machine, graph, component));
  while (ranks.size < component.length) {
    while (queue.length > 0) {
      const id = queue.shift() ?? '';
      const rank = ranks.get(id) ?? 0;
      for (const next of neighbours(graph.successors, id)) {
        if (!ranks.has(next)) {
          ranks.set(next, rank + 1);
          queue.push(next);
        }
      }
    }
    seed(component.filter((id) => !ranks.has(id)).slice(0, 1));
  }
  return ranks;
}

/** The states of each column, top to bottom, before any crossing reduction. */
function buildLayers(component: readonly string[], ranks: ReadonlyMap<string, number>): string[][] {
  const depth = Math.max(0, ...component.map((id) => ranks.get(id) ?? 0));
  const layers: string[][] = [];
  for (let rank = 0; rank <= depth; rank += 1) {
    const layer = component.filter((id) => ranks.get(id) === rank);
    // A breadth-first walk never skips a distance, so this only ever guards
    // against an empty machine — but an empty column would still cost a gap.
    if (layer.length > 0) {
      layers.push(layer);
    }
  }
  return layers;
}

/**
 * Average position, in `reference`, of the neighbours `id` has there. `undefined`
 * when it has none — such a state is not being pulled anywhere and should stay
 * where it is rather than be dragged to the top of its column.
 */
function barycentre(
  id: string,
  reference: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>,
): number | undefined {
  const positions = neighbours(adjacency, id)
    .map((neighbour) => reference.indexOf(neighbour))
    .filter((index) => index >= 0);
  if (positions.length === 0) {
    return undefined;
  }
  return positions.reduce((total, index) => total + index, 0) / positions.length;
}

/** Reorders one layer to sit under the neighbours it has in `reference`. */
function sortByBarycentre(
  layer: readonly string[],
  reference: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>,
): string[] {
  const keys = new Map<string, number>(
    layer.map((id, index) => [id, barycentre(id, reference, adjacency) ?? index]),
  );
  // Sort is stable, so states pulled to the same place keep the order they had.
  return [...layer].sort((a, b) => (keys.get(a) ?? 0) - (keys.get(b) ?? 0));
}

/**
 * Thins the crossings out with the classic barycentre heuristic: sweep down
 * putting each layer under its predecessors, sweep back up putting each layer
 * over its successors, and repeat a handful of times. It is a heuristic, not a
 * minimum — a minimum is NP-hard, and nobody reading a canvas can tell the two
 * apart.
 */
function reduceCrossings(layers: string[][], graph: Graph): void {
  for (let sweep = 0; sweep < SWEEPS; sweep += 1) {
    for (let index = 1; index < layers.length; index += 1) {
      const layer = layers[index];
      const reference = layers[index - 1];
      if (layer !== undefined && reference !== undefined) {
        layers[index] = sortByBarycentre(layer, reference, graph.predecessors);
      }
    }
    for (let index = layers.length - 2; index >= 0; index -= 1) {
      const layer = layers[index];
      const reference = layers[index + 1];
      if (layer !== undefined && reference !== undefined) {
        layers[index] = sortByBarycentre(layer, reference, graph.successors);
      }
    }
  }
}

/**
 * Where every state lands, keyed by id. Exported so a host can draw the same
 * arrangement somewhere the component is not, or diff it before applying it.
 */
export function layoutPositions(
  machine: StateMachine,
  options: LayoutOptions,
): ReadonlyMap<string, Point> {
  const origin = options.origin ?? { x: 0, y: 0 };
  const sizeOf = (id: string): Size => options.nodeSizes?.get(id) ?? options.nodeSize;
  // Both gaps are a whole transition card plus a margin on either side of it:
  // across, that is the card sitting on the edge between two columns; down, it
  // is the one an edge skipping a column, or a self loop, is nudged into.
  const columnGap = options.labelSize.width + COLUMN_MARGIN * 2;
  const rowGap = options.labelSize.height + ROW_MARGIN * 2;
  const graph = buildGraph(machine);
  const positions = new Map<string, Point>();
  // Stacked rather than pitched on one measurement: cards differ in height by
  // what they hold, and a fixed pitch would leave the tall ones nearly touching.
  const heightOf = (layer: readonly string[]): number =>
    layer.reduce((total, id) => total + sizeOf(id).height, 0) + rowGap * (layer.length - 1);
  let top = origin.y;
  for (const component of components(machine, graph)) {
    const layers = buildLayers(component, assignRanks(machine, graph, component));
    reduceCrossings(layers, graph);
    const height = Math.max(...layers.map(heightOf));
    let left = origin.x;
    for (const layer of layers) {
      // Each column is centred on the tallest one, so a graph that widens and
      // narrows again reads as a spine rather than as a staircase.
      let y = top + (height - heightOf(layer)) / 2;
      for (const id of layer) {
        positions.set(id, { x: Math.round(left), y: Math.round(y) });
        y += sizeOf(id).height + rowGap;
      }
      left += Math.max(...layer.map((id) => sizeOf(id).width)) + columnGap;
    }
    top += height + COMPONENT_MARGIN;
  }
  return positions;
}

function isPlaced(state: StateNode, positions: ReadonlyMap<string, Point>): boolean {
  const next = positions.get(state.id);
  return next === undefined || (next.x === state.position.x && next.y === state.position.y);
}

/**
 * `machine` with every state moved onto the automatic layout and every
 * transition card handed back to automatic placement.
 *
 * A card the user dragged is deliberately *not* preserved: its offset is
 * relative to an edge that has just been redrawn somewhere else entirely, so
 * keeping it would scatter the very cards this is meant to tidy.
 *
 * Returns `machine` itself when it is already laid out this way, so a caller can
 * tell "nothing to do" from "everything moved" by identity.
 */
export function organizeMachine(machine: StateMachine, options: LayoutOptions): StateMachine {
  const positions = layoutPositions(machine, options);
  const settled =
    machine.states.every((state) => isPlaced(state, positions)) &&
    machine.transitions.every(
      (transition) => transition.labelOffset.x === 0 && transition.labelOffset.y === 0,
    );
  if (settled) {
    return machine;
  }
  return {
    ...machine,
    states: machine.states.map((state) => {
      const position = positions.get(state.id);
      return position === undefined ? state : { ...state, position };
    }),
    transitions: machine.transitions.map((transition) =>
      transition.labelOffset.x === 0 && transition.labelOffset.y === 0
        ? transition
        : { ...transition, labelOffset: { x: 0, y: 0 } },
    ),
  };
}
