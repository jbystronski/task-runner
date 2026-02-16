import { createGraph } from "../graph/main.js";
import { createGraphRegistrar } from "../graph/registry.js";
import { defineSchema } from "../main.js";
import { TasksFromFns } from "../types/index.js";
import { wrapSchema } from "../utils/wrap-schema.js";

export const startSchema = defineSchema<
	TasksFromFns<{}>,
	{ foo: string },
	{ data: string }
>({
	_output: (r) => ({ data: r._init.foo }),
});

export const secondSchema = defineSchema<
	TasksFromFns<{}>,
	{ testNumber: number },
	{ numeric: number }
>({
	_output: (r) => ({ numeric: r._init.testNumber }),
});

const g = createGraph<{ foo: string }>()
	.node("one", wrapSchema(startSchema), (ctx) => ({
		foo: ctx._init.foo,
	}))
	.node("two", wrapSchema(secondSchema))
	.edge("one", "two", (ctx) => ctx.results.one.data === "bar")
	.build();

const reg = {
	one: g,
} as const;

const fromGraph = createGraphRegistrar(reg);

const r = await fromGraph("one", { foo: "bar" });
