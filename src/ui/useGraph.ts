import { useStore } from 'zustand';
import { graphStore, type GraphState } from '../model/graphStore';

export function useGraph(): GraphState {
  return useStore(graphStore);
}
