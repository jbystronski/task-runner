import {
  eventStream,
  ExecutionRuntime,
  GraphEdge,
  GraphEvent,
  GraphNode,
  GraphRunOptions,
  NodeMetric,
  RuntimeCtx,
  SchemaGraph,
} from "../graph/index.js";
import { runGraphInternal } from "../graph/main.js";

type NodeKey = string;

// Build reverse edges map
function buildReverseEdges<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(graph: SchemaGraph<Nodes, State>) {
  const reverse = new Map<keyof Nodes, GraphEdge<NodeKey, State>[]>();
  for (const e of graph.edges) {
    if (!reverse.has(e.to as keyof Nodes)) reverse.set(e.to as keyof Nodes, []);
    reverse.get(e.to as keyof Nodes)!.push(e as any);
  }
  return reverse;
}

// Backward resolve required nodes given target(s) and initial ctx
function resolveRequiredNodes<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(
  graph: SchemaGraph<Nodes, State>,
  goalNodes: (keyof Nodes)[],
  initCtx: RuntimeCtx<State>,
) {
  const reverse = buildReverseEdges(graph);
  const required = new Set<NodeKey>();

  function walk(node: keyof Nodes) {
    if (required.has(node as string)) return;
    required.add(node as string);

    const incoming = reverse.get(node) ?? [];
    for (const edge of incoming) {
      // evaluate edge.when against initial context
      if (edge.when && !edge.when(initCtx)) continue;
      walk(edge.from);
    }
  }

  goalNodes.forEach(walk);
  return required;
}

// Build subgraph from resolved nodes
// function buildExecutionGraph<
//   Nodes extends Record<string, GraphNode<any, State>>,
//   State,
// >(graph: SchemaGraph<Nodes, State>, required: Set<NodeKey>) {
//   return {
//     entry: graph.entry,
//     nodes: Object.fromEntries(
//       Object.entries(graph.nodes).filter(([k]) => required.has(k)),
//     ) as any,
//     edges: graph.edges.filter(
//       (e) => required.has(e.from as NodeKey) && required.has(e.to as NodeKey),
//     ),
//   } as SchemaGraph<Nodes, State>;
// }

function buildExecutionGraph<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(graph: SchemaGraph<Nodes, State>, required: Set<NodeKey>) {
  return {
    entry: graph.entry,
    nodes: Object.fromEntries(
      Object.entries(graph.nodes).filter(([k]) => required.has(k)),
    ) as any,
    edges: graph.edges.filter(
      (e) => required.has(e.from as NodeKey) && required.has(e.to as NodeKey),
    ),

    // 🔥 preserve graph-level middleware
    middleware: graph.middleware,
  } as SchemaGraph<Nodes, State>;
}

// Full planner
export function planGraph<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(
  graph: SchemaGraph<Nodes, State>,
  goalNodes: (keyof Nodes)[],
  initCtx: RuntimeCtx<State>,
) {
  const required = resolveRequiredNodes(graph, goalNodes, initCtx);
  return buildExecutionGraph(graph, required);
}

export async function executeWithPlanner<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(
  fullGraph: SchemaGraph<Nodes, State>,
  initArgs: Partial<State>,

  goalNodes: (keyof Nodes)[],
  opts?: GraphRunOptions,
): Promise<{
  state: State;
  runtime: ExecutionRuntime<State>;
  // metrics: Record<string, NodeMetric>;
  // trace: GraphEvent[];
  // init: Init;
}> {
  // Create a lightweight ctx for planning

  const planCtx: RuntimeCtx<State> = {
    state: { ...initArgs } as State,
    pending: {},
    runtime: {
      middleware: fullGraph.middleware ?? [],
      context: {},
    },
  };

  // Phase 1: Plan
  const executionGraph = planGraph(fullGraph, goalNodes, planCtx);
  // const logger = opts?.log;
  //
  eventStream.emit({
    type: "graph_planned",
    entry: String(executionGraph.entry),
    nodes: Object.keys(executionGraph.nodes),
    edges: executionGraph.edges.map((e) => ({
      from: String(e.from),
      to: String(e.to),
    })),
    goals: goalNodes.map(String),
    timestamp: Date.now(),
  });

  // Phase 2: Execute (scheduler already handles DAG + parallelism)
  return runGraphInternal(executionGraph, initArgs, opts);
}
