"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { autopilotOperationalStatus } from "../lib/autopilot-operational-status";
import { OverviewRequestGate } from "../lib/overview-request-gate";
import type { PortfolioChartMovement } from "../lib/performance-chart";
import { CHART_BENCHMARKS, summaryBenchmarkComparisonText, summaryBenchmarkReturnDifference, type SummaryBenchmarkComparison } from "../lib/portfolio-benchmark";

type SimulatedAutopilotStatus = {
  mode: "SIMULATED";
  strategy: "AI Opportunities";
  enabled: boolean;
  execution: "SIMULATED_ONLY";
  trackerStatus: string | null;
  schedulerStatus: string | null;
  lastCheckedAt: string | null;
  lastAttemptedAt?: string | null;
  lastSuccessfulAt?: string | null;
  lastError: string | null;
  portfolio: {
    initialCash: number;
    cash: number;
    holdingsCount: number;
    tradeCount: number;
  };
  latestTrade: null | {
    side: "buy" | "sell";
    ticker: string;
    shares: number;
    value: number;
    createdAt: string;
  };
  latestLoop: null | {
    status: string | null;
    completedAt: string | null;
    tradeCount: number | null;
  };
};

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function time(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(date);
}

function percent(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

type MarketDataState = "loading" | "ready" | "unavailable";

export function VeyroAutopilotOverview({
  marketIsOpen,
  currentPortfolioValue,
  totalReturn,
  totalReturnAmount,
  benchmarkComparisons,
  periodMovement,
  showPeriodMovement,
  marketDataState,
  priceAsOf,
}: {
  marketIsOpen: boolean;
  currentPortfolioValue: number | null;
  totalReturn: number | null;
  totalReturnAmount: number | null;
  benchmarkComparisons: SummaryBenchmarkComparison[] | null;
  periodMovement: PortfolioChartMovement | null;
  showPeriodMovement: boolean;
  marketDataState: MarketDataState;
  priceAsOf: string | null;
}) {
  const [simulation, setSimulation] = useState<SimulatedAutopilotStatus | null>(null);
  const [simulationCurrent, setSimulationCurrent] = useState(false);
  const [simulationLoaded, setSimulationLoaded] = useState(false);
  const requestGate = useRef(new OverviewRequestGate());

  const refresh = useCallback(async () => {
    const requestId = requestGate.current.beginRefresh();
    if (requestId === null) return;
    const simulationResult = await fetch("/api/simulated-autopilot", {
      cache: "no-store",
      signal: AbortSignal.timeout(7_000),
    })
      .then(async (response) => ({ ok: response.ok, payload: await response.json() }))
      .catch(() => null);
    if (!requestGate.current.accepts(requestId)) return;
    setSimulationLoaded(true);
    if (simulationResult?.ok) {
      setSimulation(simulationResult.payload as SimulatedAutopilotStatus);
      setSimulationCurrent(true);
    } else {
      setSimulationCurrent(false);
      setSimulation(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!marketIsOpen) return;
    const interval = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(interval);
  }, [marketIsOpen, refresh]);

  useEffect(() => {
    const gate = requestGate.current;
    return () => gate.cancelAll();
  }, []);

  const operationalStatus = autopilotOperationalStatus(simulationCurrent ? simulation : null, marketIsOpen);
  const updateDelayed = simulationLoaded && !operationalStatus.healthy && simulation?.schedulerStatus !== "paused";
  const periodMovementDirection = periodMovement === null
    ? "unavailable"
    : periodMovement.returnValue < 0
      ? "loss"
      : periodMovement.returnValue > 0
        ? "gain"
        : "flat";
  const periodMovementLabel = periodMovement === null
    ? "Period change unavailable"
    : `${periodMovement.returnValue < 0 ? "↓" : periodMovement.returnValue > 0 ? "↑" : "→"} ${money(Math.abs(periodMovement.valueChange), "USD")} (${(Math.abs(periodMovement.returnValue) * 100).toFixed(2)}%) ${periodMovement.periodLabel}`;
  const valueLabel = currentPortfolioValue === null
    ? marketDataState === "loading" ? "Loading market data…" : "Unavailable"
    : money(currentPortfolioValue, "USD");
  const totalReturnLabel = totalReturn === null
    ? marketDataState === "loading" ? "loading" : "unavailable"
    : percent(totalReturn);

  return (
    <section className="veyro-autopilot-overview page-content" aria-label="Portfolio simulation status">
      <div className="veyro-autopilot-summary">
        <p className="eyebrow veyro-simulation-label">AI research test portfolio</p>
        <div className="veyro-autopilot-facts">
          <div className="veyro-autopilot-main-metrics">
          <dl className="veyro-autopilot-lead">
            <dt>Portfolio value</dt>
            <dd>
              <strong>{valueLabel}</strong>
              {showPeriodMovement ? <span className="veyro-period-movement" data-return={periodMovementDirection}>{periodMovementLabel}</span> : null}
            </dd>
          </dl>
          <dl className="veyro-autopilot-lead veyro-total-return">
            <dt>Return since start</dt>
            <dd data-return={totalReturn === null ? "unavailable" : totalReturn < 0 ? "loss" : "gain"}>
              <strong>{totalReturnLabel}</strong>
              <small>
                {totalReturnAmount === null
                  ? "Change amount unavailable"
                  : `${totalReturnAmount >= 0 ? "Up" : "Down"} ${money(Math.abs(totalReturnAmount), "USD")}`}
              </small>
            </dd>
          </dl>
          </div>
          <div className="veyro-autopilot-quick-facts" role="group" aria-label="Portfolio at a glance">
            <dl className="veyro-autopilot-secondary"><dt>Uninvested cash</dt><dd>{simulationCurrent && simulation ? money(simulation.portfolio.cash, "USD") : "Unavailable"}</dd></dl>
            <dl className="veyro-autopilot-secondary"><dt>Holdings</dt><dd>{simulationCurrent && simulation ? simulation.portfolio.holdingsCount : "Unavailable"}</dd></dl>
          </div>
        </div>
        <div className="veyro-benchmark-comparisons" aria-label="Since-start benchmark comparisons">
          <p className="veyro-comparison-heading">Since start</p>
          {CHART_BENCHMARKS.map(benchmark => {
            const comparison = benchmarkComparisons?.find(item => item.benchmark === benchmark);
            return <div key={benchmark} className="veyro-benchmark-comparison" data-benchmark={benchmark}
              data-start={comparison?.baselineAt ?? ""} data-end={comparison?.endAt ?? ""}
              data-source={comparison?.source ?? ""} data-observed-at={comparison?.observedAt ?? ""}
              data-currency={comparison?.currency ?? ""} data-adjustment-basis={comparison?.adjustmentBasis ?? ""}
              data-benchmark-return={comparison?.benchmarkReturn ?? ""} data-portfolio-return={totalReturn ?? ""}
              data-portfolio-return-basis="initial-cash" data-excess-return={comparison ? summaryBenchmarkReturnDifference(comparison, totalReturn) ?? "" : ""}>
              <p className="veyro-comparison-note">{comparison ? summaryBenchmarkComparisonText(comparison, totalReturn) : `${benchmark} comparison unavailable`}</p>
            </div>;
          })}
        </div>
        <p className="veyro-price-time">{priceAsOf ? `Prices as of ${time(priceAsOf)}` : "Price time unavailable"}</p>
        {updateDelayed ? <p className="veyro-simulation-message" role="status">Portfolio updates are temporarily delayed.</p> : null}
      </div>
    </section>
  );
}
