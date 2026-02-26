import { GraphLogger } from "../types/index.js";
import { eventStream } from "./graph-event-stream.js";

export const runtimeLogger: GraphLogger = (ev) => {
	eventStream.emit(ev);
};
