import {
  eventStream,
  ExecutionRuntime,
  GoalNodes,
  GraphEdge,
  StringKey,
  GraphNode,
  GraphRunOptions,
  RuntimeCtx,
  SchemaGraph,
  GraphMiddleware,
  CompiledPlan,
} from "../graph/index.js";
import { runGraphInternal } from "../graph/main.js";

type NodeKey = string;

function normalizeGoalPhases<K extends string>(expr: GoalNodes<K>): K[][] {
  const phases: K[][] = [];
  let current: K[] = [];

  const walk = (node: K | GoalNodes<K>) => {
    if (Array.isArray(node)) {
      if (current.length) {
        phases.push(current);
        current = [];
      }

      for (const n of node) walk(n);

      if (current.length) {
        phases.push(current);
        current = [];
      }

      return;
    }

    current.push(node as K);
  };

  for (const n of expr) walk(n);

  if (current.length) phases.push(current);

  return phases;
}

/* -------------------------------------------------------
 * Utilities
 * ----------------------------------------------------- */

// Edge is allowed if:
// - goals undefined → allowed
// - goals empty → allowed
// - goals intersects active goals → allowed
function edgeAllowedForGoals<State>(
  edge: GraphEdge<NodeKey, State>,
  activeGoals: Set<NodeKey>,
) {
  if (!edge.goals || edge.goals.length === 0) return true;

  for (const g of edge.goals) {
    if (activeGoals.has(g)) return true;
  }

  return false;
}

/* -------------------------------------------------------
 * Reverse Edge Map
 * ----------------------------------------------------- */

function buildReverseEdges<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(graph: SchemaGraph<Nodes, State>) {
  const reverse = new Map<NodeKey, GraphEdge<NodeKey, State>[]>();

  for (const e of graph.edges) {
    const to = e.to as NodeKey;
    if (!reverse.has(to)) reverse.set(to, []);
    reverse.get(to)!.push(e as GraphEdge<NodeKey, State>);
  }

  return reverse;
}

/* -------------------------------------------------------
 * Backward Resolution (Goal-Aware)
 * ----------------------------------------------------- */

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
  const activeGoals = new Set<NodeKey>(goalNodes as NodeKey[]);

  function walk(node: keyof Nodes) {
    const key = node as NodeKey;
    if (required.has(key)) return;

    required.add(key);

    const incoming = reverse.get(key) ?? [];

    for (const edge of incoming) {
      // 🔥 goal filtering
      if (!edgeAllowedForGoals(edge, activeGoals)) continue;

      // 🔥 edge.when evaluated against initial planning context
      if (edge.when && !edge.when(initCtx)) continue;

      walk(edge.from as keyof Nodes);
    }
  }

  goalNodes.forEach(walk);

  return required;
}

/* -------------------------------------------------------
 * Build Execution Graph (Must Mirror Goal Filtering)
 * ----------------------------------------------------- */

function buildExecutionGraph<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(
  graph: SchemaGraph<Nodes, State>,
  required: Set<NodeKey>,
  goalNodes: (keyof Nodes)[],
) {
  const activeGoals = new Set<NodeKey>(goalNodes as NodeKey[]);

  return {
    entry: graph.entry,

    nodes: Object.fromEntries(
      Object.entries(graph.nodes).filter(([k]) => required.has(k as NodeKey)),
    ) as any,

    edges: graph.edges.filter((e) => {
      const from = e.from as NodeKey;
      const to = e.to as NodeKey;

      if (!required.has(from)) return false;
      if (!required.has(to)) return false;

      // 🔥 MUST re-apply goal filtering here
      if (!edgeAllowedForGoals(e as any, activeGoals)) return false;

      return true;
    }),

    // preserve graph-level middleware
    middleware: graph.middleware,
  } as SchemaGraph<Nodes, State>;
}

/* -------------------------------------------------------
 * Planner
 * ----------------------------------------------------- */

export function planGraph<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(
  graph: SchemaGraph<Nodes, State>,
  goalNodes: (keyof Nodes)[],
  initCtx: RuntimeCtx<State>,
) {
  const required = resolveRequiredNodes(graph, goalNodes, initCtx);

  return buildExecutionGraph(graph, required, goalNodes);
}

/* -------------------------------------------------------
 * Execute With Planner
 * ----------------------------------------------------- */

export async function executeWithPlanner<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(
  fullGraph: SchemaGraph<Nodes, State>,
  initArgs: Partial<State>,
  goalExpr: GoalNodes<Extract<keyof Nodes, string>>,
  opts?: GraphRunOptions,
): Promise<{
  state: State;
  runtime: ExecutionRuntime<State>;
}> {
  const phases = normalizeGoalPhases<StringKey<Nodes>>(goalExpr);

  let state = initArgs as State;
  let runtime: ExecutionRuntime<State> | undefined;

  for (const goals of phases) {
    const planCtx: RuntimeCtx<State> = {
      state,
      pending: {},
      runtime: runtime ?? {
        middleware: fullGraph.middleware ?? [],
        context: {},
      },
    };

    const executionGraph = planGraph(fullGraph, goals as any, planCtx);

    eventStream.emit({
      type: "graph_planned",
      entry: String(executionGraph.entry),
      nodes: Object.keys(executionGraph.nodes),
      edges: executionGraph.edges.map((e) => ({
        from: String(e.from),
        to: String(e.to),
      })),
      goals: goals.map(String),
      timestamp: Date.now(),
    });

    const res = await runGraphInternal(executionGraph, state, {
      ...opts,
      runtime: planCtx.runtime,
    });

    state = res.state;
    runtime = res.runtime;
  }

  return { state, runtime: runtime! };
}

export function compilePlan<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(
  graph: SchemaGraph<Nodes, State>,
  goalExpr: GoalNodes<Extract<keyof Nodes, string>>,
  initArgs?: Partial<State>,
): CompiledPlan<Nodes, State> {
  const phases = normalizeGoalPhases<StringKey<Nodes>>(goalExpr);

  const plans = [];

  let state = (initArgs ?? {}) as State;
  let runtime: ExecutionRuntime<State> | undefined;

  for (const goals of phases) {
    const ctx: RuntimeCtx<State> = {
      state,
      pending: {},
      runtime: runtime ?? {
        middleware: graph.middleware ?? [],
        context: {},
      },
    };

    const executionGraph = planGraph(graph, goals as any, ctx);

    plans.push({
      graph: executionGraph,
      goals,
    });
  }

  return {
    phases: plans,
    middleware: graph.middleware ?? [],
  };
}
export async function executePlan<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(
  plan: CompiledPlan<Nodes, State>,
  initArgs: Partial<State>,
  opts?: GraphRunOptions,
) {
  let state = initArgs as State;

  let runtime: ExecutionRuntime<State> = {
    middleware: plan.middleware,
    context: {},
  };

  for (const phase of plan.phases) {
    const res = await runGraphInternal(phase.graph, state, {
      ...opts,
      runtime,
    });

    state = res.state;
    runtime = res.runtime;
  }

  return { state, runtime };
}
