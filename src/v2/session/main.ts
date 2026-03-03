import { GraphNode, GraphRunOptions, SchemaGraph } from "../graph/index.js";
import { executeWithPlanner } from "../planner/main.js";
import { GraphListener } from "./types.js";

export class GraphSession<
  Nodes extends Record<string, GraphNode<any, State>>,
  State,
> {
  private state: State;
  private running = false;
  private queue: Array<{ partial: Partial<State>; goals: (keyof Nodes)[] }> =
    [];
  private listeners: (() => void)[] = [];

  constructor(
    private graph: SchemaGraph<Nodes, State>,
    initialState: State,
    private opts?: GraphRunOptions,
  ) {
    this.state = initialState;
  }

  listen(listener: GraphListener<Nodes, State>) {
    const cleanup = listener.start((partial) => {
      this.dispatch(partial, listener.goals as (keyof Nodes)[]);
    });

    this.listeners.push(cleanup);
  }

  async dispatch(partial: Partial<State>, goals: (keyof Nodes)[]) {
    this.queue.push({ partial, goals });
    if (!this.running) {
      await this.processQueue();
    }
  }

  private async processQueue() {
    this.running = true;

    while (this.queue.length) {
      const { partial, goals } = this.queue.shift()!;

      // Merge event into persistent state
      Object.assign(this.state as any, partial);

      const result = await executeWithPlanner(
        this.graph,
        this.state,
        goals,
        this.opts,
      );

      // Persist new state from execution
      Object.assign(this.state as any, result.state);
    }

    this.running = false;
  }

  destroy() {
    for (const stop of this.listeners) stop();
  }

  getState() {
    return this.state;
  }
}
