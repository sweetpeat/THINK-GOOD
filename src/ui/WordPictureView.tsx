// In-app read-only rendering of the word-picture (§5.8), exportable as Markdown.

import { useMemo } from 'react';
import { useGraph } from './useGraph';
import { useUI } from './uiStore';
import { buildWordPicture, wordPictureMarkdown } from '../export/wordPicture';
import { download, slugify } from '../export/download';

export function WordPictureView({ rootId }: { rootId: string }) {
  const g = useGraph();
  const openThread = useUI((s) => s.openThread);
  const blocks = useMemo(() => buildWordPicture(g, rootId), [g, rootId]);
  const rootText = g.nodes[rootId]?.text ?? 'word-picture';

  return (
    <div className="prose-page">
      <div className="toolbar-row">
        <button className="btn" onClick={() => openThread(rootId)}>
          ← Back to canvas
        </button>
        <button
          className="btn primary"
          onClick={() => download(`${slugify(rootText)}.md`, wordPictureMarkdown(blocks), 'text/markdown')}
        >
          Export Markdown
        </button>
      </div>
      <div className="sheet">
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
                <h2>{b.strong}</h2>
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
      </div>
    </div>
  );
}
