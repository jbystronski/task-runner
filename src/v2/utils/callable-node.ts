import { withResponse } from "@pogodisco/response";
import { TaskMap, TaskNodeWithContracts } from "../types/index.js";
import { callNode } from "../main.js";

export function callableNode<
	T extends TaskMap,
	I extends Record<string, any>,
	O,
>(node: TaskNodeWithContracts<T, I, O>) {
	return withResponse(async (initArgs: I) => {
		const res = await callNode(node, initArgs);

		if (!res.ok) throw res;

		return res.data._output;
	});
}
