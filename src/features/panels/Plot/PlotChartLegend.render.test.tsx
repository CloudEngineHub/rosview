/**
 * @vitest-environment happy-dom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRosViewMessages } from '@/shared/intl/loadRosViewMessages';
import { defaultPlotConfig, type PlotConfig } from './defaults';
import { PlotChartLegend } from './PlotChartLegend';
import { clearPlotLegendEntries, setPlotLegendEntries } from './plotPanelRuntimeStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PANEL = 'legend-render-test';
const LONG = `observation.state.${'very_long_segment.'.repeat(30)}joint_1`;

describe('PlotChartLegend rendering', () => {
  let container: HTMLDivElement;
  let root: Root;
  let config: PlotConfig;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    config = defaultPlotConfig();
    setPlotLegendEntries(PANEL, [
      { key: 'a', label: 'action.joint_1', color: '#111111' },
      { key: 'b', label: 'observation.state.joint_1', color: '#222222' },
      { key: 'c', label: LONG, color: '#333333' },
    ]);
  });

  afterEach(() => {
    act(() => root.unmount());
    clearPlotLegendEntries(PANEL);
    container.remove();
  });

  function render() {
    act(() => {
      root.render(
        <IntlProvider locale="en" messages={getRosViewMessages('en')}>
          <PlotChartLegend
            panelId={PANEL}
            config={config}
            setConfig={(next) => {
              config = typeof next === 'function' ? next(config) : next;
            }}
          />
        </IntlProvider>,
      );
    });
  }

  it('renders full names; fitting items carry no truncation or equal-width classes', () => {
    render();
    const items = [...container.querySelectorAll('[data-testid="plot-legend-item"]')];
    expect(items).toHaveLength(3);
    for (const text of ['action.joint_1', 'observation.state.joint_1']) {
      const btn = container.querySelector(`button[title="${text}"]`);
      expect(btn?.textContent).toBe(text);
      expect(btn?.className).not.toMatch(/truncate|flex-1/);
      expect(btn?.closest('[data-testid="plot-legend-item"]')?.className).not.toMatch(/truncate|flex-1/);
    }
    // Item list wraps by content instead of using equal-width grid columns.
    const list = items[0]?.parentElement as HTMLElement;
    expect(list.className).toContain('flex-wrap');
    expect(list.style.display).not.toBe('grid');
    // The one overflowing name keeps its full text in a title and is clamped to the panel width.
    const long = container.querySelector(`button[title="${LONG}"]`);
    expect(long?.textContent).toBe(LONG);
    expect(long?.querySelector('[data-testid="plot-legend-label"]')?.className).toContain('max-w-full');
  });

  it('keeps the visible/hidden toggle working', () => {
    render();
    const btn = container.querySelector('button[title="action.joint_1"]') as HTMLButtonElement;
    act(() => btn.click());
    expect(config.hiddenLegendKeys).toEqual(['a']);
  });
});
