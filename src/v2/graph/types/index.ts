import { TResponse } from "@pogodisco/response";

// graph-logger.ts

export type GraphOptions = {
	concurrency?: number;
	log?: GraphLogger;
};

export type GraphLogEvent =
	| "node_start"
	| "node_success"
	| "node_fail"
	| "node_skip"
	| "node_background"
	| "graph_finish";

export type GraphLogger = (
	event: GraphLogEvent,
	node: string,
	meta?: any,
) => void;
export type WrappedSchema<I, O> = (args: I) => Promise<TResponse<O>>;

export type ExtractInput<T> = T extends WrappedSchema<infer I, any> ? I : never;
export type ExtractOutput<T> = T extends WrappedSchema<any, infer O>
	? O
	: never;

export type GraphNode<FN extends WrappedSchema<any, any>> = {
	schema: FN;
	mapInput?: (ctx: any) => ExtractInput<FN>;
	runtime?: NodeRuntimeConfig;
};

export type NodeMetric = {
	start: number;
	end?: number;
	duration?: number;
	status: "success" | "fail" | "skipped";
	attempts: number;
};

export type GraphEvent =
	| {
			type: "node_start";
			node: string;
			input: any;
			timestamp: number;
			pool?: string;
	  }
	| {
			type: "node_success";
			node: string;
			output: any;
			duration: number;
			timestamp: number;
	  }
	| { type: "node_fail"; node: string; error: any; timestamp: number }
	| { type: "node_skip"; node: string; reason?: string; timestamp: number }
	| { type: "node_background"; node: string; timestamp: number }
	| {
			type: "graph_finish";
			metrics: any;
			results: any;
			timestamp: number;
			node?: undefined;
	  };
// export type GraphTraceEvent = Pick<GraphEvent, "type" | "node">;
// export type GraphTraceEvent =
// 	| { type: "node_start"; node: string }
// 	| { type: "node_success"; node: string }
// 	| { type: "node_fail"; node: string }
// 	| { type: "node_background"; node: string }
// 	| { type: "node_skip"; node: string };

type UnwrapNestedGraph<T> = T extends RuntimeCtx<any, any>
	? T["results"] // If it's a RuntimeCtx, extract its results
	: T extends { results: infer R }
		? R // If it has a results property, use that
		: T; // Otherwise return as-is

export type NodeOutput<T> = T extends WrappedSchema<any, infer O>
	? O extends RuntimeCtx<infer N, any>
		? GraphResults<N> // Recursively extract nested graph results
		: O extends { results: infer R }
			? R // Extract results property if present
			: O // Otherwise return output directly
	: never;

// Updated GraphResults that recursively unwraps nested graphs
export type GraphResults<N extends Record<string, GraphNode<any>>> = {
	[K in keyof N]: NodeOutput<N[K]["schema"]>;
};

// Helper to get nodes type from a graph
export type InferGraphNodes<G> = G extends SchemaGraph<infer N, any>
	? N
	: never;

// Helper to get results type from a graph
export type InferGraphResults<G> = G extends SchemaGraph<infer N, any>
	? GraphResults<N>
	: never;
export type RuntimeCtx<Nodes extends Record<string, GraphNode<any>>, Init> = {
	_init: Init;

	results: GraphResults<Nodes>; //

	metrics: Record<string, NodeMetric>;
	trace: GraphEvent[];

	pending: Record<string, Promise<any>>;
};

export type GraphEdge<NodeKeys extends keyof any> = {
	from: NodeKeys;
	to: NodeKeys;
	when?: (ctx: any) => boolean;
};

export type BuiltNode<
	FN extends WrappedSchema<any, any>,
	Nodes extends Record<string, GraphNode<any>>,
> = GraphNode<FN>;

export type SchemaGraph<Nodes extends Record<string, GraphNode<any>>, Init> = {
	entry: keyof Nodes;
	nodes: Nodes;
	edges: GraphEdge<keyof Nodes>[];
};

export type GraphBuilder<
	Nodes extends Record<string, GraphNode<any>> = {},
	Init = {},
> = {
	node<K extends string, FN extends WrappedSchema<any, any>>(
		key: K,
		schema: FN,
		mapInput?: (
			ctx: RuntimeCtx<Nodes & Record<K, GraphNode<FN>>, Init>,
		) => ExtractInput<FN>,
		runtime?: NodeRuntimeConfig,
	): GraphBuilder<Nodes & Record<K, GraphNode<FN>>, Init>;

	edge<From extends keyof Nodes, To extends keyof Nodes>(
		from: From,
		to: To,
		when?: (ctx: any) => boolean,
	): GraphBuilder<Nodes, Init>;

	build(): SchemaGraph<Nodes, Init>;
};

export type GraphEntryInput<G extends SchemaGraph<any, any>> =
	G extends SchemaGraph<infer Nodes, any>
		? RuntimeCtx<Nodes, any>["_init"]
		: never;

// await runSchemaGraph(testGraph, { _id: "bar" });

export type GraphNodes<G> = G extends SchemaGraph<infer Nodes, any>
	? Nodes
	: never;

export type InferGraphInit<G> = G extends SchemaGraph<any, infer I> ? I : never;

export type GraphInput<K extends keyof GraphRegistry> =
	GraphRegistry[K] extends SchemaGraph<any, infer Init> ? Init : never;

export type GraphOutput<K extends keyof GraphRegistry> =
	GraphRegistry[K] extends SchemaGraph<infer Nodes, infer Init>
		? RuntimeCtx<Nodes, Init>
		: never;

export interface GraphRegistry {}

export type NodeRuntimeConfig = {
	background?: boolean;
	retry?: number;
	timeoutMs?: number;
	when?: (ctx: RuntimeCtx<any, any>) => boolean | Promise<boolean>;
	pool?: string;
};

export type GraphRunOptions = {
	concurrency?: number;
	log?: GraphLogger;
	pools?: Record<string, number>;
};
