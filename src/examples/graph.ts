import { isFailure, withResponse } from "@pogodisco/response";
import {
	createGraph,
	createGraphRegistrar,
	defineSchema,
	runGraph,
	TasksFromFns,
	wrapSchema,
} from "../index.js";
import { useLogger } from "./logger.js";

const taskOne = withResponse(async () => {
	// throw
	//
	throw Error("Task one resulted in error");
});

export const schema = defineSchema<
	TasksFromFns<{
		t1: typeof taskOne;
	}>,
	{ foo: string },
	{ data: string }
>({
	t1: {
		fn: taskOne,
		argMap: (r) => ({}),
	},
	_output: (r) => ({ data: r._init.foo }),
});

const graph = createGraph<{ foo: string }>()
	.node("one", wrapSchema(schema, { log: useLogger() }))
	.build();

const graphWithResponse = withResponse(async () => {
	const r = await runGraph(graph, { foo: "FOO ONE" });
});

const wg = await graphWithResponse();

console.log("wrapped graph result", wg);

const g = await runGraph(graph, { foo: "FOO TWO" });
console.log("graph one", g);

const r = {
	test: graph,
} as const;

const fromGraph = createGraphRegistrar(r);

const resFromGraph = await fromGraph("test", { foo: "BAR" });

if (isFailure(resFromGraph)) {
	console.log("tresponse error", resFromGraph.error);
}

console.log("res from graph reg", resFromGraph);
