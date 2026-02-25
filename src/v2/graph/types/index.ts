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

export type GraphLogger = (event: GraphEvent) => void;

export type WrappedSchema<I, O> = (args: I) => Promise<O>;

export type ExtractInput<T> = T extends WrappedSchema<infer I, any> ? I : never;
export type ExtractOutput<T> = T extends WrappedSchema<any, infer O>
	? O
	: never;

export type GraphNode<FN extends WrappedSchema<any, any>> = {
	schema: FN;
	runtime?: NodeRuntimeConfig; // No type args needed here
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
			type: "graph_planned";
			entry: string;
			nodes: string[];
			edges: { from: string; to: string }[];
			goals: string[];
			timestamp: number;
	  }
	| {
			type: "node_ready";
			triggeredBy: string;
			node: string;
			timestamp: number;
	  }
	| {
			type: "node_start";
			node: string;
			input: any;
			timestamp: number;
			pool?: string;
			attempts?: number;
	  }
	| {
			type: "node_success";
			node: string;
			output: any;
			duration: number;
			attempts?: number;
			timestamp: number;
	  }
	| {
			type: "node_fail";
			node: string;
			error: any;
			timestamp: number;
			attempts?: number;
	  }
	| { type: "node_skip"; node: string; reason?: string; timestamp: number }
	| { type: "node_background"; node: string; timestamp: number }
	| {
			type: "graph_finish";
			metrics: any;
			// results: any;
			input: any;
			output: any;
			state?: any;
			timestamp: number;
			node?: undefined;
			traceLength?: number;
	  };

export type NodeOutput<T> = T extends WrappedSchema<any, infer O>
	? O extends RuntimeCtx<infer N, any, any>
		? GraphResults<N>
		: O extends { results: infer R }
			? R
			: O
	: never;

export type GraphResults<N extends Record<string, GraphNode<any>>> = {
	[K in keyof N]: NodeOutput<N[K]["schema"]>;
};

export type InferGraphNodes<G> = G extends SchemaGraph<infer N, any, any>
	? N
	: never;

export type InferGraphResults<G> = G extends SchemaGraph<infer N, any, any>
	? GraphResults<N>
	: never;

// RuntimeCtx with State generic
export type RuntimeCtx<
	Nodes extends Record<string, GraphNode<any>>,
	Init,
	State,
> = {
	_init: Init;
	results: GraphResults<Nodes>;
	metrics: Record<string, NodeMetric>;
	trace: GraphEvent[];
	state: State; // Use the State type
	pending: Record<string, Promise<any>>;
};

export type GraphEdge<
	NodeKeys extends keyof any,
	Nodes extends Record<string, GraphNode<any>>,
	Init,
	State,
> = {
	from: NodeKeys;
	to: NodeKeys;
	when?: (ctx: RuntimeCtx<Nodes, Init, State>) => boolean;
};

export type SchemaGraph<
	Nodes extends Record<string, GraphNode<any>>,
	Init,
	State,
> = {
	entry: keyof Nodes;
	nodes: Nodes;
	edges: GraphEdge<keyof Nodes, Nodes, Init, State>[]; // Now carries State
};

type ProvideMap<
	Nodes extends Record<string, GraphNode<any>>,
	CurrentKey extends keyof Nodes,
	CurrentState,
> = {
	[K in keyof CurrentState]?: (
		result: ExtractOutput<Nodes[CurrentKey]["schema"]>,
		state: CurrentState,
	) => CurrentState[K];
};

// NodeRuntimeConfig with proper generics
export type NodeRuntimeConfig<
	Nodes extends Record<string, GraphNode<any>> = any,
	CurrentKey extends keyof Nodes = any,
	CurrentState = any,
> = {
	background?: boolean;
	retry?: number;
	timeoutMs?: number;
	when?: (
		ctx: RuntimeCtx<Nodes, any, CurrentState>,
	) => boolean | Promise<boolean>;
	pool?: string;
	expect?: (state: CurrentState) => ExtractInput<Nodes[CurrentKey]["schema"]>;
	provide?: ProvideMap<Nodes, CurrentKey, CurrentState>;
};

