import {
  ACTIVE_RESEARCH_MODEL, ACTIVE_BALANCED_POLICY, PREVIOUS_BALANCED_POLICY, THEME_LIMITED_BALANCED_POLICY, BUY_SCORE_THRESHOLD, ACTIVE_CASH_RESERVE_PERCENT,
  annualCoreBuyEligible, annualCoreBuyReasons, isAnnualCoreDecisionPolicy,
} from "./annual-core-policy.ts";
import { assessHoldingGrowth, type HoldingGrowthAssessment } from "./research-holding-policy.ts";
import { researchScoreVerificationReasons, type ScoreAssessment, type ScoreStock } from "./research-score-verification.ts";
import { knownNonCoreFinancialExclusion, purchaseBlockingRiskFlags } from "./purchase-risk-policy.mjs";
import { assessResearchRanking, RESEARCH_RANK_LIMIT } from "./research-ranking.ts";

export type ResearchStock = {
  ticker: string;
  name: string;
  aiTheme: string;
  asOfDate?: string;
  dataBasis?: string;
  financialSourceUrl?: string;
  valuationBasis?: ScoreStock["valuationBasis"];
  coverageIssues?: Array<{ code: string; message: string }>;
  currentPrice: number | null;
  priceChangePercent: number | null;
  priceAsOf: string | null;
  revenueGrowth3y: number | null;
  netMargin: number | null;
  opportunityScore: number;
  legacyOpportunityScore?: number;
  researchV2?: ScoreAssessment & {
    simulatedBuyEligible: boolean;
    buyReasons: string[];
  };
  valuationScore?: number | null;
  exposureScore?: number | null;
  aiEvidenceScore?: number | null;
  aiEvidence?: string[];
  signal: string;
  qualityScore: number | null;
  confidence: number;
  redFlags: string[];
  dataQuality?: "pass" | "excluded";
  scoreEvidence?: {
    missingMetrics: string[];
    unavailableRiskChecks: string[];
    missingEvidencePenalty: number;
  };
  freeCashFlowMargin?: number | null;
  operatingCashFlowMargin?: number | null;
  shareCountGrowth3y?: number | null;
  operatingMarginChange3y?: number | null;
  netDebtToEbitda?: number | null;
  interestCoverage?: number | null;
};

export type Holding = {
  ticker: string;
  name: string;
  shares: number;
  averageCost: number;
};

export type Trade = {
  id: string;
  side: "buy" | "sell";
  ticker: string;
  name: string;
  shares: number;
  price: number;
  value: number;
  createdAt: string;
};

export type AutoDecision = {
  id: string;
  createdAt: string;
  ticker: string | null;
  action: "buy" | "sell" | "hold";
  reason: string;
};

export type ResearchNode = {
  name: "Financials" | "Valuation" | "AI position" | "Risk review";
  verdict: "positive" | "neutral" | "negative";
  confidence: number;
  summary: string;
  evidence: string[];
};

export type CandidateResearch = {
  ticker: string;
  nodes: ResearchNode[];
  verification: "verified" | "needs review";
  verificationReason: string;
  entryReasons: string[];
  eligibleForAutopilot: boolean;
  holdingGrowth?: HoldingGrowthAssessment;
  researchScore?: number | null;
  scoreVerification?: "verified" | "needs review";
  scoreVerificationReason?: string;
  researchRank?: number | null;
  rankingVerification?: "verified" | "needs review";
  rankingVerificationReason?: string;
};

export type ResearchRun = {
  id: string;
  createdAt: string;
  scanGeneratedAt: string;
  // Extra pre-buy scans update current evidence without advancing confirmations.
  confirmationEligible?: boolean;
  changeDetected: boolean;
  changeSummary: string;
  candidatesReviewed: number;
  candidatesVerified: number;
  candidatesEligible: number;
  candidateResearch: CandidateResearch[];
  decisionPolicy?: "legacy-balanced-v1" | "ai-opportunities-v2" | typeof ACTIVE_RESEARCH_MODEL | typeof PREVIOUS_BALANCED_POLICY | typeof THEME_LIMITED_BALANCED_POLICY | typeof ACTIVE_BALANCED_POLICY;
};

export type LoopStage = {
  name: "Observe" | "Validate" | "Evaluate" | "Decide" | "Act" | "Verify" | "Record";
  status: "passed" | "skipped" | "failed";
  summary: string;
};

export type LoopRun = {
  id: string;
  runKey: string;
  startedAt: string;
  completedAt: string;
  status: "completed" | "held" | "blocked" | "failed";
  stages: LoopStage[];
  tradeIds: string[];
  portfolioValue: number;
};

export type AutoTradingState = {
  strategyProfile?: "balanced";
  enabled: boolean;
  maxPositions: number;
  maxPositionPercent: number;
  // Balanced portfolio drawdown review threshold; retain the saved field name.
  stopLossPercent: number;
  // Retained only so existing simulated portfolios and their history remain
  // readable. AI Opportunities no longer makes automatic profit-target exits.
  takeProfitPercent: number;
  lastRunAt: string | null;
  decisions: AutoDecision[];
  researchRuns?: ResearchRun[];
  // Retain two distinct source assessments independently of the loop log.
  researchAssessments?: ResearchRun[];
  loopRuns?: LoopRun[];
  insightReviews?: Array<{
    key: string;
    insightId: string;
    title: string;
    suggestion: string;
    status: "approved" | "dismissed";
    decidedAt: string;
  }>;
};

export type AutopilotPortfolio = {
  cash: number;
  holdings: Holding[];
  trades: Trade[];
  watchSymbols: string[];
  autoTrading: AutoTradingState;
  benchmark?: {
    symbol: "SPY";
    entryPrice: number;
    entryAt: string;
  };
};

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

