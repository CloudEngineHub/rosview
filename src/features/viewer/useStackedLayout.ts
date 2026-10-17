import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/** Container width (px) below which the sidebar stacks under the panels. */
export const STACKED_LAYOUT_MAX_WIDTH_PX = 640;

export function isStackedLayoutWidth(width: number): boolean {
  return Number.isFinite(width) && width > 0 && width < STACKED_LAYOUT_MAX_WIDTH_PX;
}

export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Narrow hosts (phones, split panes) stack the sidebar under the panels so the
 * panels and the playback bar keep the full width. Driven by the container
 * width, not the window, because the viewer is usually embedded. Measured in
 * a layout effect so the first paint already has the right layout.
 *
 * @param remeasureKey change it when the observed element is replaced
 */
export function useStackedLayout(ref: RefObject<HTMLElement | null>, remeasureKey?: unknown): boolean {
  const [stacked, setStacked] = useState(false);
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    setStacked(isStackedLayoutWidth(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setStacked(isStackedLayoutWidth(entry.contentRect.width));
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref, remeasureKey]);
  return stacked;
}
