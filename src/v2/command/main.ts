import type { TResponse } from "@pogodisco/response";

// -----------------------------
// Input/Output helpers
// -----------------------------
export type CommandInputFor<
	R extends Record<string, any>,
	K extends keyof R,
> = R[K] extends (args: infer I) => any ? I : never;

export type CommandOutputFor<
	R extends Record<string, any>,
	K extends keyof R,
> = R[K] extends (args: any) => Promise<TResponse<infer O>> ? O : never;

// -----------------------------
// Registrar creator
// -----------------------------
export function createCommandRegistrar<
	R extends Record<string, (...args: any) => Promise<TResponse<any>>>,
>(registry: R) {
	return async function appCommand<K extends keyof R & string>(
		name: K,
		params: CommandInputFor<R, K>,
	): Promise<TResponse<CommandOutputFor<R, K>>> {
		const fn = registry[name];
		return await fn(params);
	};
}
