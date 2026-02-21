import { defineNode } from "../main.js";
import { TasksFromFns } from "../types/index.js";
import { useNode } from "./use-node.js";

export function makeNode<
	FN extends (args: any) => any, // Allow sync or async
	Out = Awaited<ReturnType<FN>>, // Unwrap Promise if present
>(fn: FN) {
	// Just return the raw node definition, not wrapped with useNode
	return defineNode<TasksFromFns<{ run: FN }>, Parameters<FN>[0], Out>({
		run: {
			fn, // Function can throw or return data
			argMap: (r) => r._init,
		},
		_output: (r) => r.run as Out,
	});
}

export function createGenericNode<FN extends (args: any) => any>(fn: FN) {
	return <T = Awaited<ReturnType<FN>>>() => useNode(makeNode<FN, T>(fn));
}

export function createFixedNode<
	FN extends (args: any) => any,
	T = Awaited<ReturnType<FN>>,
>(fn: FN): () => (args: Parameters<FN>[0]) => Promise<T> {
	return () => useNode(makeNode<FN, T>(fn));
}
