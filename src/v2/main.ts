import { TResponse, withResponse } from "@pogodisco/response";
import {
	TaskMap,
	TaskDefinition,
	TaskResultsData,
	TaskState,
	TaskSchemaWithContracts,
	SchemaOptions,
	ExecutionTrace,
	TraceEventType,
} from "./types/index.js";

// --- defineSchema ---
// export function defineSchema<
// 	T extends TaskMap,
// 	I extends Record<string, any>,
// 	O,
// >(
// 	schema: {
// 		[K in keyof T]: T[K] extends TaskDefinition<infer F, any, any>;
// 	} & {
// 		_output: (
// 			results: TaskResultsData<T, I>,
// 			status?: Record<keyof T, TaskState>,
// 		) => O;
// 	},
// ): TaskSchemaWithContracts<T, I, O> {
// 	preflightCheck(schema);
// 	return schema as any;
// }

export function defineSchema<
	T extends TaskMap,
	I extends Record<string, any>,
	O,
>(
	schema: {
		[K in keyof T]: T[K] extends TaskDefinition<infer F, any, any>
			? TaskDefinition<F, T, I>
			: never;
	} & {
		_output: (
			results: TaskResultsData<T, I>,
			status?: Record<keyof T, TaskState>,
		) => O;
	},
): TaskSchemaWithContracts<T, I, O> {
	preflightCheck(schema);
	return schema as any;
}

// --- preflight check & circular detection ---
function preflightCheck<T extends TaskMap>(
	schema: T | (T & { _output?: any }),
) {
	const keys = new Set<string>();
	for (const key in schema) {
		if (key === "_output" || key === "_init") continue;
		if (keys.has(key)) throw new Error(`Duplicate task key: ${key}`);
		keys.add(key);

		const task = (schema as T)[key];
		if (!task) continue;
		if (task.abort === undefined) task.abort = true;
		if (task.bg === undefined) task.bg = false;
		if (task.runIf === undefined) task.runIf = [];
	}

	const visited = new Set<string>();
	const stack = new Set<string>();

	const visit = (taskKey: string) => {
		if (taskKey === "_output" || taskKey === "_init") return;
		if (stack.has(taskKey))
			throw new Error(
				`Circular dependency: ${[...stack, taskKey].join(" -> ")}`,
			);
		if (visited.has(taskKey)) return;

		stack.add(taskKey);
		const task = (schema as T)[taskKey];
		for (const dep of task?.dependencies ?? []) {
			if (!(dep in schema))
				throw new Error(`Task "${taskKey}" depends on unknown "${dep}"`);
			visit(dep);
		}
		stack.delete(taskKey);
		visited.add(taskKey);
	};

	for (const key of Object.keys(schema)) visit(key);
}

// --- mark dependents skipped ---
function markDependentsSkipped<T extends TaskMap>(
	schema: T,
	status: Record<keyof T, TaskState>,
	key: keyof T,
) {
	for (const k of Object.keys(schema) as (keyof T)[]) {
		const task = schema[k];
		if (
			(task.dependencies ?? []).includes(key as string) &&
			status[k] === "pending"
		) {
			status[k] = "skipped";
			markDependentsSkipped(schema, status, k);
		}
	}
}

