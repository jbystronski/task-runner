import { GoalNodes, StringKey } from "../graph/index.js";

export type GraphListener<Nodes, State> = {
  start: (emit: (partialState: Partial<State>) => void) => () => void;
  goals: GoalNodes<StringKey<Nodes>>;
};
