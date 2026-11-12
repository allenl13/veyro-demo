"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { normaliseReturn } from "../lib/financial-metrics";
import { money, percent } from "../lib/dashboard-format";
import { marketDay, newYorkClock, regularSessionQuote, snapshotTime } from "../lib/market-time";
import { recoverMarketData } from "../lib/market-data-recovery";
import {
  latestPortfolioChartSnapshot,
  sharedReturnScale,
  returnChartY,
  formatReturnAxisTick,
  dailyClosingSnapshots,
  calendarMonthChartSnapshots,
  mergePortfolioChartSnapshots,
  enrichDailySnapshotsWithIntraday,
  inceptionTradePrices,
  latestFiveTradingSessions,
  formatRebasedReturn,
  intradaySessionPosition,
  portfolioChartMovement,
  portfolioChartHistoryIdentity,
  sessionStepPosition,
  type PerformanceTrade,
  type PerformanceHolding,
  type PerformanceSnapshot,
  type PortfolioChartMovement,
} from "../lib/performance-chart";

import { CHART_BENCHMARKS, BENCHMARK_NAMES, BENCHMARK_PREFERENCE_KEY, chartBenchmarkPreference, pairedBenchmarkChart, verifiedChartPrice, sinceStartBenchmarkComparisons, type SummaryBenchmarkComparison, type ChartBenchmark } from "../lib/portfolio-benchmark";

type Snapshot = PerformanceSnapshot;

type ChartPortfolio = {
  id: string;
  initialCash: number;
  cash: number;
  holdings: PerformanceHolding[];
  trades: PerformanceTrade[];
  snapshots: Snapshot[];
  benchmark?: { entryPrice: number };
};

const TRACKER_SERVICE = "/api/local-tracker";


const CHART_RANGES = ["1D", "5D", "1M", "Max"] as const;
const CHART_RANGE_LABELS = {
  "1D": "1D",
  "5D": "1W",
  "1M": "1M",
  Max: "All",
} as const;
type ChartRange = (typeof CHART_RANGES)[number];
const chartHistoryCache = new Map<string, { snapshots: Snapshot[] }>();

