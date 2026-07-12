import type { VertexType } from '../model/types';
import type { NodeVM } from './nodeVM';
import { TYPE_COLOR, TYPE_GLYPH } from './nodeVM';

const PAD = 9;
const LINE_H = 15;

/** Keystone glyph — the linchpin marker (§5.1), one of the three signature devices. */
function Keystone({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <path
        d="M 2.5 0 L 11.5 0 L 14 9 L 0 9 Z"
        fill="var(--c-assumption)"
        stroke="var(--surface)"
        strokeWidth="1"
      />
      <line x1="4.6" y1="0" x2="3.4" y2="9" stroke="var(--surface)" strokeWidth="0.9" />
      <line x1="9.4" y1="0" x2="10.6" y2="9" stroke="var(--surface)" strokeWidth="0.9" />
    </g>
  );
}

/** Chain-link badge for promoted nodes; warning variant when the source changed. */
function ChainLink({ x, y, changed }: { x: number; y: number; changed: boolean }) {
  const color = changed ? 'var(--danger)' : 'var(--muted)';
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x="0" y="2" width="8" height="5.5" rx="2.75" fill="none" stroke={color} strokeWidth="1.4" />
      <rect x="5.5" y="2" width="8" height="5.5" rx="2.75" fill="none" stroke={color} strokeWidth="1.4" />
      {changed && (
        <text x="16.5" y="8.5" fontSize="9" fontWeight="700" fill={color} fontFamily="var(--mono)">
          !
        </text>
      )}
    </g>
  );
}

export interface NodeBoxProps {
  vm: NodeVM;
  selected?: boolean;
  dimmed?: boolean;
  caption?: string | null;
  interactive?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onLinkStart?: (e: React.PointerEvent) => void;
  /** diamond_event corners: select the vertex (firstId) or create it (null) */
  onCornerClick?: (role: VertexType, firstId: string | null) => void;
}

/** Renders at origin; parent <g> supplies the translate. Pure of all state. */
export function NodeBox(props: NodeBoxProps) {
  if (props.vm.node.type === 'diamond_event') return <DiamondEventBox {...props} />;
  return <CardBox {...props} />;
}

/** The classic Diamond Model glyph (diamond spec §3.1): a true diamond with
    the event's text and grading inside and the four vertex sections at its
    corners — Adversary top, Capability right, Victim bottom, Infrastructure
    left. Filled corner = vertex linked (its name alongside); hollow = gap. */
function DiamondEventBox({
  vm,
  selected,
  dimmed,
  onPointerDown,
  onCornerClick,
}: NodeBoxProps) {
  const W = vm.w;
  const H = vm.h;
  const cx = W / 2;
  const cy = H / 2;
  const d = `M ${cx} 0 L ${W} ${cy} L ${cx} ${H} L 0 ${cy} Z`;
  const stale = vm.staleKind !== 'fresh';
  const R = 9;

  const CORNERS: Record<
    VertexType,
    { x: number; y: number; glyph: string; lx: number; ly: number; anchor: 'start' | 'middle' | 'end' }
  > = {
    adversary: { x: cx, y: 0, glyph: 'A', lx: cx, ly: -10, anchor: 'middle' },
    capability: { x: W, y: cy, glyph: 'C', lx: W + 13, ly: cy + 3.5, anchor: 'start' },
    victim: { x: cx, y: H, glyph: 'V', lx: cx, ly: H + 17, anchor: 'middle' },
    infrastructure: { x: 0, y: cy, glyph: 'I', lx: -13, ly: cy + 3.5, anchor: 'end' },
  };

  // centre the text block (lines + meta) vertically inside the diamond
  const blockH = vm.lines.length * LINE_H + 16;
  let ty = cy - blockH / 2 + 11;

  return (
    <g className={`node-g${selected ? ' selected' : ''}${dimmed ? ' dim' : ''}`}>
      {selected && (
        <path
          className="sel-ring-diamond"
          d={`M ${cx} ${-8} L ${W + 10} ${cy} L ${cx} ${H + 8} L ${-10} ${cy} Z`}
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      )}
      <g className="body" onPointerDown={onPointerDown}>
        <path d={d} fill="var(--surface)" stroke="var(--c-event)" strokeWidth={vm.isThreadAnchor ? 2.2 : 1.6} />
        {/* stale = hatched (§5.1) — same signature device, diamond-shaped */}
        {stale && <path d={d} fill="url(#stale-hatch)" pointerEvents="none" />}
        {vm.lines.map((line, i) => (
          <text key={i} className="node-text" x={cx} y={ty + i * LINE_H} textAnchor="middle">
            {line}
          </text>
        ))}
        <text
          className="node-meta"
          x={cx}
          y={ty + vm.lines.length * LINE_H + 3}
          textAnchor="middle"
        >
          {vm.meta.length > 30 ? `${vm.meta.slice(0, 29)}…` : vm.meta}
        </text>
      </g>

      {vm.roleSlots?.map((slot) => {
        const c = CORNERS[slot.role];
        const filled = slot.count > 0;
        // side labels sit between neighbouring diamonds — keep them tighter
        const maxLabel = c.anchor === 'middle' ? 24 : 15;
        const label = slot.label
          ? `${slot.label.length > maxLabel ? `${slot.label.slice(0, maxLabel - 1)}…` : slot.label}${slot.count > 1 ? ` +${slot.count - 1}` : ''}`
          : null;
        return (
          <g
            key={slot.role}
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onCornerClick?.(slot.role, slot.firstId);
            }}
          >
            <circle
              cx={c.x}
              cy={c.y}
              r={R}
              fill={filled ? `var(--c-${slot.role})` : 'var(--surface)'}
              stroke={`var(--c-${slot.role})`}
              strokeWidth={1.5}
              strokeDasharray={filled ? undefined : '2.5 2.5'}
            />
            <text
              x={c.x}
              y={c.y + 3.5}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fontFamily="var(--mono)"
              fill={filled ? '#fff' : `var(--c-${slot.role})`}
              pointerEvents="none"
            >
              {c.glyph}
            </text>
            {label && (
              <text
                className="corner-label"
                x={c.lx}
                y={c.ly}
                textAnchor={c.anchor}
                fill={`var(--c-${slot.role})`}
              >
                {label}
              </text>
            )}
            <title>
              {filled
                ? `${slot.role}: ${slot.label}${slot.count > 1 ? ` (+${slot.count - 1} more)` : ''} — click to select`
                : `${slot.role}: gap — click to add`}
            </title>
          </g>
        );
      })}
    </g>
  );
}

