// Review mode (friend feedback #4): walks the six lenses in a deliberate
// order — assumptions → disconfirming → shaky → gaps → attention → spine.
// A floating strip drives it; Esc or End clears. Lenses stay non-destructive.

import { useUI, REVIEW_ORDER } from './uiStore';
import { lensById } from './lenses';

const REVIEW_BLURBS: Record<string, string> = {
  assumptions: 'Is each one still Supported, Caveated, or Unsupported? Linchpins deserve extra doubt.',
  disconfirming: 'Only the evidence that contradicts something. If this view is empty, no disconfirmation has been attempted.',
  shaky: 'Claims whose weakest input is an unsupported assumption or a stale node — shore these up or caveat them.',
  gaps: 'Open questions with priority or sitting among competing claims — candidates for collection.',
  attention: 'Everything stale, in place. Affirm or revisit each (the Queue lists the same items).',
  spine: 'Your adopted judgements and their questions — the through-line a reader will follow.',
};

export function ReviewStrip() {
  const { reviewIndex, stepReview, endReview, route } = useUI();
  if (reviewIndex == null || route.screen !== 'thread') return null;
  if (route.view !== 'canvas' && route.view !== 'stratified') return null;

  const lensId = REVIEW_ORDER[reviewIndex];
  const lens = lensById(lensId);
  const last = reviewIndex === REVIEW_ORDER.length - 1;

  return (
    <div className="review-strip" role="status">
      <span className="review-count mono">
        Review {reviewIndex + 1}/{REVIEW_ORDER.length}
      </span>
      <span className="review-text">
        <b>{lens.label}</b> — {REVIEW_BLURBS[lensId]}
      </span>
      <span className="review-actions">
        {reviewIndex > 0 && (
          <button className="btn small" onClick={() => stepReview(-1)}>
            ← Back
          </button>
        )}
        <button className="btn small primary" onClick={() => (last ? endReview() : stepReview(1))}>
          {last ? 'Done' : 'Next →'}
        </button>
        <button className="btn small" onClick={endReview} title="End review (Esc)">
          ✕
        </button>
      </span>
    </div>
  );
}
