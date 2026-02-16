export type TraceEventType =
	| "start"
	| "success"
	| "fail"
	| "skipped"
	| "background";

export interface TraceEvent {
	task: string;
	type: TraceEventType;
	timestamp: number;
	meta?: any;
}

export interface ExecutionTrace {
	batches: string[][];
	events: TraceEvent[];
}

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
	parallel?: boolean;
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
	returnImmediately?: boolean;
};

export type TaskMap = Record<string, TaskDefinition<any, any, any>>;

// --- task results types ---
type SuccessData<T> = T extends { ok: true; data: infer D } ? D : never;

type TDResultData<TD extends TaskDefinition<any, any, any>> =
	TD extends TaskDefinition<infer F, any, any>
		? SuccessData<Awaited<ReturnType<F>>>
		: never;

export type TaskResultsData<T extends TaskMap, I> = { _init: I } & {
	[K in keyof T]: TDResultData<T[K]>;
};

// --- helper to create task definitions from functions ---
export type TasksFromFns<T extends Record<string, (...args: any) => any>> = {
	[K in keyof T]: TaskDefinition<T[K], any, any>;
};

// --- typed schema ---
export type TaskSchemaWithContracts<
	T extends TaskMap,
	I extends Record<string, any>,
	O,
> = {
	[K in keyof T]: T[K] extends TaskDefinition<infer F, any, any>
		? TaskDefinition<F, T, I>
		: never;
} & {
	_init?: I;
	_output: (
		results: TaskResultsData<T, I>,
		status?: Record<keyof T, TaskState>,
	) => O;
	_batches?: (keyof T)[][];
	_trace?: ExecutionTrace;
};
