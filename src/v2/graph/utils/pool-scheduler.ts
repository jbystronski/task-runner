import { GraphNode } from "../types/index.js";

export function getNodePool(node: GraphNode<any>): string {
	return node?.runtime?.pool ?? "default";
}
