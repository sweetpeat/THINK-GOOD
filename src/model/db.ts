import Dexie, { type Table } from 'dexie';
import type { AnyNode, Edge, LogEvent } from './types';

// Exactly three tables (§1). `events` is append-only: repo.ts only ever calls
// bulkAdd on it (plus clear() inside store import, which replaces the whole
// store and is itself logged). No update/delete path exists anywhere.
class ReasoningCanvasDB extends Dexie {
  nodes!: Table<AnyNode, string>;
  edges!: Table<Edge, string>;
  events!: Table<LogEvent, string>;

  constructor() {
    super('reasoning-canvas');
    this.version(1).stores({
      nodes: 'id, threadId',
      edges: 'id, from, to',
      events: 'id, seq, threadId, nodeId',
    });
  }
}

export const db = new ReasoningCanvasDB();
