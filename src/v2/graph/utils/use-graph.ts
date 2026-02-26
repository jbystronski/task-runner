// import { executeWithPlanner } from "../../planner/main.js";
// import {
// 	GraphOptions,
// 	InferGraphNodes,
// 	RuntimeCtx,
// 	SchemaGraph,
// } from "../types/index.js";
//
// export function useGraph<
// 	G extends SchemaGraph<any, any>,
// 	Goal extends keyof InferGraphNodes<G>,
// >(graph: G, opts: GraphOptions & { prefix?: string; goals: Goal[] }) {
// 	// Infer State from the graph type
// 	type GraphState = G extends SchemaGraph<any, infer S> ? S : never;
//
// 	return async (
// 		initArgs: InferGraphInit<G> & { ctx?: RuntimeCtx<any, any, GraphState> },
// 	): Promise<GraphState> => {
// 		const res = await executeWithPlanner(
// 			graph,
// 			initArgs,
// 			opts.goals as string[],
// 			opts,
// 		);
//
// 		const parentCtx = initArgs.ctx;
//
// 		if (parentCtx) {
// 			const prefix = opts?.prefix || "nested";
//
// 			for (const [key, metric] of Object.entries(res.metrics)) {
// 				parentCtx.metrics[`${prefix}_${key}`] = metric;
// 			}
//
// 			for (const event of res.trace) {
// 				// Only add node prefix if the event type has a node property
// 				if ("node" in event && event.node) {
// 					parentCtx.trace.push({
// 						...event,
// 						node: `${prefix}.${event.node}`,
// 					});
// 				} else {
// 					parentCtx.trace.push(event);
// 				}
// 			}
// 		}
//
// 		return res.state;
// 	};
// }
//

import { executeWithPlanner } from "../../planner/main.js";
import {
	GraphOptions,
	InferGraphNodes,
	RuntimeCtx,
	SchemaGraph,
} from "../types/index.js";

export function useGraph<
	G extends SchemaGraph<any, any>,
	Goal extends keyof InferGraphNodes<G>,
>(graph: G, opts: GraphOptions & { prefix?: string; goals: Goal[] }) {
	// Infer State from the graph type
	type GraphState = G extends SchemaGraph<any, infer S> ? S : never;

	return async (
		initArgs: Partial<GraphState> & { ctx?: RuntimeCtx<any, GraphState> }, // 👈 Partial<GraphState>
	): Promise<GraphState> => {
		const res = await executeWithPlanner<any, GraphState>(
			graph,
			initArgs,
			opts.goals as string[],
			opts,
		);

		const parentCtx = initArgs.ctx;

		if (parentCtx) {
			const prefix = opts?.prefix || "nested";

			for (const [key, metric] of Object.entries(res.metrics)) {
				parentCtx.metrics[`${prefix}_${key}`] = metric;
			}

			for (const event of res.trace) {
				if ("node" in event && event.node) {
					parentCtx.trace.push({
						...event,
						node: `${prefix}.${event.node}`,
					});
				} else {
					parentCtx.trace.push(event);
				}
			}
		}

		return res.state;
	};
}
