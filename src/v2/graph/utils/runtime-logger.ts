import { GraphLogger } from "../types/index.js";
import { eventStream } from "./graph-event-stream.js";

function setIfPresent<T>(key: string, value: T | null | undefined) {
	return value == null ? {} : { [key]: value };
}

export const runtimeLogger: GraphLogger = (ev) => {
	eventStream.emit(ev);
	// const timestamp = Date.now();
	//
	// const event = ev as any;
	//
	// eventStream.emit({
	// 	type: event.type,
	// 	...setIfPresent("node", event?.node),
	// 	...setIfPresent("entry", event?.entry),
	// 	...setIfPresent("nodes", event?.nodes),
	// 	...setIfPresent("edges", event?.edges),
	// 	...setIfPresent("from", event?.from),
	// 	...setIfPresent("to", event?.to),
	// 	...setIfPresent("goals", event?.goals),
	// 	...setIfPresent("input", event?.input),
	// 	...setIfPresent("output", event?.output),
	// 	...setIfPresent("state", event?.state),
	// 	...setIfPresent("traceLength", event?.traceLength),
	// 	...setIfPresent("error", event?.error),
	// 	...setIfPresent("duration", event?.duration),
	// 	...setIfPresent("reason", event?.reason),
	// 	...setIfPresent("pool", event?.pool),
	// 	...setIfPresent("attempts", event?.attempts),
	// 	...setIfPresent("metrics", event?.metrics),
	//
	// 	timestamp,
	// } as any);
};
