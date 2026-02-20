import {
	RuntimeCtx,
	GraphNode,
	GraphEvent,
	GraphResults,
	NodeMetric,
} from "../types/index.js";

export class GraphResult<Nodes extends Record<string, GraphNode<any>>, Init> {
	public results: GraphResults<Nodes>;
	public metrics: Record<string, NodeMetric>;
	public trace: GraphEvent[];
	public init: Init;

	constructor(private ctx: RuntimeCtx<Nodes, Init>) {
		// Unwrap results for type inference (this is still needed)
		this.results = this.unwrapResults(ctx.results) as GraphResults<Nodes>;

		// Metrics are already flattened by useGraph - just use them directly
		this.metrics = ctx.metrics;

		// Trace is already flattened by useGraph - just use it directly
		this.trace = ctx.trace;

		this.init = ctx._init;
	}

	private unwrapResults(results: any): any {
		const unwrapped: any = {};

		for (const [key, value] of Object.entries(results)) {
			if (value && typeof value === "object") {
				if ("results" in value) {
					// Nested graph - unwrap recursively
					unwrapped[key] = this.unwrapResults(value.results);
				} else if (value instanceof GraphResult) {
					unwrapped[key] = value.results;
				} else {
					unwrapped[key] = value;
				}
			} else {
				unwrapped[key] = value;
			}
		}

		return unwrapped;
	}

	// Raw access if absolutely needed
	raw(): RuntimeCtx<Nodes, Init> {
		return this.ctx;
	}
}
