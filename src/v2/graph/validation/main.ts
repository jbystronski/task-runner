import {
	GraphNode,
	SchemaGraph,
	NodeRuntimeConfig,
	GraphEdge,
} from "../types/index.js";
import { ValidationError, ValidationResult } from "./types/index.js";

export class GraphValidator {
	private errors: ValidationError[] = [];
	private warnings: ValidationError[] = [];

	validate<
		Nodes extends Record<string, GraphNode<any, any, any, State>>,
		State,
	>(
		graph: SchemaGraph<Nodes, State>, // Add State generic
	): ValidationResult {
		this.errors = [];
		this.warnings = [];

		this.validateEntry(graph);
		this.validateNodes(graph);
		this.validateEdges(graph);
		this.validateDependencies(graph);
		this.validateCycles(graph);
		this.validateReachability(graph);

		return {
			valid: this.errors.length === 0,
			errors: [...this.errors],
			warnings: [...this.warnings],
		};
	}

	private validateEntry<
		Nodes extends Record<string, GraphNode<any, any, any, State>>,
		State,
	>(graph: SchemaGraph<Nodes, State>) {
		if (!graph.entry) {
			this.errors.push({
				path: ["graph"],
				message: "Graph must have an entry node",
				severity: "error",
			});
			return;
		}

		if (!(graph.entry in graph.nodes)) {
			this.errors.push({
				path: ["entry"],
				message: `Entry node "${String(graph.entry)}" does not exist in nodes`,
				severity: "error",
			});
		}
	}

	private validateNodes<
		Nodes extends Record<string, GraphNode<any, any, any, State>>,
		State,
	>(graph: SchemaGraph<Nodes, State>) {
		for (const [key, node] of Object.entries(graph.nodes)) {
			this.validateNode(key, node);
		}
	}

	private validateNode(key: string, node: GraphNode<any, any, any, any>) {
		if (!node.schema) {
			this.errors.push({
				path: ["nodes", key],
				message: `Node "${key}" has no schema`,
				severity: "error",
			});
		}

		if (typeof node.schema !== "function") {
			this.errors.push({
				path: ["nodes", key, "schema"],
				message: `Node "${key}" schema must be a function`,
				severity: "error",
			});
		}

		if (node.runtime) {
			this.validateRuntimeConfig(key, node.runtime);
		}
	}

	private validateRuntimeConfig(
		key: string,
		runtime: NodeRuntimeConfig<any, any, any>,
	) {
		if (runtime.retry !== undefined && runtime.retry < 0) {
			this.warnings.push({
				path: ["nodes", key, "runtime", "retry"],
				message: `Node "${key}" retry count should be >= 0`,
				severity: "warning",
			});
		}

		if (runtime.timeoutMs !== undefined && runtime.timeoutMs < 0) {
			this.errors.push({
				path: ["nodes", key, "runtime", "timeoutMs"],
				message: `Node "${key}" timeout must be positive`,
				severity: "error",
			});
		}

		if (runtime.pool && typeof runtime.pool !== "string") {
			this.errors.push({
				path: ["nodes", key, "runtime", "pool"],
				message: `Node "${key}" pool must be a string`,
				severity: "error",
			});
		}
	}

	private validateEdges<
		Nodes extends Record<string, GraphNode<any, any, any, State>>,
		State,
	>(graph: SchemaGraph<Nodes, State>) {
		for (let i = 0; i < graph.edges.length; i++) {
			const edge = graph.edges[i];
			this.validateEdge(i, edge, graph);
		}
	}

	private validateEdge<
		Nodes extends Record<string, GraphNode<any, any, any, State>>,
		State,
	>(
		index: number,
		edge: GraphEdge<keyof Nodes, Nodes, State>, // Add all 4 generics
		graph: SchemaGraph<Nodes, State>,
	) {
		// Check from node exists
		if (!(edge.from in graph.nodes)) {
			this.errors.push({
				path: ["edges", index.toString(), "from"],
				message: `Edge ${index}: from node "${String(edge.from)}" does not exist`,
				severity: "error",
			});
		}

		// Check to node exists
		if (!(edge.to in graph.nodes)) {
			this.errors.push({
				path: ["edges", index.toString(), "to"],
				message: `Edge ${index}: to node "${String(edge.to)}" does not exist`,
				severity: "error",
			});
		}

		// Check when condition is a function if provided
		if (edge.when && typeof edge.when !== "function") {
			this.errors.push({
				path: ["edges", index.toString(), "when"],
				message: `Edge ${index}: when condition must be a function`,
				severity: "error",
			});
		}
	}

	private validateDependencies<
		Nodes extends Record<string, GraphNode<any, any, any, State>>,
		State,
	>(graph: SchemaGraph<Nodes, State>) {
		const incomingCount = new Map<keyof Nodes, number>();

		for (const key of Object.keys(graph.nodes) as (keyof Nodes)[]) {
			incomingCount.set(key, 0);
		}

		for (const edge of graph.edges) {
			incomingCount.set(edge.to, (incomingCount.get(edge.to) || 0) + 1);
		}

		for (const [key, count] of incomingCount.entries()) {
			if (count === 0 && key !== graph.entry) {
				this.warnings.push({
					path: ["nodes", String(key)],
					message: `Node "${String(key)}" has no incoming edges and is not the entry point`,
					severity: "warning",
				});
			}
		}
	}

	private validateCycles<
		Nodes extends Record<string, GraphNode<any, any, any, State>>,
		State,
	>(graph: SchemaGraph<Nodes, State>) {
		const visited = new Set<keyof Nodes>();
		const recursionStack = new Set<keyof Nodes>();

		const hasCycle = (node: keyof Nodes): boolean => {
			if (recursionStack.has(node)) return true;
			if (visited.has(node)) return false;

			visited.add(node);
			recursionStack.add(node);

			const edges = graph.edges.filter((e) => e.from === node);
			for (const edge of edges) {
				if (hasCycle(edge.to)) return true;
			}

			recursionStack.delete(node);
			return false;
		};

		if (hasCycle(graph.entry)) {
			this.errors.push({
				path: ["graph"],
				message: "Graph contains cycles - this would cause infinite execution",
				severity: "error",
			});
		}
	}

	private validateReachability<
		Nodes extends Record<string, GraphNode<any, any, any, State>>,
		State,
	>(graph: SchemaGraph<Nodes, State>) {
		const reachable = new Set<keyof Nodes>();

		const dfs = (node: keyof Nodes) => {
			if (reachable.has(node)) return;
			reachable.add(node);

			const edges = graph.edges.filter((e) => e.from === node);
			for (const edge of edges) {
				dfs(edge.to);
			}
		};

		dfs(graph.entry);

		const allNodes = new Set(Object.keys(graph.nodes) as (keyof Nodes)[]);
		const unreachable = [...allNodes].filter((n) => !reachable.has(n));

		if (unreachable.length > 0) {
			this.warnings.push({
				path: ["graph"],
				message: `Nodes ${unreachable.map(String).join(", ")} are unreachable from entry`,
				severity: "warning",
			});
		}
	}
}
