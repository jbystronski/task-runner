import { SUBGRAPH } from "./constants.js";
import { composeMiddleware } from "./middleware/index.js";
import {
  ExecutionRuntime,
  GraphEdge,
  GraphNode,
  InternalRunOptions,
  NodeExecutionFrame,
  NodeMetric,
  RuntimeCtx,
  SchemaGraph,
} from "./types/index.js";

export function edge<K extends string, State>(
  from: K,
  to: K,
  when?: (ctx: RuntimeCtx<State>) => boolean,
): GraphEdge<K, State> {
  return { from, to, when } as GraphEdge<K, State>;
}

export const runGraphInternal = async <
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
>(
  graph: SchemaGraph<Nodes, State>,
  initArgs: Partial<State>,
  opts?: InternalRunOptions<State>,
) => {
  const concurrency = opts?.concurrency ?? 4;

  // const runtime: ExecutionRuntime<State> = {
  //   middleware: [
  //     ...(graph.middleware ?? []),
  //     ...(opts?.runtime?.middleware ?? []),
  //   ],
  //   context: {
  //     ...(opts?.runtime?.context ?? {}),
  //   },
  // };
  const runtime: ExecutionRuntime<State> = {
    middleware: [
      ...new Set([
        ...(graph.middleware ?? []),
        ...(opts?.runtime?.middleware ?? []),
      ]),
    ],
    context: { ...(opts?.runtime?.context ?? {}) },
  };

  // Ensure frame storage exists
  runtime.context.frames ??= {};

  const ctx: RuntimeCtx<State> = {
    state: { ...initArgs } as State,
    pending: {},
    runtime,
  };

  const nodeKeys = Object.keys(graph.nodes) as (keyof Nodes)[];

  // --- index edges ---
  const incoming = new Map<keyof Nodes, GraphEdge<any, State>[]>();
  const outgoing = new Map<keyof Nodes, GraphEdge<any, State>[]>();

  for (const k of nodeKeys) {
    incoming.set(k, []);
    outgoing.set(k, []);
  }

  for (const e of graph.edges) {
    incoming.get(e.to as keyof Nodes)!.push(e as any);
    outgoing.get(e.from as keyof Nodes)!.push(e as any);
  }

  // --- reachability ---
  const reachable = new Set<keyof Nodes>();

  const dfs = (node: keyof Nodes) => {
    if (reachable.has(node)) return;
    reachable.add(node);
    for (const edge of outgoing.get(node) ?? []) {
      dfs(edge.to as keyof Nodes);
    }
  };

  dfs(graph.entry as keyof Nodes);

  // --- dependency counters ---
  const remainingDeps = new Map<keyof Nodes, number>();

  for (const k of nodeKeys) {
    if (!reachable.has(k)) continue;

    const deps = incoming
      .get(k)!
      .filter((e) => reachable.has(e.from as keyof Nodes)).length;

    remainingDeps.set(k, deps);
  }

  const readyQueue: (keyof Nodes)[] = [];

  for (const k of nodeKeys) {
    if (!reachable.has(k)) continue;
    if (remainingDeps.get(k) === 0) readyQueue.push(k);
  }
  async function executeNode(key: keyof Nodes) {
    const node = graph.nodes[key];
    const runtimeConfig = node.runtime ?? {};

    if (runtimeConfig.when) {
      const ok = await runtimeConfig.when(ctx);
      if (!ok) return;
    }

    // --- Create frame ---
    const frame: NodeExecutionFrame<State> = {
      node: String(key),
      attempts: 0,
      start: Date.now(),
      input: undefined,
    };
    runtime.context.frames![String(key)] = frame;

    // --- compute input BEFORE middleware ---
    const input = runtimeConfig.expect
      ? runtimeConfig.expect(ctx.state)
      : ctx.state;
    frame.input = input; // 👈 set early so middleware sees it

    const core = async () => {
      frame.attempts++;

      try {
        let result;
        if ((node.schema as any)[SUBGRAPH]) {
          result = await node.schema(input, ctx.runtime);
        } else {
          result = await node.schema(input);
        }

        frame.output = result;
        frame.end = Date.now();

        if (runtimeConfig.provide) {
          Object.assign(
            ctx.state as Record<string, any>,
            runtimeConfig.provide(result, ctx.state),
          );
        } else if ((node.schema as any)[SUBGRAPH]) {
          Object.assign(ctx.state as Record<string, any>, result);
        }

        return result;
      } catch (err) {
        frame.error = err;
        frame.end = Date.now();
        throw err;
      }
    };

    const nodeMiddleware = runtimeConfig.middleware ?? [];

    const composed = composeMiddleware(
      [...runtime.middleware, ...nodeMiddleware],
      {
        node: String(key),
        graph,
        state: ctx.state,
        runtime: ctx.runtime,
      },
      core,
    );

    await composed();

    // --- unlock dependents ---
    for (const edge of outgoing.get(key)!) {
      const next = edge.to as keyof Nodes;
      if (!reachable.has(next)) continue;
      if (edge.when && !edge.when(ctx)) continue;

      const newCount = remainingDeps.get(next)! - 1;
      remainingDeps.set(next, newCount);

      if (newCount === 0) readyQueue.push(next);
    }
  }

  async function worker() {
    while (true) {
      const next = readyQueue.shift();
      if (!next) return;

      const node = graph.nodes[next];
      const runtimeConfig = node.runtime ?? {};

      if (runtimeConfig.background) {
        ctx.pending[next as string] = executeNode(next);
      } else {
        await executeNode(next);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await Promise.all(Object.values(ctx.pending));

  return {
    state: ctx.state,
    runtime: ctx.runtime,
  };
};
