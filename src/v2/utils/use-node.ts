import { TaskMap, TaskNodeWithContracts } from "../types/index.js";
import { execNode } from "../main.js";

// export function executeNode<
// 	T extends TaskMap,
// 	I extends Record<string, any>,
// 	O,
// >(node: TaskNodeWithContracts<T, I, O>) {
// 	// withResponse catches any throws and converts to TResponse
// 	return withResponse(async (initArgs: I): Promise<O> => {
// 		// callNode now throws on error, returns raw data on success
// 		const result = await callNode(node, initArgs);
// 		return result._output;
// 	});
// }

/**
 * Adapts a node for use in graphs by extracting only the `_output`
 * from the full execution result. The returned function:
 * - Takes the node's input
 * - Returns only the output data (Promise<O>)
 * - Throws errors directly
 *
 * For full access to _status and _results, use execNode() directly.
 */

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