// Rebalancing every small price move creates noisy, uneconomic paper trades.
// Batch routine additions until they are meaningful; thesis and safety exits
// still close immediately regardless of size.
export function minimumTradeValue(accountValue: number) {
  return Math.max(100, accountValue * 0.01);
}

function percent(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

export function isAiOpportunitiesEntryWindow(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) &&
    minutes >= 11 * 60 + 30 && minutes < 14 * 60 + 30;
}

export function aiThemeGroup(theme: string) {
  const value = theme.toLowerCase();
  if (/chip|compute|silicon|memory|hardware|server|semiconductor/.test(value))
    return "Compute";
  if (/network|connect|optical/.test(value)) return "Networking";
  if (/cloud|data/.test(value)) return "Cloud & data";
  if (/power|infrastructure/.test(value)) return "Infrastructure";
  return "Software & apps";
}

type BalancedDecisionPolicy = "legacy-balanced-v1" | "ai-opportunities-v2" | typeof ACTIVE_RESEARCH_MODEL;

export function convictionWeight(
  score: number,
  maximum: number,
  balancedPolicy: BalancedDecisionPolicy = "legacy-balanced-v1",
) {
  const target = balancedPolicy !== "legacy-balanced-v1"
    ? score >= 75 ? 0.15 : score >= 65 ? 0.12 : 0.1
    : score >= 85 ? 0.12 : score >= 75 ? 0.1 : 0.07;
  return Math.min(target, maximum);
}

export function isAutopilotOpportunity(
  stock: ResearchStock,
  balancedPolicy: BalancedDecisionPolicy = "legacy-balanced-v1",
) {
  if (balancedPolicy === ACTIVE_RESEARCH_MODEL) {
    return stock.researchV2?.version === ACTIVE_RESEARCH_MODEL &&
      annualCoreBuyEligible(stock.researchV2);
  }
  const opportunityThreshold = balancedPolicy === "ai-opportunities-v2" ? 60 : 70;
  const qualityThreshold = balancedPolicy === "ai-opportunities-v2" ? 65 : 70;
  return (
    stock.dataQuality !== "excluded" &&
    stock.currentPrice !== null &&
    !stock.redFlags.length &&
    stock.opportunityScore >= opportunityThreshold &&
    (stock.qualityScore ?? 0) >= qualityThreshold &&
    (stock.revenueGrowth3y ?? 0) >= 0.1 &&
    stock.confidence >= 0.6 &&
    stock.signal !== "Review risks"
  );
}

export function autopilotEntryReasons(
  stock: ResearchStock,
  balancedPolicy: BalancedDecisionPolicy = "legacy-balanced-v1",
) {
  if (balancedPolicy === ACTIVE_RESEARCH_MODEL) {
    return stock.researchV2?.version === ACTIVE_RESEARCH_MODEL
      ? annualCoreBuyReasons(stock.researchV2)
      : ["Current annual-core research assessment is unavailable"];
  }
  const opportunityThreshold = balancedPolicy === "ai-opportunities-v2" ? 60 : 70;
  const qualityThreshold = balancedPolicy === "ai-opportunities-v2" ? 65 : 70;
  const reasons = [
    ...(stock.opportunityScore < opportunityThreshold
      ? [`Score ${stock.opportunityScore.toFixed(1)} — requires at least ${opportunityThreshold}`]
      : []),
    ...((stock.qualityScore ?? 0) < qualityThreshold
      ? [`Financial health ${(stock.qualityScore ?? 0).toFixed(1)} — requires at least ${qualityThreshold}`]
      : []),
    ...((stock.revenueGrowth3y ?? 0) < 0.1
      ? [`Three-year revenue growth ${percent(stock.revenueGrowth3y ?? 0)} — requires at least +10.00%`]
      : []),
    ...(stock.dataQuality === "excluded"
      ? ["Financial data did not pass validation"]
      : []),
    ...(stock.currentPrice === null
      ? ["A current regular-market price is required"]
      : []),
    ...(stock.confidence < 0.6
      ? [`Evidence confidence ${Math.round(stock.confidence * 100)}% — requires at least 60%`]
      : []),
    ...stock.redFlags.map((flag) => `Risk flag: ${flag}`),
    ...(stock.signal === "Review risks" && stock.redFlags.length === 0
      ? ["The research signal requires a risk review"]
      : []),
  ];
  return [...new Set(reasons)];
}

export function dynamicGuardrails(
  stocks: ResearchStock[],
  balancedPolicy: BalancedDecisionPolicy = "legacy-balanced-v1",
) {
  const opportunities = stocks
    .filter((stock) => isAutopilotOpportunity(stock, balancedPolicy))
    .sort((left, right) => right.opportunityScore - left.opportunityScore);
  const averageScore = opportunities.length
    ? opportunities.reduce((sum, stock) => sum + stock.opportunityScore, 0) /
      opportunities.length
    : 0;
  const themeCount = new Set(
    opportunities.map((stock) => aiThemeGroup(stock.aiTheme)),
  ).size;
  const cashReservePercent = balancedPolicy === ACTIVE_RESEARCH_MODEL
    ? ACTIVE_CASH_RESERVE_PERCENT
    : balancedPolicy !== "legacy-balanced-v1"
      ? opportunities.length === 0
        ? 1
        : opportunities.length >= 4
          ? 0.1
          : 0.2
      : opportunities.length === 0
        ? 1
        : opportunities.length >= 6 && averageScore >= 80 && themeCount >= 3
          ? 0.05
          : opportunities.length >= 4 && averageScore >= 72 && themeCount >= 2
            ? 0.1
            : opportunities.length >= 2
              ? 0.2
              : 0.4;
  return { opportunities, cashReservePercent };
}

const TARGET_ADDITION_DRIFT_PERCENT = 0.02;
const MINIMUM_REPLACEMENT_SCORE_ADVANTAGE = 5;
const NON_EXIT_SCORE_GAPS = new Set(["price_return_6m", "price_return_12m"]);