function buildTopologicalBatches<T extends TaskMap>(
	schema: T,
	keys: (keyof T)[],
): (keyof T)[][] {
	const remaining = new Set<keyof T>(keys);
	const resolved = new Set<keyof T>();
	const batches: (keyof T)[][] = [];

	while (remaining.size > 0) {
		const batch: (keyof T)[] = [];

		for (const key of remaining) {
			const deps = schema[key]?.dependencies ?? [];

			if (deps.every((d) => resolved.has(d as keyof T))) {
				batch.push(key);
			}
		}

		if (batch.length === 0) {
			throw new Error(
				"Unable to build execution batches (circular or unresolved deps)",
			);
		}

		for (const key of batch) {
			remaining.delete(key);
			resolved.add(key);
		}

		batches.push(batch);
	}

	return batches;
}
export const runSchema = withResponse(
	async <T extends TaskMap, I extends Record<string, any>, O>(
		schema: TaskSchemaWithContracts<T, I, O>,
		initArgs: I,
		options?: SchemaOptions,
	): Promise<{
		_output: O;
		_status: Record<keyof T, TaskState>;
		_batches: (keyof T)[][];
		_trace: ExecutionTrace;
	}> => {
		const logger = options?.log;
		const parallel = options?.parallel ?? false;

		function isTResponse(x: any): x is TResponse<any> {
			return x && typeof x === "object" && "ok" in x;
		}
		const normalizeTaskResult = (result: any) => {
			if (isTResponse(result)) {
				if (result.ok) return { ok: true, data: result.data };
				return { ok: false, error: result };
			}

			// raw return = success
			return { ok: true, data: result };
		};

		// --- result normalization ---

		// --- control flags ---
		let abortExecution = false;
		let earlyOutput: O | null = null;

		// --- extend schema with _init ---
		const localSchema = {
			...schema,
			_init: { fn: (x: I) => x, argMap: () => initArgs },
		} as unknown as T & { _init: TaskDefinition<(x: I) => I, T, I> };

		const taskKeys = Object.keys(localSchema).filter(
			(k) => k !== "_output" && k !== "_init",
		) as (keyof typeof localSchema)[];

		// add to topological batching
		const batches = buildTopologicalBatches(localSchema, taskKeys);
		const trace: ExecutionTrace = {
			batches: batches.map((b) => b.map(String)),
			events: [],
		};

		const pushTrace = (
			task: keyof typeof localSchema,
			type: TraceEventType,
			meta?: any,
		) => {
			trace.events.push({
				task: String(task),
				type,
				timestamp: Date.now(),
				meta,
			});
		};

		// const results: Partial<TaskResultsData<T, I>> & { _init: I } = {
		// 	_init: initArgs,
		// }

		const results = {
			_init: initArgs,
		} as Partial<TaskResultsData<T, I>> & { _init: I };

		const status: Record<keyof typeof localSchema, TaskState> = {} as any;
		for (const key of taskKeys) status[key] = "pending";

		// --- task runner ---
		const runTask = async (key: keyof typeof localSchema) => {
			if (abortExecution || earlyOutput) return;

			const task = localSchema[key];
			if (status[key] !== "pending") return;

			// --- dependency check ---
			const deps = task.dependencies ?? [];
			if (
				!deps.every((d) => status[d as keyof typeof localSchema] === "success")
			) {
				return;
			}

			// --- runIf ---
			if (task.runIf?.length) {
				const runIfResults = await Promise.all(
					task.runIf.map((fn) => fn(results as TaskResultsData<T, I>)),
				);

				if (!runIfResults.every(Boolean)) {
					status[key] = "skipped";
					markDependentsSkipped(localSchema, status, key);

					logger?.("skipped", String(key), {
						reason: "runIf",
						results: runIfResults,
					});

					pushTrace(key, "skipped", { reason: "runIf", results: runIfResults });
					return;
				}
			}

			const args = task.argMap?.(results as TaskResultsData<T, I>);

			// --- background task ---
			if (task.bg) {
				logger?.("background", String(key), args);
				pushTrace(key, "background", { args });

				Promise.resolve().then(async () => {
					try {
						const raw =
							args !== undefined ? await task.fn(args) : await task.fn();

						const normalized = normalizeTaskResult(raw);

						if (!normalized.ok) {
							logger?.("fail", String(key), normalized.error);

							pushTrace(key, "fail", { error: normalized.error });
						} else {
							logger?.("success", String(key), normalized.data);
							pushTrace(key, "success", { result: normalized.data });
						}
					} catch (err) {
						logger?.("fail", String(key), err);
						pushTrace(key, "fail", { error: err });
					}
				});

				status[key] = "success";
				(results as any)[key] = undefined;
				return;
			}

			// --- normal task ---
			logger?.("start", String(key), args);
			pushTrace(key, "start", { args });

			try {
				const raw = args !== undefined ? await task.fn(args) : await task.fn();

				const normalized = normalizeTaskResult(raw);

				if (!normalized.ok) {
					status[key] = "failed";
					logger?.("fail", String(key), normalized.error);
					pushTrace(key, "fail", { error: normalized.error });
					if (task.abort) {
						abortExecution = true;
						markDependentsSkipped(localSchema, status, key);
					}
					return;
				}

				status[key] = "success";
				(results as any)[key] = normalized.data;

				logger?.("success", String(key), normalized.data);
				pushTrace(key, "success", { result: normalized.data });

				// --- early return ---
				if (task.returnImmediately) {
					earlyOutput = schema._output(
						results as TaskResultsData<T, I>,
						status,
					);

					logger?.("finish", "_schema (early)", {
						results,
						status,
						output: earlyOutput,
					});
				}
			} catch (err) {
				status[key] = "failed";
				logger?.("fail", String(key), err);
				pushTrace(key, "fail", { error: err });
				if (task.abort) {
					abortExecution = true;
					markDependentsSkipped(localSchema, status, key);
				}
			}
		};

		for (const batch of batches) {
			if (abortExecution || earlyOutput) break;

			if (parallel) {
				await Promise.all(batch.map((k) => runTask(k)));
			} else {
				for (const k of batch) {
					await runTask(k);
					if (abortExecution || earlyOutput) break;
				}
			}
		}

		// --- early return output ---
		if (earlyOutput) {
			return {
				_output: earlyOutput,
				_status: status as Record<keyof T, TaskState>,
				_batches: batches,
				_trace: trace,
			};
		}

		// --- abort ---
		if (abortExecution) {
			throw new Error("Schema aborted due to task failure");
		}

		// --- unresolved tasks ---
		const pendingKeys = taskKeys.filter((k) => status[k] === "pending");
		if (pendingKeys.length) {
			throw new Error(
				`Unresolved tasks (possible circular deps): ${pendingKeys.join(", ")}`,
			);
		}

		// --- normal finish ---
		const output = schema._output(results as TaskResultsData<T, I>, status);

		logger?.("finish", "_schema", { results, status, output });

		return {
			_output: output,
			_status: status as Record<keyof T, TaskState>,
			_batches: batches,
			_trace: trace,
		};
	},
);
