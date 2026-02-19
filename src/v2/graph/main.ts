import { withResponse } from "@pogodisco/response";
import {
	GraphBuilder,
	GraphEdge,
	GraphLogger,
	GraphNode,
	GraphOpts,
	NodeMetric,
	RuntimeCtx,
	SchemaGraph,
} from "./types/index.js";

export function edge<K extends keyof any>(
	from: K,
	to: K,
	when?: (ctx: any) => boolean,
): GraphEdge<K> {
	return { from, to, when };
}

export function createGraph<Init = {}>(): GraphBuilder<{}, Init> {
	const nodes: Record<string, GraphNode<any>> = {};
	// const edges: GraphEdge<string>[] = [];
	const edges: GraphEdge<keyof any>[] = [];
	let entry: string | undefined;

	const builder: GraphBuilder<any, Init> = {
		node(key, schema, mapInput, runtime) {
			if (!entry) entry = key;
			nodes[key] = { schema, mapInput, runtime };
			return builder as any;
		},

		edge(from, to, when?: any) {
			// if (!(from in nodes))
			// 	throw new Error(`Edge 'from' node "${from}" does not exist`);
			// if (!(to in nodes))
			// 	throw new Error(`Edge 'to' node "${to}" does not exist`);
			edges.push({ from, to, when });
			return builder;
		},

		build() {
			if (!entry) throw new Error("Graph must have an entry node");
			return {
				entry,
				nodes: nodes as any,
				edges: edges as any,
			};
		},
	};

	return builder;
}

