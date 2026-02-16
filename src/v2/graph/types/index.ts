import { TResponse } from "@pogodisco/response";

export type WrappedSchema<I, O> = (args: I) => Promise<TResponse<O>>;

export type ExtractInput<T> = T extends WrappedSchema<infer I, any> ? I : never;
export type ExtractOutput<T> = T extends WrappedSchema<any, infer O>
	? O
	: never;

export type GraphNode<FN extends WrappedSchema<any, any>> = {
	schema: FN;
	mapInput?: (ctx: any) => ExtractInput<FN>;
};

export type RuntimeCtx<Nodes extends Record<string, GraphNode<any>>, Init> = {
	_init: Init;
	results: {
		[K in keyof Nodes]: ExtractOutput<Nodes[K]["schema"]>;
	};
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

export type InferGraphNodes<G> = G extends SchemaGraph<infer N, any>
	? N
	: never;

export type InferGraphInit<G> = G extends SchemaGraph<any, infer I> ? I : never;

export type GraphInput<K extends keyof GraphRegistry> =
	GraphRegistry[K] extends SchemaGraph<any, infer Init> ? Init : never;

export type GraphOutput<K extends keyof GraphRegistry> =
	GraphRegistry[K] extends SchemaGraph<infer Nodes, infer Init>
		? RuntimeCtx<Nodes, Init>
		: never;

export interface GraphRegistry {}
