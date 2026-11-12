"use client";

import Link from "../demo/link";
import { evidenceStatusLabel } from "../demo/evidence-label";
import type { ScoreEvidence } from "../lib/research-score-verification";
import { assessResearchRanking, compareResearchRanking, RESEARCH_RANK_LIMIT } from "../lib/research-ranking";
import { holdingGrowthStatus } from "../lib/research-holding-policy";

import { qualifiesForResearchShortlist, researchEntryReasons } from "../lib/research-shortlist";
import { RESEARCH_SCAN_INTERVAL_MS } from "../lib/research-cache-policy";
import { ACTIVE_BALANCED_POLICY, annualCoreBuyEligible, annualCoreBuyReasons, annualCoreScoreWeights, annualCoreWeightDescription } from "../lib/annual-core-policy";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { calculateReturn } from "../lib/financial-metrics";
import type { SummaryBenchmarkComparison } from "../lib/portfolio-benchmark";
import { latestPortfolioChartSnapshot, type PerformanceSnapshot, type PortfolioChartMovement } from "../lib/performance-chart";
import {
  allDiscoverRisks,
  principalDiscoverRisk,
} from "../lib/discover-risk-presentation";
import { reviewedRiskCitations } from "../lib/claim-citations";
import { riskCalculations, currentRiskCalculationSource } from "../lib/risk-calculations";
import type { FinancialSource } from "../lib/financial-source";
import { ReportedFinancialsPanel } from './reported-financials';
import type { ReportedFinancials } from '../lib/reported-financial-types';
import { companyResearchExplanation } from "../lib/company-research-explanation";
import { companyResearchPresentation, companyFinancialPeriod } from "../lib/company-research-presentation";
import { formatResearchScore, materialResearchScoreGaps, researchScoreExplanation, type SavedScoreEvidence } from "../lib/research-score-presentation";
import { displayPriceTime, researchDisplayPrice, verifiedResearchQuotes, type DisplayQuote } from "../lib/research-display-price";
import { recoverMarketData, verifiedQuoteBundle } from "../lib/market-data-recovery";
import { containResearchDialogFocus } from "../lib/research-dialog-focus";
import { brandedCopy, PRODUCT_NAME } from "../lib/product-brand";
import { savePersistedTrackerPortfolio } from "../lib/tracker-portfolio-save";
import { VeyroAutopilotOverview } from "./veyro-autopilot-overview";
import { PortfolioChart } from "./portfolio-chart";
import { companyBusiness } from "../lib/company-business";
import { companyCardMetrics, companyEvidenceGap, companyGroup, companyNewBuyStatus, groupCompanies, topResearchCompanies } from "../lib/company-groups";
import { BackToTop, AppearancePicker, ResearchLandscape } from "./veyro-appearance";
import { marketDay, newYorkClock, snapshotTime } from "../lib/market-time";
import { money, percent } from "../lib/dashboard-format";
import { VeyroExplainer, type AutopilotRuleInputs } from "./veyro-explainers";
import { ClaimSource, FinancialHealthIndicator, RiskIndicator, financialHealthLabel } from "./research-indicators";
import {
  decisionForTrade,
  type DailyCloseEvidence,
  sharedQuoteMarketDay,
  simulatedHoldingMarketValues,
  uniqueDecisionByTradeKey,
  verifiedPreviousClose,
} from "../lib/simulated-trade-presentation";

type MarketDataState = "loading" | "ready" | "unavailable";
type AiExposureGroup =
  | "compute"
  | "software"
  | "networking"
  | "data-centres"
  | "power-energy"
  | "grid-electrical"
  | "construction-infrastructure"
  | "ai-beneficiaries";
type AiStock = {
  ticker: string;
  name: string;
  aiTheme: string;
  asOfDate?: string | null;
  dataBasis?: "annual" | "annualised-interim" | "ttm";
  latestFinancialEvidence?: { form: string; assurance?: string };
  latestReportedFinancials?: ReportedFinancials | null;
  currentPrice: number | null;
  displayDailyChange?: { percent: number; previousClose: number; previousCloseAsOf: string; asOf: string; source: string; currency: string; adjustmentBasis: string } | null;
  priceChangePercent: number | null;
  priceAsOf: string | null;
  annualRevenue: number | null;
  revenueGrowth3y: number | null;
  netMargin: number | null;
  opportunityScore: number;
  legacyOpportunityScore?: number;
  researchV2?: {
    version: string;
    scoringRevision?: string;
    score: number | null;
    researchRanked: boolean;
    simulatedBuyEligible: boolean;
    rankReasons: string[];
    buyReasons: string[];
    reportingPeriod?: string | null;
    evidence: Record<string, ScoreEvidence>;
  };
  scoreEvidence?: SavedScoreEvidence;
  valuationScore?: number | null;
  exposureScore?: number | null;
  aiEvidenceScore?: number | null;
  aiEvidence?: string[];
  aiEvidenceDetails?: Array<{ kind: string; summary: string; source: string }>;
  aiExposureGroup?: AiExposureGroup;
  aiExposureLabel?: string;
  aiLinkageStrength?: "Direct" | "High" | "Moderate" | "Indirect";
  aiExposureConfidence?: "High" | "Medium" | "Low";
  aiEconomicLinkage?: string;
  aiThesisRisks?: string[];
  financialSourceUrl?: string;
  filingDate?: string | null;
  strategyEligibility?: "research-only";
  rankingRationale?: string;
  sectorModel?: string;
  sectorModelLabel?: string;
  sectorModelStatus?: "supported" | "limited";
  sectorModelNote?: string;
  sectorSignals?: string[];
  researchLimitations?: string[];
  scoreBreakdown?: {
    aiExposure: number;
    businessQuality: number;
    valuation: number | null;
    evidenceConfidence: number;
  };
  netDebtToEbitda?: number | null;
  interestCoverage?: number | null;
  operatingMarginChange3y?: number | null;
  freeCashFlowMargin?: number | null;
  operatingCashFlowMargin?: number | null;
  shareCountGrowth3y?: number | null;
  signal: string;
  qualityScore: number | null;
  growthScore: number | null;
  confidence: number;
  dataQuality?: "pass" | "limited" | "excluded";
  redFlags: string[];
};
type Scan = {
  modelVersion?: string;
  researchMode?: "ai-economic-ecosystem";
  strategyEligibility?: "unchanged-legacy-universe";
  generatedAt: string;
  listedUniverseSize?: number;
  dynamicDiscoveryCount?: number;
  candidatePoolSize: number;
  deepScreenLimit?: number;
  analysedCount: number;
  eligibleCount: number;
  scannedCount: number;
  pricedCount: number;
  results: AiStock[];
  researchUniverse?: AiStock[];
  assessedCompanies?: Array<{ ticker: string; name: string; status: string; reason: string | null; researchScore?: number | null; latestReportedFinancials?: ReportedFinancials | null }>;
  evidenceCoverageCount?: number;
  rejectedWeakLinkage?: Array<{ ticker: string; reason: string; evidence: string[] }>;
  errors: Array<{ ticker: string; error: string }>;
  methodology: string;
  priceNote: string;
  priceSource?: string;
  refreshWarning?: string;
  refreshing?: boolean;
  refreshStartedAt?: string | null;
};
type ResearchDataNotice = {
  state: "stale" | "unavailable";
  title: string;
  detail: string;
};
type Quote = {
  symbol: string;
  price: number;
  asOf: string;
  change?: number | null;
  changePercent?: number | null;
};
type Trade = {
  id: string;
  side: "buy" | "sell";
  ticker: string;
  name: string;
  shares: number;
  price: number;
  value: number;
  createdAt: string;
};
type Holding = {
  ticker: string;
  name: string;
  shares: number;
  averageCost: number;
};
type Snapshot = {
  capturedAt: string;
  marketAsOf: string;
  prices: Record<string, number>;
};
type AutoDecision = {
  id: string;
  createdAt: string;
  ticker: string | null;
  action: "buy" | "sell" | "hold";
  reason: string;
};
type ResearchNode = {
  name: "Financials" | "Valuation" | "AI position" | "Risk review";
  verdict: "positive" | "neutral" | "negative";
  summary: string;
  evidence: string[];
};
type CandidateResearch = {
  ticker: string;
  nodes: ResearchNode[];
  verification: "verified" | "needs review";
  verificationReason: string;
  entryReasons?: string[];
  eligibleForAutopilot: boolean;
};
type ResearchRun = {
  id: string;
  createdAt: string;
  changeDetected: boolean;
  changeSummary: string;
  candidatesReviewed: number;
  candidatesVerified: number;
  candidatesEligible: number;
  candidateResearch: CandidateResearch[];
  decisionPolicy?: "legacy-balanced-v1" | "ai-opportunities-v2" | "annual-core-v2-2026-09-29" | typeof ACTIVE_BALANCED_POLICY;
};
type LoopStage = {
  name: "Observe" | "Validate" | "Evaluate" | "Decide" | "Act" | "Verify" | "Record";
  status: "passed" | "skipped" | "failed";
  summary: string;
};
type LoopRun = {
  id: string;
  runKey: string;
  completedAt: string;
  status: "completed" | "held" | "blocked" | "failed";
  stages: LoopStage[];
  tradeIds: string[];
  portfolioValue: number;
};
type InsightReview = {
  key: string;
  insightId: string;
  title: string;
  suggestion: string;
  status: "approved" | "dismissed";
  decidedAt: string;
};
type AutoTrading = {
  strategyProfile?: "balanced";
  enabled: boolean;
  maxPositions: number;
  maxPositionPercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  lastRunAt: string | null;
  decisions: AutoDecision[];
  researchRuns?: ResearchRun[];
  loopRuns?: LoopRun[];
  insightReviews?: InsightReview[];
};
type PaperPortfolio = {
  kind: "ai-paper-portfolio";
  id: string;
  createdAt: string;
  initialCash: number;
  cash: number;
  holdings: Holding[];
  trades: Trade[];
  watchSymbols: string[];
  snapshots: Snapshot[];
  autoTrading: AutoTrading;
  benchmark?: {
    symbol: "SPY";
    entryPrice: number;
    entryAt: string;
  };
};

