// Keyboard-first node creation (§5.1): Q/C/A/E opens this form at the cursor.
// Enter commits from any field (captureMs = keypress→commit); Esc cancels;
// Tab cycles into the type's judgement dropdowns — every one skippable.

import { useRef, useState } from 'react';
import * as repo from '../model/repo';
import type { AnyNode, NodeType } from '../model/types';
import {
  CONFIDENCE_LABELS,
  CREDIBILITY_LABELS,
  LIKELIHOOD_LABELS,
  NODE_TYPE_LABELS,
  RELIABILITY_LABELS,
  VALIDITY_LABELS,
} from '../model/labels';
import { useUI } from './uiStore';

export interface CreateFormState {
  type: NodeType;
  svgX: number;
  svgY: number;
  openedAt: number;
}

const INLINE_FIELDS: Record<NodeType, { field: string; label: string; options: [string, string][] }[]> = {
  question: [],
  claim: [
    { field: 'likelihood', label: 'Likelihood', options: Object.entries(LIKELIHOOD_LABELS) },
    { field: 'confidence', label: 'Confidence', options: Object.entries(CONFIDENCE_LABELS) },
  ],
  assumption: [
    { field: 'validity', label: 'Validity', options: Object.entries(VALIDITY_LABELS) },
  ],
  evidence: [
    { field: 'sourceReliability', label: 'Source reliability', options: Object.entries(RELIABILITY_LABELS) },
    {
      field: 'infoCredibility',
      label: 'Info credibility',
      options: Object.entries(CREDIBILITY_LABELS).map(([k, v]) => [k, v] as [string, string]),
    },
  ],
};

export function InlineCreateForm({
  form,
  screen,
  threadId,
  onDone,
}: {
  form: CreateFormState;
  screen: { x: number; y: number };
  threadId: string;
  onDone: (created: AnyNode | null) => void;
}) {
  const [text, setText] = useState('');
  const [judgements, setJudgements] = useState<Record<string, unknown>>({});
  const busy = useRef(false);

  const commit = async () => {
    if (busy.current) return;
    if (!text.trim()) return onDone(null);
    busy.current = true;
    try {
      const created = await repo.createNode({
        threadId,
        type: form.type,
        text,
        x: form.svgX,
        y: form.svgY,
        captureMs: Math.round(performance.now() - form.openedAt),
        judgements,
      });
      onDone(created);
    } catch (err) {
      useUI.getState().showToast({ text: String((err as Error).message ?? err) });
      busy.current = false;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onDone(null);
    }
    e.stopPropagation();
  };

  const fields = INLINE_FIELDS[form.type];

  return (
    <div
      className="overlay-pop"
      style={{ left: Math.max(8, screen.x), top: Math.max(8, screen.y) }}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="row">
        <span className={`chip ${form.type}`}>{NODE_TYPE_LABELS[form.type]}</span>
        <input
          type="text"
          autoFocus
          placeholder={form.type === 'question' ? 'What needs answering?' : `New ${form.type}…`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {fields.length > 0 && (
        <div className="judgements">
          {fields.map(({ field, label, options }) => (
            <label key={field}>
              {label}
              <select
                className={`judgement${judgements[field] == null ? ' undeclared' : ''}`}
                value={String(judgements[field] ?? '')}
                onChange={(e) => {
                  const raw = e.target.value;
                  const value =
                    raw === '' ? null : field === 'infoCredibility' ? Number(raw) : raw;
                  setJudgements((j) => ({ ...j, [field]: value }));
                }}
              >
                <option value="">— undeclared</option>
                {options.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 6 }}>
        <span className="hint">
          <kbd>Enter</kbd> create · <kbd>Tab</kbd> grade inline · <kbd>Esc</kbd> cancel
        </span>
      </div>
    </div>
  );
}
