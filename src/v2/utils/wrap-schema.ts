import { withResponse } from "@pogodisco/response";
import {
	SchemaOptions,
	TaskMap,
	TaskSchemaWithContracts,
} from "../types/index.js";
import { runSchema } from "../main.js";

export function wrapSchema<T extends TaskMap, I extends Record<string, any>, O>(
	schema: TaskSchemaWithContracts<T, I, O>,
	options?: SchemaOptions,
) {
	return withResponse(async (initArgs: I) => {
		const res = await runSchema(schema, initArgs, options || {});

		if (!res.ok) throw res;

		return res.data._output;
	});
}
