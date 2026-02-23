import { defineNode, execNode } from "./main.js";
import { TasksFromFns, TaskMap, TaskNodeWithContracts } from "./types.js";

export function createNode<
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

export function genericNode<FN extends (args: any) => any>(fn: FN) {
	return <T = Awaited<ReturnType<FN>>>() => useNode(createNode<FN, T>(fn));
}

export function fixedNode<
	FN extends (args: any) => any,
	T = Awaited<ReturnType<FN>>,
>(fn: FN): () => (args: Parameters<FN>[0]) => Promise<T> {
	return () => useNode(createNode<FN, T>(fn));
}

export function useNode<
	T extends TaskMap,
	I extends Record<string, any> | undefined,
	O,
>(node: TaskNodeWithContracts<T, I, O>) {
	// Returns a function that graph can call, but WITHOUT withResponse
	// Just a simple adapter that calls callNode and returns raw _output
	return async (initArgs: I): Promise<O> => {
		const result = await execNode(node, initArgs);
		return result._output; // Just raw data, throws on error
	};
}
