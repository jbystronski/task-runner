import { GraphEvent } from "../types/index.js";

export function generateFlamegraph(events: GraphEvent[]) {
	const acc: Record<string, { start: number; durations: number[] }> = {};

	for (const evt of events) {
		if (evt.type === "node_start") {
			acc[evt.node] = acc[evt.node] || { start: evt.timestamp, durations: [] };
		} else if (evt.type === "node_success") {
			const node = acc[evt.node];
			if (node) node.durations.push(evt.timestamp - node.start);
		}
	}

	return acc;
}
