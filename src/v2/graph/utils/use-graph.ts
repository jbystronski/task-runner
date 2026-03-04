import { executeWithPlanner } from "../../planner/main.js";
import { SUBGRAPH } from "../constants.js";
import {
  ExecutionRuntime,
  GraphEvent,
  GraphRunOptions,
  InferGraphNodes,
  InternalRunOptions,
  NodeMetric,
  SchemaGraph,
} from "../types/index.js";

export function useGraph<
  G extends SchemaGraph<any, any>,
  Goal extends keyof InferGraphNodes<G>,
>(graph: G, opts: GraphRunOptions & { goals: Goal[] }) {
  type GraphState = G extends SchemaGraph<any, infer S> ? S : never;

  const fn = async (
    initArgs: Partial<GraphState>,
    parentRuntime?: ExecutionRuntime<any>, // injected internally
  ): Promise<GraphState> => {
    const res = await executeWithPlanner<any, GraphState>(
      graph,
      initArgs,
      opts.goals as string[],
      {
        ...opts,
        runtime: parentRuntime, // only here
      } as InternalRunOptions<GraphState>,
    );

    return res.state;
  };

  (fn as any)[SUBGRAPH] = true;

  return fn;
}
