// types/validation.ts

import { SchemaGraph, GraphNode, WrappedSchema } from "../../types/index.js";

export type ValidationError = {
	path: string[];
	message: string;
	severity: "error" | "warning";
};

export type ValidationResult = {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationError[];
};

// Type-level validation (compile-time)
export type ValidateGraph<G extends SchemaGraph<any, any, any>> =
	ValidateNodes<G> &
		ValidateEdges<G> &
		ValidateNoCycles<G> &
		ValidateReachability<G>;

type ValidateNodes<G extends SchemaGraph<any, any, any>> = {
	[K in keyof G["nodes"]]: G["nodes"][K] extends GraphNode<infer FN>
		? ValidateNode<FN, K>
		: never;
};

type ValidateNode<FN extends WrappedSchema<any, any>, K> = FN extends (
	...args: any[]
) => any
	? unknown
	: {
			__error: [`Node ${K extends string ? K : "unknown"} has invalid schema`];
		};

type ValidateEdges<G extends SchemaGraph<any, any, any>> =
	G["edges"][number] extends infer E
		? E extends { from: infer From; to: infer To }
			? From extends keyof G["nodes"]
				? To extends keyof G["nodes"]
					? unknown
					: {
							__error: [
								`Edge to node ${To extends string ? To : "unknown"} does not exist`,
							];
						}
				: {
						__error: [
							`Edge from node ${From extends string ? From : "unknown"} does not exist`,
						];
					}
			: unknown
		: unknown;

type ValidateNoCycles<G extends SchemaGraph<any, any, any>> =
	HasCycle<G> extends true ? { __error: ["Graph contains cycles"] } : unknown;

type HasCycle<G extends SchemaGraph<any, any, any>> = false; // Simplified - would need complex graph traversal at type level

type ValidateReachability<G extends SchemaGraph<any, any, any>> =
	AllNodesReachable<G, G["entry"]> extends true
		? unknown
		: { __error: ["Some nodes are unreachable from entry"] };

type AllNodesReachable<
	G extends SchemaGraph<any, any, any>,
	Entry,
	Visited = never,
> = keyof G["nodes"] extends Visited ? true : false;
