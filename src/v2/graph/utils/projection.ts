// projection.ts

import { withResponse } from "@pogodisco/response";
import {
	RuntimeCtx,
	GraphNode,
	SchemaGraph,
	GraphEvent,
	GraphResults,
	NodeMetric,
} from "../types/index.js";
import { format } from "pretty-format";

export type Projection<T, R> = (results: T) => R;

// export class GraphResult<Nodes extends Record<string, GraphNode<any>>, Init> {
// 	// Public properties
// 	public results: GraphResults<Nodes>;
// 	public metrics: Record<string, NodeMetric>;
// 	public trace: GraphEvent[];
// 	public init: Init;
//
// 	constructor(private ctx: RuntimeCtx<Nodes, Init>) {
// 		// The crown jewel - deep inference works perfectly
// 		this.results = this.unwrapResults(ctx.results) as GraphResults<Nodes>;
//
// 		// Flatten metrics for tooling - all metrics at top level with path prefixes
// 		this.metrics = this.flattenMetrics(ctx.metrics, ctx.results);
//
// 		// Flatten trace for tooling - all events in a single array with path prefixes
// 		this.trace = this.flattenTrace(ctx.trace, ctx.results);
//
// 		console.log(
// 			format(ctx.metrics, {
// 				indent: 2,
// 				min: false,
// 				maxDepth: 6,
// 				callToJSON: false,
// 				printFunctionName: false,
// 			}),
// 		);
//
// 		this.init = ctx._init;
// 	}
//
// 	private unwrapResults(results: any): any {
// 		const unwrapped: any = {};
//
// 		for (const [key, value] of Object.entries(results)) {
// 			if (value && typeof value === "object") {
// 				if ("results" in value) {
// 					// Nested graph - unwrap recursively
// 					unwrapped[key] = this.unwrapResults(value.results);
// 				} else if (value instanceof GraphResult) {
// 					unwrapped[key] = value.results;
// 				} else {
// 					unwrapped[key] = value;
// 				}
// 			} else {
// 				unwrapped[key] = value;
// 			}
// 		}
//
// 		return unwrapped;
// 	}
//
// 	private flattenMetrics(
// 		metrics: Record<string, NodeMetric>,
// 		results: any,
// 		path: string = "",
// 	): Record<string, NodeMetric> {
// 		const flattened = { ...metrics };
//
// 		const extractNested = (obj: any, currentPath: string) => {
// 			for (const [key, value] of Object.entries(obj)) {
// 				if (value && typeof value === "object") {
// 					if ("metrics" in value) {
// 						// Nested graph metrics - flatten to top level with full path
// 						for (const [nKey, nValue] of Object.entries(value.metrics)) {
// 							flattened[`${currentPath}${key}.${nKey}`] = nValue as NodeMetric;
// 						}
// 					}
// 					// Recurse deeper
// 					extractNested(value, `${currentPath}${key}.`);
// 				}
// 			}
// 		};
//
// 		extractNested(results, path);
// 		return flattened;
// 	}
//
// 	private flattenTrace(
// 		trace: GraphEvent[],
// 		results: any,
// 		path: string = "",
// 	): GraphEvent[] {
// 		// Start with current trace
// 		const flattened = [...trace];
//
// 		const extractNested = (obj: any, currentPath: string) => {
// 			for (const [key, value] of Object.entries(obj)) {
// 				if (value && typeof value === "object") {
// 					if ("trace" in value && Array.isArray(value.trace)) {
// 						// Nested graph trace - add all events with prefixed node paths
// 						for (const event of value.trace) {
// 							flattened.push({
// 								...event,
// 								node: `${currentPath}${key}.${event.node}`, // Full path: "fourth.first.levelThreeNodeOne"
// 							});
// 						}
// 					}
// 					// Recurse deeper
// 					extractNested(value, `${currentPath}${key}.`);
// 				}
// 			}
// 		};
//
// 		extractNested(results, path);
// 		return flattened;
// 	}
//
// 	// Only one utility: raw access if absolutely needed
// 	raw(): RuntimeCtx<Nodes, Init> {
// 		return this.ctx;
// 	}
// }

