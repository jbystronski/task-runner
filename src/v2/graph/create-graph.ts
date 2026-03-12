import { fixedNode } from "../node/utils.js";
import {
  GraphBuilder,
  GraphNode,
  GraphEdge,
  GraphMiddleware,
  WrappedSchema,
  NodeRuntimeConfig,
  SchemaGraph,
  GraphNodes,
} from "./types/index.js";
import { GoalFlowBuilder } from "./utils/goal-flow-builder.js";
import { GraphValidator } from "./validation/main.js";

// export function createGraph<State = {}>(): GraphBuilder<
//   { start: GraphNode<any, State> },
//   State
// > {
//   const nodes: Record<string, GraphNode<any, State>> = {
//     start: {
//       schema: fixedNode(() => {})(),
//       runtime: {},
//     },
//   };
//   const edges: GraphEdge<string, State>[] = [];
//
//   let entry: string | undefined = "start";
//   const validator = new GraphValidator();
//   let graphMiddleware: GraphMiddleware<State>[] = [];
//
//   function mergeNode<FN extends WrappedSchema<any, any>>(
//     parent: GraphNode<FN, State> | undefined,
//     child: GraphNode<FN, State>,
//   ): GraphNode<FN, State> {
//     if (!parent) return child;
//     return {
//       schema: child.schema ?? parent.schema,
//       runtime: {
//         ...parent.runtime,
//         ...child.runtime,
//         expect: composeExpect(parent.runtime?.expect, child.runtime?.expect),
//         provide: composeProvide(
//           parent.runtime?.provide,
//           child.runtime?.provide,
//         ),
//         middleware: [
//           ...(parent.runtime?.middleware ?? []),
//           ...(child.runtime?.middleware ?? []),
//         ],
//       },
//     };
//   }
//
//   function composeExpect(
//     parent?: (state: State) => any,
//     child?: (state: State, base?: any) => any,
//   ) {
//     if (!parent) return child;
//     if (!child) return parent;
//     return (state: State) => {
//       const base = parent(state);
//       return child(state, base);
//     };
//   }
//
//   function composeProvide(
//     parent?: (result: any, state: State) => Partial<State>,
//     child?: (result: any, state: State) => Partial<State>,
//   ) {
//     if (!parent) return child;
//     if (!child) return parent;
//     return (result: any, state: State) => ({
//       ...parent(result, state),
//       ...child(result, state),
//     });
//   }
//
//   const builder: GraphBuilder<any, State> = {
//     // node(key, schema, runtime) {
//     //   // if (!entry) entry = key;
//     //   if (key === "start") {
//     //     entry = "start";
//     //   }
//     //
//     //   nodes[key] = { schema, runtime };
//     //
//     //   return builder;
//     // },
//     // --- New node() --- supports partial overrides
//     node<K extends string, FN extends WrappedSchema<any, any>>(
//       key: K,
//       schemaOrRuntime?: FN | NodeRuntimeConfig<FN, State>,
//       runtimePatch?: NodeRuntimeConfig<FN, State>,
//     ) {
//       let schema: FN | undefined;
//       let runtime: NodeRuntimeConfig<FN, State> | undefined;
//
//       if (typeof schemaOrRuntime === "function") {
//         // full schema override
//         schema = schemaOrRuntime as FN;
//         runtime = runtimePatch;
//       } else {
//         // partial override only
//         schema = nodes[key]?.schema as FN;
//         runtime = schemaOrRuntime as NodeRuntimeConfig<FN, State>;
//       }
//
//       if (!schema) {
//         throw new Error(`Cannot define node "${key}" without schema`);
//       }
//
//       nodes[key] = mergeNode(nodes[key], { schema, runtime });
//
//       return builder;
//     },
//
//     edge(from, to, goals, when) {
//       const exists = edges.some((e) => e.from === from && e.to === to);
//
//       if (!exists) {
//         edges.push({ from, to, goals, when });
//       }
//
//       return builder;
//     },
//
//     extend<ParentState>(
//       graph: SchemaGraph<any, ParentState>,
//     ): GraphBuilder<
//       GraphNodes<typeof nodes> & GraphNodes<typeof graph>,
//       State & ParentState
//     > {
//       // merge nodes
//       for (const [key, node] of Object.entries(graph.nodes)) {
//         nodes[key] = mergeNode(nodes[key], node as GraphNode<any, any>);
//       }
//
//       // merge edges
//       for (const edge of graph.edges) {
//         const exists = edges.some(
//           (e) => e.from === edge.from && e.to === edge.to,
//         );
//         if (!exists)
//           edges.push(edge as unknown as GraphEdge<string, State & ParentState>);
//       }
//
//       // merge middleware
//       if (graph.middleware?.length) {
//         graphMiddleware = [
//           ...new Set([...graphMiddleware, ...(graph.middleware as any)]),
//         ];
//       }
//
//       // entry
//       if (!entry) entry = graph.entry as string;
//
//       return builder as any; // TS will now see builder as GraphBuilder<Nodes & GraphNodes<typeof graph>, State & ParentState>
//     },
//     // extend<ParentState extends Partial<State>>(
//     //   graph: SchemaGraph<any, ParentState>,
//     // ) {
//     //   // Merge nodes
//     //   for (const [key, node] of Object.entries(graph.nodes)) {
//     //     nodes[key] = mergeNode(nodes[key], node as GraphNode<any, State>);
//     //   }
//     //
//     //   // Merge edges (deduplicated)
//     //   for (const edge of graph.edges) {
//     //     const exists = edges.some(
//     //       (e) => e.from === edge.from && e.to === edge.to,
//     //     );
//     //     if (!exists) {
//     //       // cast via unknown to convince TS
//     //       edges.push(edge as unknown as GraphEdge<string, State>);
//     //     }
//     //   }
//     //
//     //   // Merge middleware
//     //   if (graph.middleware?.length) {
//     //     graphMiddleware = [
//     //       ...new Set([
//     //         ...graphMiddleware,
//     //         ...(graph.middleware as unknown as GraphMiddleware<State>[]),
//     //       ]),
//     //     ];
//     //   }
//     //
//     //   // Entry resolution
//     //   if (!entry) entry = graph.entry as string;
//     //
//     //   return builder;
//     // },
//
//     use(mw: GraphMiddleware<State>) {
//       graphMiddleware.push(mw);
//       return builder;
//     },
//
//     goal<Goal extends keyof typeof nodes & string>(
//       goal: Goal,
//       cb: (
//         f: GoalFlowBuilder<Goal, State, keyof typeof nodes & string>,
//       ) => void,
//     ): GraphBuilder<any, State> {
//       const f = new GoalFlowBuilder<Goal, State, keyof typeof nodes & string>(
//         goal,
//         edges,
//       );
//       cb(f); // edges are updated internally
//       return builder; // do NOT push buildEdges() again
//     },
//
//     build() {
//       if (!entry) {
//         throw new Error("Graph must have an entry node");
//       }
//
//       const graph = {
//         entry,
//         nodes,
//         edges,
//         middleware: graphMiddleware,
//       };
//       const validation = validator.validate(graph);
//
//       if (!validation.valid) {
//         const errorMessages = validation.errors
//           .map((e) => `${e.path.join(".")}: ${e.message}`)
//           .join("\n");
//
//         throw new Error(`Graph validation failed:\n${errorMessages}`);
//       }
//
//       if (validation.warnings.length > 0) {
//         console.warn("Graph validation warnings:");
//         validation.warnings.forEach((w) => {
//           console.warn(`  ${w.path.join(".")}: ${w.message}`);
//         });
//       }
//
//       return graph;
//     },
//   };
//
//   return builder;
// }
function mergeNode<FN extends WrappedSchema<any, any>, State>(
  parent: GraphNode<FN, State> | undefined,
  child: GraphNode<FN, State>,
): GraphNode<FN, State> {
  if (!parent) return child;
  return {
    schema: child.schema ?? parent.schema,
    runtime: {
      ...parent.runtime,
      ...child.runtime,
      expect: composeExpect(parent.runtime?.expect, child.runtime?.expect),
      provide: composeProvide(parent.runtime?.provide, child.runtime?.provide),
      middleware: [
        ...(parent.runtime?.middleware ?? []),
        ...(child.runtime?.middleware ?? []),
      ],
    },
  };
}

