import {
	createGraph,
	defineNode,
	type TasksFromFns,
	useNode,
	runGraph,
} from "../dist/index.js";

export const node = defineNode<
	TasksFromFns<{}>,
	{ foo: string },
	{ data: string }
>({
	_output: (r) => ({ data: r._init.foo }),
});

const g = createGraph<{ foo: string }>()
	.node("one", useNode(node))
	.build();

await runGraph(g, { foo: "ok" });
// @ts-expect-error
await runGraph(g, { foo: 123 });
