// Shared diamond-corner action: filling an intelligence gap creates the vertex
// and its characterizes edge in one gesture — two explicit, logged acts. Used
// by the canvas diamond glyphs and the kill-chain view.

import * as repo from '../model/repo';
import type { DiamondEventNode, VertexType } from '../model/types';
import { NODE_TYPE_LABELS } from '../model/labels';
import { useUI } from './uiStore';

// Where the new vertex lands on the canvas, relative to its event's corner.
const VERTEX_OFFSET: Record<VertexType, { x: number; y: number }> = {
  adversary: { x: 20, y: -180 },
  capability: { x: 280, y: 0 },
  victim: { x: 20, y: 180 },
  infrastructure: { x: -240, y: 0 },
};

export async function promptCreateVertex(event: DiamondEventNode, role: VertexType): Promise<void> {
  const text = window.prompt(
    `Name the ${NODE_TYPE_LABELS[role].toLowerCase()} for ‘${event.text}’ — this creates the vertex and its characterizes link (both logged):`,
  );
  if (!text?.trim()) return;
  try {
    const v = await repo.createNode({
      threadId: event.threadId,
      type: role,
      text,
      x: event.x + VERTEX_OFFSET[role].x,
      y: event.y + VERTEX_OFFSET[role].y,
    });
    await repo.createEdge('characterizes', v.id, event.id);
    useUI.getState().select(v.id);
  } catch (err) {
    useUI.getState().showToast({ text: String((err as Error).message ?? err) });
  }
}