function composeExpect<State>(
  parent?: (state: State) => any,
  child?: (state: State, base?: any) => any,
) {
  if (!parent) return child;
  if (!child) return parent;
  return (state: State) => {
    const base = parent(state);
    return child(state, base);
  };
}

function composeProvide<State>(
  parent?: (result: any, state: State) => Partial<State>,
  child?: (result: any, state: State) => Partial<State>,
) {
  if (!parent) return child;
  if (!child) return parent;
  return (result: any, state: State) => ({
    ...parent(result, state),
    ...child(result, state),
  });
}

type GraphNodeMap<State> = { start: GraphNode<any, State> } & Record<
  string,
  GraphNode<any, State>
>;

export function createGraph<State = {}>(): GraphBuilder<
  { start: GraphNode<any, State> },
  State
> {
  const nodes: Record<string, GraphNode<any, State>> = {
    start: {
      schema: fixedNode(() => {})(),
      runtime: {},
    },
  };
  // const nodes: GraphNodeMap<State> = {
  //   start: {
  //     schema: fixedNode(() => {})(),
  //     runtime: {},
  //   },
  // };

  const edges: GraphEdge<string, any>[] = []; // ← allow merge
  let entry: string | undefined = "start";

  const validator = new GraphValidator();
  let graphMiddleware: GraphMiddleware<any>[] = [];

  const builder: GraphBuilder<{ start: GraphNode<any, State> }, State> = {
    // const builder: GraphBuilder<any, State> = {
    node<K extends string, FN extends WrappedSchema<any, any>>(
      key: K,
      schemaOrRuntime?: FN | NodeRuntimeConfig<FN, State>,
      runtimePatch?: NodeRuntimeConfig<FN, State>,
    ) {
      let schema: FN | undefined;
      let runtime: NodeRuntimeConfig<FN, State> | undefined;

      if (typeof schemaOrRuntime === "function") {
        schema = schemaOrRuntime;
        runtime = runtimePatch;
      } else {
        schema = nodes[key]?.schema as FN;
        runtime = schemaOrRuntime;
      }

      if (!schema) {
        throw new Error(`Cannot define node "${key}" without schema`);
      }

      nodes[key] = mergeNode(nodes[key], { schema, runtime });

      return builder;
    },

    // node<K extends string, FN extends WrappedSchema<any, any>>(
    //   key: K,
    //   schemaOrRuntime?: FN | Partial<NodeRuntimeConfig<FN, State>>,
    //   runtimePatch?: NodeRuntimeConfig<FN, State>,
    // ) {
    //   let schema: FN | undefined;
    //   let runtime: NodeRuntimeConfig<FN, State> | undefined;
    //
    //   if (typeof schemaOrRuntime === "function") {
    //     schema = schemaOrRuntime;
    //     runtime = runtimePatch;
    //   } else {
    //     schema = nodes[key]?.schema as FN;
    //     runtime = schemaOrRuntime as NodeRuntimeConfig<FN, State>;
    //   }
    //
    //   if (!schema)
    //     throw new Error(`Cannot define node "${key}" without schema`);
    //
    //   nodes[key] = mergeNode(nodes[key], { schema, runtime });
    //
    //   return builder;
    // },

    // edge(from: string, to: string, goals?: string[], when?: any) {
    //   const exists = edges.some((e) => e.from === from && e.to === to);
    //
    //   if (!exists) {
    //     edges.push({ from, to, goals, when });
    //   }
    //
    //   return builder;
    // },

    edge(from, to, goals, when) {
      const exists = edges.some((e) => e.from === from && e.to === to);

      if (!exists) {
        edges.push({ from, to, goals, when });
      }

      return builder;
    },

    extend<ParentState>(graph: SchemaGraph<any, any>) {
      for (const [key, node] of Object.entries(graph.nodes)) {
        nodes[key] = mergeNode(nodes[key], node as GraphNode<any, any>);
      }

      for (const edge of graph.edges) {
        const exists = edges.some(
          (e) => e.from === edge.from && e.to === edge.to,
        );

        if (!exists) {
          edges.push(edge as GraphEdge<string, any>);
        }
      }

      if (graph.middleware?.length) {
        graphMiddleware = [
          ...new Set([...graphMiddleware, ...graph.middleware]),
        ];
      }

      if (!entry) entry = graph.entry as string;

      return builder as GraphBuilder<any, State & ParentState>;
    },
    // extend<ParentState>(graph: SchemaGraph<any, any>) {
    //   for (const [key, node] of Object.entries(graph.nodes)) {
    //     nodes[key] = mergeNode(nodes[key], node as GraphNode<any, any>);
    //   }
    //
    //   for (const edge of graph.edges) {
    //     const exists = edges.some(
    //       (e) => e.from === edge.from && e.to === edge.to,
    //     );
    //
    //     if (!exists) {
    //       edges.push(edge as GraphEdge<string, any>);
    //     }
    //   }
    //
    //   if (graph.middleware?.length) {
    //     graphMiddleware = [
    //       ...new Set([...graphMiddleware, ...graph.middleware]),
    //     ];
    //   }
    //
    //   if (!entry) entry = graph.entry as string;
    //
    //   return builder as any;
    // },

    use(mw: GraphMiddleware<State>) {
      graphMiddleware.push(mw);
      return builder;
    },

    goal<Goal extends keyof typeof nodes & string>(
      goal: Goal,
      cb: (
        f: GoalFlowBuilder<Goal, State, keyof typeof nodes & string>,
      ) => void,
    ): GraphBuilder<any, State> {
      const f = new GoalFlowBuilder<Goal, State, keyof typeof nodes & string>(
        goal,
        edges,
      );
      cb(f); // edges are updated internally
      return builder; // do NOT push buildEdges() again
    },

    build() {
      if (!entry) {
        throw new Error("Graph must have an entry node");
      }

      const graph = {
        entry,
        nodes,
        edges,
        middleware: graphMiddleware,
      };

      const validation = validator.validate(graph);

      if (!validation.valid) {
        const errorMessages = validation.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("\n");

        throw new Error(`Graph validation failed:\n${errorMessages}`);
      }

      return graph;
    },
  };
  return builder;
  // return builder as GraphBuilder<{ start: GraphNode<any, State> }, State>;
}
