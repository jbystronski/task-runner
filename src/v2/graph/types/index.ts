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

export type GraphNode<FN extends WrappedSchema<any, any>, State> = {
  schema: FN;
  runtime?: NodeRuntimeConfig<FN, State>; // No type args needed here
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

export type GraphNodeWithState<State> = GraphNode<any, State>;

export type InferGraphNodes<G> =
  G extends SchemaGraph<infer N, any> ? N : never;

// RuntimeCtx with State generic
export type RuntimeCtx<State> = {
  // results: GraphResults<Nodes, State>;
  metrics: Record<string, NodeMetric>;
  trace: GraphEvent[];
  state: State; // Use the State type
  pending: Record<string, Promise<any>>;
};

export type GraphEdge<NodeKeys extends string, State> = {
  from: NodeKeys;
  to: NodeKeys;
  when?: (ctx: RuntimeCtx<State>) => boolean;
};

export type SchemaGraph<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
> = {
  entry: keyof Nodes;
  nodes: Nodes;
  edges: GraphEdge<keyof Nodes & string, State>[]; // Now carries State
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

export type NodeRuntimeConfig<FN extends WrappedSchema<any, any>, State> = {
  background?: boolean;
  retry?: number;
  timeoutMs?: number;
  when?: (ctx: RuntimeCtx<State>) => boolean | Promise<boolean>;
  pool?: string;
  expect?: (state: State) => ExtractInput<FN>;
  // provide?: ProvideMap<Nodes, CurrentKey, CurrentState>;
  provide?: (result: ExtractOutput<FN>, state: State) => Partial<State>;
};

export type GraphBuilder<
  Nodes extends Record<string, GraphNode<any, State>> = {},
  State = {},
> = {
  extend<G extends SchemaGraph<any, State>>(
    graph: G,
  ): GraphBuilder<Nodes & GraphNodes<G>, State>;

  node<K extends string, FN extends WrappedSchema<any, any>>(
    key: K,
    schema: FN,

    runtime?: NodeRuntimeConfig<FN, State>,
  ): GraphBuilder<Nodes & Record<K, GraphNode<FN, State>>, State>;
  edge<
    From extends Extract<keyof Nodes, string>,
    To extends Extract<keyof Nodes, string>,
  >(
    from: From,
    to: To,
    when?: (ctx: RuntimeCtx<State>) => boolean, // Now fully typed!
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
