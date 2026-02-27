

import { GraphBuilder, GraphNode, GraphEdge } from "./types/index.js";
import { GraphValidator } from "./validation/main.js";

export function createGraph<State = {}>(): GraphBuilder<{}, State> {
  const nodes: Record<string, GraphNode<any, State>> = {};
  const edges: GraphEdge<string, State>[] = [];

  let entry: string | undefined;
  const validator = new GraphValidator();

  const builder: GraphBuilder<any, State> = {
    node(key, schema, runtime) {
      if (!entry) entry = key;

      nodes[key] = { schema, runtime };

      return builder;
    },

    edge(from, to, when) {
      edges.push({ from, to, when });
      return builder;
    },

    build() {
      if (!entry) {
        throw new Error("Graph must have an entry node");
      }

      const graph = {
        entry,
        nodes,
        edges,
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