function comparableScoreEvidence(stock: ResearchStock) {
  if (stock.researchV2?.version === ACTIVE_RESEARCH_MODEL) {
    return stock.researchV2.researchRanked && stock.researchV2.score !== null;
  }
  const evidence = stock.scoreEvidence;
  return Boolean(evidence && evidence.missingEvidencePenalty === 0 &&
    Array.isArray(evidence.missingMetrics) &&
    evidence.missingMetrics.every((metric) => NON_EXIT_SCORE_GAPS.has(metric)) &&
    Array.isArray(evidence.unavailableRiskChecks) && evidence.unavailableRiskChecks.length === 0);
}

function stableReplacementTickers(
  currentScanGeneratedAt: string,
  previousRuns: ResearchRun[] = [],
  decisionPolicy: ResearchRun["decisionPolicy"] = "ai-opportunities-v2",
  confirmationEligible = true,
) {
  const required = confirmationEligible ? 1 : 2;
  const previousDistinctScans = previousRuns.filter(
    (run) => run.scanGeneratedAt !== currentScanGeneratedAt && run.decisionPolicy === decisionPolicy,
  ).slice(0, required);
  if (previousDistinctScans.length !== required) return new Set<string>();
  return new Set(
    previousDistinctScans[0].candidateResearch
      .filter((candidate) => candidate.eligibleForAutopilot && previousDistinctScans.every(run =>
        run.candidateResearch.some(item => item.ticker === candidate.ticker && item.eligibleForAutopilot)))
      .map((candidate) => candidate.ticker),
  );
}

function stableIneligibleHoldings(
  currentScanGeneratedAt: string,
  previousRuns: ResearchRun[] = [],
  decisionPolicy: ResearchRun["decisionPolicy"] = "ai-opportunities-v2",
  confirmationEligible = true,
) {
  const required = confirmationEligible ? 1 : 2;
  const previousDistinctScans = previousRuns.filter(
    (run) => run.scanGeneratedAt !== currentScanGeneratedAt && run.decisionPolicy === decisionPolicy,
  ).slice(0, required);
  if (previousDistinctScans.length !== required) return new Set<string>();
  return new Set(previousDistinctScans[0].candidateResearch
    .filter((candidate) => previousDistinctScans.every(run => run.candidateResearch.some(item =>
      item.ticker === candidate.ticker && item.verification === "verified" && !item.eligibleForAutopilot)))
    .map((candidate) => candidate.ticker));
}

function balancedPortfolioTargets({
  opportunities,
  stocks,
  holdings,
  prices,
  accountValue,
  cashReservePercent,
  maxPositions,
  maxPositionPercent,
  stableReplacementCandidates,
  stableIneligibleTickers,
  allowReplacements = true,
}: {
  opportunities: ResearchStock[];
  stocks: ResearchStock[];
  holdings: Holding[];
  prices: Record<string, number>;
  accountValue: number;
  cashReservePercent: number;
  maxPositions: number;
  maxPositionPercent: number;
  stableReplacementCandidates: Set<string>;
  stableIneligibleTickers: Set<string>;
  allowReplacements?: boolean;
}) {
  const eligibleTickers = new Set(opportunities.map((stock) => stock.ticker));
  const retained = holdings.filter((holding) => !eligibleTickers.has(holding.ticker));
  const eligibleWithPrice = opportunities.filter(
    (stock) => Number.isFinite(prices[stock.ticker]) && prices[stock.ticker] > 0,
  );
  const heldTickers = new Set(holdings.map((holding) => holding.ticker));
  const selected = eligibleWithPrice
    .filter((stock) => heldTickers.has(stock.ticker))
    .slice(0, Math.max(0, maxPositions - retained.length));
  const selectedTickers = new Set(selected.map((stock) => stock.ticker));
  const pendingReplacements: Array<{ ticker: string; reason: string }> = [];

  // Open slots may be filled immediately. A replacement needs stable entry
  // research and a five-point lead. Missing-research holdings are protected.
  for (const candidate of eligibleWithPrice) {
    if (selected.length + retained.length >= maxPositions) break;
    if (selectedTickers.has(candidate.ticker)) continue;
    selected.push(candidate);
    selectedTickers.add(candidate.ticker);
  }
  if (allowReplacements && selected.length + retained.length >= maxPositions) {
    for (const candidate of eligibleWithPrice) {
      if (
        selectedTickers.has(candidate.ticker) ||
        heldTickers.has(candidate.ticker)
      ) continue;
      const replaceable = [
        ...selected.flatMap((stock, index) => comparableScoreEvidence(stock)
          ? [{ stock, index, retainedIndex: -1 }]
          : []),
        ...retained.flatMap((holding, retainedIndex) => {
          const stock = stocks.find((item) => item.ticker === holding.ticker);
          return stock?.dataQuality === "pass" && comparableScoreEvidence(stock) &&
            stableIneligibleTickers.has(holding.ticker)
            ? [{ stock, index: -1, retainedIndex }]
            : [];
        }),
      ].sort((left, right) =>
        left.stock.opportunityScore - right.stock.opportunityScore || right.index - left.index,
      );
      const lowest = replaceable[0];
      if (!lowest) continue;
      const scoreAdvantage = candidate.opportunityScore - lowest.stock.opportunityScore;
      if (scoreAdvantage <= 0) continue;
      if (!stableReplacementCandidates.has(candidate.ticker)) {
        pendingReplacements.push({
          ticker: candidate.ticker,
          reason: "A portfolio replacement waits until the new candidate remains eligible in a second distinct research scan.",
        });
        continue;
      }
      if (
        scoreAdvantage < MINIMUM_REPLACEMENT_SCORE_ADVANTAGE
      ) {
        pendingReplacements.push({
          ticker: candidate.ticker,
          reason: `A portfolio replacement requires a ${MINIMUM_REPLACEMENT_SCORE_ADVANTAGE}-point score advantage; the current advantage is ${scoreAdvantage.toFixed(1)} points.`,
        });
        continue;
      }
      if (lowest.retainedIndex >= 0) retained.splice(lowest.retainedIndex, 1);
      else {
        selectedTickers.delete(selected[lowest.index].ticker);
        selected.splice(lowest.index, 1);
      }
      selected.push(candidate);
      selectedTickers.add(candidate.ticker);
    }
  }
  selected.sort((left, right) => right.opportunityScore - left.opportunityScore);
  const displacedTickers = new Set(allowReplacements ?
    holdings
      .filter((holding) => !retained.some((item) => item.ticker === holding.ticker) && !selectedTickers.has(holding.ticker))
      .map((holding) => holding.ticker) : [],
  );
  const retainedValue = retained.reduce(
    (sum, holding) => sum + holding.shares * prices[holding.ticker],
    0,
  );
  const investableValue = Math.max(
    0,
    accountValue * (1 - cashReservePercent) - retainedValue,
  );
  const raw = selected.map((stock) => ({
    stock,
    value: accountValue * convictionWeight(
      stock.opportunityScore,
      maxPositionPercent,
      "ai-opportunities-v2",
    ),
  }));
  const rawTotal = raw.reduce((sum, item) => sum + item.value, 0);
  const portfolioScale = rawTotal > investableValue && rawTotal > 0
    ? investableValue / rawTotal
    : 1;
  const targets = raw.map((item) => ({ ...item, value: item.value * portfolioScale }));

  return { targets, displacedTickers, pendingReplacements };
}

