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
}

/** Renders at origin; parent <g> supplies the translate. Pure of all state. */
export function NodeBox({
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
        {/* diamond_event role slots (diamond spec §3.1): filled = present, hollow = gap */}
        {vm.roleSlots && (
          <g transform={`translate(${vm.w - vm.roleSlots.length * 15 - 4}, -5)`}>
            {vm.roleSlots.map((s, i) => (
              <g key={s.role} transform={`translate(${i * 15 + 6},0)`}>
                <rect
                  x={-4}
                  y={-4}
                  width={8}
                  height={8}
                  transform="rotate(45)"
                  fill={s.present ? `var(--c-${s.role})` : 'var(--surface)'}
                  stroke={`var(--c-${s.role})`}
                  strokeWidth={1.3}
                />
                <title>{`${s.role}: ${s.present ? 'present' : 'gap — no vertex linked'}`}</title>
              </g>
            ))}
          </g>
        )}
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
