import { create } from 'zustand';
import type { LensId } from './lenses';

export type ViewId = 'canvas' | 'stratified' | 'matrix' | 'audit';

export type Route =
  | { screen: 'home' }
  | { screen: 'thread'; threadId: string; view: ViewId }
  | { screen: 'stats' }
  | { screen: 'wordpicture'; rootId: string };

export interface Toast {
  text: string;
  action?: { label: string; run: () => void };
}

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

  go: (route) => set({ route, selectedId: null, lens: null, toast: null }),
  openThread: (threadId, view = 'canvas') =>
    set({ route: { screen: 'thread', threadId, view }, selectedId: null, lens: null }),
  // switching view clears lenses (§5.3)
  setView: (view) =>
    set((s) =>
      s.route.screen === 'thread' ? { route: { ...s.route, view }, lens: null } : {},
    ),
  select: (id) => set({ selectedId: id }),
  setLens: (lens) => set({ lens }),
  toggleQueue: (open) => set((s) => ({ queueOpen: open ?? !s.queueOpen })),
  openCeremony: (claimId) => set({ ceremonyClaimId: claimId }),
  showToast: (toast) => set({ toast }),
  dismissBriefing: (rootId) =>
    set((s) => ({ briefingDismissed: { ...s.briefingDismissed, [rootId]: true } })),
  setMatrixFocus: (evidenceId) => set({ matrixFocusEvidenceId: evidenceId }),
}));
