import {
	isFailure,
	isSuccess,
	withResponse,
	type TResponse,
	type SuccessResponse,
	type FailureResponse,
} from "@repo/tresponse";

// --- logging / options ---
export type LogEvent =
	| "start"
	| "finish"
	| "data"
	| "deferred"
	| "skipped"
	| "background"
	| "parallel"
	| "success"
	| "fail";

export type TaskLogger = (event: LogEvent, key: string, meta?: any) => void;

export interface SchemaOptions {
	log?: TaskLogger;
}

// --- core types ---
export type TaskState = "pending" | "skipped" | "failed" | "success";

// --- task definition ---
export type TaskDefinition<
	F extends (...args: any) => any,
	T extends TaskMap,
	I extends Record<string, any>,
> = {
	fn: F;
	dependencies?: string[];
	abort?: boolean;
	bg?: boolean;
	runIf?: ((results: TaskResultsData<T, I>) => boolean | Promise<boolean>)[];
	argMap?: (results: TaskResultsData<T, I>) => Parameters<F>[0];
};

export type TaskMap = Record<string, TaskDefinition<any, any, any>>;

type TaskFnResult<TD extends TaskDefinition<any, any, any>> = Awaited<
	ReturnType<TD["fn"]>
>;

type SuccessData<T> = T extends { ok: true; data: infer D } ? D : never;

// --- **results only store unwrapped success data** ---
// export type TaskResultsData<T extends TaskMap, I> = { _init: I } & {
//   [K in keyof T]: TDResultData<T[K]>;
// };

export type TaskResultsData<T extends TaskMap, I> = { _init: I } & {
	[K in keyof T]: TDResultData<T[K]>;
};

type TDResultData<TD extends TaskDefinition<any, any, any>> =
	TD extends TaskDefinition<infer F, any, any>
		? SuccessData<Awaited<ReturnType<F>>>
		: never;

type ReturnTypeSuccessData<F extends (...args: any) => any> = Awaited<
	ReturnType<F>
> extends SuccessResponse<infer D>
	? D
	: never;

// --- helper to create task definitions from functions ---
export type TasksFromFns<T extends Record<string, (...args: any) => any>> = {
	[K in keyof T]: TaskDefinition<T[K], any, any>;
};

// --- typed schema ---
export type TaskSchemaWithContracts<T extends TaskMap, I, O> = {
	[K in keyof T]: T[K] extends TaskDefinition<infer F, any, any>
		? TaskDefinition<F, T, I>
		: never;
} & {
	_init?: I;
	_output: (results: TaskResultsData<T, I>) => O;
};

// --- defineSchema ---
export function defineSchema<T extends TaskMap, I, O>(
	schema: {
		[K in keyof T]: T[K] extends TaskDefinition<infer F, any, any>
			? TaskDefinition<F, T, I>
			: never;
	} & { _output: (results: TaskResultsData<T, I>) => O },
): TaskSchemaWithContracts<T, I, O> {
	preflightCheck(schema);
	return schema as any;
}

// --- preflight check ---
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
		const deps = task?.dependencies ?? [];
		for (const dep of deps) {
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

// --- runSchema, storing **only success data** ---
export const runSchema = withResponse(
	async <T extends TaskMap, I, O>(
		schema: TaskSchemaWithContracts<T, I, O>,
		initArgs: I,
		options?: SchemaOptions,
	): Promise<{ _output: O; _status: Record<keyof T, TaskState> }> => {
		try {
			const logger: TaskLogger | undefined = options?.log;

			const localSchema = {
				...schema,
				_init: { fn: (x: I) => x, argMap: () => initArgs },
			} as unknown as T & { _init: TaskDefinition<(x: I) => I, T, I> };

			const taskKeys = Object.keys(localSchema).filter(
				(k) => k !== "_output" && k !== "_init",
			) as (keyof typeof localSchema)[];

			const results: Partial<TaskResultsData<T, I>> = {
				_init: initArgs,
			} as any;

			const status: { [K in keyof typeof localSchema]?: TaskState } = {};
			for (const key of taskKeys) status[key] = "pending";

			let progress = true;
			let safety = 0;
			const maxIterations = taskKeys.length * 2;

			while (progress && safety < maxIterations) {
				progress = false;
				safety++;

				for (const key of taskKeys) {
					const task = localSchema[key];
					if (status[key] !== "pending") continue;

					const deps = task.dependencies ?? [];
					if (
						!deps.every(
							(d) => status[d as keyof typeof localSchema] === "success",
						)
					)
						continue;

					if (task.runIf?.length) {
						const runIfResults = await Promise.all(
							task.runIf.map((fn) => fn(results as TaskResultsData<T, I>)),
						);
						if (!runIfResults.every(Boolean)) {
							status[key] = "skipped";
							logger?.("skipped", String(key), {
								reason: "runIf",
								results: runIfResults,
							});
							markDependentsSkipped(localSchema, status as any, key as any);
							continue;
						}
					}

					const args = task.argMap?.(results as TaskResultsData<T, I>);

					if (task.bg) {
						logger?.("background", String(key), args);
						Promise.resolve().then(async () => {
							try {
								await (args !== undefined ? task.fn(args) : task.fn());
								logger?.("success", String(key));
							} catch (err) {
								logger?.("fail", String(key), err);
							}
						});
						status[key] = "success";
						(results as any)[key] = undefined;
						progress = true;
						continue;
					}

					logger?.("start", String(key), args);

					try {
						const result =
							args !== undefined ? await task.fn(args) : await task.fn();

						if (isFailure(result)) {
							status[key] = "failed";
							logger?.("fail", String(key), result);
							if (task.abort) throw result;
						} else if (isSuccess(result)) {
							status[key] = "success";
							(results as any)[key] = result.data; // ✅ unwrap data automatically
							logger?.("success", String(key), result);
						}
					} catch (err) {
						status[key] = "failed";
						logger?.("fail", String(key), err);
						if (task.abort) throw err;
					}

					progress = true;
				}
			}

			const pendingKeys = taskKeys.filter(
				(k) => status[k as keyof typeof status] === "pending",
			);
			if (pendingKeys.length)
				throw new Error(
					`Unresolved tasks (possible circular deps): ${pendingKeys.join(", ")}`,
				);

			const output = schema._output(results as TaskResultsData<T, I>);
			logger?.("finish", "_schema", { results, status, output });

			return { _output: output, _status: status as Record<keyof T, TaskState> };
		} catch (err) {
			console.error("🔥 runSchema crashed before finish:", err);
			throw err;
		}
	},
);

/// utility fn wrapper around runSchema
//
//
