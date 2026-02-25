export type GraphListener<Nodes, State> = {
	start: (emit: (partialState: Partial<State>) => void) => () => void;
	goals: (keyof Nodes)[];
};