function CardBox({
  vm,
  selected,
  dimmed,
  caption,
  interactive,
  onPointerDown,
  onDoubleClick,
  onLinkStart,
}: NodeBoxProps) {
  const color = TYPE_COLOR[vm.node.type];
  const solid = vm.adopted;
  const stale = vm.staleKind !== 'fresh';
  const textClass = solid ? 'node-text inverse' : 'node-text';
  const metaClass = solid ? 'node-meta inverse' : 'node-meta';

  let ty = PAD + 11;
  const textEls = vm.lines.map((line, i) => (
    <text key={`t${i}`} className={textClass} x={PAD} y={ty + i * LINE_H}>
      {line}
    </text>
  ));
  ty += vm.lines.length * LINE_H;

  const answerEls = vm.answerLines.map((line, i) => (
    <text key={`a${i}`} className={textClass} x={PAD} y={ty + 2 + i * LINE_H} opacity={0.82}>
      {line}
    </text>
  ));
  if (vm.answerLines.length) ty += vm.answerLines.length * LINE_H + 2;
  const answerMetaEl = vm.answerMeta ? (
    <text className={metaClass} x={PAD} y={ty + 11}>
      {vm.answerMeta.length > 40 ? `${vm.answerMeta.slice(0, 39)}…` : vm.answerMeta}
    </text>
  ) : null;
  if (vm.answerMeta) ty += 17;

  return (
    <g className={`node-g${selected ? ' selected' : ''}${dimmed ? ' dim' : ''}`}>
      {/* stale = hatched border (§5.1) — signature device */}
      {stale && (
        <rect
          x={-3.5}
          y={-3.5}
          width={vm.w + 7}
          height={vm.h + 7}
          rx={9}
          fill="url(#stale-hatch)"
          stroke="none"
        />
      )}
      <rect
        className="sel-ring"
        x={-6}
        y={-6}
        width={vm.w + 12}
        height={vm.h + 12}
        rx={11}
        fill="none"
        stroke="none"
        strokeWidth={1.5}
        strokeDasharray="3 3"
      />
      <g className="body" onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
        <rect
          width={vm.w}
          height={vm.h}
          rx={6}
          fill={solid ? color : 'var(--surface)'}
          stroke={color}
          strokeWidth={vm.isThreadAnchor || vm.isCollapsedSub ? 2.2 : 1.4}
          strokeDasharray={vm.isCollapsedSub ? '6 3' : undefined}
        />
        {textEls}
        {answerEls}
        {answerMetaEl}
        {/* meta row: glyph + judgement summary, mono — grades read as data */}
        <text
          className={metaClass}
          x={PAD}
          y={vm.h - PAD + 1}
          style={{ fontWeight: 700, fill: solid ? '#fff' : color }}
        >
          {TYPE_GLYPH[vm.node.type]}
        </text>
        <text
          className={metaClass}
          x={PAD + 6 + TYPE_GLYPH[vm.node.type].length * 7}
          y={vm.h - PAD + 1}
        >
          {vm.meta.length > 34 ? `${vm.meta.slice(0, 33)}…` : vm.meta}
        </text>
        {vm.linchpin && <Keystone x={vm.w - 22} y={-4} />}
        {vm.derivedBadge !== 'none' && (
          <ChainLink x={vm.w - (vm.linchpin ? 48 : 24)} y={vm.h - 16} changed={vm.derivedBadge === 'source_changed'} />
        )}
      </g>
      {caption && (
        // truncated to stay inside one stratified column (slot ≈ 240px)
        <text className="node-caption" x={0} y={vm.h + 14}>
          {caption.length > 42 ? `⚠ ${caption.slice(0, 41)}…` : `⚠ ${caption}`}
        </text>
      )}
      {interactive && (
        <g className="link-handle-g" onPointerDown={onLinkStart}>
          <circle className="link-handle" cx={vm.w} cy={vm.h / 2} r={8} strokeWidth={1.4} />
          <line className="link-plus" x1={vm.w - 3.5} y1={vm.h / 2} x2={vm.w + 3.5} y2={vm.h / 2} />
          <line className="link-plus" x1={vm.w} y1={vm.h / 2 - 3.5} x2={vm.w} y2={vm.h / 2 + 3.5} />
          <title>Drag to another node to link (or select this node and press L)</title>
        </g>
      )}
    </g>
  );
}

/** SVG defs shared by every graph rendering, including the static export. */
export function GraphDefs() {
  return (
    <defs>
      <pattern id="stale-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" fill="none" />
        <line x1="0" y1="0" x2="0" y2="7" stroke="var(--stale)" strokeWidth="2.6" opacity="0.55" />
      </pattern>
      <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--line-strong)" />
      </marker>
      <pattern id="dotgrid" width="24" height="24" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="var(--line)" />
      </pattern>
    </defs>
  );
}
