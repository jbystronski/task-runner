import { withResponse } from "@pogodisco/response";
import { runGraph } from "../main.js";
import { SchemaGraph, InferGraphInit, GraphOpts } from "../types/index.js";

export function useGraph<G extends SchemaGraph<any, any>>(
	graph: G,
	opts?: GraphOpts,
) {
	return withResponse(async (initArgs: InferGraphInit<G>) => {
		const res = await runGraph(graph, initArgs, opts);
		if (!res.ok) throw res;

		return res.data;
	});
}
