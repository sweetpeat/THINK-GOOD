// The co-located canvas (§5.1) and stratified view (§5.2) — one component,
// two layouts over the same nodes; the animated transition between them is
// the app's single permitted motion (§6).

import { useEffect, useMemo, useRef, useState } from 'react';
import * as repo from '../model/repo';
import { graphStore } from '../model/graphStore';
import { useGraph } from './useGraph';
import { useUI } from './uiStore';
import type { AnyNode, DiamondEventNode, EdgeType, NodeType, QuestionNode } from '../model/types';
import { edgeTargetsFrom, validEdgeTypes } from '../model/types';
import { promptCreateVertex } from './diamondActions';
import { displayedEdges, displayedNodes, threadWorkflow, weakestInput } from '../model/derive';
import { EDGE_TYPE_LABELS, NODE_TYPE_LABELS, NODE_TYPE_PLURALS } from '../model/labels';
import { PALETTES, keyFor, retypeOptions, typeForKey, type Workflow } from './palette';
import { buildNodeVM, TYPE_COLOR, type NodeVM } from './nodeVM';
import { GraphDefs, NodeBox } from './NodeBox';
import { edgePath, type Rect } from './geometry';
import { stratify } from './stratify';
import { lensById, lensKeepsEdge } from './lenses';
import { maybeWorkAcrossToast } from './workAcross';
import { InlineCreateForm, type CreateFormState } from './InlineCreateForm';

interface Transform {
  x: number;
  y: number;
  k: number;
}

type Picker =
  | { kind: 'edge'; fromId: string; toId: string; x: number; y: number }
  | { kind: 'edgeEdit'; edgeId: string; x: number; y: number }
  | { kind: 'retype'; nodeId: string; x: number; y: number };

const SUB_ANCHOR = { x: 120, y: 80 };

