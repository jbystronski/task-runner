import { defineNode } from "../main.js";
import { TasksFromFns } from "../types/index.js";
import { useNode } from "./use-node.js";

type UnwrapResponse<T> = T extends { data: infer D } ? D : T;

export function makeNode<
	FN extends (args: any) => Promise<any>,
	Out = UnwrapResponse<Awaited<ReturnType<FN>>>,
>(fn: FN) {
	return useNode(
		defineNode<TasksFromFns<{ run: FN }>, Parameters<FN>[0], Out>({
			run: {
				fn,

				argMap: (r) => r._init,
			},
			_output: (r) => r.run as Out,
		}),
	);
}
