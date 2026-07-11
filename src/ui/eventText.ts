// Human-readable rendering of log events — used by the Audit view, the queue's
// cause lines, the briefing's "what changed", and the share file's appendix.

import type { Graph } from '../model/graphStore';
import type { AnyNode, LogEvent } from '../model/types';
import { EDGE_TYPE_LABELS, FIELD_LABELS, judgementValueLabel, NODE_TYPE_LABELS } from '../model/labels';

const short = (t: string | undefined, n = 44): string =>
  !t ? '?' : t.length > n ? `${t.slice(0, n - 1)}…` : t;

function nodeName(g: Graph, id?: string): string {
  if (!id) return '?';
  const n = g.nodes[id];
  return n ? `‘${short(n.text)}’` : '(removed node)';
}

export function eventText(g: Graph, e: LogEvent): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case 'thread_created':
      if (p.workflow === 'diamond') return 'Incident thread opened';
      return p.parentThreadId
        ? `Sub-question thread opened under ${nodeName(g, p.parentThreadId as string)}`
        : 'Thread created';
    case 'node_created': {
      const node = p.node as AnyNode | undefined;
      const ms = typeof p.captureMs === 'number' ? ` (captured in ${(p.captureMs / 1000).toFixed(1)}s)` : '';
      return `${NODE_TYPE_LABELS[node?.type ?? 'claim']} created: ${nodeName(g, e.nodeId)}${ms}`;
    }
    case 'node_text_edited':
      return `Text edited on ${nodeName(g, e.nodeId)}: “${short(String(p.before ?? ''), 26)}” → “${short(String(p.after ?? ''), 26)}”`;
    case 'node_retyped': {
      const before = (p.before as { type?: string })?.type ?? '?';
      const after = (p.after as { type?: string })?.type ?? '?';
      return `Retyped ${nodeName(g, e.nodeId)}: ${before} → ${after}`;
    }
    case 'judgement_declared': {
      const field = String(p.field);
      return `${FIELD_LABELS[field] ?? field} declared on ${nodeName(g, e.nodeId)}: ${judgementValueLabel(field, p.before)} → ${judgementValueLabel(field, p.after)}`;
    }
    case 'judgement_affirmed':
      return `Judgements affirmed unchanged on ${nodeName(g, e.nodeId)}`;
    case 'node_deleted':
      return `Deleted ${nodeName(g, e.nodeId)} (snapshot kept in log)`;
    case 'edge_created': {
      const edge = p.edge as { type: string; from: string; to: string } | undefined;
      if (!edge) return 'Edge created';
      return `Linked ${nodeName(g, edge.from)} —${EDGE_TYPE_LABELS[edge.type as keyof typeof EDGE_TYPE_LABELS]}→ ${nodeName(g, edge.to)}`;
    }
    case 'edge_deleted': {
      const edge = p.edge as { type: string; from: string; to: string } | undefined;
      if (!edge) return 'Edge removed';
      return `Unlinked ${nodeName(g, edge.from)} —${EDGE_TYPE_LABELS[edge.type as keyof typeof EDGE_TYPE_LABELS]}→ ${nodeName(g, edge.to)}`;
    }
    case 'claim_status_changed':
      return p.after === 'adopted'
        ? `Adopted as judgement: ${nodeName(g, e.nodeId)}`
        : `Adoption reverted on ${nodeName(g, e.nodeId)}`;
    case 'gate_overridden': {
      const gate =
        p.gate === 'rival_stronger'
          ? 'Rival stronger'
          : p.gate === 'diamond_gaps'
            ? 'Open diamond gaps'
            : 'Unsupported linchpin';
      return `Gate overridden (${gate}) on ${nodeName(g, e.nodeId)} — reason: “${e.reason}”`;
    }
    case 'node_promoted':
      return `Answer promoted into parent as ${String(p.asType)}: ${nodeName(g, e.nodeId)}`;
    case 'question_status_changed':
      return `Question ${p.after === 'answered' ? 'answered' : 'reopened'}: ${nodeName(g, e.nodeId)}`;
    case 'incident_status_changed':
      return `Incident ${p.after === 'assessed' ? 'assessed' : 'reopened'}: ${nodeName(g, e.nodeId)}`;
    case 'store_imported':
      return `Store imported (${String(p.nodeCount)} nodes, ${String(p.edgeCount)} edges, ${String(p.eventCount)} events)`;
  }
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
