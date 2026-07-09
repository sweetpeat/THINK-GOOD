// Share file (§5.9): a single self-contained static HTML file — word-picture,
// inline SVG of the stratified view (lens cleared), and a collapsible audit
// appendix. Readable with no JS and no network.

import { renderToStaticMarkup } from 'react-dom/server';
import type { Graph } from '../model/graphStore';
import type { EvidenceNode, QuestionNode } from '../model/types';
import {
  competingSet,
  disconfirmationCoverage,
  displayedEdges,
  displayedNodes,
  isLiveSet,
  isNonDiagnostic,
  threadEvents,
  weakestInput,
} from '../model/derive';
import { CONFIDENCE_LABELS, LIKELIHOOD_LABELS } from '../model/labels';
import { buildNodeVM } from '../ui/nodeVM';
import { GraphDefs, NodeBox } from '../ui/NodeBox';
import { edgePath } from '../ui/geometry';
import { stratify } from '../ui/stratify';
import { eventText, fmtTime } from '../ui/eventText';
import { buildWordPicture, type WPBlock } from './wordPicture';

function StaticStratifiedSVG({ g, rootThreadId }: { g: Graph; rootThreadId: string }) {
  const nodes = displayedNodes(g, rootThreadId);
  const edges = displayedEdges(g, rootThreadId);
  const vms = new Map(nodes.map((n) => [n.id, buildNodeVM(g, n, rootThreadId)]));
  const layout = stratify([...vms.values()], edges, 140, 70);

  const rectOf = (id: string) => {
    const p = layout.positions.get(id)!;
    const vm = vms.get(id)!;
    return { x: p.x, y: p.y, w: vm.w, h: vm.h };
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${Math.max(layout.width, 700)} ${layout.height}`}
      width="100%"
      style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 }}
    >
      <GraphDefs />
      {layout.bands.map((b) => (
        <text key={b.label} className="band-label" x={20} y={b.y + 4}>
          {b.label}
        </text>
      ))}
      <line className="waterline" x1={10} y1={layout.waterlineY} x2={Math.max(layout.width, 700) - 10} y2={layout.waterlineY} />
      <text className="waterline-label" x={12} y={layout.waterlineY - 6}>
        WATERLINE
      </text>
      {edges
        .filter((e) => layout.positions.has(e.from) && layout.positions.has(e.to))
        .map((e) => {
          const shape = edgePath(rectOf(e.from), rectOf(e.to));
          return (
            <g key={e.id}>
              <path className={`edge ${e.type}`} d={shape.d} markerEnd={e.type === 'answers' ? 'url(#arrow)' : undefined} />
              {e.type === 'inconsistent_with' && (
                <line
                  className="edge-tick"
                  x1={shape.mid.x - shape.normal.x * 5}
                  y1={shape.mid.y - shape.normal.y * 5}
                  x2={shape.mid.x + shape.normal.x * 5}
                  y2={shape.mid.y + shape.normal.y * 5}
                />
              )}
            </g>
          );
        })}
      {nodes
        .filter((n) => layout.positions.has(n.id))
        .map((n) => {
          const p = layout.positions.get(n.id)!;
          const caption = n.type === 'claim' ? (weakestInput(g, n.id)?.caption ?? null) : null;
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`}>
              <NodeBox vm={vms.get(n.id)!} caption={caption} />
            </g>
          );
        })}
    </svg>
  );
}

function WordPictureHTML({ blocks }: { blocks: WPBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'title') return <h1 key={i}>{b.text}</h1>;
        if (b.kind === 'para')
          return (
            <p key={i}>
              <strong>{b.strong}</strong> {b.text}
            </p>
          );
        if (b.kind === 'bullets')
          return (
            <div key={i}>
              <p>
                <strong>{b.strong}</strong>
              </p>
              <ul>
                {b.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          );
        return (
          <p key={i} className="audit-line">
            {b.text}
          </p>
        );
      })}
    </>
  );
}