export function PortfolioChart({
  portfolio,
  displaySnapshot,
  marketIsOpen,
  selectedTicker,
  onSelect,
  onPortfolioMovementChange,
  onBenchmarkComparisonsChange,
}: {
  portfolio: ChartPortfolio;
  displaySnapshot?: Snapshot | null;
  marketIsOpen: boolean;
  selectedTicker: string | null;
  onSelect: (ticker: string | null) => void;
  onPortfolioMovementChange: (movement: PortfolioChartMovement | null) => void;
  onBenchmarkComparisonsChange: (comparisons: SummaryBenchmarkComparison[]) => void;
}) {
  const { symbolsKey: historySymbolsKey, cacheKey: historyCacheKey } = portfolioChartHistoryIdentity(portfolio, CHART_BENCHMARKS);
  const cachedHistory = chartHistoryCache.get(historyCacheKey);
  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRetry, setHistoryRetry] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<HTMLElement>(null);
  const [benchmark, setBenchmark] = useState<ChartBenchmark>("QQQ");
  const [benchmarkQuoteSnapshots, setBenchmarkQuoteSnapshots] = useState<Snapshot[]>([]);
  const [benchmarkQuoteError, setBenchmarkQuoteError] = useState(false);
  const [range, setRange] = useState<ChartRange>("1D");
  const [hoverPoint, setHoverPoint] = useState<{
    index: number;
    leftPercent: number;
    series: "primary" | "benchmark";
  } | null>(null);
  const [historySnapshots, setHistorySnapshots] = useState<Snapshot[]>(() => cachedHistory?.snapshots ?? []);
  const [loadedHistoryKey, setLoadedHistoryKey] = useState(cachedHistory ? historyCacheKey : "");
  const positions = portfolio.holdings;
  useEffect(() => {
    try { setBenchmark(chartBenchmarkPreference(localStorage.getItem(BENCHMARK_PREFERENCE_KEY))); } catch { /* Default remains QQQ when storage is unavailable. */ }
  }, []);
  const selectBenchmark = (value: ChartBenchmark) => {
    setBenchmark(value);
    try { localStorage.setItem(BENCHMARK_PREFERENCE_KEY, value); } catch { /* Preference remains usable in this session. */ }
  };
  // Update benchmark marks with the existing portfolio quote cadence, without refetching history or resetting the range.
  const displayMarketAt = displaySnapshot?.marketAsOf;
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`${TRACKER_SERVICE}/quotes`, {method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({symbols: CHART_BENCHMARKS, required: ["SPY"]}), signal: controller.signal});
        if (!response.ok) throw Error("Benchmark quotes unavailable");
        const payload = await response.json() as {quotes?: unknown[]};
        const marks = CHART_BENCHMARKS.flatMap(symbol => {
          const snapshot = latestPortfolioChartSnapshot(payload.quotes, [symbol]);
          return snapshot ? [snapshot] : [];
        });
        if (!controller.signal.aborted) { setBenchmarkQuoteSnapshots(marks); setBenchmarkQuoteError(marks.length !== CHART_BENCHMARKS.length); }
      } catch { if (!controller.signal.aborted) setBenchmarkQuoteError(true); }
    })();
    return () => controller.abort();
  }, [displayMarketAt, historyRetry]);


  const firstTrade = useMemo(
    () => [...portfolio.trades]
      .filter((trade) => trade.side === "buy")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0],
    [portfolio.trades],
  );
  const firstTradeAt = firstTrade?.createdAt ?? "";
  const historySymbols = useMemo(() => historySymbolsKey.split(","), [historySymbolsKey]);
  useEffect(() => {
    const previous = chartHistoryCache.get(historyCacheKey);
    setHistoryError(false);
    setLoadedHistoryKey(previous ? historyCacheKey : "");
    setHistorySnapshots(previous?.snapshots ?? []);
    if (!firstTradeAt || !historySymbols.length) {
      setLoadedHistoryKey(historyCacheKey);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setHistoryLoading(true);
    void (async () => {
      try {
        const value = await recoverMarketData(async (signal) => {
        const response = await fetch(`${TRACKER_SERVICE}/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbols: historySymbols,
            from: Math.floor(new Date(firstTradeAt).getTime() / 1000),
            to: Math.floor(Date.now() / 1000),
          }),
          signal,
        });
        if (!response.ok) throw new Error("History request failed");
        const payload = (await response.json()) as {
          snapshots?: Snapshot[];
        };
        if (!Array.isArray(payload.snapshots) || !payload.snapshots.length) throw new Error("History response is incomplete");
        return { snapshots: payload.snapshots };
        }, controller.signal);
        if (!active) return;
        chartHistoryCache.set(historyCacheKey, value);
        if (chartHistoryCache.size > 4) chartHistoryCache.delete(chartHistoryCache.keys().next().value!);
        setHistorySnapshots(value.snapshots);
        setLoadedHistoryKey(historyCacheKey);
      } catch {
        if (active) setHistoryError(true);
      } finally {
        if (active) setHistoryLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [firstTradeAt, historyCacheKey, historyRetry, historySymbols]);
  const historyReady = !firstTradeAt || loadedHistoryKey === historyCacheKey;

  const entrySnapshot = useMemo<Snapshot | null>(() => {
    if (!firstTrade) return null;
    const entryTime = Date.parse(firstTrade.createdAt);
    const benchmarkSnapshot = [...portfolio.snapshots]
      .filter((snapshot) => snapshotTime(snapshot) <= entryTime)
      .sort((left, right) => snapshotTime(left) - snapshotTime(right))
      .at(-1) ?? historySnapshots.find((snapshot) => snapshotTime(snapshot) >= entryTime);
    const benchmarkEntryPrice = portfolio.benchmark?.entryPrice ??
      benchmarkSnapshot?.prices.SPY;
    return {
      capturedAt: firstTrade.createdAt,
      marketAsOf: firstTrade.createdAt,
      prices: {
        ...inceptionTradePrices(portfolio.trades),
        ...(benchmarkEntryPrice
          ? { SPY: benchmarkEntryPrice }
          : {}),
      },
    } satisfies Snapshot;
  }, [firstTrade, historySnapshots, portfolio.benchmark?.entryPrice, portfolio.snapshots, portfolio.trades]);
  const verifiedStoredSnapshots = useMemo(() => portfolio.snapshots.map(snapshot => {
      const symbols = Object.keys(snapshot.prices).filter(symbol => verifiedChartPrice(snapshot, symbol));
      return {...snapshot, prices: Object.fromEntries(symbols.map(symbol => [symbol, snapshot.prices[symbol]])),
        quoteEvidence: snapshot.quoteEvidence?.filter(q => symbols.includes(q.symbol))};
    }).filter(snapshot => Object.keys(snapshot.prices).length), [portfolio.snapshots]);
  const snapshots = useMemo(() => mergePortfolioChartSnapshots([...historySnapshots, ...benchmarkQuoteSnapshots], verifiedStoredSnapshots, entrySnapshot, displaySnapshot ?? null),
    [entrySnapshot, historySnapshots, benchmarkQuoteSnapshots, verifiedStoredSnapshots, displaySnapshot]);
  const summarySnapshots = useMemo(() => mergePortfolioChartSnapshots([...historySnapshots, ...benchmarkQuoteSnapshots], verifiedStoredSnapshots, null, displaySnapshot ?? null),
    [historySnapshots, benchmarkQuoteSnapshots, verifiedStoredSnapshots, displaySnapshot]);
  const summaryComparisons = useMemo(() => sinceStartBenchmarkComparisons({initialCash:portfolio.initialCash, cash:portfolio.cash, holdings:positions, trades:portfolio.trades}, summarySnapshots),
    [portfolio.initialCash, portfolio.cash, positions, portfolio.trades, summarySnapshots]);
  useEffect(() => { onBenchmarkComparisonsChange(summaryComparisons); }, [onBenchmarkComparisonsChange, summaryComparisons]);

  const dailySnapshots = useMemo(() => dailyClosingSnapshots(snapshots), [snapshots]);

  const visibleDailySnapshots = useMemo(() => {
    if (range === "1D") return [];
    if (range === "5D") return latestFiveTradingSessions(dailySnapshots);
    return range === "1M" ? calendarMonthChartSnapshots(dailySnapshots) : dailySnapshots;
  }, [dailySnapshots, range]);

  const visibleSnapshots = useMemo(() => {
    if (!historyReady) return [];
    if (range === "1D") {
      const now = Date.now();
      const regularSnapshots = snapshots.filter((snapshot) => {
        const timestamp = snapshotTime(snapshot);
        return timestamp <= now && regularSessionQuote(new Date(timestamp));
      });
      if (!historyReady && regularSnapshots.length === 0) return [];
      const latestDay = regularSnapshots.length
        ? marketDay(regularSnapshots.at(-1)!.marketAsOf || regularSnapshots.at(-1)!.capturedAt)
        : "";
      const latestSession = regularSnapshots.filter(
        (snapshot) => marketDay(snapshot.marketAsOf || snapshot.capturedAt) === latestDay,
      );
      return latestSession.length ? latestSession : snapshots.slice(-1);
    }
    return enrichDailySnapshotsWithIntraday(
      visibleDailySnapshots,
      snapshots,
      {
        timestamp: snapshotTime,
        sessionKey: (snapshot) => marketDay(snapshot.marketAsOf || snapshot.capturedAt),
        isRegularMarketPoint: (snapshot) => regularSessionQuote(new Date(snapshotTime(snapshot))),
      },
    );
  }, [historyReady, range, snapshots, visibleDailySnapshots]);

  const requestedDisplaySnapshots = visibleSnapshots;

  const chartData = useMemo(() => pairedBenchmarkChart({
    portfolio: {
      initialCash: portfolio.initialCash,
      cash: portfolio.cash,
      holdings: positions,
      trades: portfolio.trades,
    },
    visibleSnapshots: requestedDisplaySnapshots,
    snapshots,
    selectedTicker,
    range,
    benchmark,
  }), [portfolio.cash, portfolio.initialCash, portfolio.trades, positions, selectedTicker, benchmark, requestedDisplaySnapshots, range, snapshots]);
  const displaySnapshots = chartData.displaySnapshots;

  const rawPeriodReturn = chartData.series.at(-1) ?? 0;
  const movementPeriodLabel = range === "1D" ? "today" : CHART_RANGE_LABELS[range];
  const portfolioMovement = useMemo(
    () => portfolioChartMovement(
      selectedTicker,
      chartData.pointStart,
      chartData.pointValues.at(-1),
      movementPeriodLabel,
    ),
    [chartData.pointStart, chartData.pointValues, movementPeriodLabel, selectedTicker],
  );
  const periodReturn = portfolioMovement?.returnValue ?? normaliseReturn(rawPeriodReturn);
  useEffect(() => {
    onPortfolioMovementChange(portfolioMovement);
  }, [onPortfolioMovementChange, portfolioMovement]);
  const movement = periodReturn < 0 ? "down" : periodReturn > 0 ? "up" : "flat";
  const lineColour = movement === "down"
    ? "#ef3855"
    : movement === "up"
      ? "#42b883"
      : "#7d8590";
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-NZ", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "America/New_York",
      }),
    [],
  );
  const axisDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-NZ", {
        day: "numeric",
        month: "short",
        timeZone: "America/New_York",
      }),
    [],
  );
  const hoverTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-NZ", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/New_York",
      }),
    [],
  );
  const firstVisible = displaySnapshots[0];
  const lastVisible = displaySnapshots.at(-1);
  const tradingStartedAt = firstTradeAt ? Date.parse(firstTradeAt) : Infinity;
  const includesStrategyInception = Boolean(
    chartData.baselineAt &&
    Number.isFinite(tradingStartedAt) &&
    Date.parse(chartData.baselineAt) <= tradingStartedAt,
  );
  const coverage = firstVisible
    ? range === "1D"
      ? `${dateFormatter.format(new Date(firstVisible.marketAsOf || firstVisible.capturedAt))} · 9:30am–4:00pm ET`
      : `${dateFormatter.format(new Date(chartData.baselineAt || firstVisible.marketAsOf || firstVisible.capturedAt))} – ${dateFormatter.format(new Date(lastVisible!.marketAsOf || lastVisible!.capturedAt))}${includesStrategyInception ? " · full available history" : ""}`
    : "Waiting for the first market snapshot";
  const chartScale = useMemo(
    () => sharedReturnScale([...chartData.series, ...chartData.benchmark]),
    [chartData],
  );

  useEffect(() => setHoverPoint(null), [range, selectedTicker, benchmark]);

  const handleChartPointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!displaySnapshots.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const left = 12;
    const right = 64;
    const plotWidth = Math.max(1, bounds.width - left - right);
    const pointerX = Math.max(
      left,
      Math.min(bounds.width - right, event.clientX - bounds.left),
    );
    const pointX = (snapshot: Snapshot, index: number) => {
      if (range === "1D") {
        const minute = newYorkClock(new Date(snapshotTime(snapshot))).minutes;
        return left + intradaySessionPosition(minute) * plotWidth;
      }
      return left + sessionStepPosition(index, displaySnapshots.length) * plotWidth;
    };
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    displaySnapshots.forEach((snapshot, index) => {
      const distance = Math.abs(pointX(snapshot, index) - pointerX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    const pointerY = event.clientY - bounds.top;
    const primaryValue = chartData.series[nearestIndex];
    const benchmarkValue = chartData.benchmark[nearestIndex];
    const primaryY = Number.isFinite(primaryValue)
      ? returnChartY(primaryValue, chartScale, bounds.height)
      : null;
    const benchmarkY = Number.isFinite(benchmarkValue)
      ? returnChartY(benchmarkValue, chartScale, bounds.height)
      : null;
    const series: "primary" | "benchmark" = (() => {
      if (primaryY === null) return "benchmark";
      if (benchmarkY === null) return "primary";
      const primaryDistance = Math.abs(pointerY - primaryY);
      const benchmarkDistance = Math.abs(pointerY - benchmarkY);
      return benchmarkDistance <= primaryDistance ? "benchmark" : "primary";
    })();
    const nextHoverPoint = {
      index: nearestIndex,
      leftPercent: (pointX(displaySnapshots[nearestIndex], nearestIndex) / bounds.width) * 100,
      series,
    };
    setHoverPoint((current) =>
      current?.index === nextHoverPoint.index && current.series === nextHoverPoint.series
        ? current
        : nextHoverPoint,
    );
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const context = canvas.getContext("2d");
      if (!context) return;
      const theme = getComputedStyle(document.documentElement);
      const axisColour = theme.getPropertyValue("--text-secondary").trim() || "#a1a1a6";
      const dividerColour = theme.getPropertyValue("--divider").trim() || "rgba(161,161,166,.10)";
      const lightTheme = document.documentElement.dataset.theme === "light";
      const primaryColour = lightTheme
        ? theme.getPropertyValue(lineColour === "#ef3855" ? "--negative" : lineColour === "#42b883" ? "--positive" : "--text-tertiary").trim() || lineColour
        : lineColour;
      const benchmarkColour = lightTheme ? theme.getPropertyValue("--text-tertiary").trim() || "#7d8590" : "#7d8590";
      const width = Math.max(320, canvas.clientWidth),
        height = Math.max(1, canvas.clientHeight),
        ratio = window.devicePixelRatio || 1;
      const backingWidth = Math.round(width * ratio);
      const backingHeight = Math.round(height * ratio);
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const { series, benchmark: benchmarkSeries } = chartData;
      if (!series.length) {
        context.font = "11px -apple-system, sans-serif";
        context.fillStyle = axisColour;
        context.textAlign = "center";
        context.fillText(
          historyError && !historyReady
            ? "Market history could not be loaded. Use Retry chart."
            : historyReady
            ? `No matched USD history available for ${benchmark}.`
            : marketIsOpen
              ? "Loading today's market history…"
              : "Loading the latest closed session…",
          width / 2,
          height / 2,
        );
        context.textAlign = "left";
        return;
      }
      const left = 12,
        right = 64,
        top = 18,
        bottom = 12,
        plotWidth = width - left - right;
      const x = (index: number) => {
        if (range === "1D" && displaySnapshots[index]) {
          const minute = newYorkClock(new Date(snapshotTime(displaySnapshots[index]))).minutes;
          return left + intradaySessionPosition(minute) * plotWidth;
        }
        return left + sessionStepPosition(index, displaySnapshots.length) * plotWidth;
      };
      const y = (value: number) => returnChartY(value, chartScale, height);
      context.font = "11px -apple-system, sans-serif";
      context.textAlign = "left";
      context.textBaseline = "middle";
      for (const tick of chartScale.ticks) {
        const tickY = y(tick);
        context.strokeStyle = dividerColour;
        context.lineWidth = tick === 0 ? 1.5 : 1;
        context.beginPath();
        context.moveTo(left, tickY);
        context.lineTo(width - right, tickY);
        context.stroke();
        context.fillStyle = axisColour;
        context.fillText(formatReturnAxisTick(tick, chartScale.step), width - right + 8, tickY);
      }
      const trace = (values: number[]) => {
        context.moveTo(x(0), y(values[0]));
        for (let index = 1; index < values.length; index++) {
          context.lineTo(x(index), y(values[index]));
        }
      };
      const fillArea = (values: number[], colour: string) => {
        if (values.length < 2) return;
        context.beginPath();
        trace(values);
        context.lineTo(x(values.length - 1), height - bottom);
        context.lineTo(x(0), height - bottom);
        context.closePath();
        const gradient = context.createLinearGradient(0, top, 0, height - bottom);
        gradient.addColorStop(0, `${colour}38`);
        gradient.addColorStop(1, `${colour}00`);
        context.fillStyle = gradient;
        context.fill();
      };
      const line = (values: number[], colour: string) => {
        if (!values.length) return;
        context.beginPath();
        trace(values);
        context.strokeStyle = colour;
        context.lineWidth = 2.5;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.stroke();
        const lastIndex = values.length - 1;
        context.beginPath();
        context.arc(x(lastIndex), y(values[lastIndex]), 3, 0, Math.PI * 2);
        context.fillStyle = colour;
        context.fill();
      };
      fillArea(series, primaryColour);
      line(benchmarkSeries, benchmarkColour);
      line(series, primaryColour);
      if (hoverPoint) {
        const hoveredValue = hoverPoint.series === "primary"
          ? series[hoverPoint.index]
          : benchmarkSeries[hoverPoint.index];
        const hoverX = x(hoverPoint.index);
        if (hoveredValue !== undefined) {
          const hoverY = y(hoveredValue);
          context.strokeStyle = axisColour;
          context.setLineDash([3, 4]);
          context.beginPath();
          context.moveTo(hoverX, top);
          context.lineTo(hoverX, height - bottom);
          context.stroke();
          context.setLineDash([]);
          context.beginPath();
          context.arc(hoverX, hoverY, 4, 0, Math.PI * 2);
          context.fillStyle = hoverPoint.series === "primary" ? primaryColour : benchmarkColour;
          context.fill();
        }
      }
      context.textAlign = "left";
    };
    let drawFrame: number | null = null;
    const scheduleDraw = () => {
      if (drawFrame !== null) return;
      drawFrame = window.requestAnimationFrame(() => {
        drawFrame = null;
        draw();
      });
    };
    draw();
    const observer = new ResizeObserver(scheduleDraw);
    if (chartRef.current) observer.observe(chartRef.current);
    const themeObserver = new MutationObserver(scheduleDraw);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      if (drawFrame !== null) window.cancelAnimationFrame(drawFrame);
    };
  }, [benchmark, chartData, chartScale, displaySnapshots, historyReady, historyError, hoverPoint, lineColour, marketIsOpen, range, selectedTicker]);

  const hoveredSnapshot =
    hoverPoint === null ? null : displaySnapshots[hoverPoint.index];
  const hoveredValue =
    hoverPoint === null
      ? null
      : hoverPoint.series === "primary"
        ? chartData.pointValues[hoverPoint.index] ?? null
        : chartData.benchmarkValues[hoverPoint.index] ?? null;
  const hoveredReturn =
    hoverPoint === null
      ? null
      : hoverPoint.series === "primary"
        ? chartData.series[hoverPoint.index] ?? null
        : chartData.benchmark[hoverPoint.index] ?? null;
  const hoveredLabel = hoverPoint === null
    ? ""
    : hoverPoint.series === "benchmark"
      ? chartData.benchmarkLabel
      : selectedTicker
        ? `${selectedTicker} price`
      : "Portfolio value";
  const hoveredWhen = hoveredSnapshot
    ? range === "1D"
      ? `${hoverTimeFormatter.format(new Date(snapshotTime(hoveredSnapshot)))} ET`
      : axisDateFormatter.format(new Date(snapshotTime(hoveredSnapshot)))
    : "";

  return (
    <section ref={chartRef} className="live-chart" data-movement={movement}>
      <div className="chart-title">
        <div>
          <span>Performance</span>
          <strong>
            {selectedTicker
              ? `${selectedTicker} movement`
              : `Veyro vs ${benchmark}`}
          </strong>
          <small className="chart-coverage">
            <span>{CHART_RANGE_LABELS[range]} · {coverage}</span>
          </small>
        </div>
        <div className="chart-summary">
          {selectedTicker ? <strong className={`chart-return ${movement}`}>{percent(periodReturn)}</strong> : null}
          <div className="chart-legend">
            <i className={movement} /> {selectedTicker ?? "Veyro"}
            <i className="benchmark-line" /> {chartData.benchmarkLabel}{displaySnapshots.length ? ` ${percent(chartData.benchmark.at(-1)!)}` : ""}
          </div>
        </div>
      </div>
      <div className="chart-benchmark-controls" role="group" aria-label="Comparison benchmark">
        {CHART_BENCHMARKS.map(symbol => <button key={symbol} aria-pressed={benchmark === symbol}
          className={benchmark === symbol ? "active" : ""} onClick={() => selectBenchmark(symbol)}>
          {symbol} <span>{BENCHMARK_NAMES[symbol]}</span>
        </button>)}
      </div>
      {chartData.unavailable || chartData.missingPreviousClose || benchmarkQuoteError ? <p className="chart-data-note" role="status">
        {chartData.unavailable ? `${benchmark} comparison unavailable for this range. ` : ""}
        {chartData.missingPreviousClose ? "Prior close unavailable; both lines start at the first verified point. " : ""}
        {benchmarkQuoteError ? "Latest benchmark update incomplete; available history retains its original dates. " : ""}
      </p> : null}
      {historyError ? <div className="market-recovery" role="status">
        <span>{historyReady ? "Chart update unavailable. Previously loaded history is shown with its original dates." : "Market history is unavailable."}</span>
        <button disabled={historyLoading} onClick={() => setHistoryRetry(value => value + 1)}>Retry chart</button>
      </div> : null}
      <div className="chart-picker">
        <button
          className={selectedTicker === null ? "active" : ""}
          onClick={() => onSelect(null)}
        >
          Portfolio
        </button>
        {positions.map((holding) => (
          <button
            key={holding.ticker}
            className={selectedTicker === holding.ticker ? "active" : ""}
            onClick={() => onSelect(holding.ticker)}
          >
            {holding.ticker}
          </button>
        ))}
      </div>
      <div className="chart-canvas-wrap">
        <canvas
          ref={canvasRef}
          role="img"
          data-benchmark={benchmark}
          data-start={chartData.baselineAt ?? ""} data-end={chartData.endAt ?? ""}
          data-points={displaySnapshots.length} data-series-count={displaySnapshots.length ? 2 : 0}
          aria-label={`Veyro versus ${benchmark} ${BENCHMARK_NAMES[benchmark]} price-return chart using regular-market USD prices. Both lines exclude dividends. Shared return scale ${formatReturnAxisTick(chartScale.low, chartScale.step)} to ${formatReturnAxisTick(chartScale.high, chartScale.step)}.`}
          onPointerMove={handleChartPointerMove}
          onPointerLeave={() => setHoverPoint(null)}
        />
        {hoverPoint && hoveredSnapshot && hoveredValue !== null && hoveredReturn !== null ? (
          <div
            className="chart-tooltip"
            style={{ left: `${Math.max(10, Math.min(90, hoverPoint.leftPercent))}%` }}
          >
            <strong>
              <span>{money(hoveredValue)}</span>
              <span
                className={`tooltip-return ${hoveredReturn > 0 ? "up" : hoveredReturn < 0 ? "down" : "flat"}`}
              >
                {formatRebasedReturn(hoveredReturn)}
              </span>
            </strong>
            <span>
              {hoveredLabel} · {hoveredWhen}
            </span>
          </div>
        ) : null}
      </div>
      <nav className="chart-ranges" aria-label="Chart time range">
        {CHART_RANGES.map((option) => (
          <button
            key={option}
            className={range === option ? "active" : ""}
          aria-pressed={range === option}
          onClick={() => setRange(option)}
        >
            {CHART_RANGE_LABELS[option]}
          </button>
        ))}
      </nav>
    </section>
  );
}
