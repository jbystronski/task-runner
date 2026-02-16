import { withResponse } from "@pogodisco/response";
import {
	GraphBuilder,
	GraphEdge,
	GraphNode,
	RuntimeCtx,
	SchemaGraph,
} from "./types/index.js";

export function edge<K extends keyof any>(
	from: K,
	to: K,
	when?: (ctx: any) => boolean,
): GraphEdge<K> {
	return { from, to, when };
}

export function createGraph<Init = {}>(): GraphBuilder<{}, Init> {
	const nodes: Record<string, GraphNode<any>> = {};
	// const edges: GraphEdge<string>[] = [];
	const edges: GraphEdge<keyof any>[] = [];
	let entry: string | undefined;

	const builder: GraphBuilder<any, Init> = {
		node(key, schema, mapInput) {
			if (!entry) entry = key;
			nodes[key] = { schema, mapInput };
			return builder as any;
		},

		edge(from, to, when?: any) {
			// if (!(from in nodes))
			// 	throw new Error(`Edge 'from' node "${from}" does not exist`);
			// if (!(to in nodes))
			// 	throw new Error(`Edge 'to' node "${to}" does not exist`);
			edges.push({ from, to, when });
			return builder;
		},

		build() {
			if (!entry) throw new Error("Graph must have an entry node");
			return {
				entry,
				nodes: nodes as any,
				edges: edges as any,
			};
		},
	};

	return builder;
}
// export async function runGraph<
// 	Nodes extends Record<string, GraphNode<any>>,
// 	Init,
// >(
// 	graph: SchemaGraph<Nodes, Init>,
// 	initArgs: Init,
// ): Promise<RuntimeCtx<Nodes, Init>> {
// 	const ctx: RuntimeCtx<Nodes, Init> = {
// 		_init: initArgs,
// 		results: {} as any,
// 	};
//
// 	const queue: (keyof Nodes)[] = [graph.entry];
// 	const visited = new Set<keyof Nodes>();
//
// 	while (queue.length) {
// 		const nodeName = queue.shift()!;
// 		if (visited.has(nodeName)) continue;
//
// 		const node = graph.nodes[nodeName];
// 		const input = node.mapInput ? node.mapInput(ctx) : ctx._init;
// 		const res = await node.schema(input);
// 		if (!res.ok) throw res;
//
// 		ctx.results[nodeName] = res.data;
// 		visited.add(nodeName);
//
// 		const nextEdges = graph.edges.filter(
// 			(e) => e.from === nodeName && (!e.when || e.when(ctx)),
// 		);
//
// 		for (const e of nextEdges) queue.push(e.to);
// 	}
//
// 	return ctx;
// }
export const runGraph = withResponse(
	async <Nodes extends Record<string, GraphNode<any>>, Init>(
		graph: SchemaGraph<Nodes, Init>,
		initArgs: Init,
	): Promise<RuntimeCtx<Nodes, Init>> => {
		const ctx: RuntimeCtx<Nodes, Init> = {
			_init: initArgs,
			results: {} as any,
		};

		const queue: (keyof Nodes)[] = [graph.entry];
		const visited = new Set<keyof Nodes>();

		while (queue.length) {
			const nodeName = queue.shift()!;
			if (visited.has(nodeName)) continue;

			const node = graph.nodes[nodeName];
			const input = node.mapInput ? node.mapInput(ctx) : ctx._init;
			const res = await node.schema(input);
			if (!res.ok) throw res;

			ctx.results[nodeName] = res.data;
			visited.add(nodeName);

			const nextEdges = graph.edges.filter(
				(e) => e.from === nodeName && (!e.when || e.when(ctx)),
			);

			for (const e of nextEdges) queue.push(e.to);
		}

		return ctx;
	},
);
