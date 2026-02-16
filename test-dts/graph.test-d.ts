import {
	createGraph,
	defineSchema,
	type TasksFromFns,
	wrapSchema,
	runGraph,
} from "../dist/index.js";

export const schema = defineSchema<
	TasksFromFns<{}>,
	{ foo: string },
	{ data: string }
>({
	_output: (r) => ({ data: r._init.foo }),
});

const g = createGraph<{ foo: string }>()
	.node("one", wrapSchema(schema))
	.build();

await runGraph(g, { foo: "ok" });
// @ts-expect-error
await runGraph(g, { foo: 123 });
