import { GraphEvent } from "../types/index.js";

class GraphEventStream {
  private listeners: ((evt: GraphEvent) => void)[] = [];

  emit(evt: GraphEvent) {
    for (const l of this.listeners) l(evt);
  }

  subscribe(listener: (evt: GraphEvent) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

export const eventStream = new GraphEventStream();