export function GraphView({ threadId, view }: { threadId: string; view: 'canvas' | 'stratified' }) {
  const g = useGraph();
  const { selectedId, select, lens } = useUI();
  const openThread = useUI((s) => s.openThread);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [panning, setPanning] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState | null>(null);
  // via 'drag' = from the ○ handle; 'click' = L key or click-click linking
  const [linking, setLinking] = useState<{ fromId: string; x: number; y: number; via: 'drag' | 'click' } | null>(null);
  const linkMoved = useRef(false);
  const linkStart = useRef({ x: 0, y: 0 });
  const [picker, setPicker] = useState<Picker | null>(null);
  const [dragOverride, setDragOverride] = useState<{ id: string; x: number; y: number } | null>(null);
  const cursorSvg = useRef({ x: 200, y: 160 });

  const workflow = threadWorkflow(g, threadId);
  const palette = PALETTES[workflow];
  const nodes = useMemo(() => displayedNodes(g, threadId), [g, threadId]);
  const edges = useMemo(() => displayedEdges(g, threadId), [g, threadId]);
  const vms = useMemo(() => {
    const m = new Map<string, NodeVM>();
    for (const n of nodes) m.set(n.id, buildNodeVM(g, n, threadId));
    return m;
  }, [g, nodes, threadId]);

  // ----- positions: canvas (stored) vs stratified (computed, never stored) -----
  const layout = useMemo(
    () => (view === 'stratified' ? stratify([...vms.values()], edges) : null),
    [view, vms, edges],
  );

  const targets = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      if (view === 'stratified') {
        const p = layout!.positions.get(n.id);
        if (p) m.set(n.id, p);
      } else if (n.id === threadId && (n as QuestionNode).parentThreadId) {
        m.set(n.id, SUB_ANCHOR); // a sub-thread's anchor question is pinned here
      } else {
        m.set(n.id, { x: n.x, y: n.y });
      }
    }
    return m;
  }, [nodes, view, layout, threadId]);

  // ----- animated transition between layouts -----
  const [anim, setAnim] = useState<Map<string, { x: number; y: number }> | null>(null);
  const renderedPos = useRef(new Map<string, { x: number; y: number }>());
  const rafRef = useRef(0);
  const prevView = useRef(view);

  useEffect(() => {
    if (prevView.current === view) return;
    prevView.current = view;
    const from = new Map(renderedPos.current);
    const to = targets;
    const start = performance.now();
    const DUR = 340;
    cancelAnimationFrame(rafRef.current);
    const step = (t: number) => {
      const raw = Math.min(1, (t - start) / DUR);
      const e = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
      const frame = new Map<string, { x: number; y: number }>();
      for (const [id, target] of to) {
        const src = from.get(id) ?? target;
        frame.set(id, { x: src.x + (target.x - src.x) * e, y: src.y + (target.y - src.y) * e });
      }
      setAnim(frame);
      if (raw < 1) rafRef.current = requestAnimationFrame(step);
      else setAnim(null);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [view, targets]);

  const posOf = (id: string): { x: number; y: number } => {
    if (dragOverride?.id === id) return dragOverride;
    return anim?.get(id) ?? targets.get(id) ?? { x: 0, y: 0 };
  };
  renderedPos.current = new Map([...targets.keys()].map((id) => [id, posOf(id)]));

  // ----- coordinate conversions -----
  const clientToSvg = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - transform.x) / transform.k, y: (cy - r.top - transform.y) / transform.k };
  };
  const clientToWrap = (cx: number, cy: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  };

  const fit = () => {
    if (!nodes.length || !svgRef.current) return;
    const rects = nodes.map((n) => {
      const p = targets.get(n.id)!;
      const vm = vms.get(n.id)!;
      return { x0: p.x, y0: p.y, x1: p.x + vm.w, y1: p.y + vm.h };
    });
    const minX = Math.min(...rects.map((r) => r.x0)) - 60;
    const minY = Math.min(...rects.map((r) => r.y0)) - 60;
    const maxX = Math.max(...rects.map((r) => r.x1)) + 60;
    const maxY = Math.max(...rects.map((r) => r.y1)) + 60;
    const box = svgRef.current.getBoundingClientRect();
    const k = Math.min(1.2, Math.max(0.25, Math.min(box.width / (maxX - minX), box.height / (maxY - minY))));
    setTransform({
      x: (box.width - (maxX - minX) * k) / 2 - minX * k,
      y: (box.height - (maxY - minY) * k) / 2 - minY * k,
      k,
    });
  };
  const fitOnOpen = useRef('');
  useEffect(() => {
    if (fitOnOpen.current !== threadId && nodes.length) {
      fitOnOpen.current = threadId;
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, nodes.length]);

  // wheel: pan; ctrl/cmd+wheel (incl. pinch) zooms at the cursor
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        setTransform((t) => {
          const k = Math.min(2.5, Math.max(0.2, t.k * Math.exp(-e.deltaY * 0.008)));
          const r = el.getBoundingClientRect();
          const px = e.clientX - r.left;
          const py = e.clientY - r.top;
          return { k, x: px - ((px - t.x) / t.k) * k, y: py - ((py - t.y) / t.k) * k };
        });
      } else {
        setTransform((t) => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ----- background pan -----
  const panStart = useRef<{ px: number; py: number; tx: number; ty: number } | null>(null);
  const onBgPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (linking) return; // the pointerup decides whether this is a drop or a cancel
    setPicker(null);
    select(null);
    panStart.current = { px: e.clientX, py: e.clientY, tx: transform.x, ty: transform.y };
    setPanning(true);
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // pointer id may already be released (e.g. synthetic events); harmless
    }
  };
  const onBgPointerMove = (e: React.PointerEvent) => {
    cursorSvg.current = clientToSvg(e.clientX, e.clientY);
    if (linking) {
      if (Math.hypot(e.clientX - linkStart.current.x, e.clientY - linkStart.current.y) > 6) {
        linkMoved.current = true;
      }
      setLinking({ ...linking, ...cursorSvg.current });
    }
    if (panStart.current) {
      setTransform((t) => ({
        ...t,
        x: panStart.current!.tx + e.clientX - panStart.current!.px,
        y: panStart.current!.ty + e.clientY - panStart.current!.py,
      }));
    }
  };
  // One svg-level pointerup resolves link drops by hit-testing data-node-id,
  // so drops land no matter which node part (or the rubber line's cursor spot)
  // sits under the pointer.
  const onBgPointerUp = (e: React.PointerEvent) => {
    panStart.current = null;
    setPanning(false);
    if (!linking) return;
    const targetId = (e.target as Element).closest?.('[data-node-id]')?.getAttribute('data-node-id');
    if (targetId && targetId !== linking.fromId) {
      const at = clientToWrap(e.clientX, e.clientY);
      setPicker({ kind: 'edge', fromId: linking.fromId, toId: targetId, x: at.x, y: at.y });
      setLinking(null);
    } else if (targetId === linking.fromId && linking.via === 'drag' && !linkMoved.current) {
      // released the initial handle click without dragging — stay armed, click-click
      setLinking({ ...linking, via: 'click' });
    } else if (linking.via === 'click' || linkMoved.current) {
      setLinking(null); // released over empty canvas (or back on the source)
    }
  };

  // ----- node drag / select (canvas only) -----
  const dragState = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const onNodePointerDown = (node: AnyNode) => (e: React.PointerEvent) => {
    if (e.button !== 0 || linking) return;
    e.stopPropagation();
    setPicker(null);
    const pinned = view === 'stratified' || (node.id === threadId && (node as QuestionNode).parentThreadId);
    const p = posOf(node.id);
    dragState.current = { id: node.id, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y, moved: false };
    const move = (ev: PointerEvent) => {
      const d = dragState.current;
      if (!d) return;
      const dx = (ev.clientX - d.startX) / transform.k;
      const dy = (ev.clientY - d.startY) / transform.k;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      if (!pinned) setDragOverride({ id: d.id, x: d.origX + dx, y: d.origY + dy });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = dragState.current;
      dragState.current = null;
      if (!d) return;
      if (d.moved && !pinned) {
        const dx = (ev.clientX - d.startX) / transform.k;
        const dy = (ev.clientY - d.startY) / transform.k;
        setDragOverride(null);
        void repo.moveNode(d.id, d.origX + dx, d.origY + dy);
      } else if (!d.moved) {
        select(d.id);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onNodeDoubleClick = (node: AnyNode) => () => {
    // double-click descends into a sub-question's own thread (§2.6)
    if (node.type === 'question' && node.id !== threadId) openThread(node.id);
  };

  const startLink = (node: AnyNode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    linkMoved.current = false;
    linkStart.current = { x: e.clientX, y: e.clientY };
    const p = clientToSvg(e.clientX, e.clientY);
    setLinking({ fromId: node.id, x: p.x, y: p.y, via: 'drag' });
  };

  // ----- keyboard (§5.1: every mouse action has a keyboard path) -----
  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const key = e.key.toLowerCase();
    const paletteType = view === 'canvas' && !e.metaKey && !e.ctrlKey ? typeForKey(workflow, key) : null;
    if (paletteType) {
      openCreateForm(paletteType);
      e.preventDefault();
    } else if (key === 'l' && selectedId) {
      linkMoved.current = false;
      setLinking({ fromId: selectedId, ...cursorSvg.current, via: 'click' });
      e.preventDefault();
    } else if (key === 't' && selectedId) {
      const p = posOf(selectedId);
      const r = svgRef.current!.getBoundingClientRect();
      const wr = wrapRef.current!.getBoundingClientRect();
      setPicker({
        kind: 'retype',
        nodeId: selectedId,
        x: p.x * transform.k + transform.x + (r.left - wr.left) + 40,
        y: p.y * transform.k + transform.y + (r.top - wr.top) + 30,
      });
      e.preventDefault();
    } else if ((key === 'delete' || key === 'backspace') && selectedId) {
      const n = g.nodes[selectedId];
      if (n && window.confirm(`Delete ${NODE_TYPE_LABELS[n.type].toLowerCase()} ‘${n.text}’? The log keeps its history.`)) {
        void repo.deleteNode(selectedId).then(() => select(null));
      }
      e.preventDefault();
    } else if (key === 'f') {
      fit();
      e.preventDefault();
    } else if (key === 'escape') {
      if (picker || createForm) {
        setPicker(null);
        setCreateForm(null);
      } else if (linking) setLinking(null);
      else if (lens) {
        const ui = useUI.getState();
        if (ui.reviewIndex != null) ui.endReview();
        else ui.setLens(null);
      } else select(null);
    }
  };

  const openCreateForm = (type: NodeType) => {
    const at = cursorSvg.current;
    setCreateForm({ type, svgX: at.x, svgY: at.y, openedAt: performance.now() });
  };

  // ----- lens application (§5.3): dim to 15% or hide; never edits -----
  const lensDef = lens ? lensById(lens.id) : null;
  const lensMatch = useMemo(() => {
    if (!lensDef) return null;
    const m = new Set<string>();
    for (const n of nodes) if (lensDef.predicate(n, g)) m.add(n.id);
    return m;
  }, [lensDef, nodes, g]);

  const nodeHidden = (id: string) => !!(lensMatch && lens?.hide && !lensMatch.has(id));
  const nodeDimmed = (id: string) => !!(lensMatch && !lens?.hide && !lensMatch.has(id));

  // ----- render -----
  const rectOf = (id: string): Rect => {
    const p = posOf(id);
    const vm = vms.get(id)!;
    return {
      x: p.x,
      y: p.y,
      w: vm.w,
      h: vm.h,
      shape: vm.node.type === 'diamond_event' ? 'diamond' : undefined,
    };
  };

  const edgeEls = edges
    .filter((e) => !nodeHidden(e.from) && !nodeHidden(e.to))
    .map((e) => {
      const shape = edgePath(rectOf(e.from), rectOf(e.to));
      const fromMatch = !!lensMatch?.has(e.from);
      const toMatch = !!lensMatch?.has(e.to);
      const dim = lensMatch ? !lensKeepsEdge(lensDef!, e.type, fromMatch, toMatch) : false;
      return (
        <g key={e.id} className={dim ? 'dim-edge' : undefined}>
          <path
            className={`edge ${e.type}${dim ? ' dim' : ''}`}
            d={shape.d}
            markerEnd={e.type === 'answers' ? 'url(#arrow)' : undefined}
          />
          {e.type === 'inconsistent_with' && !dim && (
            <line
              className="edge-tick"
              x1={shape.mid.x - shape.normal.x * 5}
              y1={shape.mid.y - shape.normal.y * 5}
              x2={shape.mid.x + shape.normal.x * 5}
              y2={shape.mid.y + shape.normal.y * 5}
            />
          )}
          <path
            className="edge-hit"
            d={shape.d}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              const at = clientToWrap(ev.clientX, ev.clientY);
              setPicker({ kind: 'edgeEdit', edgeId: e.id, x: at.x, y: at.y });
            }}
          >
            <title>{EDGE_TYPE_LABELS[e.type]}</title>
          </path>
        </g>
      );
    });

  const nodeEls = nodes
    .filter((n) => !nodeHidden(n.id))
    .map((n) => {
      const vm = vms.get(n.id)!;
      const p = posOf(n.id);
      let caption: string | null = null;
      if (lensMatch?.has(n.id) && lensDef?.caption) caption = lensDef.caption(n, g);
      else if (view === 'stratified' && n.type === 'claim') caption = weakestInput(g, n.id)?.caption ?? null;
      return (
        <g key={n.id} data-node-id={n.id} transform={`translate(${p.x},${p.y})`}>
          <NodeBox
            vm={vm}
            selected={selectedId === n.id}
            dimmed={nodeDimmed(n.id)}
            caption={caption}
            interactive={view === 'canvas'}
            onPointerDown={onNodePointerDown(n)}
            onDoubleClick={onNodeDoubleClick(n)}
            onLinkStart={startLink(n)}
            onCornerClick={(role, firstId) => {
              if (firstId) select(firstId);
              else void promptCreateVertex(n as DiamondEventNode, role);
            }}
          />
        </g>
      );
    });

  const linkSource = linking ? rectOf(linking.fromId) : null;

  // While a link is armed, tell the user exactly what to aim at — and, if the
  // canvas has no node this source can validly point to, say so plainly.
  const linkGuide = (() => {
    if (!linking) return null;
    const from = g.nodes[linking.fromId];
    if (!from) return null;
    const targetTypes = edgeTargetsFrom(from.type);
    const targetLabels = targetTypes.map((t) => NODE_TYPE_PLURALS[t]).join(' or ');
    const hasTarget = nodes.some(
      (n) => n.id !== from.id && !n.deletedAt && validEdgeTypes(from.type, n.type).length > 0,
    );
    return { fromLabel: NODE_TYPE_LABELS[from.type], targetLabels, targetTypes, hasTarget };
  })();

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className={`canvas-svg${panning ? ' panning' : ''}${linking ? ' linking' : ''}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={onBgPointerUp}
      >
        <GraphDefs />
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {view === 'canvas' && (
            <rect x={-6000} y={-6000} width={12000} height={12000} fill="url(#dotgrid)" pointerEvents="none" />
          )}
          {view === 'stratified' && layout && (
            <g>
              {layout.bands.map((b) => (
                <text key={b.label} className="band-label" x={-60} y={b.y + 4}>
                  {b.label}
                </text>
              ))}
              <line className="waterline" x1={-70} y1={layout.waterlineY} x2={layout.width} y2={layout.waterlineY} />
              <text className="waterline-label" x={-70} y={layout.waterlineY - 6}>
                WATERLINE
              </text>
            </g>
          )}
          {edgeEls}
          {nodeEls}
          {linking && linkSource && (
            <line
              className="rubber"
              x1={linkSource.x + linkSource.w / 2}
              y1={linkSource.y + linkSource.h / 2}
              x2={linking.x}
              y2={linking.y}
            />
          )}
        </g>
      </svg>

      {linkGuide && (
        <div className={`link-banner${linkGuide.hasTarget ? '' : ' warn'}`}>
          {linkGuide.targetTypes.length === 0 ? (
            <>
              A <b>{linkGuide.fromLabel.toLowerCase()}</b> can’t start a link.{' '}
              {workflow === 'diamond' ? (
                <>
                  Draw links <b>from a vertex</b> (to an event), <b>from evidence</b> (to a vertex
                  or assessment), or <b>from an assessment</b> (to the incident).
                </>
              ) : (
                <>
                  Draw links <b>from evidence</b> (to a claim) or <b>from a claim</b> (to an
                  assumption or question).
                </>
              )}
              <button className="link-banner-x" onClick={() => setLinking(null)}>
                Cancel (Esc)
              </button>
            </>
          ) : linkGuide.hasTarget ? (
            <>
              Linking from this <b>{linkGuide.fromLabel.toLowerCase()}</b> — now click{' '}
              <b>{linkGuide.targetLabels}</b> to connect to it.
              <button className="link-banner-x" onClick={() => setLinking(null)}>
                Cancel (Esc)
              </button>
            </>
          ) : (
            <>
              Nothing to link to yet: a <b>{linkGuide.fromLabel.toLowerCase()}</b> links to{' '}
              <b>{linkGuide.targetLabels}</b>, and there are none on this canvas. Press{' '}
              <kbd>{keyFor(workflow, linkGuide.targetTypes[0]).toUpperCase()}</kbd> to add one first.
              <button className="link-banner-x" onClick={() => setLinking(null)}>
                Cancel (Esc)
              </button>
            </>
          )}
        </div>
      )}

      {view === 'canvas' && (
        <div className="toolbar">
          {palette.map((p) => (
            <button
              key={p.type}
              style={{ color: TYPE_COLOR[p.type] }}
              title={`New ${p.label.toLowerCase()} (${p.key.toUpperCase()})`}
              onClick={() => {
                cursorSvg.current = clientToSvg(
                  wrapRef.current!.getBoundingClientRect().left + 340,
                  wrapRef.current!.getBoundingClientRect().top + 200,
                );
                openCreateForm(p.type);
              }}
            >
              {p.key.toUpperCase()}
            </button>
          ))}
          <div className="sep" />
          <button title="Fit view (F)" onClick={fit}>
            ⤢
          </button>
          {workflow === 'ach' && (
            <button
              title="Arrange nodes into the stratified layout (replaces your manual positions)"
              onClick={() => {
                if (!window.confirm('Arrange all nodes into the stratified layout? This replaces your manual positions — you can still drag them afterwards.')) return;
                const l = stratify([...vms.values()], edges);
                for (const [id, p] of l.positions) {
                  if (id === threadId && (g.nodes[id] as QuestionNode).parentThreadId) continue; // pinned anchor
                  void repo.moveNode(id, p.x, p.y);
                }
                setTimeout(fit, 80);
              }}
            >
              ▦
            </button>
          )}
        </div>
      )}

      <div className="canvas-hint">
        {view === 'canvas' ? (
          <>
            {palette.map((p) => (
              <span key={p.key}>
                <kbd>{p.key.toUpperCase()}</kbd>{' '}
              </span>
            ))}
            create at cursor · drag ⊕ or <kbd>L</kbd> link · <kbd>T</kbd> retype
            {workflow === 'ach' && <> · double-click a sub-question descends</>}
          </>
        ) : (
          <>positions are computed here — arrange freely on the Canvas view</>
        )}
      </div>

      {createForm && (
        <InlineCreateForm
          form={createForm}
          screen={{
            x: createForm.svgX * transform.k + transform.x,
            y: createForm.svgY * transform.k + transform.y,
          }}
          onDone={(created) => {
            setCreateForm(null);
            if (created) select(created.id);
            svgRef.current?.focus();
          }}
          threadId={threadId}
        />
      )}

      {picker && <CanvasPicker picker={picker} g={g} workflow={workflow} onClose={() => setPicker(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CanvasPicker({
  picker,
  g,
  workflow,
  onClose,
}: {
  picker: Picker;
  g: ReturnType<typeof useGraph>;
  workflow: Workflow;
  onClose: () => void;
}) {
  const style = { left: Math.max(8, picker.x), top: Math.max(8, picker.y) };

  if (picker.kind === 'edge') {
    const from = g.nodes[picker.fromId];
    const to = g.nodes[picker.toId];
    const types = from && to ? validEdgeTypes(from.type, to.type) : [];
    return (
      <div className="overlay-pop picker" style={style}>
        {types.length ? (
          <>
            <div className="title">
              {NODE_TYPE_LABELS[from.type]} → {NODE_TYPE_LABELS[to.type]}
            </div>
            {types.map((t) => (
              <button
                key={t}
                onClick={() => {
                  void repo
                    .createEdge(t, picker.fromId, picker.toId)
                    .then((edge) => maybeWorkAcrossToast(useGraphState(), edge))
                    .catch((err) => useUI.getState().showToast({ text: String(err.message ?? err) }));
                  onClose();
                }}
              >
                {EDGE_TYPE_LABELS[t]}
              </button>
            ))}
          </>
        ) : (
          <div className="title" style={{ maxWidth: 220, whiteSpace: 'normal' }}>
            A {NODE_TYPE_LABELS[from?.type ?? 'claim'].toLowerCase()} can’t link to a{' '}
            {NODE_TYPE_LABELS[to?.type ?? 'claim'].toLowerCase()}.
            {from && edgeTargetsFrom(from.type).length > 0 ? (
              <>
                {' '}
                It links to{' '}
                {edgeTargetsFrom(from.type)
                  .map((t) => `${NODE_TYPE_LABELS[t].toLowerCase()}s`)
                  .join(' or ')}
                . Try linking the other way round.
              </>
            ) : (
              <> Start links from evidence or claims instead.</>
            )}
          </div>
        )}
      </div>
    );
  }

  if (picker.kind === 'edgeEdit') {
    const edge = g.edges[picker.edgeId];
    if (!edge) return null;
    const isCI = edge.type === 'consistent_with' || edge.type === 'inconsistent_with';
    const other = edge.type === 'consistent_with' ? 'inconsistent_with' : 'consistent_with';
    return (
      <div className="overlay-pop picker" style={style}>
        <div className="title">{EDGE_TYPE_LABELS[edge.type]}</div>
        {isCI && (
          <button
            onClick={() => {
              void repo
                .createEdge(other as EdgeType, edge.from, edge.to)
                .then((e2) => maybeWorkAcrossToast(useGraphState(), e2))
                .catch(() => undefined);
              onClose();
            }}
          >
            Switch to {EDGE_TYPE_LABELS[other as EdgeType]}
          </button>
        )}
        <button
          onClick={() => {
            void repo.deleteEdge(edge.id);
            onClose();
          }}
        >
          Remove link
        </button>
      </div>
    );
  }

  const node = g.nodes[picker.nodeId];
  if (!node) return null;
  const options = retypeOptions(workflow, node.type);
  return (
    <div className="overlay-pop picker" style={style}>
      <div className="title">Retype ‘{node.text.slice(0, 30)}’ to…</div>
      {options.map((t) => (
        <button
          key={t}
          onClick={() => {
            void repo
              .retypeNode(node.id, t)
              .catch((err) => useUI.getState().showToast({ text: String(err.message ?? err) }));
            onClose();
          }}
        >
          <span className={`chip ${t}`}>{keyFor(workflow, t).toUpperCase()}</span> {NODE_TYPE_LABELS[t]}
        </button>
      ))}
    </div>
  );
}

const useGraphState = () => graphStore.getState();
