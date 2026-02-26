import { GraphNode } from "../types/index.js";

export function getNodePool(node: GraphNode<any, any, any, any>): string {
	return node?.runtime?.pool ?? "default";
}
