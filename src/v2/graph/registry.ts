import { runGraph } from "./main.js";
import { RuntimeCtx, SchemaGraph } from "./types/index.js";

type GraphInputFor<
	R extends Record<string, SchemaGraph<any, any>>,
	K extends keyof R,
> = R[K] extends SchemaGraph<any, infer I> ? I : never;

type GraphOutputFor<
	R extends Record<string, SchemaGraph<any, any>>,
	K extends keyof R,
> = R[K] extends SchemaGraph<infer N, infer I> ? RuntimeCtx<N, I> : never;

export function createGraphRegistrar<
	R extends Record<string, SchemaGraph<any, any>>,
>(registry: R) {
	return async function graphCommand<K extends keyof R & string>(
		name: K,
		params: GraphInputFor<R, K>,
	): Promise<GraphOutputFor<R, K>> {
		const graph = registry[name];
		return runGraph(graph, params) as any; // safe internally
	};
}