export const runGraph = withResponse(
	async <Nodes extends Record<string, GraphNode<any>>, Init>(
		graph: SchemaGraph<Nodes, Init>,
		initArgs: Init,
		opts?: GraphOpts,
	) => {
		// -----------------------------
		// CONTEXT
		// -----------------------------
		const ctx: RuntimeCtx<Nodes, Init> = {
			_init: initArgs,
			results: {} as RuntimeCtx<Nodes, Init>["results"],
			metrics: {},
			trace: [],
			pending: {},
		};

		const logger = opts?.log;

		// -----------------------------
		// POOL CONFIG
		// -----------------------------
		const defaultConcurrency = opts?.concurrency ?? 4;

		const poolConcurrency = new Map<string, number>();
		poolConcurrency.set("default", defaultConcurrency);

		for (const [pool, value] of Object.entries(opts?.pools ?? {})) {
			poolConcurrency.set(pool, value);
		}

		const poolQueues = new Map<string, (keyof Nodes)[]>();

		function ensurePool(pool: string) {
			if (!poolQueues.has(pool)) poolQueues.set(pool, []);
			if (!poolConcurrency.has(pool)) {
				poolConcurrency.set(pool, defaultConcurrency);
			}
		}

		function resolvePool(key: keyof Nodes): string {
			return graph.nodes[key].runtime?.pool ?? "default";
		}

		// -----------------------------
		// GRAPH INDEX
		// -----------------------------
		const nodeKeys = Object.keys(graph.nodes) as (keyof Nodes)[];

		const incoming = new Map<keyof Nodes, GraphEdge<keyof Nodes>[]>();
		const outgoing = new Map<keyof Nodes, GraphEdge<keyof Nodes>[]>();

		for (const k of nodeKeys) {
			incoming.set(k, []);
			outgoing.set(k, []);
		}

		for (const e of graph.edges) {
			incoming.get(e.to as keyof Nodes)!.push(e as any);
			outgoing.get(e.from as keyof Nodes)!.push(e as any);
		}

		// -----------------------------
		// REACHABILITY
		// -----------------------------
		const reachable = new Set<keyof Nodes>();

		const dfs = (node: keyof Nodes) => {
			if (reachable.has(node)) return;
			reachable.add(node);

			for (const edge of outgoing.get(node) ?? []) {
				dfs(edge.to as keyof Nodes);
			}
		};

		dfs(graph.entry as keyof Nodes);

		// -----------------------------
		// DEP COUNTERS
		// -----------------------------
		const remainingDeps = new Map<keyof Nodes, number>();

		for (const k of nodeKeys) {
			if (!reachable.has(k)) continue;

			const deps = incoming
				.get(k)!
				.filter((e) => reachable.has(e.from as keyof Nodes)).length;

			remainingDeps.set(k, deps);
		}

		// -----------------------------
		// READY QUEUE
		// -----------------------------
		for (const k of nodeKeys) {
			if (!reachable.has(k)) continue;
			const pool = resolvePool(k);
			ensurePool(pool);
			if (!poolQueues.get(pool)) poolQueues.set(pool, []);
		}

		function enqueueNode(key: keyof Nodes) {
			const pool = resolvePool(key);
			ensurePool(pool);
			poolQueues.get(pool)!.push(key);
		}

		for (const k of nodeKeys) {
			if (!reachable.has(k)) continue;
			if (remainingDeps.get(k) === 0) enqueueNode(k);
		}

		// -----------------------------
		// EXECUTION
		// -----------------------------
		let activeTasks = 0;
		let graphDone = false;

		const pendingTasks = new Set<Promise<any>>();

		function totalQueued() {
			let total = 0;
			for (const q of poolQueues.values()) total += q.length;
			return total;
		}

		function checkGraphDone() {
			if (totalQueued() === 0 && activeTasks === 0) {
				graphDone = true;
			}
		}

		async function executeNode(key: keyof Nodes) {
			activeTasks++;

			try {
				const node = graph.nodes[key];
				const runtime = node.runtime ?? {};

				const pool = resolvePool(key);

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

						logger?.("node_skip", String(key), {
							reason: "runtime.when === false",
						});

						return;
					}
				}

				const input = node.mapInput ? node.mapInput(ctx) : ctx._init;

				logger?.("node_start", String(key), {
					input,
					attempt: metric.attempts + 1,
					pool,
				});

				ctx.trace.push({
					type: "node_start",
					node: String(key),
					input,
					timestamp: Date.now(),
					pool,
				});

				const retryCount = runtime.retry ?? 0;

				for (let attempt = 0; attempt <= retryCount; attempt++) {
					metric.attempts++;

					try {
						const execPromise = node.schema(input);

						const res = runtime.timeoutMs
							? await Promise.race([
									execPromise,
									new Promise((_, rej) =>
										setTimeout(
											() => rej(new Error("Timeout")),
											runtime.timeoutMs,
										),
									),
								])
							: await execPromise;

						if (!res.ok) throw res;

						ctx.results[key] = res.data;

						metric.end = Date.now();
						metric.duration = metric.end - metric.start;
						metric.status = "success";

						ctx.trace.push({
							type: "node_success",
							node: String(key),
							output: res.data,
							timestamp: Date.now(),
							duration: metric.duration,
						});

						logger?.("node_success", String(key), {
							output: res.data,
							duration: metric.duration,
							attempts: metric.attempts,
						});

						// UNLOCK NEXT
						for (const edge of outgoing.get(key)!) {
							const next = edge.to as keyof Nodes;
							if (!reachable.has(next)) continue;
							if (edge.when && !edge.when(ctx)) continue;

							remainingDeps.set(next, remainingDeps.get(next)! - 1);
							if (remainingDeps.get(next) === 0) {
								enqueueNode(next);
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

							logger?.("node_fail", String(key), {
								error: err,
								attempts: metric.attempts,
							});

							throw err;
						}

						await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
					}
				}
			} finally {
				activeTasks--;
				checkGraphDone();
			}
		}

		// -----------------------------
		// WORKER POOL
		// -----------------------------
		async function poolWorker(pool: string) {
			const queue = poolQueues.get(pool)!;

			while (true) {
				const next = queue.shift();

				if (!next) {
					if (graphDone && pendingTasks.size === 0) return;
					await new Promise((r) => setTimeout(r, 10)); // tiny polling
					continue;
				}

				const node = graph.nodes[next];
				const runtime = node.runtime ?? {};

				const execPromise = executeNode(next);
				pendingTasks.add(execPromise);
				execPromise.finally(() => pendingTasks.delete(execPromise));

				if (!runtime.background) {
					await execPromise;
				}
			}
		}

		// -----------------------------
		// START WORKERS
		// -----------------------------
		const workerPromises: Promise<any>[] = [];

		for (const [pool, conc] of poolConcurrency) {
			ensurePool(pool);

			for (let i = 0; i < conc; i++) {
				workerPromises.push(poolWorker(pool));
			}
		}

		await Promise.all(workerPromises);
		await Promise.all(Array.from(pendingTasks));

		logger?.("graph_finish", "_graph", {
			metrics: ctx.metrics,
			input: ctx._init,
			output: ctx.results,
			traceLength: ctx.trace.length,
		});

		return ctx;
	},
);
