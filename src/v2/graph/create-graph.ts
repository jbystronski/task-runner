import { GraphBuilder, GraphNode, GraphEdge } from "./types/index.js";
import { GraphValidator } from "./validation/main.js";

export function createGraph<Init = {}, State = {}>(): GraphBuilder<
	{},
	Init,
	State
> {
	const nodes: Record<string, GraphNode<any>> = {};
	// const edges: GraphEdge<string>[] = [];

	const edges: GraphEdge<keyof any, any, Init, State>[] = [];
	let entry: string | undefined;
	const validator = new GraphValidator();

	const builder: GraphBuilder<any, Init, State> = {
		node(key, schema, runtime) {
			if (!entry) entry = key;
			nodes[key] = { schema, runtime };
			return builder as any;
		},

		edge(from, to, when) {
			edges.push({ from, to, when } as GraphEdge<keyof any, any, Init, State>);
			return builder;
		},

		build() {
			if (!entry) throw new Error("Graph must have an entry node");

			const graph = {
				entry,
				nodes: nodes as any,
				edges: edges as any,
			};

			// Run validation
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
	return builder as GraphBuilder<{}, Init, State>;
}
