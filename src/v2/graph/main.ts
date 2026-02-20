import { withResponse } from "@pogodisco/response";
import {
	GraphBuilder,
	GraphEdge,
	GraphLogger,
	GraphNode,
	GraphOpts,
	NodeMetric,
	PoolStats,
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
	const edges: GraphEdge<keyof any>[] = [];
	let entry: string | undefined;

	const builder: GraphBuilder<any, Init> = {
		node(key, schema, mapInput, runtime) {
			if (!entry) entry = key;
			nodes[key] = { schema, mapInput, runtime };
			return builder as any;
		},

		edge(from, to, when?: any) {
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
		const poolStats = new Map<string, PoolStats>();

		function ensurePoolStats(pool: string) {
			if (!poolStats.has(pool)) {
				poolStats.set(pool, {
					queueDepth: 0,
					activeWorkers: 0,
					completed: 0,
					failed: 0,
					avgDurationMs: 0,
					lastDurationMs: 0,
					maxQueue: 1000,
				});
			}
		}

		function ensurePool(pool: string) {
			if (!poolQueues.has(pool)) poolQueues.set(pool, []);
			if (!poolConcurrency.has(pool)) {
				poolConcurrency.set(pool, defaultConcurrency);
			}
			ensurePoolStats(pool);
		}

		function resolvePool(key: keyof Nodes): string {
			return graph.nodes[key].runtime?.pool ?? "default";
		}

		function canSchedule(pool: string) {
			const stats = poolStats.get(pool)!;
			if (!stats.maxQueue) return true;
			return stats.queueDepth < stats.maxQueue;
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
		// READY QUEUES
		// -----------------------------
		function enqueueNode(key: keyof Nodes) {
			const pool = resolvePool(key);
			ensurePool(pool);

			if (!canSchedule(pool)) {
				logger?.("pool_backpressure" as any, pool, poolStats.get(pool));
				return;
			}

			poolQueues.get(pool)!.push(key);
			poolStats.get(pool)!.queueDepth++;
		}

		for (const k of nodeKeys) {
			if (!reachable.has(k)) continue;
			ensurePool(resolvePool(k));
		}

		for (const k of nodeKeys) {
			if (!reachable.has(k)) continue;
			if (remainingDeps.get(k) === 0) enqueueNode(k);
		}

		// -----------------------------
		// EXECUTION STATE
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

		// -----------------------------
		// EXECUTE NODE (Telemetry Correct)
		// -----------------------------
		async function executeNode(key: keyof Nodes) {
			const pool = resolvePool(key);
			ensurePool(pool);

			const stats = poolStats.get(pool)!;

			activeTasks++;
			stats.activeWorkers++;

			try {
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
						return;
					}
				}

				const input = node.mapInput ? node.mapInput(ctx) : ctx._init;

				logger?.("node_start", String(key), {
					input,
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

						stats.completed++;
						stats.lastDurationMs = metric.duration ?? 0;

						stats.avgDurationMs =
							stats.avgDurationMs === 0
								? stats.lastDurationMs
								: stats.avgDurationMs * 0.8 + stats.lastDurationMs * 0.2;

						for (const edge of outgoing.get(key)!) {
							const next = edge.to as keyof Nodes;
							if (!reachable.has(next)) continue;
							if (edge.when && !edge.when(ctx)) continue;

							remainingDeps.set(next, remainingDeps.get(next)! - 1);
							if (remainingDeps.get(next) === 0) enqueueNode(next);
						}

						return;
					} catch (err) {
						if (attempt >= retryCount) {
							metric.status = "fail";
							stats.failed++;
							throw err;
						}
						await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
					}
				}
			} finally {
				stats.activeWorkers--;
				activeTasks--;
				checkGraphDone();
			}
		}

		// -----------------------------
		// WORKERS
		// -----------------------------
		async function poolWorker(pool: string) {
			const queue = poolQueues.get(pool)!;

			while (true) {
				const next = queue.shift();

				if (next) {
					poolStats.get(pool)!.queueDepth = Math.max(
						0,
						poolStats.get(pool)!.queueDepth - 1,
					);
				}

				if (!next) {
					if (graphDone && pendingTasks.size === 0) return;
					await new Promise((r) => setTimeout(r, 10));
					continue;
				}

				const execPromise = executeNode(next);
				pendingTasks.add(execPromise);
				execPromise.finally(() => pendingTasks.delete(execPromise));

				const runtime = graph.nodes[next].runtime ?? {};
				if (!runtime.background) await execPromise;
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
			pools: Object.fromEntries(poolStats),
			output: ctx.results,
		});

		return ctx;
	},
);
