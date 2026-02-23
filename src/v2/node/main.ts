import {
	TaskMap,
	TaskDefinition,
	TaskResultsData,
	TaskState,
	TaskNodeWithContracts,
} from "./types.js";

export function defineNode<T extends TaskMap, I extends Record<string, any>, O>(
	node: {
		[K in keyof T]: T[K] extends TaskDefinition<infer F, any, any>
			? TaskDefinition<F, T, I>
			: never;
	} & {
		_output: (
			results: TaskResultsData<T, I>,
			status?: Record<keyof T, TaskState>,
		) => O;
	},
): TaskNodeWithContracts<T, I, O> {
	preflightCheck(node);
	return node as any;
}

// --- preflight check & circular detection ---
function preflightCheck<T extends TaskMap>(node: T | (T & { _output?: any })) {
	const keys = new Set<string>();
	for (const key in node) {
		if (key === "_output" || key === "_init") continue;
		if (keys.has(key)) throw new Error(`Duplicate task key: ${key}`);
		keys.add(key);

		const task = (node as T)[key];
		if (!task) continue;
		if (task.abort === undefined) task.abort = true;
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
		const task = (node as T)[taskKey];
		for (const dep of task?.dependencies ?? []) {
			if (!(dep in node))
				throw new Error(
					`Task "${taskKey}" depends on unknown "${String(dep)}"`,
				);
			visit(String(dep));
		}
		stack.delete(taskKey);
		visited.add(taskKey);
	};

	for (const key of Object.keys(node)) visit(key);
}

function buildTopologicalBatches<T extends TaskMap>(
	node: T,
	keys: (keyof T)[],
): (keyof T)[][] {
	const remaining = new Set<keyof T>(keys);
	const resolved = new Set<keyof T>();
	const batches: (keyof T)[][] = [];

	while (remaining.size > 0) {
		const batch: (keyof T)[] = [];

		for (const key of remaining) {
			const deps = node[key]?.dependencies ?? [];

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

export const execNode = async <
	T extends TaskMap,
	I extends Record<string, any> | undefined,
	O,
>(
	node: TaskNodeWithContracts<T, I, O>,
	initArgs: I,
) => {
	const results = { _init: initArgs } as any;
	const status = {} as Record<keyof T, TaskState>;

	const taskKeys = Object.keys(node).filter(
		(k) => k !== "_output",
	) as (keyof T)[];

	for (const k of taskKeys) status[k] = "pending";

	const batches = buildTopologicalBatches(node as any, taskKeys);

	for (const batch of batches) {
		for (const key of batch) {
			const task = node[key];

			const deps = task.dependencies ?? [];

			if (!deps.every((d) => status[d] === "success")) continue;

			try {
				const args = task.argMap?.(results) ?? initArgs;

				// Just call the function - it either returns data or throws
				const raw = await task.fn(args);

				// No ok check - if we get here, it succeeded
				status[key] = "success";
				results[key] = raw; // Store the raw return value
			} catch (err) {
				status[key] = "failed";
				if (task.abort !== false) throw err;
				// If abort is false, continue to next task
			}
		}
	}

	return {
		_output: node._output(results, status),
		_status: status,
		_results: results,
	};
};
