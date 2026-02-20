import { withResponse } from "@pogodisco/response";
import { runGraph } from "../main.js";
import {
	SchemaGraph,
	InferGraphInit,
	GraphOptions,
	InferGraphResults,
	GraphResults,
	InferGraphNodes,
} from "../types/index.js";

// export function useGraph<G extends SchemaGraph<any, any>>(
// 	graph: G,
// 	opts?: GraphOptions & { prefix?: string },
// ) {
// 	return withResponse(
// 		async (initArgs: InferGraphInit<G>): Promise<InferGraphResults<G>> => {
// 			const res = await runGraph(graph, initArgs, opts);
// 			if (!res.ok) throw res;
//
// 			if (opts?.prefix) {
// 				const prefixedResults: Record<string, any> = {};
// 				for (const [key, value] of Object.entries(res.data.results)) {
// 					prefixedResults[`${opts.prefix}_${key}`] = value;
// 				}
// 				return prefixedResults;
// 			}
//
// 			// Return just the results, not the full context
// 			return res.data.results;
// 		},
// 	);
// }

// export function useGraph<G extends SchemaGraph<any, any>>(
// 	graph: G,
// 	opts?: GraphOptions & { prefix?: string },
// ) {
// 	return withResponse(
// 		async (
// 			initArgs: InferGraphInit<G>,
// 		): Promise<GraphResults<InferGraphNodes<G>>> => {
// 			const res = await runGraph(graph, initArgs, opts);
// 			if (!res.ok) throw res;
//
// 			console.log("INIT ARGS IN SUB GRAPH", initArgs);
// 			// if (opts?.prefix) {
// 			// 	const prefixedResults: Record<string, any> = {};
// 			// 	const results = res.data.results; // Now we have direct property access
// 			//
// 			// 	for (const [key, value] of Object.entries(results)) {
// 			// 		if (value && typeof value === "object" && "results" in value) {
// 			// 			// Handle nested graph results
// 			// 			prefixedResults[`${opts.prefix}_${key}`] = value.results;
// 			// 		} else {
// 			// 			prefixedResults[`${opts.prefix}_${key}`] = value;
// 			// 		}
// 			// 	}
// 			// 	return prefixedResults as GraphResults<InferGraphNodes<G>>;
// 			// }
//
// 			return res.data.results;
// 		},
// 	);
// }

// useGraph.ts
export function useGraph<G extends SchemaGraph<any, any>>(
	graph: G,
	opts?: GraphOptions & { prefix?: string },
) {
	return withResponse(
		async (
			initArgs: InferGraphInit<G> & { ctx?: RuntimeCtx<any, any> }, // Parent context is passed through
		): Promise<GraphResults<InferGraphNodes<G>>> => {
			const res = await runGraph(graph, initArgs, opts);
			if (!res.ok) throw res;

			// Get the parent context from initArgs
			const parentCtx = initArgs.ctx;

			// If we have a parent context, merge metrics and trace
			if (parentCtx) {
				const prefix = opts?.prefix || "nested";

				// Merge nested metrics into parent with prefix
				for (const [key, metric] of Object.entries(res.data.metrics)) {
					parentCtx.metrics[`${prefix}_${key}`] = metric;
				}

				// Merge nested trace into parent with prefixed node names
				for (const event of res.data.trace) {
					parentCtx.trace.push({
						...event,
						node: `${prefix}.${event.node}`,
					});
				}
			}

			// Handle prefixing of results if needed
			// if (opts?.prefix) {
			// 	const prefixedResults: Record<string, any> = {};
			// 	const results = res.data.results;
			//
			// 	for (const [key, value] of Object.entries(results)) {
			// 		if (value && typeof value === "object" && "results" in value) {
			// 			prefixedResults[`${opts.prefix}_${key}`] = value.results;
			// 		} else {
			// 			prefixedResults[`${opts.prefix}_${key}`] = value;
			// 		}
			// 	}
			// 	return prefixedResults as GraphResults<InferGraphNodes<G>>;
			// }

			return res.data.results;
		},
	);
}