function financialNode(stock: ResearchStock): ResearchNode {
  const growth = stock.revenueGrowth3y;
  const quality = stock.qualityScore;
  const positive = (growth ?? -1) >= 0.1 && (quality ?? 0) >= 70;
  const negative = (growth ?? 0) < 0 || (quality ?? 100) < 45;
  return {
    name: "Financials",
    verdict: positive ? "positive" : negative ? "negative" : "neutral",
    confidence: stock.confidence,
    summary: positive
      ? "Growth and financial health clear the portfolio standard."
      : negative
        ? "Growth or financial health needs material improvement."
        : "The financial evidence is mixed.",
    evidence: [
      `Revenue growth ${growth === null ? "unavailable" : percent(growth)}`,
      `Financial health ${quality === null ? "unavailable" : Math.round(quality)}`,
      `Net margin ${stock.netMargin === null ? "unavailable" : percent(stock.netMargin)}`,
    ],
  };
}

function valuationNode(stock: ResearchStock): ResearchNode {
  const score = stock.valuationScore ?? null;
  return {
    name: "Valuation",
    verdict: score === null ? "neutral" : score >= 60 ? "positive" : score < 40 ? "negative" : "neutral",
    confidence: score === null ? Math.min(stock.confidence, 0.5) : stock.confidence,
    summary:
      score === null
        ? "A complete current valuation score was not available."
        : score >= 60
          ? "Current valuation compares favourably with the model's ranges."
          : score < 40
            ? "Current valuation leaves limited room for error."
            : "Current valuation is neither clearly attractive nor excessive.",
    evidence: [
      `Valuation score ${score === null ? "unavailable" : Math.round(score)}`,
      `Regular-market price ${stock.currentPrice === null ? "unavailable" : `$${stock.currentPrice.toFixed(2)}`}`,
      `Price timestamp ${stock.priceAsOf ?? "unavailable"}`,
    ],
  };
}

function aiPositionNode(stock: ResearchStock): ResearchNode {
  const score = stock.exposureScore ?? 50;
  return {
    name: "AI position",
    verdict: score >= 60 ? "positive" : score < 45 ? "negative" : "neutral",
    confidence: stock.exposureScore === null || stock.exposureScore === undefined ? 0.5 : stock.confidence,
    summary: `ClearSignal classifies the company within ${stock.aiTheme}.`,
    evidence: [
      `AI theme ${stock.aiTheme}`,
      `AI exposure proxy ${stock.exposureScore === null || stock.exposureScore === undefined ? "not separately scored" : Math.round(stock.exposureScore)}`,
      `AI evidence ${stock.aiEvidenceScore === null || stock.aiEvidenceScore === undefined ? "not separately scored" : Math.round(stock.aiEvidenceScore)}`,
      ...(stock.aiEvidence ?? []).slice(0, 2),
    ],
  };
}

function riskNode(stock: ResearchStock): ResearchNode {
  const hasRisk = stock.redFlags.length > 0;
  return {
    name: "Risk review",
    verdict: hasRisk ? "negative" : stock.confidence >= 0.65 ? "positive" : "neutral",
    confidence: stock.confidence,
    summary: hasRisk
      ? "One or more explicit warning signs require review."
      : "No explicit automated risk flag was found in the current evidence.",
    evidence: hasRisk
      ? stock.redFlags
      : [`Data confidence ${Math.round(stock.confidence * 100)}%`, "No explicit risk flags"],
  };
}

// These are entry thresholds, not evidence gaps. Unknown restrictions and
// financial/risk evidence failures continue to require review.
const ANNUAL_CORE_ENTRY_THRESHOLDS = new Set([
  "Candidate score below 65",
  "Candidate score below 70",
  ...(BUY_SCORE_THRESHOLD === null ? [] : [`Candidate score below ${BUY_SCORE_THRESHOLD}`]),
  "Revenue growth below 10%",
  "Revenue growth below 20%",
  "Free cash flow margin not positive",
  "Net margin not positive",
  "Neither net profit nor free cash flow is positive",
]);

const MISSING_PURCHASE_SAFETY = /^(Net debt safety evidence|Debt-service evidence|Operating-margin risk evidence): (unavailable_source|not_applicable)$/;

