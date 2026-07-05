// Global frame (§5.0): breadcrumb · view switcher · queue badge, lens menu,
// export menu.

import { useEffect, useRef, useState } from 'react';
import * as repo from '../model/repo';
import { useGraph } from './useGraph';
import { useUI, type ViewId } from './uiStore';
import { queue, threadAncestry } from '../model/derive';
import { LENSES } from './lenses';
import { buildShareHtml } from '../export/shareFile';
import { download, slugify } from '../export/download';

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'stratified', label: 'Stratified' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'audit', label: 'Audit' },
];

function useClickAway(onAway: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway();
    };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  });
  return ref;
}

export function TopBar({ threadId, view }: { threadId: string; view: ViewId }) {
  const g = useGraph();
  const { go, openThread, setView, lens, setLens, toggleQueue, queueOpen } = useUI();
  const [openMenu, setOpenMenu] = useState<'lens' | 'export' | null>(null);
  const menuRef = useClickAway(() => setOpenMenu(null));

  const crumbs = threadAncestry(g, threadId);
  const rootId = crumbs[0]?.id ?? threadId;
  const qItems = queue(g, rootId);

  return (
    <header className="topbar">
      <nav className="crumbs">
        <a onClick={() => go({ screen: 'home' })}>Home</a>
        {crumbs.map((q, i) => (
          <span key={q.id} style={{ display: 'contents' }}>
            <span style={{ color: 'var(--faint)' }}>/</span>
            {i === crumbs.length - 1 ? (
              <a className="here">{q.text}</a>
            ) : (
              <a onClick={() => openThread(q.id)}>{q.text}</a>
            )}
          </span>
        ))}
      </nav>

      <div className="view-switch" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            className={view === v.id ? 'active' : undefined}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="right" ref={menuRef}>
        <button
          className={`queue-badge${qItems.length ? ' hot' : ''}`}
          onClick={() => toggleQueue()}
          aria-pressed={queueOpen}
          title="Stale judgements needing attention"
        >
          Queue <span className="count">{qItems.length}</span>
        </button>

        <div className="menu-wrap">
          <button className="btn" onClick={() => setOpenMenu(openMenu === 'lens' ? null : 'lens')}>
            Lens{lens ? ` · ${LENSES.find((l) => l.id === lens.id)?.label.split(' ')[0]}` : ''} ▾
          </button>
          {openMenu === 'lens' && (
            <div className="menu">
              {LENSES.map((l) => (
                <button
                  key={l.id}
                  className={lens?.id === l.id ? 'active' : undefined}
                  onClick={() => {
                    setLens(lens?.id === l.id ? null : { id: l.id, hide: lens?.hide ?? false });
                    setOpenMenu(null);
                  }}
                >
                  {l.label}
                </button>
              ))}
              <hr />
              <button onClick={() => lens && setLens({ ...lens, hide: !lens.hide })}>
                {lens?.hide ? '✓ ' : ''}Hide non-matching (instead of dim)
              </button>
              {lens && <button onClick={() => setLens(null)}>Clear lens (Esc)</button>}
              <div className="menu-note">Lenses never edit — they only dim or hide.</div>
            </div>
          )}
        </div>

        <div className="menu-wrap">
          <button className="btn" onClick={() => setOpenMenu(openMenu === 'export' ? null : 'export')}>
            Export ▾
          </button>
          {openMenu === 'export' && (
            <div className="menu">
              <button
                onClick={() => {
                  go({ screen: 'wordpicture', rootId });
                  setOpenMenu(null);
                }}
              >
                Word-picture
              </button>
              <button
                onClick={() => {
                  const html = buildShareHtml(g, rootId);
                  download(`${slugify(g.nodes[rootId]?.text ?? 'share')}.html`, html, 'text/html');
                  setOpenMenu(null);
                }}
              >
                Share file (.html)
              </button>
              <button
                onClick={() => {
                  download(
                    `reasoning-canvas-backup-${new Date().toISOString().slice(0, 10)}.rcanvas.json`,
                    JSON.stringify(repo.exportSnapshot(), null, 2),
                    'application/json',
                  );
                  setOpenMenu(null);
                }}
              >
                JSON backup (.rcanvas.json)
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
