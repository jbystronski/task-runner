// import { GraphEdge } from "../types/index.js";
//
// export class GoalFlowBuilder<K extends string, State, AllKeys extends string> {
//   private edges: GraphEdge<AllKeys, State>[];
//   private current: AllKeys[];
//   private goals?: K[];
//
//   constructor(goals: K | K[], edges: GraphEdge<AllKeys, State>[]) {
//     this.edges = edges; // <- shared edges array
//     this.current = [];
//     this.goals = Array.isArray(goals) ? goals : [goals];
//   }
//
//   private push(from: AllKeys, to: AllKeys) {
//     // look for an existing edge
//     let existing = this.edges.find((e) => e.from === from && e.to === to);
//
//     if (!existing) {
//       existing = { from, to, goals: [] }; // start with empty array
//       this.edges.push(existing);
//     }
//
//     // merge goals safely, avoiding duplicates
//     if (this.goals?.length) {
//       const merged = new Set([...(existing.goals ?? []), ...this.goals]);
//       existing.goals = [...merged] as unknown as AllKeys[];
//     }
//   }
//
//   chain(...nodes: AllKeys[]) {
//     if (!nodes.length) return this;
//
//     // Only push from current to first node if current exists
//     if (this.current.length) {
//       for (const c of this.current) this.push(c, nodes[0]);
//     }
//
//     // Push edges between consecutive nodes in the chain
//     for (let i = 0; i < nodes.length - 1; i++)
//       this.push(nodes[i], nodes[i + 1]);
//
//     // Update current to last node
//     this.current = [nodes[nodes.length - 1]];
//     return this;
//   }
//
//   parallel(...nodes: AllKeys[]) {
//     const next: AllKeys[] = [];
//     for (const c of this.current)
//       for (const n of nodes) {
//         this.push(c, n);
//         next.push(n);
//       }
//     this.current = next;
//     return this;
//   }
//
//   join(node: AllKeys) {
//     for (const c of this.current) this.push(c, node);
//     this.current = [node];
//     return this;
//   }
//
//   fork<NS extends AllKeys>(
//     nodes: NS | NS[],
//     cb: (f: GoalFlowBuilder<K, State, AllKeys>) => void,
//   ) {
//     const prev = [...this.current];
//     this.current = Array.isArray(nodes) ? nodes : [nodes];
//     cb(this);
//     this.current = prev;
//     return this;
//   }
//
//   buildEdges() {
//     return this.edges; // optional, edges are already shared
//   }
// }
//
// import { GraphEdge } from "../types/index.js";
//
// export class GoalFlowBuilder<K extends string, State, AllKeys extends string> {
//   private edges: GraphEdge<AllKeys, State>[];
//   private current: AllKeys[];
//   private goals: K[];
//
//   constructor(goals: K | K[], edges: GraphEdge<AllKeys, State>[]) {
//     this.edges = edges;
//     this.current = [];
//     this.goals = Array.isArray(goals) ? goals : [goals];
//   }
//
//   private push(from: AllKeys, to: AllKeys) {
//     if (from === to) return; // prevent accidental self cycles
//
//     let edge = this.edges.find((e) => e.from === from && e.to === to);
//
//     if (!edge) {
//       edge = { from, to, goals: [] };
//       this.edges.push(edge);
//     }
//
//     if (this.goals.length) {
//       const merged = new Set([...(edge.goals ?? []), ...this.goals]);
//       edge.goals = [...merged] as unknown as AllKeys[];
//     }
//   }
//
//   chain(...nodes: AllKeys[]) {
//     if (!nodes.length) return this;
//
//     if (this.current.length) {
//       for (const c of this.current) {
//         this.push(c, nodes[0]);
//       }
//     }
//
//     for (let i = 0; i < nodes.length - 1; i++) {
//       this.push(nodes[i], nodes[i + 1]);
//     }
//
//     this.current = [nodes[nodes.length - 1]];
//     return this;
//   }
//
//   parallel(...nodes: AllKeys[]) {
//     if (!this.current.length) return this;
//
//     const next: AllKeys[] = [];
//
//     for (const c of this.current) {
//       for (const n of nodes) {
//         this.push(c, n);
//         next.push(n);
//       }
//     }
//
//     this.current = next;
//     return this;
//   }
//
//   join(node: AllKeys) {
//     if (!this.current.length) return this;
//
//     for (const c of this.current) {
//       this.push(c, node);
//     }
//
//     this.current = [node];
//     return this;
//   }
//
//   fork<NS extends AllKeys>(
//     nodes: NS | NS[],
//     cb: (f: GoalFlowBuilder<K, State, AllKeys>) => void,
//   ) {
//     const prev = [...this.current];
//
//     this.current = Array.isArray(nodes) ? nodes : [nodes];
//
//     cb(this);
//
//     this.current = prev;
//
//     return this;
//   }
//
//   buildEdges() {
//     return this.edges;
//   }
// }

import { GraphEdge } from "../types/index.js";

export class GoalFlowBuilder<K extends string, State, AllKeys extends string> {
  private edges: GraphEdge<AllKeys, State>[];

  // O(1) lookup index
  private edgeIndex: Map<string, GraphEdge<AllKeys, State>>;

  private current: AllKeys[];
  private goals: K[];

  constructor(goals: K | K[], edges: GraphEdge<AllKeys, State>[]) {
    this.edges = edges;
    this.current = [];
    this.goals = Array.isArray(goals) ? goals : [goals];

    // Build index from existing edges
    this.edgeIndex = new Map();

    for (const e of edges) {
      this.edgeIndex.set(this.key(e.from, e.to), e);
    }
  }

  private key(from: AllKeys, to: AllKeys) {
    return `${from}→${to}`;
  }

  private push(from: AllKeys, to: AllKeys) {
    if (from === to) return; // guard accidental self-cycle

    const k = this.key(from, to);

    let edge = this.edgeIndex.get(k);

    if (!edge) {
      edge = { from, to, goals: [] };

      this.edgeIndex.set(k, edge);
      this.edges.push(edge);
    }

    if (this.goals.length) {
      const merged = new Set([...(edge.goals ?? []), ...this.goals]);
      edge.goals = [...merged] as unknown as AllKeys[];
    }
  }

  chain(...nodes: AllKeys[]) {
    if (!nodes.length) return this;

    if (this.current.length) {
      for (const c of this.current) {
        this.push(c, nodes[0]);
      }
    }

    for (let i = 0; i < nodes.length - 1; i++) {
      this.push(nodes[i], nodes[i + 1]);
    }

    this.current = [nodes[nodes.length - 1]];
    return this;
  }

  parallel(...nodes: AllKeys[]) {
    if (!this.current.length) return this;

    const next: AllKeys[] = [];

    for (const c of this.current) {
      for (const n of nodes) {
        this.push(c, n);
        next.push(n);
      }
    }

    this.current = next;

    return this;
  }

  join(node: AllKeys) {
    if (!this.current.length) return this;

    for (const c of this.current) {
      this.push(c, node);
    }

    this.current = [node];

    return this;
  }

  fork<NS extends AllKeys>(
    nodes: NS | NS[],
    cb: (f: GoalFlowBuilder<K, State, AllKeys>) => void,
  ) {
    const prev = [...this.current];

    this.current = Array.isArray(nodes) ? nodes : [nodes];

    cb(this);

    this.current = prev;

    return this;
  }

  buildEdges() {
    return this.edges;
  }
}
