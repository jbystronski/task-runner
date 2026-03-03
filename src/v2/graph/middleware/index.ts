import {
  ExecutionRuntime,
  GraphMiddleware,
  SchemaGraph,
} from "../types/index.js";
import { eventStream } from "../utils/graph-event-stream.js";

export function composeMiddleware<State>(
  middleware: GraphMiddleware<State>[],
  ctx: {
    node: string;
    graph: SchemaGraph<any, State>;
    state: State;
    runtime: ExecutionRuntime<State>;
  },
  core: () => Promise<any>,
) {
  let index = -1;

  async function dispatch(i: number): Promise<any> {
    if (i <= index) throw new Error("next() called mutliple times");
    index = i;
    const fn = middleware[i];
    if (!fn) return core();
    return fn(ctx, () => dispatch(i + 1));
  }
  return () => dispatch(0);
}

export function useMetrics(): GraphMiddleware<any> {
  return async (ctx, next) => {
    const metrics = (ctx.runtime.context.metrics ??= {} as Record<string, any>);

    const start = Date.now();

    try {
      const res = await next();
      metrics[ctx.node] = {
        status: "success",
        duration: Date.now() - start,
      };
      return res;
    } catch (err) {
      metrics[ctx.node] = {
        status: "fail",
        duration: Date.now() - start,
      };
      throw err;
    }
  };
}

export function useLog(): GraphMiddleware<any> {
  return async (ctx, next) => {
    const frames = ctx.runtime.context.frames!;
    const frame = frames[ctx.node];

    eventStream.emit({
      type: "node_start",
      node: ctx.node,
      timestamp: frame.start,
      input: frame.input,
    });

    try {
      const res = await next();

      eventStream.emit({
        type: "node_success",
        node: ctx.node,
        output: frame.output,
        duration: frame.end! - frame.start,
        attempts: frame.attempts,
        timestamp: Date.now(),
      });

      return res;
    } catch (err) {
      eventStream.emit({
        type: "node_fail",
        node: ctx.node,
        error: frame.error,
        timestamp: Date.now(),
        attempts: frame.attempts,
      });

      throw err;
    }
  };
}

export function useRetry<State>(
  attempts: number,
  delayMs = 0,
): GraphMiddleware<State> {
  return async (ctx, next) => {
    let lastError;

    for (let i = 0; i < attempts; i++) {
      try {
        return await next();
      } catch (err) {
        lastError = err;
        if (i < attempts - 1 && delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    throw lastError;
  };
}

export function useTimeout<State>(ms: number): GraphMiddleware<State> {
  return async (ctx, next) => {
    return await Promise.race([
      next(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Node timeout")), ms),
      ),
    ]);
  };
}