function scoreDecision(stock: ResearchStock, scanGeneratedAt: string, now: string) {
  const reasons = researchScoreVerificationReasons(stock, scanGeneratedAt, now);
  // Only known omissions outside the six scoring inputs may bypass the old
  // aggregate data-quality flag. Unexplained exclusions still require review.
  const knownNonScoreExclusion = knownNonCoreFinancialExclusion(stock);
  if (stock.dataQuality !== "pass" && !knownNonScoreExclusion) reasons.push("Financial data exclusion is unexplained");
  reasons.push(...autopilotEntryReasons(stock, ACTIVE_RESEARCH_MODEL).filter(reason =>
    !ANNUAL_CORE_ENTRY_THRESHOLDS.has(reason) && !MISSING_PURCHASE_SAFETY.test(reason)));
  if (stock.researchV2?.simulatedBuyEligible === false && stock.researchV2.buyReasons.length === 0) {
    reasons.push("Saved buy eligibility is inconsistent with its entry checks");
  }
  return {
    scoreVerification: reasons.length ? "needs review" as const : "verified" as const,
    scoreVerificationReason: reasons.length ? [...new Set(reasons)].join("; ") :
      "The six scoring inputs and their source, period, price and currency evidence are verified.",
  };
}

function candidateDecision(
  stock: ResearchStock,
  balancedPolicy: BalancedDecisionPolicy,
  scanGeneratedAt: string,
  now: string,
): Pick<CandidateResearch, "verification" | "verificationReason" | "entryReasons" | "eligibleForAutopilot" | "researchScore" | "scoreVerification" | "scoreVerificationReason" | "holdingGrowth"> {
  const entryReasons = autopilotEntryReasons(stock, balancedPolicy);
  const holdingGrowth = balancedPolicy === ACTIVE_RESEARCH_MODEL ? assessHoldingGrowth(stock, scanGeneratedAt, now) : undefined;
  const reasons = balancedPolicy === ACTIVE_RESEARCH_MODEL
    ? [
      ...entryReasons.filter((reason) => !ANNUAL_CORE_ENTRY_THRESHOLDS.has(reason)),
      ...researchScoreVerificationReasons(stock, scanGeneratedAt, now),
      ...(holdingGrowth?.verification === "needs review" ? [holdingGrowth.verificationReason] : []),
      ...(!stock.researchV2?.researchRanked || !Number.isFinite(stock.researchV2.score) ||
        !Number.isFinite(stock.opportunityScore) ? ["Comparable research score is unavailable"] : []),
      ...(stock.researchV2 && (stock.researchV2.score !== stock.opportunityScore ||
        stock.researchV2.score! < 0 || stock.researchV2.score! > 100)
        ? ["Research score does not match its current assessment"] : []),
      ...(stock.dataQuality !== "pass" && !knownNonCoreFinancialExclusion(stock)
        ? ["financial data failed validation"] : []),
      ...(!(stock.currentPrice !== null && Number.isFinite(stock.currentPrice) && stock.currentPrice > 0) ||
        !stock.priceAsOf || !Number.isFinite(Date.parse(stock.priceAsOf))
        ? ["current regular-market price evidence is unavailable"] : []),
      ...purchaseBlockingRiskFlags(stock.redFlags),
      ...(stock.researchV2?.simulatedBuyEligible === false && stock.researchV2.buyReasons.length === 0
        ? ["Saved buy eligibility is inconsistent with its entry checks"] : []),
    ]
    : [
    ...(stock.dataQuality === "excluded" ? ["financial data failed validation"] : []),
    ...(stock.currentPrice === null ? ["current regular-market price is unavailable"] : []),
    ...(stock.confidence < 0.6 ? ["evidence confidence is below 60%"] : []),
    ...stock.redFlags,
  ];
  const verification = reasons.length ? "needs review" : "verified";
  return {
    verification,
    verificationReason: reasons.length
      ? reasons.join("; ")
      : "The available evidence is current enough, internally consistent and satisfies the current purchase checks.",
    entryReasons,
    eligibleForAutopilot: verification === "verified" && entryReasons.length === 0 &&
      (balancedPolicy !== ACTIVE_RESEARCH_MODEL || stock.researchV2?.simulatedBuyEligible === true),
    ...(balancedPolicy === ACTIVE_RESEARCH_MODEL ? {
      holdingGrowth, researchScore: stock.researchV2?.score ?? null, ...scoreDecision(stock, scanGeneratedAt, now),
    } : {}),
  };
}

function reviewCandidate(
  stock: ResearchStock,
  balancedPolicy: BalancedDecisionPolicy,
  scanGeneratedAt: string,
  now: string,
): CandidateResearch {
  return {
    ticker: stock.ticker,
    nodes: [financialNode(stock), valuationNode(stock), aiPositionNode(stock), riskNode(stock)],
    ...candidateDecision(stock, balancedPolicy, scanGeneratedAt, now),
  };
}

