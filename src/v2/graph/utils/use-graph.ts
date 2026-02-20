import { withResponse } from "@pogodisco/response";
import { runGraph } from "../main.js";
import {
	SchemaGraph,
	InferGraphInit,
	GraphOptions,
	InferGraphResults,
	GraphResults,
	InferGraphNodes,
	RuntimeCtx,
} from "../types/index.js";

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
					const n = event?.node ? `${prefix}.${event?.node}` : undefined;
					parentCtx.trace.push({
						...event,
						node: n,
					});
				}
			}

			return res.data.results;
		},
	);
}