type GetProvidesFromConfig<Config> = Config extends { provide: infer P }
	? P extends Record<string, (...args: any) => any>
		? { [K in keyof P]: ReturnType<P[K]> }
		: {}
	: {};

// GraphBuilder with proper state accumulation
// export type GraphBuilder<
// 	Nodes extends Record<string, GraphNode<any>> = {},
// 	Init = {},
// 	CurrentState = {},
// > = {
// 	node<K extends string, FN extends WrappedSchema<any, any>, Config>(
// 		key: K,
// 		schema: FN,
// 		runtime?: Config &
// 			NodeRuntimeConfig<Nodes & Record<K, GraphNode<FN>>, K, CurrentState>,
// 	): GraphBuilder<
// 		Nodes & Record<K, GraphNode<FN>>,
// 		Init,
// 		CurrentState & GetProvidesFromConfig<Config>
// 	>;
//
// 	edge<From extends keyof Nodes, To extends keyof Nodes>(
// 		from: From,
// 		to: To,
// 		when?: (ctx: any) => boolean,
// 	): GraphBuilder<Nodes, Init, CurrentState>;
//
// 	build(): SchemaGraph<Nodes, Init>;
// };
// GraphBuilder with proper state accumulation
// export type GraphBuilder<
// 	Nodes extends Record<string, GraphNode<any>> = {},
// 	Init = {},
// 	AllProvides = {}, // Accumulates ALL provide types from all nodes
// > = {
// 	node<K extends string, FN extends WrappedSchema<any, any>, Config>(
// 		key: K,
// 		schema: FN,
// 		// Pass the FINAL AllProvides type (not the current one)
// 		runtime?: Config &
// 			NodeRuntimeConfig<Nodes & Record<K, GraphNode<FN>>, K, AllProvides>,
// 	): GraphBuilder<
// 		Nodes & Record<K, GraphNode<FN>>,
// 		Init,
// 		// Add this node's provides to AllProvides for NEXT nodes
// 		AllProvides & GetProvidesFromConfig<Config>
// 	>;
//
// 	edge<From extends keyof Nodes, To extends keyof Nodes>(
// 		from: From,
// 		to: To,
// 		when?: (ctx: any) => boolean,
// 	): GraphBuilder<Nodes, Init, AllProvides>;
//
// 	build(): SchemaGraph<Nodes, Init>;
// };

export type GraphBuilder<
	Nodes extends Record<string, GraphNode<any>> = {},
	Init = {},
	State = {}, // Add State generic here
> = {
	node<K extends string, FN extends WrappedSchema<any, any>, Config>(
		key: K,
		schema: FN,
		// Pass State to NodeRuntimeConfig
		runtime?: Config &
			NodeRuntimeConfig<Nodes & Record<K, GraphNode<FN>>, K, State>,
	): GraphBuilder<
		Nodes & Record<K, GraphNode<FN>>,
		Init,
		State & GetProvidesFromConfig<Config> // Accumulate provides into State
	>;
	edge<From extends keyof Nodes, To extends keyof Nodes>(
		from: From,
		to: To,
		when?: (ctx: RuntimeCtx<Nodes, Init, State>) => boolean, // Now fully typed!
	): GraphBuilder<Nodes, Init, State>;

	build(): SchemaGraph<Nodes, Init, State>;
};

export type GraphEntryInput<G extends SchemaGraph<any, any, any>> =
	G extends SchemaGraph<infer Nodes, any, any>
		? RuntimeCtx<Nodes, any, any>["_init"]
		: never;

export type GraphNodes<G> = G extends SchemaGraph<infer Nodes, any, any>
	? Nodes
	: never;

export type InferGraphInit<G> = G extends SchemaGraph<any, infer I, any>
	? I
	: never;

export interface GraphRegistry {}

export type GraphRunOptions = {
	concurrency?: number;
	log?: GraphLogger;

	pools?: Record<string, number>;
};
