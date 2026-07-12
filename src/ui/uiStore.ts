import { create } from 'zustand';
import type { LensId } from './lenses';

export type ViewId = 'canvas' | 'stratified' | 'matrix' | 'audit' | 'killchain';

/** 'intro' = the short what-is-this card on Home; 'ach' | 'diamond' = the
    per-workflow walkthroughs that run on first entry into a thread. */
export type TourKind = 'intro' | 'ach' | 'diamond';

export type Route =
  | { screen: 'home' }
  | { screen: 'thread'; threadId: string; view: ViewId }
  | { screen: 'stats' }
  | { screen: 'wordpicture'; rootId: string };

export interface Toast {
  text: string;
  action?: { label: string; run: () => void };
}

/** Review mode (§ friend feedback): walks the six lenses in a deliberate order. */
export const REVIEW_ORDER: LensId[] = [
  'assumptions',
  'disconfirming',
  'shaky',
  'gaps',
  'attention',
  'spine',
];

interface UIState {
  route: Route;
  selectedId: string | null;
  lens: { id: LensId; hide: boolean } | null;
  queueOpen: boolean;
  ceremonyClaimId: string | null;
  toast: Toast | null;
  /** matrix row to focus after a work-across jump */
  matrixFocusEvidenceId: string | null;
  /** root threads whose briefing was dismissed this app session */
  briefingDismissed: Record<string, boolean>;
  /** guided lens walk; index into REVIEW_ORDER, null = off */
  reviewIndex: number | null;
  /** first-run tours: the home intro card, or a per-workflow walkthrough */
  tutorial: { kind: TourKind; step: number } | null;

  go: (route: Route) => void;
  openThread: (threadId: string, view?: ViewId) => void;
  setView: (view: ViewId) => void;
  select: (id: string | null) => void;
  setLens: (lens: UIState['lens']) => void;
  toggleQueue: (open?: boolean) => void;
  openCeremony: (claimId: string | null) => void;
  showToast: (toast: Toast | null) => void;
  dismissBriefing: (rootId: string) => void;
  setMatrixFocus: (evidenceId: string | null) => void;
  startReview: () => void;
  stepReview: (dir: 1 | -1) => void;
  endReview: () => void;
  setTutorial: (tutorial: UIState['tutorial']) => void;
}

export const useUI = create<UIState>((set) => ({
  route: { screen: 'home' },
  selectedId: null,
  lens: null,
  queueOpen: false,
  ceremonyClaimId: null,
  toast: null,
  matrixFocusEvidenceId: null,
  briefingDismissed: {},
  reviewIndex: null,
  tutorial: null,

  go: (route) => set({ route, selectedId: null, lens: null, toast: null, reviewIndex: null }),
  openThread: (threadId, view = 'canvas') =>
    set({ route: { screen: 'thread', threadId, view }, selectedId: null, lens: null, reviewIndex: null }),
  // switching view clears lenses (§5.3) and therefore ends a review walk
  setView: (view) =>
    set((s) =>
      s.route.screen === 'thread' ? { route: { ...s.route, view }, lens: null, reviewIndex: null } : {},
    ),
  select: (id) => set({ selectedId: id }),
  setLens: (lens) => set({ lens }),
  toggleQueue: (open) => set((s) => ({ queueOpen: open ?? !s.queueOpen })),
  openCeremony: (claimId) => set({ ceremonyClaimId: claimId }),
  showToast: (toast) => set({ toast }),
  dismissBriefing: (rootId) =>
    set((s) => ({ briefingDismissed: { ...s.briefingDismissed, [rootId]: true } })),
  setMatrixFocus: (evidenceId) => set({ matrixFocusEvidenceId: evidenceId }),

  startReview: () =>
    set({ reviewIndex: 0, lens: { id: REVIEW_ORDER[0], hide: false }, queueOpen: false }),
  stepReview: (dir) =>
    set((s) => {
      if (s.reviewIndex == null) return {};
      const next = s.reviewIndex + dir;
      if (next < 0 || next >= REVIEW_ORDER.length) return { reviewIndex: null, lens: null };
      return { reviewIndex: next, lens: { id: REVIEW_ORDER[next], hide: s.lens?.hide ?? false } };
    }),
  endReview: () => set({ reviewIndex: null, lens: null }),

  setTutorial: (tutorial) => set({ tutorial }),
}));