// projection.ts
// export class GraphResult<Nodes extends Record<string, GraphNode<any>>, Init> {
// 	public results: GraphResults<Nodes>;
// 	public metrics: Record<string, NodeMetric>;
// 	public trace: GraphEvent[];
// 	public init: Init;
//
// 	constructor(private ctx: RuntimeCtx<Nodes, Init>) {
// 		// First, unwrap results for type inference
// 		this.results = this.unwrapResults(ctx.results) as GraphResults<Nodes>;
//
// 		// Then, flatten ALL metrics recursively (including nested GraphResults)
// 		this.metrics = this.flattenAllMetrics(ctx);
//
// 		// Then, flatten ALL trace recursively (including nested GraphResults)
// 		this.trace = this.flattenAllTrace(ctx);
//
// 		this.init = ctx._init;
// 	}
//
// 	private unwrapResults(results: any): any {
// 		const unwrapped: any = {};
//
// 		for (const [key, value] of Object.entries(results)) {
// 			if (value && typeof value === "object") {
// 				if ("results" in value) {
// 					// Nested graph - unwrap recursively
// 					unwrapped[key] = this.unwrapResults(value.results);
// 				} else if (value instanceof GraphResult) {
// 					unwrapped[key] = value.results;
// 				} else {
// 					unwrapped[key] = value;
// 				}
// 			} else {
// 				unwrapped[key] = value;
// 			}
// 		}
//
// 		return unwrapped;
// 	}
//
// 	private flattenAllMetrics(
// 		ctx: RuntimeCtx<Nodes, Init>,
// 	): Record<string, NodeMetric> {
// 		const flattened: Record<string, NodeMetric> = {};
//
// 		// Helper to recursively extract metrics
// 		const extract = (obj: any, currentPath: string = "") => {
// 			// Add current level metrics
// 			if (obj.metrics) {
// 				for (const [key, value] of Object.entries(obj.metrics)) {
// 					flattened[`${currentPath}${key}`] = value as NodeMetric;
// 				}
// 			}
//
// 			// Look for nested graphs in results
// 			if (obj.results) {
// 				for (const [key, value] of Object.entries(obj.results)) {
// 					if (value && typeof value === "object") {
// 						// Check if this is a GraphResult or has metrics
// 						if (
// 							value instanceof GraphResult ||
// 							("metrics" in value && "trace" in value)
// 						) {
// 							// Recursively extract from nested graph
// 							extract(value, `${currentPath}${key}.`);
// 						}
// 					}
// 				}
// 			}
// 		};
//
// 		// Start extraction from the current context
// 		extract(ctx);
//
// 		return flattened;
// 	}
//
// 	private flattenAllTrace(ctx: RuntimeCtx<Nodes, Init>): GraphEvent[] {
// 		const flattened: GraphEvent[] = [];
//
// 		// Helper to recursively extract trace
// 		const extract = (obj: any, currentPath: string = "") => {
// 			// Add current level trace with path prefix
// 			if (obj.trace) {
// 				for (const event of obj.trace) {
// 					flattened.push({
// 						...event,
// 						node: `${currentPath}${event.node}`,
// 					});
// 				}
// 			}
//
// 			// Look for nested graphs in results
// 			if (obj.results) {
// 				for (const [key, value] of Object.entries(obj.results)) {
// 					if (value && typeof value === "object") {
// 						// Check if this is a GraphResult or has trace
// 						if (
// 							value instanceof GraphResult ||
// 							("trace" in value && "metrics" in value)
// 						) {
// 							// Recursively extract from nested graph
// 							extract(value, `${currentPath}${key}.`);
// 						}
// 					}
// 				}
// 			}
// 		};
//
// 		// Start extraction from the current context
// 		extract(ctx);
//
// 		return flattened;
// 	}
//
// 	raw(): RuntimeCtx<Nodes, Init> {
// 		return this.ctx;
// 	}
// }

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