// Only the CSS the share file actually uses — inlined so the file stands alone.
const SHARE_CSS = `
:root {
  --paper:#f7f6f3; --surface:#fffefc; --ink:#201d19; --muted:#7a746a; --faint:#a8a196;
  --line:#e3dfd7; --line-strong:#cfc9be; --stale:#8a8378; --danger:#a33d2e;
  --c-question:#6d4fc4; --c-claim:#1e66c7; --c-assumption:#b3620e; --c-evidence:#0e7a70;
  --mono:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
}
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:var(--paper);
  color:var(--ink); max-width:860px; margin:0 auto; padding:40px 24px; line-height:1.5; font-size:14px; }
h1 { font-size:21px; } h2 { font-size:15px; margin-top:32px; }
ul { margin:4px 0; } li { margin-bottom:3px; }
.audit-line { margin-top:28px; padding-top:12px; border-top:1px solid var(--line); color:var(--muted);
  font-family:var(--mono); font-size:11px; }
.node-text { font-size:11.5px; fill:var(--ink); } .node-text.inverse { fill:#fff; }
.node-meta { font-family:var(--mono); font-size:9.5px; fill:var(--muted); }
.node-meta.inverse { fill:rgba(255,255,255,.85); }
.node-caption { font-size:10px; fill:var(--c-assumption); }
.band-label { font-family:var(--mono); font-size:10px; letter-spacing:.14em; fill:var(--faint); text-transform:uppercase; }
.waterline { stroke:var(--line-strong); stroke-width:1.5; stroke-dasharray:7 5; }
.waterline-label { font-family:var(--mono); font-size:9px; letter-spacing:.1em; fill:var(--faint); }
.edge { fill:none; stroke:var(--line-strong); stroke-width:1.4; }
.edge.inconsistent_with { stroke:var(--danger); } .edge.rests_on { stroke-dasharray:4 4; }
.edge.answers { stroke-width:1.8; } .edge-tick { stroke:var(--danger); stroke-width:1.6; }
details { margin-top:32px; } summary { cursor:pointer; color:var(--muted); }
table { border-collapse:collapse; width:100%; font-size:12px; margin-top:12px; }
th { text-align:left; font-weight:600; color:var(--muted); border-bottom:1px solid var(--line-strong); padding:4px 10px 4px 0; font-size:11px; }
td { border-bottom:1px solid var(--line); padding:4px 10px 4px 0; vertical-align:top; }
.nondiag-note { color:var(--muted); font-size:12px; }
td.when { white-space:nowrap; color:var(--muted); font-family:var(--mono); font-size:11px; }
td.etype { white-space:nowrap; font-family:var(--mono); font-size:11px; }
`;

export function buildShareHtml(g: Graph, rootThreadId: string): string {
  const root = g.nodes[rootThreadId] as QuestionNode;
  const blocks = buildWordPicture(g, rootThreadId);
  const events = [...threadEvents(g, rootThreadId)].reverse();

  const set = competingSet(g, rootThreadId);
  const nonDiagnostic = displayedNodes(g, rootThreadId).filter(
    (n): n is EvidenceNode => n.type === 'evidence' && isNonDiagnostic(g, n.id, set),
  );

  const body = renderToStaticMarkup(
    <>
      <WordPictureHTML blocks={blocks} />
      {isLiveSet(set) && (
        <>
          <h2>Competing claims</h2>
          <table>
            <thead>
              <tr>
                <th>Claim</th>
                <th>Status</th>
                <th>Assessed as</th>
                <th>Inconsistent items</th>
                <th>Disconfirmation attempted</th>
              </tr>
            </thead>
            <tbody>
              {set.map((c) => {
                const cov = disconfirmationCoverage(g, c.id);
                return (
                  <tr key={c.id}>
                    <td>{c.text}</td>
                    <td>{c.status}</td>
                    <td>
                      {c.likelihood ? LIKELIHOOD_LABELS[c.likelihood] : 'undeclared'} ·{' '}
                      {c.confidence ? CONFIDENCE_LABELS[c.confidence] : 'undeclared'}
                    </td>
                    <td>{cov.count}</td>
                    <td>{cov.attempted ? 'yes' : 'no'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {nonDiagnostic.length > 0 && (
            <p className="nondiag-note">
              Non-diagnostic evidence (consistent with every claim, discriminates nothing):{' '}
              {nonDiagnostic.map((e) => e.text).join('; ')}.
            </p>
          )}
        </>
      )}
      <h2>Stratified view</h2>
      <StaticStratifiedSVG g={g} rootThreadId={rootThreadId} />
      <details>
        <summary>
          Audit appendix — {events.length} event{events.length === 1 ? '' : 's'} (append-only)
        </summary>
        <table>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="when">{fmtTime(e.at)}</td>
                <td className="etype">{e.type}</td>
                <td>{eventText(g, e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(root?.text ?? 'Reasoning Canvas')}</title>
<style>${SHARE_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
