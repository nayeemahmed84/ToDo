import { RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Delays unmounting of an overlay/pane/toast so CSS exit animations can play.
 */
export function useAnimatedPresence(isOpen: boolean, exitDurationMs = 200): {
  shouldRender: boolean;
  isExiting: boolean;
} {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsExiting(false);
      return;
    }
    if (!shouldRender) return;
    if (prefersReducedMotion()) {
      setIsExiting(false);
      setShouldRender(false);
      return;
    }
    setIsExiting(true);
    const timer = window.setTimeout(() => {
      setShouldRender(false);
      setIsExiting(false);
    }, exitDurationMs);
    return () => window.clearTimeout(timer);
  }, [isOpen, exitDurationMs, shouldRender]);

  return { shouldRender, isExiting };
}

/**
 * Keeps the last non-null value around while an exit animation is playing.
 */
export function useRetainedValue<T>(value: T | null, shouldRender: boolean): T | null {
  const retainedRef = useRef<T | null>(value);
  if (value !== null) {
    retainedRef.current = value;
  } else if (!shouldRender) {
    retainedRef.current = null;
  }
  return value ?? (shouldRender ? retainedRef.current : null);
}

/**
 * Lightweight FLIP animation for reordered/filtered list items tagged with `data-flip-id`.
 */
export function useFlipList(
  containerRef: RefObject<HTMLElement | null>,
  depsKey: string
): void {
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const prevDepsRef = useRef<string>(depsKey);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const children = Array.from(container.querySelectorAll<HTMLElement>('[data-flip-id]'));
    const nextRects = new Map<string, DOMRect>();
    for (const el of children) {
      const id = el.dataset.flipId;
      if (id) nextRects.set(id, el.getBoundingClientRect());
    }

    if (prevDepsRef.current !== depsKey && !prefersReducedMotion()) {
      for (const el of children) {
        const id = el.dataset.flipId;
        if (!id) continue;
        if (el.classList.contains('dragging') || el.classList.contains('sand-dissolve')) continue;
        const prev = prevRectsRef.current.get(id);
        const next = nextRects.get(id);
        if (!prev || !next) continue;
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

        el.style.transition = 'none';
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        el.getBoundingClientRect();
        el.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = 'translate3d(0, 0, 0)';

        const cleanup = () => {
          el.style.transition = '';
          el.style.transform = '';
          el.removeEventListener('transitionend', cleanup);
        };
        el.addEventListener('transitionend', cleanup);
      }
    }

    prevRectsRef.current = nextRects;
    prevDepsRef.current = depsKey;
  }, [containerRef, depsKey]);
}

/**
 * Wraps state updates in the native View Transitions API when supported.
 */
export function runViewTransition(update: () => void): void {
  if (prefersReducedMotion()) {
    update();
    return;
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (typeof doc.startViewTransition === 'function') {
    try {
      doc.startViewTransition(update);
      return;
    } catch {
      // Fall back to synchronous update if a transition is already active or unsupported.
    }
  }
  update();
}
