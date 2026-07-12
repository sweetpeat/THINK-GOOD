// Kill-chain view (diamond spec §3.2): the incident thread's peer of the ACH
// matrix. Seven lanes in kill-chain order (plus "Unphased" when needed), events
// left→right by occurredAt then createdAt, each drawn as a diamond glyph —
// Adversary top, Capability right, Victim bottom, Infrastructure left; filled
// corner = role present, hollow = gap. Purely a rendering of the same graph:
// positions are computed, never stored; the only edits it offers are explicit
// logged acts (creating a missing vertex + its characterizes edge).

import { useGraph } from './useGraph';
import { useUI } from './uiStore';
import type { DiamondEventNode, VertexType } from '../model/types';
import { staleStateOf, VERTEX_TYPES } from '../model/types';
import { killChain, verticesOf } from '../model/derive';
import { NODE_TYPE_LABELS, PHASE_LABELS, RESULT_LABELS } from '../model/labels';
import { promptCreateVertex } from './diamondActions';
import { GraphDefs } from './NodeBox';
import { TYPE_COLOR, wrapText } from './nodeVM';

const GUTTER = 168; // lane-label column
const SLOT_W = 224;
const LANE_H = 196;
const R = 44; // diamond half-diagonal
const CORNER_R = 9;

const CORNER: Record<VertexType, { dx: number; dy: number; glyph: string }> = {
  adversary: { dx: 0, dy: -1, glyph: 'A' },
  capability: { dx: 1, dy: 0, glyph: 'C' },
  victim: { dx: 0, dy: 1, glyph: 'V' },
  infrastructure: { dx: -1, dy: 0, glyph: 'I' },
};

export function KillChainView({ incidentId }: { incidentId: string }) {
  const g = useGraph();
  const { selectedId, select } = useUI();
  const lanes = killChain(g, incidentId);
  const totalEvents = lanes.reduce((n, l) => n + l.events.length, 0);

  if (totalEvents === 0) {
    return (
      <div className="killchain-wrap">
        <div style={{ maxWidth: 520 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>No diamond events yet</h3>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            This view threads the incident's events along the kill chain. On the Canvas,
            press <kbd>D</kbd> to capture an event, declare its phase, and link vertices to
            it (<kbd>A</kbd> adversary · <kbd>C</kbd> capability · <kbd>I</kbd> infrastructure ·{' '}
            <kbd>V</kbd> victim, then drag each vertex's ⊕ onto the event → <em>characterizes</em>).
          </p>
        </div>
      </div>
    );
  }

  const maxCount = Math.max(1, ...lanes.map((l) => l.events.length));
  const width = GUTTER + maxCount * SLOT_W + 40;
  const height = lanes.length * LANE_H + 20;

  const addVertex = (role: VertexType, event: DiamondEventNode) => promptCreateVertex(event, role);

  return (
    <div className="killchain-wrap">
      <svg className="killchain-svg" width={width} height={height}>
        <GraphDefs />
        {lanes.map((lane, li) => {
          const y0 = 10 + li * LANE_H;
          const label = lane.phase ? PHASE_LABELS[lane.phase] : 'Unphased';
          return (
            <g key={lane.phase ?? 'unphased'}>
              <line className="lane-rule" x1={0} y1={y0} x2={width} y2={y0} />
              <text className="lane-label" x={14} y={y0 + 26}>
                {`${li + 1 <= 7 && lane.phase ? `${li + 1}. ` : ''}${label}`}
              </text>
              {lane.events.length === 0 && (
                <text className="lane-empty" x={GUTTER + 18} y={y0 + LANE_H / 2}>
                  no events recorded in this phase
                </text>
              )}
              {lane.events.map((ev, ei) => (
                <EventDiamond
                  key={ev.id}
                  event={ev}
                  cx={GUTTER + ei * SLOT_W + SLOT_W / 2}
                  cy={y0 + LANE_H / 2 - 26}
                  selectedId={selectedId}
                  onSelect={select}
                  onAddVertex={addVertex}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="canvas-hint">
        click a diamond selects the event · click a corner selects (or creates) that vertex ·
        hollow corner = intelligence gap
      </div>
    </div>
  );
}

function EventDiamond({
  event,
  cx,
  cy,
  selectedId,
  onSelect,
  onAddVertex,
}: {
  event: DiamondEventNode;
  cx: number;
  cy: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddVertex: (role: VertexType, event: DiamondEventNode) => void;
}) {
  const g = useGraph();
  const vertices = verticesOf(g, event.id);
  const stale = staleStateOf(event).kind !== 'fresh';
  const d = `M ${cx} ${cy - R} L ${cx + R} ${cy} L ${cx} ${cy + R} L ${cx - R} ${cy} Z`;
  const lines = wrapText(event.text, 2, 30);
  const meta = [
    event.result ? RESULT_LABELS[event.result] : 'result?',
    event.occurredAt ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <g>
      {selectedId === event.id && (
        <path
          d={`M ${cx} ${cy - R - 7} L ${cx + R + 7} ${cy} L ${cx} ${cy + R + 7} L ${cx - R - 7} ${cy} Z`}
          fill="none"
          stroke="var(--c-claim)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      )}
      <path
        d={d}
        fill="var(--surface)"
        stroke="var(--c-event)"
        strokeWidth={1.6}
        style={{ cursor: 'pointer' }}
        onClick={() => onSelect(event.id)}
      >
        <title>{event.text}</title>
      </path>
      {stale && <path d={d} fill="url(#stale-hatch)" pointerEvents="none" />}

      {VERTEX_TYPES.map((role) => {
        const { dx, dy, glyph } = CORNER[role];
        const px = cx + dx * R;
        const py = cy + dy * R;
        const present = vertices[role];
        const first = present[0];
        const isSelected = !!first && selectedId != null && present.some((v) => v.id === selectedId);
        return (
          <g
            key={role}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              if (first) onSelect(first.id);
              else void onAddVertex(role, event);
            }}
          >
            {isSelected && (
              <circle cx={px} cy={py} r={CORNER_R + 4} fill="none" stroke="var(--c-claim)" strokeWidth={1.5} strokeDasharray="3 3" />
            )}
            <circle
              cx={px}
              cy={py}
              r={CORNER_R}
              fill={first ? TYPE_COLOR[role] : 'var(--surface)'}
              stroke={TYPE_COLOR[role]}
              strokeWidth={1.5}
              strokeDasharray={first ? undefined : '2.5 2.5'}
            />
            <text
              x={px}
              y={py + 3.5}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fontFamily="var(--mono)"
              fill={first ? '#fff' : TYPE_COLOR[role]}
              pointerEvents="none"
            >
              {glyph}
            </text>
            <title>
              {first
                ? `${NODE_TYPE_LABELS[role]}: ${present.map((v) => v.text).join(' · ')}`
                : `${NODE_TYPE_LABELS[role]}: gap — click to add`}
            </title>
          </g>
        );
      })}

      {lines.map((line, i) => (
        <text key={i} className="diamond-caption" x={cx} y={cy + R + 24 + i * 14} textAnchor="middle">
          {line}
        </text>
      ))}
      <text className="diamond-meta" x={cx} y={cy + R + 24 + lines.length * 14} textAnchor="middle">
        {meta}
      </text>
    </g>
  );
}
