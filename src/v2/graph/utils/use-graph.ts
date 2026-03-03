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

// export function useGraph<
//   G extends SchemaGraph<any, any>,
//   Goal extends keyof InferGraphNodes<G>,
// >(graph: G, opts: GraphOptions & { prefix?: string; goals: Goal[] }) {
//   // Infer State from the graph type
//   type GraphState = G extends SchemaGraph<any, infer S> ? S : never;
//
//   const fn = async (
//     initArgs: Partial<GraphState> & {
//       __metrics?: Record<string, NodeMetric>;
//       __trace?: GraphEvent[];
//     }, // 👈 Partial<GraphState>
//   ): Promise<GraphState> => {
//     const { __metrics, __trace, ...stateData } = initArgs;
//     const res = await executeWithPlanner<any, GraphState>(
//       graph,
//       stateData as Partial<GraphState>,
//       opts.goals as string[],
//       opts,
//     );
//
//     if (__metrics) {
//       const prefix = opts?.prefix || "nested";
//       for (const [key, metric] of Object.entries(res.metrics)) {
//         __metrics[`${prefix}_${key}`] = metric;
//       }
//     }
//
//     // Merge trace if it was provided
//     if (__trace) {
//       const prefix = opts?.prefix || "nested";
//       for (const event of res.trace) {
//         if ("node" in event && event.node) {
//           __trace.push({
//             ...event,
//             node: `${prefix}.${event.node}`,
//           });
//         } else {
//           __trace.push(event);
//         }
//       }
//     }
//
//     return res.state;
//   };
//
//   fn.__isSubgraph = true;
//   fn.__goals = opts.goals;
//
//   return fn;
// }

// export function useGraph<
//   G extends SchemaGraph<any, any>,
//   Goal extends keyof InferGraphNodes<G>,
// >(graph: G, opts: InternalRunOptions<any> & { goals: Goal[] }) {
//   type GraphState = G extends SchemaGraph<any, infer S> ? S : never;
//
//   const fn = async (
//     initArgs: Partial<GraphState>,
//     parentRuntime?: ExecutionRuntime<any>, // 👈 injected
//   ): Promise<GraphState> => {
//     const res = await executeWithPlanner<any, GraphState>(
//       graph,
//       initArgs,
//       opts.goals as string[],
//       {
//         ...opts,
//         runtime: parentRuntime, // 👈 pass runtime through
//       },
//     );
//
//     return res.state;
//   };
//
//   (fn as any)[SUBGRAPH] = true;
//
//   return fn;
// }

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
