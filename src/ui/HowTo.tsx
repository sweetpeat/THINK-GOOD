// Permanently-open reference legend, pinned to the bottom of the right panel.
// Static text: the vocabulary of the tool (node types, edge types), the four
// views, and the six lenses. Never reacts to selection — it's a legend you can
// always read while you work.

const NODE_ROWS: { chip: string; cls: string; text: string }[] = [
  { chip: 'Q', cls: 'question', text: 'Question — what you’re trying to answer. Anchors a canvas; sub-questions nest inside.' },
  { chip: 'C', cls: 'claim', text: 'Claim — a candidate answer. Carries a likelihood and your confidence; can be adopted.' },
  { chip: 'A', cls: 'assumption', text: 'Assumption — something taken as given. Has a validity; a keystone marks a linchpin.' },
  { chip: 'E', cls: 'evidence', text: 'Evidence — an observation, graded on the Admiralty scale (e.g. B2).' },
];

const EDGE_ROWS: { name: string; dir: string; text: string }[] = [
  { name: 'consistent with', dir: 'evidence → claim', text: 'the evidence fits the claim' },
  { name: 'inconsistent with', dir: 'evidence → claim', text: 'the evidence is hard to square with the claim' },
  { name: 'rests on', dir: 'claim → assumption', text: 'the claim depends on the assumption' },
  { name: 'answers', dir: 'claim → question', text: 'the claim is a candidate answer' },
];

const VIEW_ROWS: { name: string; text: string }[] = [
  { name: 'Canvas', text: 'Freeform capture. Your node positions are yours and mean nothing to the machine.' },
  { name: 'Stratified', text: 'The same nodes in bands — Question, Claims, Assumptions, then a waterline above Evidence. Each claim is captioned with its weakest input.' },
  { name: 'Matrix', text: 'ACH grid over a set of rival claims. Cells mark evidence as consistent (C) or inconsistent (I); rows that fit every claim grey out as non-diagnostic.' },
  { name: 'Audit', text: 'The full append-only log, newest first — every act on the record, filterable by node.' },
];

const LENS_ROWS: { name: string; text: string }[] = [
  { name: 'Assumptions', text: 'Just the assumptions, each captioned with its validity and linchpin status.' },
  { name: 'Spine / Answers', text: 'The adopted claims and the questions they answer — your through-line.' },
  { name: 'Gaps', text: 'Open questions that have a priority or sit among competing claims.' },
  { name: 'Disconfirming only', text: 'Evidence that contradicts something, plus its inconsistent-with links.' },
  { name: 'On shaky ground', text: 'Claims whose weakest input is an unsupported assumption or a stale node.' },
  { name: 'Needs attention', text: 'Everything stale — mirrors the queue, laid out in place.' },
];

export function HowTo() {
  return (
    <section className="howto" aria-label="How to">
      <h2 className="howto-title">How to</h2>
      <div className="howto-scroll">
        <h3>Nodes</h3>
        <p className="howto-lead">Four kinds of thought, each a colour and a glyph. Press its key on the canvas to create one.</p>
        <ul className="howto-nodes">
          {NODE_ROWS.map((r) => (
            <li key={r.chip}>
              <span className={`chip ${r.cls}`}>{r.chip}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
        <p className="howto-note">
          Solid fill = adopted claim · hatched border = stale (undeclared or undermined) ·
          keystone = linchpin · chain-link = promoted from a sub-thread.
        </p>

        <h3>Edges</h3>
        <p className="howto-lead">
          Links flow one way, so start from the right end — drag the ⊕ handle, or select a node
          and press <kbd>L</kbd>.
        </p>
        <ul className="howto-edges">
          {EDGE_ROWS.map((r) => (
            <li key={r.name}>
              <span className="howto-edge-name mono">{r.name}</span>
              <span className="howto-edge-dir mono">{r.dir}</span>
              <span className="howto-edge-text">{r.text}</span>
            </li>
          ))}
        </ul>

        <h3>Views</h3>
        <p className="howto-lead">One graph, four renderings. Switching never changes data.</p>
        <ul className="howto-defs">
          {VIEW_ROWS.map((r) => (
            <li key={r.name}>
              <b>{r.name}</b> — {r.text}
            </li>
          ))}
        </ul>

        <h3>Lenses</h3>
        <p className="howto-lead">
          Ephemeral filters over the current view — they dim or hide, never edit. <kbd>Esc</kbd>{' '}
          clears. The <b>Review</b> button walks all six in order.
        </p>
        <ul className="howto-defs">
          {LENS_ROWS.map((r) => (
            <li key={r.name}>
              <b>{r.name}</b> — {r.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
