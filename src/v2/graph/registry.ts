import { GraphRunOptions, RuntimeCtx, SchemaGraph } from "./types/index.js";
import { executeWithPlanner } from "../planner/main.js";

// -----------------------------
// Input / Output helpers
// -----------------------------
export type GraphInputFor<
	R extends Record<string, SchemaGraph<any, any, any>>,
	K extends keyof R,
> = R[K] extends SchemaGraph<any, infer I, any> ? I : never;

export type GraphOutputFor<
	R extends Record<string, SchemaGraph<any, any, any>>,
	K extends keyof R,
> = R[K] extends SchemaGraph<infer N, infer I, infer S>
	? RuntimeCtx<N, I, S>
	: never;

// -----------------------------
// Public registrar type (IMPORTANT)
// -----------------------------
// export type GraphRegistrar<R extends Record<string, SchemaGraph<any, any>>> = <
// 	K extends keyof R & string,
// >(
// 	name: K,
// 	params: GraphInputFor<R, K>,
// ) => Promise<GraphOutputFor<R, K>>;

// export type GraphRegistrar<R extends Record<string, SchemaGraph<any, any>>> = <
// 	K extends keyof R & string,
// >(
// 	name: K,
// 	params: GraphInputFor<R, K>,
// 	opts?: GraphRunOptions,
// ) => Promise<GraphOutputFor<R, K>>;
export type GraphRegistrar<
	R extends Record<string, SchemaGraph<any, any, any>>,
> = <K extends keyof R & string, Goal extends keyof R[K]["nodes"]>(
	name: K,
	params: GraphInputFor<R, K>,
	opts: GraphRunOptions & {
		goals: Goal[];
	},
) => Promise<GraphOutputFor<R, K>>;
// -----------------------------
// Factory
// -----------------------------
// export function createGraphRegistrar<
// 	R extends Record<string, SchemaGraph<any, any>>,
// >(registry: R): GraphRegistrar<R> {
// 	return async (name, params) => {
// 		const graph = registry[name];
// 		return runGraph(graph, params) as any;
// 	};
// }

export function createGraphRegistrar<
	R extends Record<string, SchemaGraph<any, any, any>>,
>(registry: R): GraphRegistrar<R> {
	return async (name, params, opts) => {
		const graph = registry[name];
		if (!opts?.goals?.length) {
			throw new Error(`No goals provided for graph "${name}"`);
		}

		return executeWithPlanner(graph, params, opts.goals, opts) as any;
		// return runGraph(graph, params, opts) as any;
	};
}
