/**
 * @vitest-environment happy-dom
 */
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isStackedLayoutWidth, STACKED_LAYOUT_MAX_WIDTH_PX, useStackedLayout } from './useStackedLayout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useStackedLayout', () => {
  let container: HTMLDivElement;
  let root: Root;
  let resizeCallback: ResizeObserverCallback | undefined;
  let observed: Element | undefined;
  const disconnect = vi.fn();
  let initialWidth = 0;

  beforeEach(() => {
    resizeCallback = undefined;
    observed = undefined;
    disconnect.mockReset();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          resizeCallback = cb;
        }
        observe(el: Element) {
          observed = el;
        }
        unobserve() {}
        disconnect() {
          disconnect();
        }
      },
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ width: initialWidth, height: 600, x: 0, y: 0, top: 0, left: 0, right: initialWidth, bottom: 600, toJSON() {} }),
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function Probe() {
    const ref = useRef<HTMLDivElement | null>(null);
    const stacked = useStackedLayout(ref);
    return <div ref={ref} data-layout={stacked ? 'stacked' : 'split'} />;
  }

  const layout = () => container.querySelector('[data-layout]')?.getAttribute('data-layout');
  const resizeTo = (width: number) =>
    act(() => {
      resizeCallback?.([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    });

  it('decides the layout from the first measurement', () => {
    initialWidth = 390;
    act(() => root.render(<Probe />));
    expect(layout()).toBe('stacked');
  });

  it('follows the container across the 640px breakpoint and observes the container', () => {
    initialWidth = 1175;
    act(() => root.render(<Probe />));
    expect(layout()).toBe('split');
    expect(observed).toBe(container.firstElementChild);
    resizeTo(500);
    expect(layout()).toBe('stacked');
    resizeTo(STACKED_LAYOUT_MAX_WIDTH_PX);
    expect(layout()).toBe('split');
  });

  it('disconnects the observer on unmount', () => {
    initialWidth = 900;
    act(() => root.render(<Probe />));
    act(() => root.render(<></>));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('keeps the split layout before the container has a width', () => {
    expect(isStackedLayoutWidth(0)).toBe(false);
    expect(isStackedLayoutWidth(Number.NaN)).toBe(false);
    expect(isStackedLayoutWidth(639)).toBe(true);
  });
});
