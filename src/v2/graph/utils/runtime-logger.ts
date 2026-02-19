import { GraphLogger } from "../types/index.js";
import { eventStream } from "./graph-event-stream.js";

function setIfPresent<T>(key: string, value: T | null | undefined) {
	return value == null ? {} : { [key]: value };
}

export const runtimeLogger: GraphLogger = (event, node, meta) => {
	const timestamp = Date.now();

	eventStream.emit({
		type: event as any,
		node,
		...setIfPresent("input", meta?.input),
		...setIfPresent("output", meta?.output),
		...setIfPresent("error", meta?.error),
		...setIfPresent("duration", meta?.duration),
		...setIfPresent("reason", meta?.reason),
		...setIfPresent("metrics", meta?.metrics),
		...setIfPresent("pool", meta?.pool),
		timestamp,
	} as any);
};
