import { SchemaGraph } from "../../types/index.js";
import { ValidateGraph } from "./index.js";

// types/type-validation.ts
export type AssertValidGraph<G extends SchemaGraph<any, any>> =
	ValidateGraph<G> extends infer R
		? R extends { __error: any }
			? never
			: G
		: G;

// Usage in tests or as a helper
export function validateGraphType<G extends SchemaGraph<any, any>>(
	graph: G & AssertValidGraph<G>,
): G {
	return graph;
}
