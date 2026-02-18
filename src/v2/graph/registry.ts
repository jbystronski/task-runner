import { TResponse } from "@pogodisco/response";
import { runGraph } from "./main.js";
import { GraphRunOptions, RuntimeCtx, SchemaGraph } from "./types/index.js";

// -----------------------------
// Input / Output helpers
// -----------------------------
export type GraphInputFor<
	R extends Record<string, SchemaGraph<any, any>>,
	K extends keyof R,
> = R[K] extends SchemaGraph<any, infer I> ? I : never;

export type GraphOutputFor<
	R extends Record<string, SchemaGraph<any, any>>,
	K extends keyof R,
> = R[K] extends SchemaGraph<infer N, infer I> ? RuntimeCtx<N, I> : never;

// -----------------------------
// Public registrar type (IMPORTANT)
// -----------------------------
// export type GraphRegistrar<R extends Record<string, SchemaGraph<any, any>>> = <
// 	K extends keyof R & string,
// >(
// 	name: K,
// 	params: GraphInputFor<R, K>,
// ) => Promise<GraphOutputFor<R, K>>;

export type GraphRegistrar<R extends Record<string, SchemaGraph<any, any>>> = <
	K extends keyof R & string,
>(
	name: K,
	params: GraphInputFor<R, K>,
	opts?: GraphRunOptions,
) => Promise<TResponse<GraphOutputFor<R, K>>>;

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
	R extends Record<string, SchemaGraph<any, any>>,
>(registry: R): GraphRegistrar<R> {
	return async (name, params, opts) => {
		const graph = registry[name];
		return runGraph(graph, params, opts) as any;
	};
}