export function buildResearchRun({
  stocks,
  scanGeneratedAt,
  previous,
  now,
  balancedPolicy = "legacy-balanced-v1",
  confirmationEligible = true,
}: {
  stocks: ResearchStock[];
  scanGeneratedAt: string;
  previous?: ResearchRun;
  now: string;
  balancedPolicy?: BalancedDecisionPolicy;
  confirmationEligible?: boolean;
}): ResearchRun {
  if (typeof confirmationEligible !== "boolean") throw new Error("Research confirmation classification is invalid");
  const materialMoves = stocks.filter(
    (stock) => Math.abs(stock.priceChangePercent ?? 0) >= 5,
  );
  const scanChanged = previous?.scanGeneratedAt !== scanGeneratedAt;
  const decisionPolicy = balancedPolicy === ACTIVE_RESEARCH_MODEL ? ACTIVE_BALANCED_POLICY : balancedPolicy;
  const policyChanged = previous?.decisionPolicy !== decisionPolicy;
  const changeDetected = !previous || scanChanged || policyChanged || materialMoves.length > 0;
  const reviewedCandidates = changeDetected
    ? stocks.map((stock) => reviewCandidate(stock, balancedPolicy, scanGeneratedAt, now))
    : previous.candidateResearch.map((candidate) => {
        const stock = stocks.find((item) => item.ticker === candidate.ticker);
        if (balancedPolicy === ACTIVE_RESEARCH_MODEL) {
          // Correct cached decision metadata without rewriting prior runs or
          // counting another check of this source scan as a new assessment.
          return stock
            ? { ...candidate, ...candidateDecision(stock, balancedPolicy, scanGeneratedAt, now) }
            : { ...candidate, verification: "needs review" as const,
              verificationReason: "Current company research is unavailable", eligibleForAutopilot: false,
              holdingGrowth: undefined, researchScore: null, scoreVerification: "needs review" as const,
              scoreVerificationReason: "Current company scoring evidence is unavailable" };
        }
        if (candidate.entryReasons) return candidate;
        return stock
          ? { ...candidate, entryReasons: autopilotEntryReasons(stock, balancedPolicy) }
          : { ...candidate, entryReasons: [] };
      });
  const ranking = balancedPolicy === ACTIVE_RESEARCH_MODEL
    ? assessResearchRanking(stocks, scanGeneratedAt, now, previous?.scanGeneratedAt) : null;
  const candidateResearch = reviewedCandidates.map(candidate => {
    if (!ranking) return candidate;
    const rank = ranking.rankByTicker.get(candidate.ticker) ?? null;
    const rankReason = !ranking.verified ? `Research ranking needs review. ${ranking.reason}`
      : rank === null ? "Current comparable research rank is unavailable"
      : rank > RESEARCH_RANK_LIMIT ? `Research rank ${rank} is outside the Top ${RESEARCH_RANK_LIMIT}` : null;
    return {
      ...candidate,
      researchRank: ranking.verified ? rank : null,
      rankingVerification: ranking.verified && rank !== null ? "verified" as const : "needs review" as const,
      rankingVerificationReason: rankReason ?? ranking.reason,
      entryReasons: rankReason ? [...candidate.entryReasons, rankReason] : candidate.entryReasons,
      eligibleForAutopilot: candidate.eligibleForAutopilot && rankReason === null,
    };
  });
  return {
    id: `${Date.parse(now)}-research-graph`,
    createdAt: now,
    scanGeneratedAt,
    confirmationEligible,
    changeDetected,
    changeSummary: !previous
      ? "Established the first structured research baseline."
      : scanChanged
        ? "New company research was available, so every specialist check was rerun."
        : materialMoves.length
          ? `Material regular-session move detected in ${materialMoves.map((stock) => stock.ticker).join(", ")}.`
          : "No material research change was detected; the verified conclusions were retained.",
    candidatesReviewed: candidateResearch.length,
    candidatesVerified: candidateResearch.filter((item) => item.verification === "verified").length,
    candidatesEligible: candidateResearch.filter((item) => item.eligibleForAutopilot).length,
    candidateResearch,
    decisionPolicy,
  };
}

function distinctResearchAssessments(current: ResearchRun, history: ResearchRun[] = []) {
  const seen = new Set<string>();
  return [current, ...history]
    .filter(run => {
      if (run.decisionPolicy !== ACTIVE_BALANCED_POLICY ||
        (run.confirmationEligible !== undefined && run.confirmationEligible !== true) ||
        !Number.isFinite(Date.parse(run.scanGeneratedAt)) || seen.has(run.scanGeneratedAt)) return false;
      seen.add(run.scanGeneratedAt);
      return true;
    })
    .sort((a, b) => Date.parse(b.scanGeneratedAt) - Date.parse(a.scanGeneratedAt))
    .slice(0, 2);
}

