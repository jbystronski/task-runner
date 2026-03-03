import { executeWithPlanner } from "../planner/main.js";
import {
  ExecutionRuntime,
  GraphEvent,
  GraphRunOptions,
  NodeMetric,
  SchemaGraph,
} from "./types/index.js";

// -----------------------------
// Input / Output helpers
// -----------------------------
export type GraphInputFor<
  R extends Record<string, SchemaGraph<any, any>>,
  K extends keyof R,
> = R[K] extends SchemaGraph<infer N, infer S> ? Partial<S> : never;

export type GraphOutputFor<
  R extends Record<string, SchemaGraph<any, any>>,
  K extends keyof R,
> =
  R[K] extends SchemaGraph<infer N, infer S>
    ? {
        state: S;
        runtime: ExecutionRuntime<S>;
      }
    : never;

export type GraphRegistrar<R extends Record<string, SchemaGraph<any, any>>> = <
  K extends keyof R & string,
  Goal extends keyof R[K]["nodes"],
>(
  name: K,
  params: GraphInputFor<R, K>,
  opts: GraphRunOptions & {
    goals: Goal[];
  },
) => Promise<GraphOutputFor<R, K>>;
// -----------------------------
// Factory
// -----------------------------

export function createGraphRegistrar<
  R extends Record<string, SchemaGraph<any, any>>,
>(registry: R): GraphRegistrar<R> {
  return async (name, params, opts) => {
    const graph = registry[name];
    if (!opts?.goals?.length) {
      throw new Error(`No goals provided for graph "${name}"`);
    }

    return executeWithPlanner(graph, params, opts.goals, opts) as any;
  };
}
