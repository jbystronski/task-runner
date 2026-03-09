import { fixedNode } from "../node/utils.js";
import {
  GraphBuilder,
  GraphNode,
  GraphEdge,
  GraphMiddleware,
} from "./types/index.js";
import { GoalFlowBuilder } from "./utils/goal-flow-builder.js";
import { GraphValidator } from "./validation/main.js";

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
  const edges: GraphEdge<string, State>[] = [];

  let entry: string | undefined = "start";
  const validator = new GraphValidator();
  let graphMiddleware: GraphMiddleware<State>[] = [];

  const builder: GraphBuilder<any, State> = {
    node(key, schema, runtime) {
      // if (!entry) entry = key;
      if (key === "start") {
        entry = "start";
      }

      nodes[key] = { schema, runtime };

      return builder;
    },

    // edge(from, to, when) {
    //   edges.push({ from, to, when });
    //   return builder;
    // },

    edge(from, to, goals, when) {
      const exists = edges.some((e) => e.from === from && e.to === to);

      if (!exists) {
        edges.push({ from, to, goals, when });
      }

      return builder;
    },

    extend(graph) {
      // Merge nodes (base first)
      for (const [key, node] of Object.entries(graph.nodes)) {
        if (!(key in nodes)) {
          nodes[key] = node as GraphNode<any, State>;
        }
      }

      // Merge edges
      for (const edge of graph.edges) {
        const exists = edges.some(
          (e) => e.from === edge.from && e.to === edge.to,
        );

        if (!exists) {
          edges.push(edge);
        }
      }

      // merge middleware
      if (graph.middleware?.length) {
        graphMiddleware = [
          ...new Set([...graphMiddleware, ...graph.middleware]),
        ];
      }

      // Entry resolution
      if (!entry) {
        entry = graph.entry as string;
      }

      return builder;
    },

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

      if (validation.warnings.length > 0) {
        console.warn("Graph validation warnings:");
        validation.warnings.forEach((w) => {
          console.warn(`  ${w.path.join(".")}: ${w.message}`);
        });
      }

      return graph;
    },
  };

  return builder;
}
