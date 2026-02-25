import {
	GraphEdge,
	GraphNode,
	GraphOptions,
	NodeMetric,
	RuntimeCtx,
	SchemaGraph,
} from "./types/index.js";
import { GraphResult } from "./utils/projection.js";

export function edge<
	K extends keyof any,
	Nodes extends Record<string, GraphNode<any>>, // Add constraint
	Init,
	State,
>(
	from: K,
	to: K,
	when?: (ctx: RuntimeCtx<Nodes, Init, State>) => boolean,
): GraphEdge<K, Nodes, Init, State> {
	return { from, to, when } as GraphEdge<K, Nodes, Init, State>;
}

export const runGraphInternal = async <
	Nodes extends Record<string, GraphNode<any>>,
	Init,
	State,
>(
	graph: SchemaGraph<Nodes, Init, State>,
	initArgs: Init,
	opts?: GraphOptions,
) => {
	const concurrency = opts?.concurrency ?? 4;
	const logger = opts?.log;

	// Initialize state with initArgs - this is the foundation
	const initialState = {
		...initArgs,
		// Any other default state can go here
	} as unknown as State;

	const ctx: RuntimeCtx<Nodes, Init, State> = {
		_init: initArgs,
		results: {} as RuntimeCtx<Nodes, Init, State>["results"],
		metrics: {},
		state: initialState as RuntimeCtx<Nodes, Init, State>["state"],
		trace: [],
		pending: {},
	};

	const nodeKeys = Object.keys(graph.nodes) as (keyof Nodes)[];

	// ---------- GRAPH INDEX ----------

	const incoming = new Map<
		keyof Nodes,
		GraphEdge<keyof Nodes, Nodes, Init, State>[]
	>();
	const outgoing = new Map<
		keyof Nodes,
		GraphEdge<keyof Nodes, Nodes, Init, State>[]
	>();
	for (const k of nodeKeys) {
		incoming.set(k, []);
		outgoing.set(k, []);
	}

	for (const e of graph.edges) {
		incoming.get(e.to as keyof Nodes)!.push(e as any);
		outgoing.get(e.from as keyof Nodes)!.push(e as any);
	}

	// ---------- REACHABILITY ----------
	const reachable = new Set<keyof Nodes>();

	const dfs = (node: keyof Nodes) => {
		if (reachable.has(node)) return;
		reachable.add(node);

		const outs = outgoing.get(node);
		if (!outs) return;

		for (const edge of outs) {
			dfs(edge.to as keyof Nodes);
		}
	};

	dfs(graph.entry as keyof Nodes);

	// ---------- DEP COUNTERS ----------
	const remainingDeps = new Map<keyof Nodes, number>();

	for (const k of nodeKeys) {
		if (!reachable.has(k)) continue;

		const deps = incoming
			.get(k)!
			.filter((e) => reachable.has(e.from as keyof Nodes)).length;

		remainingDeps.set(k, deps);
	}

	// ---------- READY QUEUE ----------
	const readyQueue: (keyof Nodes)[] = [];

	for (const k of nodeKeys) {
		if (!reachable.has(k)) continue;
		if (remainingDeps.get(k) === 0) readyQueue.push(k);
	}

	// ---------- EXECUTION ----------
	async function executeNode(key: keyof Nodes) {
		const node = graph.nodes[key];
		const runtime = node.runtime ?? {};

		const metric: NodeMetric = (ctx.metrics[key as string] = {
			start: Date.now(),
			status: "success",
			attempts: 0,
		});

		if (runtime.when) {
			const ok = await runtime.when(ctx);
			if (!ok) {
				metric.status = "skipped";
				ctx.trace.push({
					type: "node_skip",
					node: String(key),
					timestamp: Date.now(),
				});

				logger?.({
					type: "node_skip",
					node: String(key),
					reason: "runtime.when === false",
					timestamp: Date.now(),
				});

				return;
			}
		}

		const input = runtime.expect ? runtime.expect(ctx.state) : ctx.state; // If no transform, pass entire state

		logger?.({
			type: "node_start",
			node: String(key),
			timestamp: Date.now(),
			input,
			attempts: metric.attempts + 1,
		});

		ctx.trace.push({
			type: "node_start",
			node: String(key),
			input,
			timestamp: Date.now(),
		});

		const retryCount = runtime.retry ?? 0;

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			metric.attempts++;

			try {
				// Check if this schema is from useGraph (expects ctx)
				const isSubgraph =
					node.schema.toString().includes("ctx") || node.schema.length === 1;

				let finalInput = input;

				// For subgraphs, ensure ctx is present
				if (isSubgraph) {
					if (input === undefined || input === null) {
						finalInput = { ctx } as any;
					} else if (typeof input !== "object") {
						finalInput = {
							value: input,
							ctx,
						} as any;
					} else if (input && typeof input === "object" && !("ctx" in input)) {
						finalInput = {
							...input,
							ctx,
						};
					}
				}

				const execPromise = node.schema(finalInput);
				const res = runtime.timeoutMs
					? await Promise.race([
							execPromise,
							new Promise((_, rej) =>
								setTimeout(() => rej(new Error("Timeout")), runtime.timeoutMs),
							),
						])
					: await execPromise;

				// Store result
				ctx.results[key] = res;

				// 🔥 NEW: Provide data to shared state

				if (runtime.provide) {
					// Cast ctx.state to Record<string, any> for dynamic property assignment
					const state = ctx.state as Record<string, any>;
					for (const [key, mapper] of Object.entries(runtime.provide)) {
						state[key] = mapper?.(res, ctx.state);
					}
				}

				// 🔥 NEW: Provide data to shared state

				// 🔥 NEW: Provide data to downstream nodes via state
				// if (runtime.provide) {
				// 	// Type assertion that we're working with the right shape
				// 	const provide = runtime.provide as {
				// 		[K in keyof Nodes]?: (result: any, state: State) => any;
				// 	};
				// 	for (const [key, mapper] of Object.entries(provide)) {
				// 		ctx.state[key] = mapper?.(res, ctx.state);
				// 	}
				// }

				metric.end = Date.now();
				metric.duration = metric.end - metric.start;
				metric.status = "success";

				ctx.trace.push({
					type: "node_success",
					node: String(key),
					output: res,
					timestamp: Date.now(),
					duration: metric.duration,
				});

				logger?.({
					type: "node_success",
					node: String(key),
					output: res,
					duration: metric.duration,
					attempts: metric.attempts,
					timestamp: Date.now(),
				});

				// ---------- UNLOCK ----------

				for (const edge of outgoing.get(key)!) {
					const next = edge.to as keyof Nodes;

					if (!reachable.has(next)) continue;
					if (edge.when && !edge.when(ctx)) continue;

					const newCount = remainingDeps.get(next)! - 1;
					remainingDeps.set(next, newCount);

					if (newCount === 0) {
						readyQueue.push(next);

						logger?.({
							type: "node_ready",
							triggeredBy: String(key),
							node: String(next),
							timestamp: Date.now(),
						});
					}
				}

				return;
			} catch (err) {
				if (attempt >= retryCount) {
					metric.status = "fail";

					ctx.trace.push({
						error: err,
						type: "node_fail",
						node: String(key),
						timestamp: Date.now(),
					});

					logger?.({
						type: "node_fail",
						node: String(key),
						attempts: metric.attempts,
						timestamp: Date.now(),
						error: err,
					});

					throw err;
				}

				await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
			}
		}
	}

	// ---------- WORKER POOL ----------
	async function worker() {
		while (true) {
			const next = readyQueue.shift();
			if (!next) return;

			const node = graph.nodes[next];
			const runtime = node.runtime ?? {};

			if (runtime.background) {
				ctx.trace.push({
					type: "node_background",
					node: String(next),
					timestamp: Date.now(),
				});

				logger?.({
					type: "node_background",
					node: String(next),
					timestamp: Date.now(),
				});

				ctx.pending[next as string] = executeNode(next);
			} else {
				await executeNode(next);
			}
		}
	}

	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	await Promise.all(Object.values(ctx.pending));

	logger?.({
		type: "graph_finish",
		metrics: ctx.metrics,
		input: ctx._init,
		output: ctx.results,
		state: ctx.state,
		traceLength: ctx.trace.length,
		timestamp: Date.now(),
	});

	return new GraphResult(ctx);
};