const TRACKER_SERVICE = "/api/local-tracker";
const BENCHMARK = "SPY";
// Keep the performance view useful for Veyro's current track record. Longer
// ranges would currently show the same short history under several labels.
const RESEARCH_REQUEST_TIMEOUT_MS = 38_000;
const RESEARCH_REFRESH_POLL_MS = 1_500;
const RESEARCH_REFRESH_WAIT_MS = 40_000;
const RESEARCH_STATUS_POLL_MS = 15 * 60_000;
const TRADE_HISTORY_PAGE_SIZE = 10;
const RESEARCH_ENDPOINT = "/api/opportunities";
let lastLoadedPortfolio: PaperPortfolio | null = null;
let lastDisplayQuotes: { prices: Record<string, number>; asOf: Record<string, string>; expires: number; key: string; displaySnapshot: PerformanceSnapshot | null } | null = null;
function quoteCacheKey(portfolio: PaperPortfolio | null) {
  return portfolio ? `${portfolio.id}|${[...new Set(portfolio.watchSymbols)].sort().join(",")}` : "";
}
function cachedDisplayQuotes(key = quoteCacheKey(lastLoadedPortfolio)) {
  return lastDisplayQuotes?.key === key ? lastDisplayQuotes : null;
}
let sharedScanPromise: Promise<Scan> | null = null;
function activityDateTime(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(timestamp);
}

function reportingDate(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(timestamp);
}

function validActivityTimestamp(value: string | null | undefined) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(new Date(value).getTime());
}

function researchDataNotice({
  priceAsOf,
  scan,
}: {
  priceAsOf: string | null;
  scan: Scan | null;
}): ResearchDataNotice | null {
  if (!validActivityTimestamp(priceAsOf)) {
    return {
      state: "unavailable",
      title: "Price unavailable",
      detail: "No regular-market price is available for this company. Its research details remain available.",
    };
  }
  if (!validActivityTimestamp(scan?.generatedAt)) {
    return {
      state: "unavailable",
      title: "Research scan unavailable",
      detail: "The scan date is unavailable. Review the dated source evidence before relying on this summary.",
    };
  }
  if (scan?.refreshWarning) {
    return {
      state: "stale",
      title: "Research update needs attention",
      detail: "The latest saved research remains visible. Review the dates above before relying on it.",
    };
  }
  if (scan?.refreshing) {
    return {
      state: "stale",
      title: "Research update in progress",
      detail: "The latest saved research remains visible while Veyro checks for an update.",
    };
  }
  return null;
}

type ResearchFreshnessState = "loading" | "refreshing" | "attention" | "updated" | "unavailable";

function researchFreshnessStatus({
  scan,
  refreshing,
  error,
}: {
  scan: Scan | null;
  refreshing: boolean;
  error: string;
}): { state: ResearchFreshnessState; label: string } {
  if (!scan) return { state: "loading", label: "Updating research…" };
  if (!validActivityTimestamp(scan.generatedAt)) {
    return { state: "unavailable", label: "Research date unavailable" };
  }

  const generatedAt = new Date(scan.generatedAt).toLocaleDateString("en-NZ", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  if (scan.refreshWarning || error) {
    return {
      state: "attention",
      label: `Research update needs attention — showing results from ${generatedAt}.`,
    };
  }
  if (refreshing || scan.refreshing) {
    return {
      state: "refreshing",
      label: `Showing results from ${generatedAt} while Veyro checks for an update.`,
    };
  }
  if (Date.now() - Date.parse(scan.generatedAt) >= RESEARCH_SCAN_INTERVAL_MS) {
    return { state: "attention", label: `Research from ${generatedAt} — update due.` };
  }
  return { state: "updated", label: `Synthetic snapshot ${generatedAt} UTC` };
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string) {
  const body = await response.text();
  let payload: (T & { error?: string }) | null = null;
  try {
    payload = JSON.parse(body) as T & { error?: string };
  } catch {
    // An upstream service can return plain text or HTML when it fails. Keep the
    // UI message useful instead of exposing a JSON parser error to the user.
  }
  if (!response.ok) {
    throw new Error(payload?.error ?? fallbackMessage);
  }
  if (!payload) throw new Error(fallbackMessage);
  return payload;
}

function price(value: number | null) {
  return value === null ? "—" : money(value);
}
function opportunityPriceDisplay(stock: AiStock, quote?: DisplayQuote) {
  const display = researchDisplayPrice(stock, quote);
  return <span className="opportunity-price">
    <strong>{display.price === null ? "Unavailable" : price(display.price)}</strong>
    {display.percent !== null && <small className={display.percent >= 0 ? "price-up" : "price-down"}>{percent(display.percent / 100)}</small>}
    <small className="opportunity-price-time" title={`${display.source ?? "Saved research"} · ${display.basis ?? "saved assessment basis"}`}>{display.label} · {displayPriceTime(display.asOf)}</small>
  </span>;
}
function regularSession(value = new Date()) {
  const { weekday, minutes } = newYorkClock(value);
  return (
    ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday) &&
    minutes >= 570 &&
    minutes < 960
  );
}
function signalTone(signal: string) {
  return signal === "Exceptional" || signal === "Strong opportunity"
    ? "positive"
    : signal === "Review risks" || signal === "Weak"
      ? "negative"
      : "neutral";
}
function researchCaseLabel(signal: string) {
  if (signal === "Strong opportunity") return "Strong evidence";
  if (signal === "Promising") return "Moderate";
  return signal;
}
const AI_OPPORTUNITIES_FINANCIAL_HEALTH_GATE = 65;

function valuationContext(stock: AiStock) {
  const score = stock.valuationScore;
  if (score === null || score === undefined) return "Unavailable";
  if (score >= 70) return "Attractive";
  if (score >= 40) return "Fair";
  return "Expensive";
}

function whyOpportunityRanks(stock: AiStock) {
  if (stock.researchV2?.researchRanked) {
    return `${percent(stock.revenueGrowth3y ?? 0)} three-year annualised revenue growth and ${percent(stock.freeCashFlowMargin ?? 0)} free-cash-flow margin; simulated new buys require separate safety checks.`;
  }
  if (stock.rankingRationale) return stock.rankingRationale;
  const evidence = stock.aiEvidence?.find(Boolean);
  if ((stock.revenueGrowth3y ?? 0) >= 0.2) {
    return `${percent(stock.revenueGrowth3y!)} three-year annualised revenue growth with ${stock.aiTheme.toLowerCase()} exposure.`;
  }
  if ((stock.qualityScore ?? 0) >= 80) {
    return `${financialHealthLabel(stock.qualityScore)} financial health with ${stock.aiTheme.toLowerCase()} exposure.`;
  }
  if (evidence) return evidence;
  return `${stock.aiTheme} exposure supported by the current research score.`;
}

function currentEntryReasons(stock: AiStock, rankingReason: string | null = null) {
  const reasons = stock.researchV2?.version === "annual-core-v2-2026-09-29"
    ? annualCoreBuyReasons(stock.researchV2)
    : researchEntryReasons(stock);
  return [...reasons, ...(rankingReason ? [rankingReason] : [])].map(reason => companyEvidenceGap(reason).replace("Candidate score below", "Research score below"));
}

const annualCoreFactors = [
  ["ai_linkage", "AI linkage", "score"],
  ["revenue_cagr_3y", "Three-year revenue growth", "percent"],
  ["free_cash_flow_margin", "Free-cash-flow margin", "percent"],
  ["net_margin", "Net margin", "percent"],
  ["free_cash_flow_yield", "Free-cash-flow yield", "percent"],
  ["share_count_cagr_3y", "Three-year share-count growth", "percent"],
] as const;

function annualCoreValue(value: number | null, format: "score" | "percent") {
  return value === null ? "Unavailable" : format === "score" ? `${value.toFixed(1)} / 100` : percent(value);
}

function defaultAutoTrading(): AutoTrading {
  return {
    strategyProfile: "balanced",
    enabled: false,
    maxPositions: 10,
    maxPositionPercent: 0.20,
    stopLossPercent: 0.12,
    takeProfitPercent: 0.25,
    lastRunAt: null,
    decisions: [],
  };
}
function normalizePortfolio(value: PaperPortfolio): PaperPortfolio {
  const saved = (value.autoTrading ?? {}) as Partial<AutoTrading> & {
    allocationPercent?: number;
  };
  const migrated = saved.maxPositionPercent === undefined;
  return {
    ...value,
    autoTrading: {
      ...defaultAutoTrading(),
      ...saved,
      maxPositions: migrated ? 10 : (saved.maxPositions ?? 10),
      maxPositionPercent:
        saved.maxPositionPercent ?? saved.allocationPercent ?? 0.20,
    },
  };
}

function currentAutopilotRuleInputs(value: PaperPortfolio | null): AutopilotRuleInputs {
  const latestResearch = value?.autoTrading.researchRuns?.[0];
  const qualifyingOpportunityCount = (latestResearch?.decisionPolicy === "ai-opportunities-v2" ||
      latestResearch?.decisionPolicy === ACTIVE_BALANCED_POLICY) &&
      Number.isInteger(latestResearch.candidatesEligible) && latestResearch.candidatesEligible >= 0
    ? latestResearch.candidatesEligible
    : null;
  const maxPositionPercent = typeof value?.autoTrading.maxPositionPercent === "number" &&
      Number.isFinite(value.autoTrading.maxPositionPercent) && value.autoTrading.maxPositionPercent > 0 &&
      value.autoTrading.maxPositionPercent <= 1
    ? value.autoTrading.maxPositionPercent
    : null;
  const maxPositions = typeof value?.autoTrading.maxPositions === "number" &&
      Number.isInteger(value.autoTrading.maxPositions) && value.autoTrading.maxPositions > 0
    ? value.autoTrading.maxPositions
    : null;
  return { qualifyingOpportunityCount, maxPositionPercent, maxPositions };
}

function isAutopilotOpportunity(stock: AiStock) {
  if (stock.researchV2?.version === "annual-core-v2-2026-09-29") {
    return annualCoreBuyEligible(stock.researchV2);
  }
  return (
    stock.dataQuality !== "excluded" &&
    stock.currentPrice !== null &&
    !stock.redFlags.length &&
    stock.opportunityScore >= 60 &&
    (stock.qualityScore ?? 0) >= AI_OPPORTUNITIES_FINANCIAL_HEALTH_GATE &&
    (stock.revenueGrowth3y ?? 0) >= 0.1 &&
    stock.confidence >= 0.6 &&
    stock.signal !== "Review risks"
  );
}

