import { describe, expect, it } from 'vitest';
import {
  computePredictiveBackProgress,
  detectEdgeSwipeStart,
  getPredictiveBackBackdropStyle,
  getPredictiveBackSurfaceStyle,
  resolveEdgeSwipeTarget,
  resolveMobileBackAction,
  shouldCommitPredictiveBack,
  type MobileBackNavState,
} from '../src/lib/predictiveBack';

const baseState: MobileBackNavState = {
  settingsOpen: false,
  shortcutsOpen: false,
  taskDatePickerOpen: false,
  contextMenuOpen: false,
  selectedCount: 0,
  selectedItemId: null,
  mobileView: 'home',
};

describe('mobile predictive back navigation', () => {
  it('closes settings or shortcuts one level before lower views', () => {
    expect(
      resolveMobileBackAction({ ...baseState, settingsOpen: true })
    ).toBe('close-settings');

    expect(
      resolveMobileBackAction({ ...baseState, settingsOpen: true, mobileView: 'list', selectedItemId: 't1' })
    ).toBe('close-settings');

    expect(
      resolveMobileBackAction({ ...baseState, shortcutsOpen: true })
    ).toBe('close-shortcuts');

    expect(
      resolveMobileBackAction({ ...baseState, shortcutsOpen: true, mobileView: 'list' })
    ).toBe('close-shortcuts');

    expect(
      resolveMobileBackAction({ ...baseState, mobileView: 'list' })
    ).toBe('go-home');

    expect(resolveMobileBackAction(baseState)).toBe('none');
  });

  it('targets settings and shortcuts surfaces for interactive edge swipes', () => {
    expect(resolveEdgeSwipeTarget({ ...baseState, settingsOpen: true })).toBe('settings');
    expect(resolveEdgeSwipeTarget({ ...baseState, shortcutsOpen: true })).toBe('shortcuts');
    expect(resolveEdgeSwipeTarget({ ...baseState, mobileView: 'list' })).toBe('main');
    expect(resolveEdgeSwipeTarget(baseState)).toBeNull();
  });

  it('detects left-edge and right-edge gesture starts appropriately', () => {
    expect(detectEdgeSwipeStart(12, 390, false)).toBe(1);
    expect(detectEdgeSwipeStart(380, 390, false)).toBeNull();
    expect(detectEdgeSwipeStart(380, 390, true)).toBe(-1);
    expect(detectEdgeSwipeStart(200, 390, true)).toBeNull();
  });

  it('computes normalized predictive-back progress and commit threshold for both edges', () => {
    // Left-edge swipe right
    expect(computePredictiveBackProgress(70, 5, 1)).toBeCloseTo(0.5, 2);
    expect(computePredictiveBackProgress(200, 5, 1)).toBe(1);
    expect(computePredictiveBackProgress(40, 50, 1)).toBe(0);
    expect(shouldCommitPredictiveBack(70, 10, 1)).toBe(true);
    expect(shouldCommitPredictiveBack(40, 5, 1)).toBe(false);

    // Right-edge swipe left
    expect(computePredictiveBackProgress(-70, 5, -1)).toBeCloseTo(0.5, 2);
    expect(shouldCommitPredictiveBack(-70, 10, -1)).toBe(true);
    expect(shouldCommitPredictiveBack(70, 10, -1)).toBe(false);
  });

  it('produces predictive back scale, translation, radius, and backdrop dimming styles', () => {
    expect(getPredictiveBackSurfaceStyle(0, 1)).toEqual({});
    expect(getPredictiveBackBackdropStyle(0)).toEqual({});

    const leftSwipeStyle = getPredictiveBackSurfaceStyle(0.5, 1);
    expect(leftSwipeStyle.transform).toBe('translate3d(18px, 0, 0) scale(0.96)');
    expect(leftSwipeStyle.transformOrigin).toBe('right center');
    expect(leftSwipeStyle.borderRadius).toBe('12px');

    const rightSwipeStyle = getPredictiveBackSurfaceStyle(1, -1);
    expect(rightSwipeStyle.transform).toBe('translate3d(-36px, 0, 0) scale(0.92)');
    expect(rightSwipeStyle.transformOrigin).toBe('left center');
    expect(rightSwipeStyle.borderRadius).toBe('24px');

    const backdropStyle = getPredictiveBackBackdropStyle(1);
    expect(backdropStyle.opacity).toBe(0.35);
  });
});
