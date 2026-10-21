import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { useIntl } from 'react-intl';
import type { PlotConfig } from './defaults';
import {
  isPlotLegendVisible,
  setOnlyPlotLegendVisible,
  setPlotLegendGroupVisible,
  setPlotLegendVisible,
  visiblePlotLegendCount,
} from './plotLegendVisibility';
import { usePlotLegendEntries, type PlotLegendEntry } from './plotPanelRuntimeStore';

const COLLAPSED_LIMIT = 1;
const SEARCH_THRESHOLD = 8;

interface PlotChartLegendProps {
  panelId: string;
  config: PlotConfig;
  setConfig: (next: PlotConfig | ((prev: PlotConfig) => PlotConfig)) => void;
}

function stopPanelInteraction(event: React.SyntheticEvent) {
  event.stopPropagation();
}

export function filterPlotLegendEntries(
  entries: readonly PlotLegendEntry[],
  query: string,
): PlotLegendEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...entries];
  return entries.filter((entry) => entry.label.toLowerCase().includes(needle));
}

export function collapsedPlotLegendEntries(
  entries: readonly PlotLegendEntry[],
  hiddenKeys: readonly string[],
  limit = COLLAPSED_LIMIT,
): PlotLegendEntry[] {
  const visible = entries.filter((entry) => isPlotLegendVisible(hiddenKeys, entry.key));
  const hidden = entries.filter((entry) => !isPlotLegendVisible(hiddenKeys, entry.key));
  return [...visible, ...hidden].slice(0, limit);
}

function LegendRow({
  entry,
  visible,
  onToggle,
  onOnly,
  showOnlyAction,
}: {
  entry: PlotLegendEntry;
  visible: boolean;
  onToggle: () => void;
  onOnly?: () => void;
  showOnlyAction?: boolean;
}): React.ReactNode {
  const { formatMessage } = useIntl();
  return (
    <div
      className={`flex max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 ${visible ? '' : 'opacity-55'}`}
      data-testid="plot-legend-item"
    >
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent"
        onClick={onToggle}
        title={formatMessage({
          id: visible ? 'panels.plot.legend.hideCurve' : 'panels.plot.legend.showCurve',
        })}
        aria-label={formatMessage({
          id: visible ? 'panels.plot.legend.hideCurve' : 'panels.plot.legend.showCurve',
        })}
      >
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-sm ring-1 ring-border/60"
        style={{ backgroundColor: entry.color }}
        aria-hidden
      />
      <button
        type="button"
        className="min-w-0 max-w-full text-left text-[11px] leading-tight text-foreground hover:underline"
        onClick={onToggle}
        title={entry.label}
      >
        <span className="block max-w-full truncate" data-testid="plot-legend-label">
          {entry.label}
        </span>
      </button>
      {showOnlyAction && onOnly && (
        <button
          type="button"
          className="shrink-0 rounded px-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onOnly}
          title={formatMessage({ id: 'panels.plot.legend.onlyThis' })}
        >
          {formatMessage({ id: 'panels.plot.legend.only' })}
        </button>
      )}
      {!showOnlyAction && (
        <span className="invisible shrink-0 rounded px-1 text-[10px]" aria-hidden>
          {formatMessage({ id: 'panels.plot.legend.only' })}
        </span>
      )}
    </div>
  );
}

export function PlotChartLegend({
  panelId,
  config,
  setConfig,
}: PlotChartLegendProps): React.ReactNode {
  const { formatMessage } = useIntl();
  const entries = usePlotLegendEntries(panelId);
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => filterPlotLegendEntries(entries, query), [entries, query]);
  const hiddenKeys = config.hiddenLegendKeys;
  const allKeys = useMemo(() => entries.map((entry) => entry.key), [entries]);
  const visibleCount = visiblePlotLegendCount(entries, hiddenKeys);

  if (entries.length <= 1) return null;

  const setHiddenKeys = (next: string[]) => {
    setConfig((prev) => ({ ...prev, hiddenLegendKeys: next }));
  };

  const toggleEntry = (entry: PlotLegendEntry) => {
    setHiddenKeys(setPlotLegendVisible(hiddenKeys, entry.key, !isPlotLegendVisible(hiddenKeys, entry.key)));
  };

  const showOnly = (entry: PlotLegendEntry) => {
    setHiddenKeys(setOnlyPlotLegendVisible(hiddenKeys, allKeys, entry.key));
  };

  const showTools = entries.length > SEARCH_THRESHOLD;

  return (
    <div
      className="flex max-h-[45%] shrink-0 flex-col border-t border-border bg-card/60 text-foreground"
      data-testid="plot-legend"
      onClick={stopPanelInteraction}
      onDoubleClick={stopPanelInteraction}
      onPointerDown={stopPanelInteraction}
      onWheel={stopPanelInteraction}
    >
      <div className="flex shrink-0 items-center gap-2 px-2 py-0.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
          {formatMessage(
            { id: 'panels.plot.legend.visibleCount' },
            { visible: visibleCount, total: entries.length },
          )}
        </span>
        <button
          type="button"
          className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
          onClick={() => setHiddenKeys(setPlotLegendGroupVisible(hiddenKeys, allKeys, true))}
        >
          {formatMessage({ id: 'panels.plot.legend.showAll' })}
        </button>
        <button
          type="button"
          className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
          onClick={() => setHiddenKeys(setPlotLegendGroupVisible(hiddenKeys, allKeys, false))}
        >
          {formatMessage({ id: 'panels.plot.legend.hideAll' })}
        </button>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          title={formatMessage({ id: open ? 'panels.plot.legend.collapse' : 'panels.plot.legend.expand' })}
          aria-label={formatMessage({ id: open ? 'panels.plot.legend.collapse' : 'panels.plot.legend.expand' })}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>
      {open ? (
        <>
          {showTools && (
            <div className="shrink-0 px-2 pb-1">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-6 w-full rounded border border-border bg-background px-2 text-[11px] outline-hidden focus:border-primary"
                placeholder={formatMessage({ id: 'panels.plot.legend.searchPlaceholder' })}
                aria-label={formatMessage({ id: 'panels.plot.legend.searchPlaceholder' })}
              />
            </div>
          )}
          <div
            className="flex min-h-0 flex-1 flex-wrap content-start items-center gap-x-2 gap-y-0.5 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-muted-foreground">
                {formatMessage({ id: 'panels.plot.legend.noMatches' })}
              </div>
            ) : (
              filtered.map((entry) => (
                <LegendRow
                  key={entry.key}
                  entry={entry}
                  visible={isPlotLegendVisible(hiddenKeys, entry.key)}
                  onToggle={() => toggleEntry(entry)}
                  onOnly={() => showOnly(entry)}
                  showOnlyAction
                />
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