async function marketScan() {
  // Read saved research on navigation; the private after-close job refreshes filings.
  if (sharedScanPromise) return sharedScanPromise;
  const pending = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RESEARCH_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(RESEARCH_ENDPOINT, { cache: "no-store", signal: controller.signal });
      const payload = await readJsonResponse<Scan>(
        response,
        "Research is temporarily unavailable. Try again.",
      );
      return payload;
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        throw new Error("The update took too long. Your latest results are still available.");
      }
      throw reason;
    } finally {
      clearTimeout(timer);
    }
  })();
  sharedScanPromise = pending;
  try {
    return await pending;
  } finally {
    if (sharedScanPromise === pending) sharedScanPromise = null;
  }
}

async function waitForResearchRefresh(previousGeneratedAt: string) {
  const deadline = Date.now() + RESEARCH_REFRESH_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, RESEARCH_REFRESH_POLL_MS));
    const response = await fetch(
      `${RESEARCH_ENDPOINT}?refreshStatus=1&after=${encodeURIComponent(previousGeneratedAt)}`,
      { cache: "no-store" },
    );
    const payload = await readJsonResponse<Scan>(
      response,
      "The research update could not be checked. Please try again shortly.",
    );
    if (!payload.refreshing || payload.generatedAt !== previousGeneratedAt) {
      return payload;
    }
  }
  throw new Error("The update is still running in the background. Your latest results remain available.");
}

