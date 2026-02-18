import { defineSchema } from "../main.js";
import { SchemaOptions, TasksFromFns } from "../types/index.js";
import { wrapSchema } from "./wrap-schema.js";

type UnwrapResponse<T> = T extends { data: infer D } ? D : T;

export function makeSchema<
	FN extends (args: any) => Promise<any>,
	Out = UnwrapResponse<Awaited<ReturnType<FN>>>,
>(fn: FN, opts?: SchemaOptions) {
	return wrapSchema(
		defineSchema<TasksFromFns<{ run: FN }>, Parameters<FN>[0], Out>({
			run: {
				fn,

				argMap: (r) => r._init,
			},
			_output: (r) => r.run as Out,
		}),
		opts,
	);
}
