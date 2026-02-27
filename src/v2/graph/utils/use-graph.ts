import { executeWithPlanner } from "../../planner/main.js";
import {
  GraphEvent,
  GraphOptions,
  InferGraphNodes,
  NodeMetric,
  SchemaGraph,
} from "../types/index.js";

export function useGraph<
  G extends SchemaGraph<any, any>,
  Goal extends keyof InferGraphNodes<G>,
>(graph: G, opts: GraphOptions & { prefix?: string; goals: Goal[] }) {
  // Infer State from the graph type
  type GraphState = G extends SchemaGraph<any, infer S> ? S : never;

  const fn = async (
    initArgs: Partial<GraphState> & {
      __metrics?: Record<string, NodeMetric>;
      __trace?: GraphEvent[];
    }, // 👈 Partial<GraphState>
  ): Promise<GraphState> => {
    const { __metrics, __trace, ...stateData } = initArgs;
    const res = await executeWithPlanner<any, GraphState>(
      graph,
      stateData as Partial<GraphState>,
      opts.goals as string[],
      opts,
    );

    if (__metrics) {
      const prefix = opts?.prefix || "nested";
      for (const [key, metric] of Object.entries(res.metrics)) {
        __metrics[`${prefix}_${key}`] = metric;
      }
    }

    // Merge trace if it was provided
    if (__trace) {
      const prefix = opts?.prefix || "nested";
      for (const event of res.trace) {
        if ("node" in event && event.node) {
          __trace.push({
            ...event,
            node: `${prefix}.${event.node}`,
          });
        } else {
          __trace.push(event);
        }
      }
    }

    // console.log("INIT ARGS in sub", initArgs);
    // 🔥 ONLY auto-merge state if initArgs is JUST { ctx }
    // This means the parent didn't provide expect, wanting passthrough
    // if (Object.keys(initArgs).length === 1 && "ctx" in initArgs) {
    // 	Object.assign(parentCtx!.state, res.state);
    // }
    console.log("SUB STATE", res.state);
    return res.state;
  };

  fn.__isSubgraph = true;
  fn.__goals = opts.goals;

  return fn;
}