export function DiscoverDashboard({ initialSection = "research" }: { initialSection?: "research" | "portfolio" }) {
  // Research must show the same saved research feed that the simulated
  // Autopilot evaluates. The broader ecosystem scan remains research-only and
  // must not be presented as the execution strategy's ranking.
  const [portfolioActive, setPortfolioActive] = useState(initialSection === "portfolio");
  const portfolioSectionRef = useRef<HTMLElement>(null);
  const pendingSectionRef = useRef<string | null>(initialSection === "portfolio" ? "portfolio" : null);
  const [scan, setScan] = useState<Scan | null>(null),
    [loading, setLoading] = useState(true),
    [refreshingResearch, setRefreshingResearch] = useState(false),
    [error, setError] = useState("");
  const [portfolio, setPortfolio] = useState<PaperPortfolio | null>(() => lastLoadedPortfolio);
  const [portfolioMovement, setPortfolioMovement] = useState<PortfolioChartMovement | null>(null);
  const [portfolioBenchmarkComparisons, setPortfolioBenchmarkComparisons] = useState<SummaryBenchmarkComparison[] | null>(null);
  const [autopilotRuleInputs, setAutopilotRuleInputs] = useState<AutopilotRuleInputs>(() => currentAutopilotRuleInputs(lastLoadedPortfolio));
  const [researchQuotes, setResearchQuotes] = useState<Record<string, DisplayQuote>>({});
  const [dailyCloseEvidence, setDailyCloseEvidence] = useState<DailyCloseEvidence[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>(() => cachedDisplayQuotes()?.prices ?? {}),
    [priceAsOf, setPriceAsOf] = useState<Record<string, string>>(() => cachedDisplayQuotes()?.asOf ?? {}),
    [marketDataState, setMarketDataState] = useState<MarketDataState>(() => cachedDisplayQuotes() ? "ready" : "loading"),
    [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [chartDisplaySnapshot, setChartDisplaySnapshot] = useState<PerformanceSnapshot | null>(() => cachedDisplayQuotes()?.displaySnapshot ?? null);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [selectedResearchTicker, setSelectedResearchTicker] = useState<string | null>(null);
  const researchDialogRef = useRef<HTMLElement>(null);
  const researchDrawerShellRef = useRef<HTMLDivElement>(null);
  const [financialSource, setFinancialSource] = useState<{ key: string; value: FinancialSource | null } | null>(null);
  const [showFullTradeHistory, setShowFullTradeHistory] = useState(false);
  const [tradeHistoryPage, setTradeHistoryPage] = useState(0);
  const [marketIsOpen, setMarketIsOpen] = useState(() => regularSession());
  const researchRefreshInFlight = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextMarketIsOpen = regularSession();
      setMarketIsOpen((current) => current === nextMarketIsOpen ? current : nextMarketIsOpen);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (["portfolio", "performance", "holdings", "portfolio-changes"].includes(hash)) {
      pendingSectionRef.current = hash;
      setPortfolioActive(true);
    }
  }, []);

  const researchSettled = Boolean(scan || error);
  useEffect(() => {
    if (!researchSettled) return;
    const section = portfolioSectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setPortfolioActive(true);
        observer.disconnect();
      }
    }, { rootMargin: "500px" });
    observer.observe(section);
    return () => observer.disconnect();
  }, [researchSettled]);

  const loadResearch = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const nextScan = await marketScan();
      setScan(nextScan);
      if (nextScan.refreshing) {
        setRefreshingResearch(true);
        try {
          const freshScan = await waitForResearchRefresh(nextScan.generatedAt);
          setScan(freshScan);
          setError(freshScan.refreshWarning ?? "");
        } finally {
          setRefreshingResearch(false);
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "AI research could not be loaded",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadResearch();
  }, [loadResearch]);

  const refreshResearch = useCallback(async () => {
    if (researchRefreshInFlight.current) return;
    researchRefreshInFlight.current = true;
    setRefreshingResearch(true);
    try {
      const nextScan = await marketScan();
      setScan(nextScan);
      setError(nextScan.refreshWarning ?? "");
      if (nextScan.refreshing) {
        const freshScan = await waitForResearchRefresh(nextScan.generatedAt);
        setScan(freshScan);
        setError(freshScan.refreshWarning ?? "");
      }
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : "The automatic research update could not be completed. Your latest results remain available.");
    } finally {
      researchRefreshInFlight.current = false;
      setRefreshingResearch(false);
    }
  }, []);

  useEffect(() => {
    if (!marketIsOpen) return;
    const interval = window.setInterval(
      () => void refreshResearch(),
      RESEARCH_STATUS_POLL_MS,
    );
    return () => window.clearInterval(interval);
  }, [marketIsOpen, refreshResearch]);

  useEffect(() => {
    if (!selectedResearchTicker) return;
    const dialog = researchDialogRef.current;
    const shell = researchDrawerShellRef.current;
    if (!dialog || !shell) return;
    document.body.classList.add("research-drawer-open");
    const restoreFocus = containResearchDialogFocus(dialog, shell, () => setSelectedResearchTicker(null));
    return () => {
      document.body.classList.remove("research-drawer-open");
      restoreFocus();
    };
  }, [selectedResearchTicker]);

  useEffect(() => {
    if (!portfolioActive) return;
    let active = true;
    let portfolioEtag: string | null = null;
    const refreshPortfolio = async () => {
      try {
        const response = await fetch(`${TRACKER_SERVICE}/tests?id=ai-paper-portfolio`, {
          cache: "no-store",
          ...(portfolioEtag ? { headers: { "If-None-Match": portfolioEtag } } : {}),
        });
        if (response.status === 304) return;
        if (!response.ok) throw new Error("Portfolio refresh failed");
        const payload = (await response.json()) as { tests?: PaperPortfolio[] };
        if (!Array.isArray(payload.tests)) throw new Error("Portfolio response is incomplete");
        const stored = payload.tests?.find((item) => item.id === "ai-paper-portfolio");
        if (active) {
          portfolioEtag = response.headers.get("ETag");
          setAutopilotRuleInputs(currentAutopilotRuleInputs(stored ?? null));
          lastLoadedPortfolio = stored ? normalizePortfolio(stored) : null;
          setPortfolio(lastLoadedPortfolio);
        }
      } catch {
        if (active) {
          // Keep the last confirmed portfolio during a transient refresh failure.
          // Its original observation timestamps remain visible.
          setPortfolio(lastLoadedPortfolio);
        }
      }
    };
    void refreshPortfolio();
    if (!marketIsOpen) {
      return () => {
        active = false;
      };
    }
    const interval = window.setInterval(() => void refreshPortfolio(), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [portfolioActive, marketIsOpen]);

  const portfolioStartAt = useMemo(() => {
    if (!portfolio) return "";
    return [...portfolio.trades]
      .filter((trade) => trade.side === "buy")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
      ?.createdAt ?? portfolio.createdAt;
  }, [portfolio]);
  const activePortfolioId = portfolio?.id ?? "";
  const activeWatchSymbols = portfolio?.watchSymbols.join(",") ?? "";
  const dailyReturnSymbols = portfolio
    ? [...new Set([...portfolio.holdings.map((holding) => holding.ticker), BENCHMARK])].join(",")
    : "";
  const quoteMarketDay = useMemo(
    () => sharedQuoteMarketDay([BENCHMARK], priceAsOf),
    [priceAsOf],
  );
  const savePortfolio = async (next: PaperPortfolio) => {
    const persisted = await savePersistedTrackerPortfolio(TRACKER_SERVICE, next);
    setAutopilotRuleInputs(currentAutopilotRuleInputs(persisted));
    setPortfolio(normalizePortfolio(persisted));
  };

  useEffect(() => {
    if (!portfolioActive || !activePortfolioId || !portfolioStartAt || portfolio?.benchmark?.entryPrice) return;
    let active = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const start = Date.parse(portfolioStartAt);
        const response = await fetch(`${TRACKER_SERVICE}/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbols: [BENCHMARK],
            from: Math.floor((start - 5 * 60_000) / 1000),
            to: Math.floor((start + 15 * 60_000) / 1000),
          }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as { snapshots?: Snapshot[] };
        if (!response.ok || !payload.snapshots?.length) return;
        const entry = [...payload.snapshots].sort(
          (left, right) =>
            Math.abs(snapshotTime(left) - start) - Math.abs(snapshotTime(right) - start),
        )[0];
        const entryPrice = entry.prices[BENCHMARK];
        if (!Number.isFinite(entryPrice) || entryPrice <= 0) return;
        const latestResponse = await fetch(`${TRACKER_SERVICE}/tests?id=ai-paper-portfolio`, { cache: "no-store" });
        const latestPayload = (await latestResponse.json()) as { tests?: PaperPortfolio[] };
        const latestStored = latestPayload.tests?.find((item) => item.id === activePortfolioId);
        if (!active || !latestResponse.ok || !latestStored) return;
        const latest = normalizePortfolio(latestStored);
        await savePortfolio({
          ...latest,
          benchmark: {
            symbol: BENCHMARK,
            entryPrice,
            entryAt: entry.marketAsOf || entry.capturedAt,
          },
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [activePortfolioId, portfolioActive, portfolio?.benchmark?.entryPrice, portfolioStartAt]);

  useEffect(() => {
    if (!portfolioActive || !activePortfolioId) return;
    const key = `${activePortfolioId}|${[...new Set(activeWatchSymbols.split(",").filter(Boolean))].sort().join(",")}`;
    const previous = cachedDisplayQuotes(key);
    setPrices(previous?.prices ?? {});
    setChartDisplaySnapshot(previous?.displaySnapshot ?? null);
    setPriceAsOf(previous?.asOf ?? {});
    setMarketDataState(previous ? "ready" : "loading");
    setQuoteError(false);
    const symbols = activeWatchSymbols.split(",").filter(Boolean);
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      setQuoteLoading(true);
      try {
        const observed = await recoverMarketData(async (signal) => {
          const response = await fetch(`${TRACKER_SERVICE}/quotes`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbols }), signal,
          });
          if (!response.ok) throw new Error("Regular-market prices are unavailable");
          const payload = await response.json() as { quotes?: Quote[] };
          return { ...verifiedQuoteBundle(payload.quotes, symbols), displaySnapshot: latestPortfolioChartSnapshot(payload.quotes, symbols) };
        }, controller.signal);
        if (!active) return;
        const bundle = { ...observed, key, expires: Date.now() + 5 * 60_000 };
        lastDisplayQuotes = bundle;
        setPrices(bundle.prices);
        setChartDisplaySnapshot(bundle.displaySnapshot);
        setPriceAsOf(bundle.asOf);
        setMarketDataState("ready");
        setQuoteError(false);
      } catch {
        if (!active) return;
        // Keep the entire previous bundle and its observation times; never label it as refreshed.
        const retained = cachedDisplayQuotes(key);
        setPrices(retained?.prices ?? {});
        setChartDisplaySnapshot(retained?.displaySnapshot ?? null);
        setPriceAsOf(retained?.asOf ?? {});
        setQuoteError(true);
        setMarketDataState(retained ? "ready" : "unavailable");
      } finally {
        inFlight = false;
        if (active) setQuoteLoading(false);
      }
    };
    void refresh();
    let timer: number | undefined;
    const scheduleNextBar = () => {
      if (!marketIsOpen || !active) return;
      const barMs = 5 * 60_000;
      timer = window.setTimeout(async () => {
        await refresh();
        scheduleNextBar();
      }, barMs - Date.now() % barMs + 5_000);
    };
    scheduleNextBar();
    return () => { active = false; controller.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [activePortfolioId, activeWatchSymbols, portfolioActive, marketIsOpen, quoteRetry]);

  useEffect(() => {
    setDailyCloseEvidence([]);
    if (!portfolioActive || !activePortfolioId || !dailyReturnSymbols || !quoteMarketDay) return;
    let active = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const currentDay = Date.parse(`${quoteMarketDay}T12:00:00.000Z`);
        const response = await fetch(`${TRACKER_SERVICE}/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbols: dailyReturnSymbols.split(","),
            from: Math.floor((currentDay - 21 * 24 * 60 * 60_000) / 1000),
            to: Math.floor(Date.now() / 1000),
          }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as { dailyCloses?: DailyCloseEvidence[] };
        if (!response.ok || !Array.isArray(payload.dailyCloses)) return;
        if (active) setDailyCloseEvidence(payload.dailyCloses);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [activePortfolioId, dailyReturnSymbols, portfolioActive, quoteMarketDay]);

  const assessedResearch = scan?.researchUniverse ?? scan?.results ?? [];
  const researchQuoteSymbols = [...new Set(assessedResearch.map(s => s.ticker))].sort().join(",");
  useEffect(() => {
    if (!researchQuoteSymbols) return;
    let active = true, inFlight = false;
    const controller = new AbortController();
    const symbols = researchQuoteSymbols.split(",");
    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const batches = Array.from({length:Math.ceil(symbols.length / 30)}, (_,i) => symbols.slice(i*30, (i+1)*30));
        const observations = await Promise.all(batches.map(async batch => {
          const response = await fetch("/api/research-prices", {method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({symbols:batch}), signal:controller.signal});
          if (!response.ok) throw Error("Display prices unavailable");
          const payload = await response.json() as {quotes?: unknown};
          return verifiedResearchQuotes(payload.quotes, batch);
        }));
        if (active) setResearchQuotes(Object.assign({}, ...observations));
      } catch {
        // Keep dated observations; a failed request never advances their market time.
      } finally { inFlight = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), marketIsOpen ? 5*60_000 : 15*60_000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [researchQuoteSymbols, marketIsOpen]);
  const currentRanking = scan?.modelVersion === "annual-core-v2-2026-09-29"
    ? assessResearchRanking(assessedResearch, scan.generatedAt, new Date().toISOString()) : null;
  const rankingEntryReason = (stock: AiStock) => {
    if (!currentRanking) return null;
    if (!currentRanking.verified) return "Current Research ranking needs review";
    const rank = currentRanking.rankByTicker.get(stock.ticker);
    return rank === undefined ? "Current comparable research rank is unavailable"
      : rank > RESEARCH_RANK_LIMIT ? `Research rank ${rank} is outside the Top ${RESEARCH_RANK_LIMIT}` : null;
  };
  const holdingResearchStatus = (ticker: string) => {
    if (!scan) return { label: "Research status unavailable", reason: "The latest saved research could not be loaded." };
    const stock = assessedResearch.find((item) => item.ticker === ticker);
    if (stock) {
      if (scan.modelVersion === "annual-core-v2-2026-09-29" && stock.researchV2) {
        const growthStatus = holdingGrowthStatus(stock, scan.generatedAt, new Date().toISOString());
        if (growthStatus) return growthStatus;
        return companyNewBuyStatus({ ...stock.researchV2,
          simulatedBuyEligible: annualCoreBuyEligible(stock.researchV2) && rankingEntryReason(stock) === null,
          buyReasons: [...annualCoreBuyReasons(stock.researchV2), ...(rankingEntryReason(stock) ? [rankingEntryReason(stock)!] : [])] });
      }
      const evidenceGaps = materialResearchScoreGaps(stock.scoreEvidence);
      if (evidenceGaps.length) return { label: "Evidence missing", reason: companyEvidenceGap(evidenceGaps.join("; ")) };
      const reasons = currentEntryReasons(stock);
      return reasons.length
        ? { label: "Below new-buy threshold", reason: companyEvidenceGap(reasons.join("; ")) }
        : { label: "Meets research criteria", reason: "Current portfolio rules determine new buys." };
    }
    const assessment = scan.assessedCompanies?.find((item) => item.ticker === ticker);
    return assessment
      ? { label: assessment.status === "reviewed" ? "Reviewed · unranked" : "Evidence missing", reason: companyEvidenceGap(assessment.reason) }
      : { label: "Not in current review", reason: "This company was not assessed in the latest research scan." };
  };
  const discoverRankingUniverse = scan?.modelVersion === "annual-core-v2-2026-09-29"
    ? assessedResearch.filter(stock => stock.researchV2?.researchRanked).sort(compareResearchRanking)
    : assessedResearch.filter(qualifiesForResearchShortlist);
  const discoverStocks = topResearchCompanies(discoverRankingUniverse);
  const categoryCompanies = groupCompanies([
    ...assessedResearch.map(stock => ({ ticker: stock.ticker, name: stock.name, stock, reason: null as string | null })),
    ...(scan?.assessedCompanies ?? []).filter(company => !assessedResearch.some(stock => stock.ticker === company.ticker))
      .map(company => ({ ticker: company.ticker, name: company.name, stock: null, reason: company.reason })),
  ]);
  const selectedResearchAssessment = scan?.assessedCompanies?.find(company => company.ticker === selectedResearchTicker);
  const selectedResearchStock = assessedResearch.find(
    (stock) => stock.ticker === selectedResearchTicker,
  ) ?? null;
  const selectedResearchExplanation = selectedResearchStock
    ? companyResearchExplanation(selectedResearchStock)
    : null;
  const selectedScoreExplanation = selectedResearchStock
    ? researchScoreExplanation(selectedResearchStock)
    : null;
  const selectedDisplayPrice = selectedResearchStock ? researchDisplayPrice(selectedResearchStock, researchQuotes[selectedResearchStock.ticker]) : null;
  const selectedResearchDataNotice = selectedResearchStock
    ? researchDataNotice({ priceAsOf: selectedResearchStock.priceAsOf, scan })
    : null;
  const sourceTicker = selectedResearchStock?.ticker ?? "";
  const sourcePeriod = selectedResearchStock?.asOfDate ?? "";
  const sourceScanDate = scan?.generatedAt ?? "";
  const sourceFilingDate = selectedResearchStock?.filingDate ?? "";
  const financialSourceKey = `${sourceTicker}|${sourcePeriod}|${sourceScanDate}|${sourceFilingDate}`;
  const activeFinancialSource = financialSource?.key === financialSourceKey ? financialSource.value : null;
  const selectedResearchPresentation = selectedResearchStock
    ? companyResearchPresentation(selectedResearchStock, scan?.generatedAt, activeFinancialSource)
    : null;
  const financialSourceLoading = Boolean(sourceTicker) && financialSource?.key !== financialSourceKey;
  useEffect(() => {
    if (!sourceTicker) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    let active = true;
    const params = new URLSearchParams({ ticker: sourceTicker, period: sourcePeriod, scanAsOf: sourceScanDate });
    if (sourceFilingDate && sourceFilingDate !== "Unknown") params.set("filed", sourceFilingDate);
    void fetch(`/api/company-sources?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Filing source unavailable");
        return await response.json() as FinancialSource;
      })
      .then((value) => { if (active) setFinancialSource({ key: financialSourceKey, value }); })
      .catch(() => { if (active) setFinancialSource({ key: financialSourceKey, value: null }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [financialSourceKey, sourceTicker, sourcePeriod, sourceScanDate, sourceFilingDate]);
  const holdingMarketPrice = (holding: Holding) => {
    const candidate = prices[holding.ticker];
    return typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0
      ? candidate
      : null;
  };
  const meaningfulDecisions = useMemo(
    () => portfolio?.autoTrading.decisions.filter(
      (decision) => decision.action !== "hold",
    ) ?? [],
    [portfolio?.autoTrading.decisions],
  );
  const orderedTrades = useMemo(
    () => [...(portfolio?.trades ?? [])]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [portfolio?.trades],
  );
  const latestTradeDay = orderedTrades[0]?.createdAt
    ? marketDay(orderedTrades[0].createdAt)
    : "";
  const latestDayTrades = orderedTrades.filter(
    (trade) => marketDay(trade.createdAt) === latestTradeDay,
  );
  const fullTradeHistoryPageCount = Math.max(1, Math.ceil(orderedTrades.length / TRADE_HISTORY_PAGE_SIZE));
  const currentTradeHistoryPage = Math.min(tradeHistoryPage, fullTradeHistoryPageCount - 1);
  const visibleTrades = showFullTradeHistory
    ? orderedTrades.slice(
      currentTradeHistoryPage * TRADE_HISTORY_PAGE_SIZE,
      (currentTradeHistoryPage + 1) * TRADE_HISTORY_PAGE_SIZE,
    )
    : latestDayTrades;
  const openFullTradeHistory = () => {
    setTradeHistoryPage(0);
    setShowFullTradeHistory(true);
  };
  const closeFullTradeHistory = () => {
    setShowFullTradeHistory(false);
    setTradeHistoryPage(0);
  };
  const decisionByTrade = useMemo(
    () => uniqueDecisionByTradeKey(meaningfulDecisions),
    [meaningfulDecisions],
  );
  const latestNoActionCheck = portfolio?.autoTrading.decisions.find(
    (decision) => decision.action === "hold",
  ) ?? null;
  const latestResearchRun = portfolio?.autoTrading.researchRuns?.[0] ?? null;
  const unownedEligibleCandidates = latestResearchRun?.candidateResearch.filter(
    (candidate) =>
      candidate.eligibleForAutopilot &&
      !portfolio?.holdings.some((holding) => holding.ticker === candidate.ticker),
  ).length ?? 0;
  const holdingMarketPrices = portfolio?.holdings.map((holding) => ({
    holding,
    price: holdingMarketPrice(holding),
  })) ?? [];
  const currentPortfolioValue = portfolio && holdingMarketPrices.every(({ price }) => price !== null)
    ? portfolio.cash + holdingMarketPrices.reduce(
      (sum, { holding, price }) => sum + holding.shares * price!,
      0,
    )
    : null;
  const marketDataLabel = marketDataState === "loading" ? "Loading…" : "Unavailable";
  const cashExplanation = !latestResearchRun
    ? "Cash remains available under the current strategy rules."
    : latestResearchRun.candidatesEligible === 0
      ? "Cash remains because no researched companies currently meet every entry rule."
      : unownedEligibleCandidates === 0
        ? `The ${latestResearchRun.candidatesEligible} qualifying ${latestResearchRun.candidatesEligible === 1 ? "company is" : "companies are"} already held; purchase targets and available cash limit further additions.`
        : "Cash remains available while Autopilot applies purchase targets and portfolio-size limits."
  const totalPortfolioReturn = calculateReturn(currentPortfolioValue, portfolio?.initialCash);

  useEffect(() => {
    if (!portfolio || !portfolioActive || !pendingSectionRef.current) return;
    const target = pendingSectionRef.current;
    pendingSectionRef.current = null;
    const frame = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [portfolio, portfolioActive]);

  function jumpToPortfolio(section: string) {
    if (!portfolioActive || !portfolio) pendingSectionRef.current = section;
    setPortfolioActive(true);
  }

  const nav = (
    <header className="topbar">
      <Link className="brand" href="/">
        {PRODUCT_NAME}<span aria-hidden="true">.</span>
      </Link>
      <nav className="primary-nav dashboard-shortcuts" aria-label="Primary navigation">
        <a href="#research">Research</a>
        <a href="#companies">Companies</a>
        <a href="#portfolio" onClick={() => jumpToPortfolio("portfolio")}>Portfolio</a>
        <a href="#holdings" onClick={() => jumpToPortfolio("holdings")}>Holdings</a>
        <a href="#portfolio-changes" onClick={() => jumpToPortfolio("portfolio-changes")}>Trades</a>
      </nav>
      <AppearancePicker />
    </header>
  );
  const researchFreshness = researchFreshnessStatus({
    scan,
    refreshing: refreshingResearch,
    error,
  });
  return (
      <main id="dashboard-top">
        {nav}
        <section id="research" className="discover-header page-content">
          <div className="personal-hero-copy">
            <h1>Research</h1>
            <p className="muted">Research on companies shaping and applying AI. Price times are shown in New York time.</p>
            <VeyroExplainer variant="opportunity-selection" />
          </div>
          <ResearchLandscape />
          <div className="discover-freshness" data-state={researchFreshness.state} role="status" aria-live="polite">
            <span>{researchFreshness.label}</span>
          </div>
        </section>
        <section className="opportunities page-content">
          {error && scan && <p className="error">{error}</p>}
          {loading && !scan ? (
            <div className="scan-loading">
              <i /> Updating research…
            </div>
          ) : (
            scan ? (
              <>
                <div id="top-ranked" className="ranked-heading">
                  <div><h2>Research-ranked demo companies</h2></div>
                  <p>
                    Select a company to explore
                  </p>
                </div>
                <p className="simulated-reference-note">{scan.modelVersion === "annual-core-v2-2026-09-29"
                  ? "Ranked for research. Simulated new buys require separate financial and risk checks."
                  : "These companies meet Veyro’s research criteria."}</p>
                <p className="simulated-reference-note">Prices are artificial and frozen. Research scores use the synthetic assessment price shown in company details.</p>
                <p className="simulated-reference-note">Price targets are unavailable in this demo. No issuer forecast catalogues are included.</p>
                <div className="opportunity-cards" aria-label="AI company research cards">
                  {discoverStocks.map((stock, index) => {
                    const signal = stock.signal;
                    const risk = principalDiscoverRisk(stock);
                    const rank = discoverRankingUniverse.findIndex((candidate) => candidate.ticker === stock.ticker) + 1;
                    return (
                      <button
                        key={stock.ticker}
                        className={selectedResearchTicker === stock.ticker ? "selected" : ""}
                        onClick={() => setSelectedResearchTicker(stock.ticker)}
                        aria-expanded={selectedResearchTicker === stock.ticker}
                      >
                        <span className="mobile-rank">{rank || index + 1}</span>
                        <span className="mobile-company">
                          <strong>{stock.ticker}</strong>
                          <small>{stock.name}</small>
                          <small className="company-ai-theme">{stock.aiExposureLabel ?? stock.aiTheme}</small>
                          <small className="company-financial-period">{companyFinancialPeriod(stock)}</small>
                          <span className="mobile-price-line">{opportunityPriceDisplay(stock, researchQuotes[stock.ticker])}</span>
                        </span>
                        <span className={`signal ${signalTone(signal)}`}>{researchCaseLabel(signal)}</span>
                        <span className="mobile-context">
                          <span>Revenue growth (3-year annualised) {annualCoreValue(stock.researchV2
                            ? stock.researchV2.evidence.revenue_cagr_3y?.value ?? null
                            : stock.revenueGrowth3y, "percent")}</span>
                          <span>{stock.researchV2 ? "FCF margin " : "Financial health "}{stock.researchV2
                            ? annualCoreValue(stock.researchV2.evidence.free_cash_flow_margin?.value ?? null, "percent")
                            : <FinancialHealthIndicator score={stock.qualityScore} />}</span>
                          {risk && <RiskIndicator risk={risk} compact />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="table-wrap opportunity-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Company</th>
                        <th>Market price</th>
                        <th>Revenue growth<small className="research-metric-basis">3-year annualised</small></th>
                        <th>{scan.modelVersion === "annual-core-v2-2026-09-29" ? "FCF margin" : "Financial health"}</th>
                        <th>Research rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discoverStocks.map((stock, index) => (
                        <tr
                          key={stock.ticker}
                          className={selectedResearchTicker === stock.ticker ? "research-selected" : ""}
                          onClick={() => setSelectedResearchTicker(stock.ticker)}
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedResearchTicker(stock.ticker);
                            }
                          }}
                        >
                          <td className="rank-cell">
                            <small className="company-rank">#{discoverRankingUniverse.findIndex((candidate) => candidate.ticker === stock.ticker) + 1 || index + 1}</small>
                          </td>
                          <td>
                            <span className="company-cell">
                              <strong>{stock.ticker}</strong>
                              <small>{stock.name}</small>
                              <small className="company-ai-theme">{stock.aiExposureLabel ?? stock.aiTheme}</small>
                              <small className="company-financial-period">{companyFinancialPeriod(stock)}</small>
                            </span>
                          </td>
                          <td>
                            {opportunityPriceDisplay(stock, researchQuotes[stock.ticker])}
                          </td>
                          <td>{annualCoreValue(stock.researchV2
                            ? stock.researchV2.evidence.revenue_cagr_3y?.value ?? null
                            : stock.revenueGrowth3y, "percent")}</td>
                          <td>
                            <span className="financial-health-cell">
                              {stock.researchV2
                                ? annualCoreValue(stock.researchV2.evidence.free_cash_flow_margin?.value ?? null, "percent")
                                : <FinancialHealthIndicator score={stock.qualityScore} />}
                            </span>
                          </td>
                          <td>
                            <span className="research-view-cell">
                              <span
                                className={`signal ${signalTone(stock.signal)}`}
                              >
                                {researchCaseLabel(stock.signal)}
                              </span>
                              <small>{formatResearchScore(stock.researchV2 ? stock.researchV2.score : stock.opportunityScore)}</small>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <section id="companies" className="company-categories" aria-labelledby="company-categories-title">
                  <div className="section-heading compact">
                    <div><h2 id="company-categories-title">Companies by category</h2></div>
                    <p>{categoryCompanies.reduce((total, group) => total + group.companies.length, 0)} reviewed companies</p>
                  </div>
                  <p className="category-note">Grouped by primary business. Research ratings and new-buy criteria remain separate.</p>
                  <nav className="category-shortcuts" aria-label="Company categories">
                    {categoryCompanies.map(group => <a key={group.id} href={`#category-${group.id}`}>{group.label}<span>{group.companies.length}</span></a>)}
                  </nav>
                  {categoryCompanies.map(group => <section key={group.id} id={`category-${group.id}`} className="company-category" aria-labelledby={`category-title-${group.id}`}>
                    <header><div><h3 id={`category-title-${group.id}`}>{group.label}</h3><p>{group.description}</p></div><span>{group.companies.length} companies</span></header>
                    <div className="category-company-grid">
                      {group.companies.map(company => {
                        const business = companyBusiness(company.ticker);
                        return <button type="button" key={company.ticker} onClick={() => setSelectedResearchTicker(company.ticker)} aria-label={`Open ${company.ticker} company research`}>
                          <span className="category-company-heading"><strong>{company.ticker}</strong><span aria-hidden="true">↗</span></span>
                          <span className="category-company-name-row">
                            <span className="category-company-name">{business?.name ?? company.name}</span>
                            <span className="category-company-inline-score" aria-label={`Research score: ${company.stock ? formatResearchScore(company.stock.researchV2 ? company.stock.researchV2.score : company.stock.opportunityScore) : "Unavailable"}`} title="Research score">{company.stock ? formatResearchScore(company.stock.researchV2 ? company.stock.researchV2.score : company.stock.opportunityScore) : "Unavailable"}</span>
                          </span>
                          <span className="category-company-role">{business?.role ?? companyGroup(company.ticker).label}</span>
                          <span className="category-company-description">{business?.description ?? "Business overview unavailable."}</span>
                          <span className="company-financial-period">{companyFinancialPeriod(company.stock)}</span>
                          {company.stock ? <span className="category-company-metrics">
                            {companyCardMetrics(company.stock).map(metric => <span key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong></span>)}
                          </span> : <span className="category-company-summary">Research score unavailable. View research for the evidence gaps.</span>}
                          <span className="category-company-footer">View research</span>
                        </button>;
                      })}
                    </div>
                  </section>)}
                </section>
                {selectedResearchStock && (
                  <div className="research-drawer-shell" ref={researchDrawerShellRef}>
                    <button className="research-drawer-backdrop" tabIndex={-1} aria-hidden="true" onClick={() => setSelectedResearchTicker(null)} />
                    <section className="company-research research-drawer" ref={researchDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${selectedResearchStock.ticker} research`}>
                    <header>
                      <div>
                        <p className="eyebrow">{companyGroup(selectedResearchStock.ticker).label}</p>
                        <h3>{selectedResearchStock.ticker} · {selectedResearchStock.name}</h3>
                        <p>{selectedResearchStock.aiTheme}</p>
                      </div>
                      <button onClick={() => setSelectedResearchTicker(null)} aria-label="Close company research">Close</button>
                    </header>
                    {selectedResearchStock.aiEconomicLinkage ? <p className="company-profile-summary">{selectedResearchStock.aiEconomicLinkage}</p> : null}
                    <nav className="company-research-nav" aria-label="Company research sections">
                      <a href="#company-overview">Overview</a>
                      <a href="#company-evidence">Evidence</a>
                      <a href="#company-valuation">Valuation</a>
                      <a href="#company-risks">Risks</a>
                      <a href="#company-sources">Sources</a>
                    </nav>
                    <section className="company-research-section" aria-labelledby="company-overview">
                      <h4 id="company-overview" tabIndex={-1}>Overview</h4>
                    <div className="research-overview">
                      <article>
                        <span>{selectedDisplayPrice?.label ?? "Market price"}</span>
                        <strong>
                          {selectedDisplayPrice?.price == null ? "Unavailable" : price(selectedDisplayPrice.price)}
                        </strong>
                        <p>
                          <span className={selectedDisplayPrice?.percent == null ? "price-muted" : selectedDisplayPrice.percent >= 0 ? "price-up" : "price-down"}>
                            {selectedDisplayPrice?.percent == null ? "Daily movement unavailable" : `${percent(selectedDisplayPrice.percent / 100)} vs previous close`}
                          </span>
                          <br /><small>{displayPriceTime(selectedDisplayPrice?.asOf ?? null)}</small>
                        </p>
                      </article>
                      <article>
                        <div className="research-rating-heading">
                          <span>Research rating</span>
                          <strong className={`signal ${signalTone(selectedResearchStock.signal)}`}>{researchCaseLabel(selectedResearchStock.signal)}</strong>
                        </div>
                        <p>{whyOpportunityRanks(selectedResearchStock)}</p>
                        {selectedResearchStock.strategyEligibility === "research-only" ? (
                          <p>Does not currently qualify for the simulated portfolio.</p>
                        ) : (
                          <p>
                            {isAutopilotOpportunity(selectedResearchStock) && rankingEntryReason(selectedResearchStock) === null
                              ? "Qualifies for the simulated portfolio, subject to portfolio limits."
                              : "Does not currently qualify for the simulated portfolio."}
                          </p>
                        )}
                      </article>
                      <article>
                        <span>Score</span>
                        <strong>{formatResearchScore(selectedResearchStock.researchV2 ? selectedResearchStock.researchV2.score : selectedResearchStock.opportunityScore)}</strong>
                        {selectedResearchStock.researchV2
                          ? <p>Annual-core research score. New buys also require separate safety checks.</p>
                          : <p>Financial health {financialHealthLabel(selectedResearchStock.qualityScore)} · Valuation <strong className={`valuation-label valuation-${valuationContext(selectedResearchStock).toLowerCase()}`}>{valuationContext(selectedResearchStock)}</strong></p>}
                      </article>
                      <article className="research-data-dates">
                        <span>Data dates</span>
                        <dl>
                          <div>
                            <dt>Market price observed</dt>
                            <dd>{displayPriceTime(selectedDisplayPrice?.asOf ?? null)}</dd>
                          </div>
                          <div>
                            <dt>Assessment price</dt>
                            <dd>{price(selectedResearchStock.currentPrice)} · {displayPriceTime(selectedResearchStock.priceAsOf)}</dd>
                          </div>
                          <div>
                            <dt>Research scan</dt>
                            <dd>{scan?.generatedAt ? activityDateTime(scan.generatedAt) : "Unavailable"}</dd>
                          </div>
                          <div>
                            <dt>Financial basis</dt>
                            <dd>{selectedResearchPresentation?.financialBasis}</dd>
                          </div>
                          <div>
                            <dt>Financial period ended</dt>
                            <dd>{reportingDate(selectedResearchStock.asOfDate)}</dd>
                          </div>
                          <div>
                            <dt>Synthetic record date</dt>
                            <dd>{reportingDate(selectedResearchPresentation?.filingDate)}</dd>
                          </div>
                        </dl>
                        {selectedResearchDataNotice ? (
                          <div className={`research-data-notice research-data-notice-${selectedResearchDataNotice.state}`} role="status">
                            <strong>{selectedResearchDataNotice.title}</strong>
                            <span>{selectedResearchDataNotice.detail}</span>
                          </div>
                        ) : null}
                        {selectedResearchPresentation?.filingDateBasis === "resolved-period" && <p>Filing date resolved for this saved financial period.</p>}
                        <p>Financial-data coverage: {selectedResearchPresentation?.financialCoverage}.</p>
                        <p>AI-evidence confidence: {selectedResearchPresentation?.aiEvidenceConfidence}.</p>
                      </article>
                    </div>
                    </section>
                    <section className="company-research-section" aria-labelledby="company-evidence">
                      <h4 id="company-evidence" tabIndex={-1}>Evidence</h4>
                    <div className="research-detail-grid">
                      <article>
                        <h5>Why this company stands out</h5>
                        {selectedResearchStock.researchV2
                          ? <p>{whyOpportunityRanks(selectedResearchStock)}</p>
                          : <dl className="company-standout-reasons">
                          <div><dt>AI opportunity</dt><dd>{selectedResearchExplanation?.aiOpportunity}</dd></div>
                          <div><dt>Valuation</dt><dd>{selectedResearchExplanation?.valuation}</dd></div>
                          <div><dt>Financial evidence</dt><dd>{selectedResearchExplanation?.financialEvidence}</dd></div>
                        </dl>}
                        <p className="company-standout-period">Financial period ended {reportingDate(selectedResearchStock.asOfDate)}.</p>
                      </article>
                      <article>
                        <h5>Supporting evidence</h5>
                        <p>All business statements and financial inputs in this demonstration are fictional. Checked inputs mean internal consistency, not verified issuer evidence.</p>
                        {(selectedResearchStock.aiEvidenceDetails?.length ?? 0) > 0 ? (
                          <ul className="research-evidence-list">
                            {selectedResearchStock.aiEvidenceDetails?.map((evidence) => (
                              <li key={`${evidence.source}-${evidence.summary}`}><strong>Recorded source category: {brandedCopy(evidence.source)}</strong><span>{brandedCopy(evidence.summary)}</span><ClaimSource ticker={selectedResearchStock.ticker} kind="evidence" claim={evidence.summary} /></li>
                            ))}
                          </ul>
                        ) : (
                          (selectedResearchStock.aiEvidence?.length ?? 0) > 0
                            ? <ul>{selectedResearchStock.aiEvidence?.map((evidence) => <li key={evidence}>{evidence}<ClaimSource ticker={selectedResearchStock.ticker} kind="evidence" claim={evidence} /></li>)}</ul>
                            : <p>Supporting evidence is unavailable for this saved research.</p>
                        )}
                      </article>
                    </div>
                    </section>
                    <section className="company-research-section" aria-labelledby="company-valuation">
                      <h4 id="company-valuation" tabIndex={-1}>Valuation</h4>
                    <div className="research-detail-grid">
                      <article>
                        <h5>{selectedResearchStock.researchV2 ? "Annual-core financial context" : "Business health & valuation"}</h5>
                        <ul>
                          {selectedResearchStock.researchV2 ? <>
                            <li>Free-cash-flow yield: {annualCoreValue(selectedResearchStock.researchV2.evidence.free_cash_flow_yield?.value ?? null, "percent")}</li>
                            <li>Free-cash-flow margin: {annualCoreValue(selectedResearchStock.researchV2.evidence.free_cash_flow_margin?.value ?? null, "percent")}</li>
                          </> : <>
                            <li>Financial health: {financialHealthLabel(selectedResearchStock.qualityScore)}</li>
                            <li>Valuation: <strong className={`valuation-label valuation-${valuationContext(selectedResearchStock).toLowerCase()}`}>{valuationContext(selectedResearchStock)}</strong></li>
                          </>}
                          <li>Three-year annualised revenue growth: {selectedResearchStock.revenueGrowth3y === null ? "not available" : percent(selectedResearchStock.revenueGrowth3y)}</li>
                          {selectedResearchStock.sectorModelLabel && <li>Analysis model: {selectedResearchStock.sectorModelLabel}</li>}
                        </ul>
                        {selectedResearchStock.sectorModelNote && <p>{selectedResearchStock.sectorModelNote}</p>}
                      </article>
                      {selectedResearchStock.researchV2 ? (
                        <article>
                          <h5>Research and entry-check inputs</h5>
                          <p>{annualCoreWeightDescription(selectedResearchStock.researchV2)}</p>
                          <dl className="score-breakdown">
                            {annualCoreFactors.map(([key, label, format]) => {
                              const item = selectedResearchStock.researchV2?.evidence[key];
                              const entryOnly = key === "net_margin" && annualCoreScoreWeights(selectedResearchStock.researchV2)?.net_margin === 0;
                              return <div key={key}><dt>{label}{entryOnly && <small> · Entry check; no score weight</small>}{item?.reportingPeriod && key !== "ai_linkage" && <small> · {item.periodBasis === "annual" ? `Annual history ${reportingDate(item.reportingPeriodStart)} to ${reportingDate(item.reportingPeriod)}` : `Financial period ended ${reportingDate(item.reportingPeriod)}`}</small>}</dt><dd>{annualCoreValue(item?.value ?? null, format)} · {evidenceStatusLabel(item?.status ?? "unavailable")}</dd></div>;
                            })}
                          </dl>
                          {currentEntryReasons(selectedResearchStock, rankingEntryReason(selectedResearchStock)).length > 0 && <p>New buys blocked: {currentEntryReasons(selectedResearchStock, rankingEntryReason(selectedResearchStock)).join("; ")}.</p>}
                        </article>
                      ) : scan?.researchMode !== "ai-economic-ecosystem" && (
                        <article>
                          <h5>Why the score changed</h5>
                          {selectedScoreExplanation ? (
                            <>
                              {selectedScoreExplanation.comparison ? (
                                <p>Earlier saved scan ({activityDateTime(selectedScoreExplanation.comparison.observedAt)}): {selectedScoreExplanation.comparison.previous}. Current scan: {selectedScoreExplanation.comparison.current}.</p>
                              ) : <p>No score was recorded for this company in the earlier saved scan.</p>}
                              <p>The current method gives no points for missing scoring inputs. The scans may also use different financial or price evidence, so the score difference cannot be attributed to the method alone.</p>
                              <p>Missing scoring inputs in this scan: {selectedScoreExplanation.missingInputs.length ? selectedScoreExplanation.missingInputs.join(", ") : "none"}.</p>
                              {selectedScoreExplanation.riskChecks.length > 0 && <p>Unverified risk checks: {selectedScoreExplanation.riskChecks.join(", ")}. These are uncertainties, not confirmed risks.</p>}
                              {selectedScoreExplanation.uncertainty && <p>Score deduction for unverified risk checks: {selectedScoreExplanation.uncertainty} points.</p>}
                            </>
                          ) : <p>Input-level score details were not saved with this scan. They will appear after the next complete research refresh.</p>}
                        </article>
                      )}
                      {!selectedResearchStock.researchV2 && selectedResearchStock.scoreBreakdown && (
                        <article>
                          <h5>Score details</h5>
                          <dl className="score-breakdown">
                            <div><dt>AI exposure</dt><dd>{selectedResearchStock.scoreBreakdown.aiExposure} / 100</dd></div>
                            <div><dt>Financial health</dt><dd>{selectedResearchStock.scoreBreakdown.businessQuality} / 100</dd></div>
                            <div><dt>Valuation</dt><dd>{selectedResearchStock.scoreBreakdown.valuation === null ? "Specialist review required" : `${selectedResearchStock.scoreBreakdown.valuation} / 100`}</dd></div>
                            <div><dt>Evidence confidence</dt><dd>{selectedResearchStock.scoreBreakdown.evidenceConfidence} / 100</dd></div>
                          </dl>
                          {(selectedResearchStock.researchLimitations?.length ?? 0) > 0 && (
                            <ul className="research-limitations">{selectedResearchStock.researchLimitations?.map((item) => <li key={item}>{item}</li>)}</ul>
                          )}
                        </article>
                      )}
                    </div>
                    </section>
                    <ReportedFinancialsPanel report={selectedResearchStock.latestReportedFinancials} />
                    <section className="company-research-section" aria-labelledby="company-risks">
                      <h4 id="company-risks" tabIndex={-1}>Risks</h4>
                    <div className="research-detail-grid">
                      <article className="research-risks">
                        <h5>Risks</h5>
                        <details className="financial-risk-calculations">
                          <summary>Financial risk calculations</summary>
                          <p>Saved scan values are shown below. The synthetic input trace is separate from the saved score. No external financial source is fetched.</p>
                          {financialSourceLoading && <p role="status">Loading current calculation inputs…</p>}
                          {activeFinancialSource?.calculationReview && <p>Synthetic input trace retrieved {activityDateTime(activeFinancialSource.calculationReview.observedAt)} · revenue period ended {reportingDate(activeFinancialSource.calculationReview.periodEnd)}.</p>}
                          {riskCalculations(activeFinancialSource?.calculationReview ? currentRiskCalculationSource(activeFinancialSource.calculationReview.traces) : {}).map((calculation) => <article key={calculation.key}>
                            <h5>{calculation.label}</h5>
                            <p>Saved scan: {riskCalculations(selectedResearchStock).find((item) => item.key === calculation.key)?.formatted} · Synthetic input trace: {calculation.formatted}</p>
                            <p>{calculation.formula}</p><p>{calculation.rule}</p>
                            {calculation.trace ? <>
                              <ul>{calculation.trace.inputs.map((input, index) => <li key={`${input.label}-${index}`}>
                                <strong>{input.label}: {input.value === null ? "Unavailable" : `${input.value.toLocaleString("en-NZ", { maximumFractionDigits: 4 })} ${input.unit ?? ""}`}</strong>
                                <div>{input.concept ?? "SEC concept unavailable"} · {input.start ? `${input.start} to ` : "As at "}{input.end ?? "period unavailable"} · filed {input.filed ?? "date unavailable"}</div>
                                {input.scale !== undefined && input.scale !== 1 && <div>Reported value: {input.rawValue?.toLocaleString("en-NZ")} {input.unit}; scale factor: {input.scale.toFixed(6)}</div>}
                                {input.filingUrl ? <a href={input.filingUrl} target="_blank" rel="noopener noreferrer">Open {input.form ?? "SEC"} filing for this input</a> : <span> Exact filing link unavailable.</span>}
                              </li>)}</ul>
                              {calculation.trace.notes.map((note) => <p key={note}>{note}</p>)}
                            </> : <p>Current calculation inputs are unavailable. The saved scan’s original filing inputs were not retained.</p>}
                          </article>)}
                        </details>

                        {allDiscoverRisks(selectedResearchStock).length ? (
                          <ul className="research-risk-list">{allDiscoverRisks(selectedResearchStock).map((risk) => <li key={risk.text}><RiskIndicator risk={risk} /><ClaimSource ticker={selectedResearchStock.ticker} kind="risk" claim={risk.text} /></li>)}</ul>
                        ) : (
                          <p>No red flags found. Other risks may still apply.</p>
                        )}
                        {reviewedRiskCitations(selectedResearchStock.ticker, allDiscoverRisks(selectedResearchStock).map((risk) => risk.text)).length > 0 && <>
                          <h5>Additional company watch points</h5>
                          <p>Additional risks to monitor, reviewed separately from the saved score. These scenarios may not have occurred.</p>
                          <ul className="research-risk-list">
                            {reviewedRiskCitations(selectedResearchStock.ticker, allDiscoverRisks(selectedResearchStock).map((risk) => risk.text)).map((citation) => (
                              <li key={citation.claim}>
                                <RiskIndicator risk={{ text: citation.claim, kind: "watch", label: "Watch" }} />
                                <ClaimSource ticker={selectedResearchStock.ticker} kind="risk" claim={citation.claim} />
                              </li>
                            ))}
                          </ul>
                        </>}
                      </article>
                    </div>
                    </section>
                    <section className="company-research-section" aria-labelledby="company-sources">
                      <h4 id="company-sources" tabIndex={-1}>Sources</h4>
                      {companyBusiness(selectedResearchStock.ticker) && <p className="research-detail-source">Business overview: <a href={companyBusiness(selectedResearchStock.ticker)!.sourceUrl} target="_blank" rel="noopener noreferrer">Authored business record</a></p>}
                    <div className="research-detail-grid">
                      <article>
                        <h5>Synthetic source records</h5>
                        {financialSourceLoading ? <p role="status">Loading synthetic source…</p> : activeFinancialSource?.filingUrl ? (
                          <>
                            <a href={activeFinancialSource.filingUrl} target="_blank" rel="noreferrer">Open synthetic evidence record</a>
                            <p>Revenue reporting period ended {reportingDate(activeFinancialSource.periodEnd)} · filed {reportingDate(activeFinancialSource.filingDate)}.</p>
                            <p>This authored record demonstrates period and source presentation. It is not an issuer filing.</p>
                          </>
                        ) : <p>A direct financial-source link is unavailable for this saved research.</p>}
                        {activeFinancialSource?.companyUrl && (
                          <a href={activeFinancialSource.companyUrl} target="_blank" rel="noreferrer">Inspect authored demo inputs</a>
                        )}
                      </article>
                      <article>
                        <h5>Market data</h5>
                        <p>Market price source: {selectedDisplayPrice?.source ?? scan?.priceSource ?? "Unavailable"}. USD · {selectedDisplayPrice?.basis ?? "saved assessment basis"}.</p>
                        <p>Market price observed: {displayPriceTime(selectedDisplayPrice?.asOf ?? null)}.</p>
                        <p>Research scores and FCF yield retain the assessment price of {price(selectedResearchStock.currentPrice)} observed {displayPriceTime(selectedResearchStock.priceAsOf)}.</p>
                      </article>
                    </div>
                    </section>
                    </section>
                  </div>
                )}
                {selectedResearchTicker && !selectedResearchStock && selectedResearchAssessment ? (
                  <div className="research-drawer-shell" ref={researchDrawerShellRef}>
                    <button className="research-drawer-backdrop" tabIndex={-1} aria-hidden="true" onClick={() => setSelectedResearchTicker(null)} />
                    <section className="company-research research-drawer" ref={researchDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${selectedResearchTicker} research`}>
                      <header><div><p className="eyebrow">{companyGroup(selectedResearchTicker).label}</p><h3>{selectedResearchTicker} · {selectedResearchAssessment.name}</h3></div><button onClick={() => setSelectedResearchTicker(null)} aria-label="Close company research">Close</button></header>
                      {companyBusiness(selectedResearchTicker) && <>
                        <p className="company-profile-summary">{companyBusiness(selectedResearchTicker)!.description}</p>
                        <p className="research-detail-source">Business overview: <a href={companyBusiness(selectedResearchTicker)!.sourceUrl} target="_blank" rel="noopener noreferrer">Authored business record</a></p>
                      </>}
                      <ReportedFinancialsPanel report={selectedResearchAssessment.latestReportedFinancials} />
                      <h4>Research incomplete</h4>
                      <p>{companyEvidenceGap(selectedResearchAssessment.reason)}</p>
                      <p className="muted">No score or financial figures are inferred from the missing evidence.</p>
                      <p className="muted">Research scan: {activityDateTime(scan.generatedAt)}</p>
                    </section>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="scan-failure" role="alert">
                <strong>Research is unavailable right now</strong>
                <p>{error ? brandedCopy(error) : "Research is temporarily unavailable. Try again later."}</p>
                <button onClick={() => void loadResearch()}>Try again</button>
              </div>
            )
          )}
        </section>
        <section id="portfolio" ref={portfolioSectionRef} className="dashboard-portfolio" aria-labelledby="portfolio-title">
          <div className="discover-header autopilot-header page-content">
            <h2 id="portfolio-title">Simulated Portfolio</h2>
            <VeyroExplainer variant="autopilot" currentRules={autopilotRuleInputs} simulationStartedAt={portfolioStartAt} />
          </div>
        {portfolioActive ? <div id="performance"><VeyroAutopilotOverview
          marketIsOpen={marketIsOpen}
          currentPortfolioValue={currentPortfolioValue}
          totalReturn={totalPortfolioReturn}
          totalReturnAmount={currentPortfolioValue === null || !portfolio ? null : currentPortfolioValue - portfolio.initialCash}
          benchmarkComparisons={portfolioBenchmarkComparisons}
          periodMovement={portfolio && selectedTicker === null ? portfolioMovement : null}
          showPeriodMovement={selectedTicker === null}
          marketDataState={portfolio ? marketDataState : "unavailable"}
          priceAsOf={priceAsOf.SPY ?? null}
        />
        {quoteError ? <div className="market-recovery page-content" role="status">
          <span>{Object.keys(prices).length ? "Price update unavailable. Previously loaded prices are shown with their original observation times." : "Prices are unavailable."}</span>
          <button disabled={quoteLoading} onClick={() => setQuoteRetry(value => value + 1)}>Retry prices</button>
        </div> : null}
        {portfolio ? (
          <div className="discover-performance page-content">
            <PortfolioChart
              portfolio={portfolio}
              displaySnapshot={chartDisplaySnapshot}
              marketIsOpen={marketIsOpen}
              selectedTicker={selectedTicker}
              onSelect={setSelectedTicker}
              onPortfolioMovementChange={setPortfolioMovement}
              onBenchmarkComparisonsChange={setPortfolioBenchmarkComparisons}
            />
            <div className="discover-portfolio-context">
              <section id="holdings" aria-labelledby="discover-holdings-title">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Portfolio</p>
                    <h3 id="discover-holdings-title">Current holdings</h3>
                  </div>
                </div>
                <div className="table-wrap tracker-table discover-holdings-table" aria-label="Simulated holdings">
                  <table>
                    <thead>
                      <tr>
                        <th>Holding</th>
                        <th>Shares</th>
                        <th>Value</th>
                        <th>Today</th>
                        <th>Total return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.holdings.length ? portfolio.holdings.map((holding) => {
                        const researchStatus = holdingResearchStatus(holding.ticker);
                        const livePrice = holdingMarketPrice(holding);
                        const previousClose = verifiedPreviousClose({
                          evidence: dailyCloseEvidence,
                          ticker: holding.ticker,
                          currentMarketDay: sharedQuoteMarketDay([holding.ticker, BENCHMARK], priceAsOf),
                        });
                        const {
                          value,
                          gain,
                          dailyGain,
                          dailyReturn: dailyHoldingReturn,
                          totalReturn: holdingTotalReturn,
                        } = simulatedHoldingMarketValues({ ...holding, livePrice, previousClose });
                        return (
                          <tr
                            key={holding.ticker}
                            className={selectedTicker === holding.ticker ? "chart-selected" : ""}
                            onClick={() => setSelectedTicker(holding.ticker)}
                          >
                            <td>
                              <span className="company-cell">
                                <strong>{holding.ticker}</strong>
                                <small>{holding.name}</small>
                                <small className="holding-research-status"><b>{researchStatus.label}</b> · {researchStatus.reason}</small>
                              </span>
                            </td>
                            <td><strong>{holding.shares.toFixed(4)}</strong></td>
                            <td>
                              <strong>{value === null ? marketDataLabel : money(value)}</strong>
                              <small className="table-secondary">
                                {livePrice === null
                                  ? `${marketDataLabel} market price · ${money(holding.averageCost)} avg`
                                  : `${money(livePrice)} current · ${money(holding.averageCost)} avg`}
                              </small>
                            </td>
                            <td className={dailyGain === null ? "muted" : dailyGain >= 0 ? "price-up" : "price-down"}>
                              {dailyGain === null || dailyHoldingReturn === null
                                ? "Unavailable"
                                : `${money(dailyGain)} · ${percent(dailyHoldingReturn)}`}
                            </td>
                            <td className={gain === null ? "muted" : gain >= 0 ? "price-up" : "price-down"}>
                              {gain === null || holdingTotalReturn === null
                                ? marketDataLabel
                                : `${money(gain)} · ${percent(holdingTotalReturn)}`}
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan={5}>No holdings yet. {cashExplanation}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="holding-cards" aria-label="Simulated holdings">
                  {portfolio.holdings.length ? portfolio.holdings.map((holding) => {
                    const researchStatus = holdingResearchStatus(holding.ticker);
                    const livePrice = holdingMarketPrice(holding);
                    const previousClose = verifiedPreviousClose({
                      evidence: dailyCloseEvidence,
                      ticker: holding.ticker,
                      currentMarketDay: sharedQuoteMarketDay([holding.ticker, BENCHMARK], priceAsOf),
                    });
                    const {
                      value,
                      gain,
                      dailyGain,
                      dailyReturn: dailyHoldingReturn,
                      totalReturn: holdingTotalReturn,
                    } = simulatedHoldingMarketValues({ ...holding, livePrice, previousClose });
                    return (
                      <button
                        key={holding.ticker}
                        className={selectedTicker === holding.ticker ? "selected" : ""}
                        onClick={() => setSelectedTicker(holding.ticker)}
                      >
                        <span className="holding-card-title"><strong>{holding.ticker}</strong><small>{holding.name}</small></span>
                        <span className="holding-card-research"><small>{researchStatus.label}</small><strong>{researchStatus.reason}</strong></span>
                        <span><small>Shares owned</small><strong>{holding.shares.toFixed(4)}</strong></span>
                        <span><small>Value</small><strong>{value === null ? marketDataLabel : money(value)}</strong></span>
                        <span><small>Today</small><strong className={dailyGain === null ? "muted" : dailyGain >= 0 ? "price-up" : "price-down"}>{dailyGain === null || dailyHoldingReturn === null ? "Unavailable" : `${money(dailyGain)} · ${percent(dailyHoldingReturn)}`}</strong></span>
                        <span><small>Total</small><strong className={gain === null ? "muted" : gain >= 0 ? "price-up" : "price-down"}>{gain === null || holdingTotalReturn === null ? marketDataLabel : `${money(gain)} · ${percent(holdingTotalReturn)}`}</strong></span>
                      </button>
                    );
                  }) : <p>No holdings yet. {cashExplanation}</p>}
                </div>
              </section>
              <section id="portfolio-changes" className="recent-decisions" aria-labelledby="discover-decisions-title">
                <div className={showFullTradeHistory ? "section-heading compact trade-history-heading" : "section-heading compact"}>
                  <div>
                    <p className="eyebrow">Portfolio changes</p>
                    <h3 id="discover-decisions-title">
                      {showFullTradeHistory ? "Full trade history" : "Latest trading day"}
                    </h3>
                  </div>
                  {showFullTradeHistory ? (
                    <div className="trade-history-controls" aria-label="Full trade history controls">
                      <span>Page {currentTradeHistoryPage + 1} of {fullTradeHistoryPageCount}</span>
                      <button type="button" onClick={closeFullTradeHistory}>Back to latest day</button>
                      <button
                        type="button"
                        disabled={currentTradeHistoryPage === 0}
                        onClick={() => setTradeHistoryPage((current) => Math.max(0, current - 1))}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={currentTradeHistoryPage === fullTradeHistoryPageCount - 1}
                        onClick={() => setTradeHistoryPage((current) => Math.min(fullTradeHistoryPageCount - 1, current + 1))}
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="simulated-reference-note">Simulated activity only. No real orders are placed. Reasons appear when recorded.</p>
                {visibleTrades.length ? (
                  <div className="recent-decision-list">
                    {visibleTrades.map((trade) => {
                      const decision = decisionForTrade(decisionByTrade, trade);
                      return (
                        <article key={trade.id}>
                          <strong className={trade.side}>{trade.side.toUpperCase()}</strong>
                          <div>
                            <b>{trade.ticker} · {trade.side === "buy" ? "Bought" : "Sold"} {trade.shares.toFixed(4)} shares</b>
                            <p>{decision?.reason ?? "Reason not recorded."}</p>
                          </div>
                          <time dateTime={trade.createdAt}>{activityDateTime(trade.createdAt)}</time>
                        </article>
                      );
                    })}
                    {!showFullTradeHistory && orderedTrades.length > latestDayTrades.length ? (
                      <button
                        className="decision-history-toggle"
                        type="button"
                        onClick={openFullTradeHistory}
                      >
                        View all {orderedTrades.length} changes
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="discover-no-decision">{latestNoActionCheck?.reason ?? "No simulated trades recorded yet."}</p>
                )}
              </section>
            </div>
          </div>
        ) : null}</div> : null}
          {!portfolioActive ? <p className="portfolio-loading page-content">Portfolio data loads when you reach this section.</p> : !portfolio ? <p className="portfolio-loading page-content" role="status">Loading saved portfolio…</p> : null}
        </section>
        <BackToTop />
        <footer>
          <span>{PRODUCT_NAME}</span>
        </footer>
      </main>
    );
}
