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
export type ExtractOutput<T> =
	T extends WrappedSchema<any, infer O> ? O : never;

export type GraphNode<
	FN extends WrappedSchema<any, any>,
	Nodes extends Record<string, GraphNode<any, any, any, any>>,
	CurrentKey extends keyof Nodes,
	CurrentState,
> = {
	schema: FN;
	runtime?: NodeRuntimeConfig<Nodes, CurrentKey, CurrentState>; // No type args needed here
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

			// output: any;
			state?: any;
			timestamp: number;
			node?: undefined;
			traceLength?: number;
	  };

// export type NodeOutput<T, State> =
// 	T extends WrappedSchema<any, infer O>
// 		? O extends RuntimeCtx<infer N, any, any>
// 			? GraphResults<N, State>
// 			: O extends { results: infer R }
// 				? R
// 				: O
// 		: never;
export type GraphNodeWithState<State> = GraphNode<any, any, any, State>;
// export type GraphResults<
// 	N extends Record<string, GraphNode<any, any, any, State>>,
// 	State,
// > = {
// 	[K in keyof N]: NodeOutput<N[K]["schema"], State>;
// };

export type InferGraphNodes<G> =
	G extends SchemaGraph<infer N, any> ? N : never;

// export type InferGraphResults<G, State> =
// 	G extends SchemaGraph<infer N, any, any> ? GraphResults<N, State> : never;

// RuntimeCtx with State generic
export type RuntimeCtx<
	Nodes extends Record<string, GraphNode<any, any, any, State>>,
	State,
> = {
	// results: GraphResults<Nodes, State>;
	metrics: Record<string, NodeMetric>;
	trace: GraphEvent[];
	state: State; // Use the State type
	pending: Record<string, Promise<any>>;
};

export type GraphEdge<
	NodeKeys extends keyof any,
	Nodes extends Record<string, GraphNode<any, any, any, State>>,
	State,
> = {
	from: NodeKeys;
	to: NodeKeys;
	when?: (ctx: RuntimeCtx<Nodes, State>) => boolean;
};

export type SchemaGraph<
	Nodes extends Record<string, GraphNode<any, any, any, State>>,
	State,
> = {
	entry: keyof Nodes;
	nodes: Nodes;
	edges: GraphEdge<keyof Nodes, Nodes, State>[]; // Now carries State
};

// type ProvideMap<
// 	Nodes extends Record<string, GraphNode<any, any, any, any>>,
// 	CurrentKey extends keyof Nodes,
// 	CurrentState,
// > = {
// 	[K in keyof CurrentState]?: (
// 		result: ExtractOutput<Nodes[CurrentKey]["schema"]>,
// 		state: CurrentState,
// 	) => CurrentState[K];
// };
// type ProvideMapReturn<CurrentState> = {
// 	[K in keyof CurrentState]?: CurrentState[K]; // Direct values, not functions
// };
// NodeRuntimeConfig with proper generics
//
type Exact<T, U extends T> = U & Record<Exclude<keyof U, keyof T>, never>;
export type NodeRuntimeConfig<
	Nodes extends Record<string, GraphNode<any, any, any, CurrentState>>,
	CurrentKey extends keyof Nodes,
	CurrentState,
> = {
	background?: boolean;
	retry?: number;
	timeoutMs?: number;
	when?: (ctx: RuntimeCtx<Nodes, CurrentState>) => boolean | Promise<boolean>;
	pool?: string;
	expect?: (state: CurrentState) => ExtractInput<Nodes[CurrentKey]["schema"]>;
	// provide?: ProvideMap<Nodes, CurrentKey, CurrentState>;
	provide?: (
		result: ExtractOutput<Nodes[CurrentKey]["schema"]>,
		state: CurrentState,
	) => Partial<CurrentState>;
};

export type GraphBuilder<
	Nodes extends Record<string, GraphNode<any, any, any, State>> = {},
	State = {}, // Add State generic here
> = {
	node<K extends string, FN extends WrappedSchema<any, any>>(
		key: K,
		schema: FN,
		// Pass State to NodeRuntimeConfig
		//
		runtime?: NodeRuntimeConfig<
			Nodes & Record<K, GraphNode<FN, Nodes, K, State>>,
			K,
			State
		>,
	): GraphBuilder<Nodes & Record<K, GraphNode<FN, Nodes, K, State>>, State>;
	edge<From extends keyof Nodes, To extends keyof Nodes>(
		from: From,
		to: To,
		when?: (ctx: RuntimeCtx<Nodes, State>) => boolean, // Now fully typed!
	): GraphBuilder<Nodes, State>;

	build(): SchemaGraph<Nodes, State>;
};

// export type GraphEntryInput<G extends SchemaGraph<any, any>> =
// 	G extends SchemaGraph<infer Nodes, any>
// 		? RuntimeCtx<Nodes, any, any>["_init"]
// 		: never;

export type GraphNodes<G> =
	G extends SchemaGraph<infer Nodes, any> ? Nodes : never;

// export type InferGraphInit<G> =
// 	G extends SchemaGraph<any, infer I, any> ? I : never;

export interface GraphRegistry {}

export type GraphRunOptions = {
	concurrency?: number;
	log?: GraphLogger;

	pools?: Record<string, number>;
};
