import { executeWithPlanner } from "../../planner/main.js";
import { SUBGRAPH } from "../constants.js";
import {
  ExecutionRuntime,
  GoalNodes,
  GraphEvent,
  GraphRunOptions,
  InferGraphNodes,
  InternalRunOptions,
  NodeMetric,
  SchemaGraph,
  StringKey,
} from "../types/index.js";

export function useGraph<
  G extends SchemaGraph<any, any>,
  Goal extends StringKey<InferGraphNodes<G>>,
>(graph: G, opts: GraphRunOptions & { goals: GoalNodes<Goal> }) {
  type GraphState = G extends SchemaGraph<any, infer S> ? S : never;

  const fn = async (
    initArgs: Partial<GraphState>,
    parentRuntime?: ExecutionRuntime<any>, // injected internally
  ): Promise<GraphState> => {
    const res = await executeWithPlanner<any, GraphState>(
      graph,
      initArgs,
      opts.goals,
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
