import { GraphEvent } from "../types/index.js";

// export function generateFlamegraph(events: GraphEvent[]) {
// 	return events
// 		.filter((e) => e.type === "node_start" || e.type === "node_success")
// 		.reduce(
// 			(acc, evt) => {
// 				if (evt.type === "node_start") {
// 					acc[evt.node] = acc[evt.node] || {
// 						start: evt.timestamp,
// 						durations: [],
// 					};
// 				} else if (evt.type === "node_success") {
// 					if (acc[evt.node]) {
// 						const duration = evt.timestamp - acc[evt.node].start;
// 						acc[evt.node].durations.push(duration);
// 					}
// 				}
// 				return acc;
// 			},
// 			{} as Record<string, { start: number; durations: number[] }>,
// 		);
// }

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
