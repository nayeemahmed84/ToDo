import type { CSSProperties } from 'react';

export const EDGE_SWIPE_ZONE_PX = 28;
export const EDGE_SWIPE_MAX_DISTANCE_PX = 140;
export const EDGE_SWIPE_COMMIT_DISTANCE_PX = 60;

export type PredictiveBackDirection = 1 | -1;
export type PredictiveBackTarget = 'settings' | 'shortcuts' | 'main' | null;

export interface MobileBackNavState {
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  taskDatePickerOpen: boolean;
  contextMenuOpen: boolean;
  selectedCount: number;
  selectedItemId: string | null;
  mobileView: 'home' | 'list' | 'search';
}

export type MobileBackAction =
  | 'close-settings'
  | 'close-shortcuts'
  | 'close-date-picker'
  | 'close-context-menu'
  | 'clear-selection'
  | 'close-detail'
  | 'go-home'
  | 'none';

/**
 * Resolves the single top-most mobile navigation level to dismiss on back.
 */
export function resolveMobileBackAction(state: MobileBackNavState): MobileBackAction {
  if (state.settingsOpen) return 'close-settings';
  if (state.shortcutsOpen) return 'close-shortcuts';
  if (state.taskDatePickerOpen) return 'close-date-picker';
  if (state.contextMenuOpen) return 'close-context-menu';
  if (state.selectedCount > 0) return 'clear-selection';
  if (state.selectedItemId !== null) return 'close-detail';
  if (state.mobileView !== 'home') return 'go-home';
  return 'none';
}

/**
 * Identifies which visual surface should respond to an interactive edge-swipe.
 */
export function resolveEdgeSwipeTarget(state: MobileBackNavState): PredictiveBackTarget {
  if (state.settingsOpen) return 'settings';
  if (state.shortcutsOpen) return 'shortcuts';
  if (state.selectedItemId !== null || state.mobileView !== 'home') return 'main';
  return null;
}

/**
 * Detects whether a touch starts inside a screen edge back-gesture zone.
 * Returns `1` for left-edge swipe right, `-1` for right-edge swipe left, or `null`.
 */
export function detectEdgeSwipeStart(
  clientX: number,
  viewportWidth: number,
  allowRightEdge: boolean
): PredictiveBackDirection | null {
  if (clientX <= EDGE_SWIPE_ZONE_PX) return 1;
  if (allowRightEdge && viewportWidth > 0 && clientX >= viewportWidth - EDGE_SWIPE_ZONE_PX) {
    return -1;
  }
  return null;
}

/**
 * Computes normalized predictive-back progress in [0, 1] for an active edge drag.
 */
export function computePredictiveBackProgress(
  dx: number,
  dy: number,
  direction: PredictiveBackDirection
): number {
  const inward = dx * direction;
  if (inward > 8 && Math.abs(inward) > Math.abs(dy) * 1.2) {
    return Math.min(1, inward / EDGE_SWIPE_MAX_DISTANCE_PX);
  }
  return 0;
}

/**
 * Returns true when the edge swipe traveled far enough horizontally to commit back navigation.
 */
export function shouldCommitPredictiveBack(
  dx: number,
  dy: number,
  direction: PredictiveBackDirection
): boolean {
  const inward = dx * direction;
  return inward > EDGE_SWIPE_COMMIT_DISTANCE_PX && Math.abs(inward) > Math.abs(dy) * 1.5;
}

/**
 * Builds Material 3-inspired predictive back transform styles for a foreground surface.
 */
export function getPredictiveBackSurfaceStyle(
  progress: number,
  direction: PredictiveBackDirection,
  options?: {
    maxTranslateX?: number;
    minScale?: number;
    maxRadiusPx?: number;
  }
): CSSProperties {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0) return {};

  const maxTranslateX = options?.maxTranslateX ?? 36;
  const minScale = options?.minScale ?? 0.92;
  const maxRadiusPx = options?.maxRadiusPx ?? 24;

  const translateX = Math.round(direction * clamped * maxTranslateX);
  const scale = Number((1 - clamped * (1 - minScale)).toFixed(4));
  const radius = Math.round(clamped * maxRadiusPx);

  return {
    transform: `translate3d(${translateX}px, 0, 0) scale(${scale})`,
    transformOrigin: direction === 1 ? 'right center' : 'left center',
    borderRadius: `${radius}px`,
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.32)',
    transition: 'none',
    willChange: 'transform, border-radius',
  };
}

/**
 * Builds backdrop dimming feedback styles during a predictive back drag.
 */
export function getPredictiveBackBackdropStyle(progress: number): CSSProperties {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0) return {};

  return {
    opacity: Number(Math.max(0.2, 1 - clamped * 0.65).toFixed(3)),
    transition: 'none',
  };
}
