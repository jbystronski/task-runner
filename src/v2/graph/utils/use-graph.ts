import { executeWithPlanner } from "../../planner/main.js";

import {
	SchemaGraph,
	InferGraphInit,
	GraphOptions,
	GraphResults,
	InferGraphNodes,
	RuntimeCtx,
} from "../types/index.js";

export function useGraph<
	G extends SchemaGraph<any, any>,
	Goal extends keyof InferGraphNodes<G>,
>(graph: G, opts: GraphOptions & { prefix?: string; goals: Goal[] }) {
	return async (
		initArgs: InferGraphInit<G> & { ctx?: RuntimeCtx<any, any> },
	): Promise<GraphResults<InferGraphNodes<G>>> => {
		// runGraph already returns TResponse, so we need to handle it
		// const res = await runGraph(graph, initArgs, opts);

		const res = await executeWithPlanner(
			graph,
			initArgs,
			opts.goals as string[],
			opts,
		);
		// If it's a failure, throw it (let the graph runtime handle it)

		// Get the parent context from initArgs
		const parentCtx = initArgs.ctx;

		// If we have a parent context, merge metrics and trace
		if (parentCtx) {
			const prefix = opts?.prefix || "nested";

			// Merge nested metrics into parent with prefix
			for (const [key, metric] of Object.entries(res.metrics)) {
				parentCtx.metrics[`${prefix}_${key}`] = metric;
			}

			// Merge nested trace into parent with prefixed node names
			for (const event of res.trace) {
				parentCtx.trace.push({
					...event,
					node: event?.node ? `${prefix}.${event.node}` : undefined,
				});
			}
		}

		// Return just the results (raw data)
		return res.results;
	};
}
