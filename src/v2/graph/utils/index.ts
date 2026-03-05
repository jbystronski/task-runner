export * from "./use-graph.js";
export * from "./runtime-logger.js";
export * from "./generate-flamegraph.js";
export * from "./graph-event-stream.js";

export const seq = <T extends string[]>(...goals: T) => [goals] as const;
export const par = <T extends string[]>(...goals: T) => goals;