export function runAutopilot({
  portfolio,
  stocks,
  prices,
  scanGeneratedAt,
  now,
  runKey,
  confirmationEligible = true,
}: {
  portfolio: AutopilotPortfolio;
  stocks: ResearchStock[];
  prices: Record<string, number>;
  scanGeneratedAt: string;
  now: string;
  runKey?: string;
  confirmationEligible?: boolean;
}) {
  const stableRunKey = runKey ?? String(Date.parse(now));
  const strategy = portfolio.autoTrading;
  if (strategy.strategyProfile && strategy.strategyProfile !== "balanced") {
    throw new Error("Only AI Opportunities (balanced) may run automatically");
  }
  const balancedPolicy: BalancedDecisionPolicy = stocks.some(stock => stock.researchV2?.version === ACTIVE_RESEARCH_MODEL) ||
    strategy.researchRuns?.some(run => isAnnualCoreDecisionPolicy(run.decisionPolicy)) ||
    strategy.researchAssessments?.some(run => isAnnualCoreDecisionPolicy(run.decisionPolicy))
      ? ACTIVE_RESEARCH_MODEL : "ai-opportunities-v2";
  const previousResearch = strategy.researchRuns?.[0];
  const researchRun = buildResearchRun({ stocks, scanGeneratedAt, previous: previousResearch, now, balancedPolicy, confirmationEligible });
  const researchAssessments = balancedPolicy === ACTIVE_RESEARCH_MODEL
    ? distinctResearchAssessments(researchRun, strategy.researchAssessments ?? strategy.researchRuns)
    : undefined;
  const confirmationHistory = strategy.researchRuns;
  const stableReplacementCandidates = balancedPolicy === ACTIVE_RESEARCH_MODEL ? new Set<string>() : stableReplacementTickers(
    scanGeneratedAt,
    confirmationHistory,
    researchRun.decisionPolicy,
    researchRun.confirmationEligible,
  );
  const stableIneligibleTickers = balancedPolicy === ACTIVE_RESEARCH_MODEL ? new Set<string>() : stableIneligibleHoldings(scanGeneratedAt,
    confirmationHistory, researchRun.decisionPolicy, researchRun.confirmationEligible);
  if (balancedPolicy === ACTIVE_RESEARCH_MODEL) {
    const currentlyVerified = new Set(researchRun.candidateResearch
      .filter((candidate) => candidate.verification === "verified" && !candidate.eligibleForAutopilot)
      .map((candidate) => candidate.ticker));
    for (const ticker of stableIneligibleTickers) {
      if (!currentlyVerified.has(ticker)) stableIneligibleTickers.delete(ticker);
    }
  }
  const verified = new Set(
    researchRun.candidateResearch
      .filter((item) => item.eligibleForAutopilot)
      .map((item) => item.ticker),
  );
  const guardrails = dynamicGuardrails(
    stocks.map((stock) =>
      verified.has(stock.ticker)
        ? stock
        : {
          ...stock,
          signal: "Review risks",
          ...(balancedPolicy === ACTIVE_RESEARCH_MODEL && stock.researchV2
            ? { researchV2: { ...stock.researchV2, simulatedBuyEligible: false } }
            : {}),
        },
    ), balancedPolicy,
  );
  let cash = portfolio.cash;
  let holdings = [...portfolio.holdings];
  const trades: Trade[] = [];
  const decisions: AutoDecision[] = [];
  const decide = (ticker: string | null, action: AutoDecision["action"], reason: string) =>
    decisions.push({
      id: `${stableRunKey}-decision-${decisions.length}`,
      createdAt: now,
      ticker,
      action,
      reason,
    });
  const stockFor = (ticker: string) => stocks.find((item) => item.ticker === ticker);
  const livePriceFor = (holding: Holding) => prices[holding.ticker];
  const missingHeldResearch = new Set<string>();
  const drawdownReviewTickers = new Set<string>();
  const accountValue = cash + holdings.reduce(
    (sum, holding) => sum + holding.shares * livePriceFor(holding),
    0,
  );
  const minimumTrade = minimumTradeValue(accountValue);
  const sellShares = (
    holding: Holding,
    requestedShares: number,
    reason: string,
    force = false,
  ) => {
    const current = holdings.find((item) => item.ticker === holding.ticker);
    if (!current) return;
    let shares = Math.min(current.shares, requestedShares);
    if (shares <= 0.000001) return;
    const price = livePriceFor(current);
    const requestedValue = shares * price;
    const remainingValue = (current.shares - shares) * price;
    if (!force && requestedValue < minimumTrade) return;
    if (!force && remainingValue > 0 && remainingValue < minimumTrade) shares = current.shares;
    const value = shares * price;
    cash += value;
    holdings = holdings.flatMap((item) => {
      if (item.ticker !== current.ticker) return [item];
      const remaining = item.shares - shares;
      return remaining > 0.000001 ? [{ ...item, shares: remaining }] : [];
    });
    trades.push({
      id: `${stableRunKey}-auto-sell-${current.ticker}-${trades.length}`,
      side: "sell",
      ticker: current.ticker,
      name: current.name,
      shares,
      price,
      value,
      createdAt: now,
    });
    decide(current.ticker, "sell", reason);
  };

  for (const holding of [...holdings]) {
    const stock = stockFor(holding.ticker);
    const livePrice = livePriceFor(holding);
    const balancedDrawdown = Number.isFinite(livePrice) && livePrice > 0 &&
      livePrice <= holding.averageCost * (1 - strategy.stopLossPercent);
    const heldReview = researchRun.candidateResearch.find(candidate => candidate.ticker === holding.ticker);
    const growthReview = heldReview?.holdingGrowth;
    const blockingRiskFlags = stock ? balancedPolicy === ACTIVE_RESEARCH_MODEL
      ? purchaseBlockingRiskFlags(stock.redFlags) : stock.redFlags : [];
    const reason = blockingRiskFlags.length
          ? "New research risk flag"
          : balancedPolicy === ACTIVE_RESEARCH_MODEL
            ? heldReview?.rankingVerification === "verified" && heldReview.researchRank! > RESEARCH_RANK_LIMIT
              ? `Research rank ${heldReview.researchRank} fell outside the Top ${RESEARCH_RANK_LIMIT}` : null
            : stock && stock.opportunityScore < 50 && comparableScoreEvidence(stock)
              ? "Opportunity score fell below 50"
            : null;
    if (!stock && !reason) missingHeldResearch.add(holding.ticker);
    if (reason) sellShares(holding, holding.shares, reason, true);
    else if (stock && balancedPolicy === ACTIVE_RESEARCH_MODEL && heldReview?.rankingVerification !== "verified") {
      decide(holding.ticker, "hold", `Ranking exit awaits verified current research. ${heldReview?.rankingVerificationReason ?? "Current company scoring evidence is unavailable"}`);
      if (balancedDrawdown) drawdownReviewTickers.add(holding.ticker);
    }
    else if (balancedPolicy === ACTIVE_RESEARCH_MODEL && growthReview?.verification === "needs review") {
      decide(holding.ticker, "hold", `Revenue-growth evidence needs review. ${growthReview.verificationReason}`);
      if (balancedDrawdown) drawdownReviewTickers.add(holding.ticker);
    }
    else if (balancedDrawdown) {
      drawdownReviewTickers.add(holding.ticker);
      decide(
        holding.ticker,
        "hold",
        `${Math.round(strategy.stopLossPercent * 100)}% drawdown flagged for research review; additions pause while the threshold remains breached.`,
      );
    }
  }

  const cashReserve = accountValue * guardrails.cashReservePercent;
  // The active annual-core policy makes all cash available to eligible targets.
  // Other policies retain their reserve as an entry budget, not an exit signal.
  // Scarce opportunities stop new purchases, while existing holdings remain
  // governed by their thesis, safety and position rules above.

  const unresolvedMissingResearch = holdings.filter((holding) => missingHeldResearch.has(holding.ticker));
  for (const holding of unresolvedMissingResearch) {
    decide(
      holding.ticker,
      "hold",
      "Current research is unavailable; this holding is protected from a research-based exit or replacement.",
    );
  }

  {
    const { targets, displacedTickers, pendingReplacements } = balancedPortfolioTargets({
      opportunities: guardrails.opportunities,
      stocks,
      holdings,
      prices,
      accountValue,
      cashReservePercent: guardrails.cashReservePercent,
      maxPositions: strategy.maxPositions,
      maxPositionPercent: strategy.maxPositionPercent,
      stableReplacementCandidates,
      stableIneligibleTickers,
      allowReplacements: balancedPolicy !== ACTIVE_RESEARCH_MODEL,
    });
    for (const pending of pendingReplacements) {
      decide(pending.ticker, "hold", pending.reason);
    }
    const rebalanceThreshold = Math.max(minimumTrade, accountValue * TARGET_ADDITION_DRIFT_PERCENT);
    const rebalanceOpen = isAiOpportunitiesEntryWindow(now);
    const actionableAddition = targets.some((target) => {
      if (drawdownReviewTickers.has(target.stock.ticker)) return false;
      const holding = holdings.find((item) => item.ticker === target.stock.ticker);
      const currentValue = holding ? holding.shares * prices[holding.ticker] : 0;
      return target.value - currentValue >= rebalanceThreshold;
    }) || holdings.some((holding) =>
      displacedTickers.has(holding.ticker) && holding.shares * prices[holding.ticker] >= rebalanceThreshold,
    );

    if (!rebalanceOpen && actionableAddition) {
      decide(null, "hold", balancedPolicy === ACTIVE_RESEARCH_MODEL
        ? "Portfolio additions wait for the approved 11:30 a.m.–2:30 p.m. New York entry window."
        : "Portfolio additions and qualified replacements wait for the approved 11:30 a.m.–2:30 p.m. New York entry window.");
    }

    if (rebalanceOpen) {
      for (const holding of [...holdings]) {
        if (!displacedTickers.has(holding.ticker)) continue;
        if (holding.shares * prices[holding.ticker] < rebalanceThreshold) continue;
        sellShares(
          holding,
          holding.shares,
          "Replaced by a higher-ranked eligible opportunity within the portfolio position limit",
        );
      }

      // Purchase targets guide additions. Appreciation above a target or the
      // saved sizing ceiling does not trigger a sale. The active policy only
      // frees slots through ranking or explicit research-risk exits.
      const underweight = targets
        .map((target) => {
          const holding = holdings.find((item) => item.ticker === target.stock.ticker);
          const currentValue = holding ? holding.shares * prices[holding.ticker] : 0;
          return { ...target, gap: target.value - currentValue };
        })
        .filter((target) => target.gap >= rebalanceThreshold && !drawdownReviewTickers.has(target.stock.ticker))
        .sort((left, right) => right.gap - left.gap || right.stock.opportunityScore - left.stock.opportunityScore);

      for (const target of underweight) {
        const entryPrice = prices[target.stock.ticker];
        if (!(entryPrice > 0)) continue;
        const allocation = Math.min(
          target.gap,
          Math.max(0, cash - cashReserve),
        );
        if (allocation < rebalanceThreshold) continue;
        const shares = allocation / entryPrice;
        const current = holdings.find((holding) => holding.ticker === target.stock.ticker);
        if (!current && holdings.length >= strategy.maxPositions) continue;
        cash -= allocation;
        if (current) {
          const combinedShares = current.shares + shares;
          const averageCost = (current.shares * current.averageCost + allocation) / combinedShares;
          holdings = holdings.map((holding) => holding.ticker === current.ticker
            ? { ...holding, shares: combinedShares, averageCost }
            : holding);
        } else {
          holdings.push({ ticker: target.stock.ticker, name: target.stock.name, shares, averageCost: entryPrice });
        }
        trades.push({
          id: `${stableRunKey}-auto-buy-${target.stock.ticker}`,
          side: "buy",
          ticker: target.stock.ticker,
          name: target.stock.name,
          shares,
          price: entryPrice,
          value: allocation,
          createdAt: now,
        });
        decide(
          target.stock.ticker,
          "buy",
          `Rebalanced toward its ${(target.value / accountValue * 100).toFixed(2)}% target weight, within cash and company limits`,
        );
      }
    }
  }

  if (!decisions.length) {
    decide(null, "hold", "No verified entry or exit condition was met.");
  }
  // Ranking needs the full research universe; the tracker persists at most 30
  // quote watches. Prioritise held companies and the Top 15 before older watches.
  const watchSymbols = balancedPolicy === ACTIVE_RESEARCH_MODEL
    ? [...new Set([
        ...holdings.map(holding => holding.ticker), "SPY",
        ...researchRun.candidateResearch
          .filter(candidate => candidate.rankingVerification === "verified" &&
            candidate.researchRank != null && candidate.researchRank <= RESEARCH_RANK_LIMIT)
          .sort((left, right) => left.researchRank! - right.researchRank!)
          .map(candidate => candidate.ticker),
        ...(portfolio.watchSymbols ?? stocks.map(stock => stock.ticker)),
      ])].slice(0, 30)
    : [...new Set([...stocks.map(stock => stock.ticker), ...holdings.map(holding => holding.ticker), "SPY"])];
  return {
    portfolio: {
      ...portfolio,
      cash: rounded(cash),
      holdings,
      watchSymbols,
      trades: [...trades, ...portfolio.trades],
      autoTrading: {
        ...strategy,
        lastRunAt: now,
        decisions: [...decisions, ...strategy.decisions].slice(0, 50),
        researchRuns: [researchRun, ...(strategy.researchRuns ?? [])].slice(0, 20),
        ...(researchAssessments ? { researchAssessments } : {}),
      },
    },
    researchRun,
    trades,
    guardrails,
  };
}
