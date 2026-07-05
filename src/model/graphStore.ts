import { createStore } from 'zustand/vanilla';
import type { AnyNode, Edge, LogEvent } from './types';

// The one graph (§0.3). Views are pure functions of this state; the only
// view-owned data is node x,y. Mutations happen exclusively via repo.ts.
export interface Graph {
  nodes: Record<string, AnyNode>;
  edges: Record<string, Edge>;
  events: LogEvent[]; // ascending seq
}

export interface GraphState extends Graph {
  loaded: boolean;
}

export const graphStore = createStore<GraphState>(() => ({
  loaded: false,
  nodes: {},
  edges: {},
  events: [],
}));
