import { ACTIVE_SCORING_REVISION, GROWTH50_HOLDING20_POLICY } from '../lib/annual-core-policy.ts';
import assert from "node:assert/strict";
import test from "node:test";

import {
  autopilotEntryReasons,
  buildResearchRun,
  convictionWeight,
  dynamicGuardrails,
  isAiOpportunitiesEntryWindow,
  isAutopilotOpportunity,
  minimumTradeValue,
  runAutopilot,
} from "../lib/autopilot-engine.ts";
import {
  aiOpportunitiesRuleDisplay,
} from "../lib/autopilot-strategy-presentation.ts";
import { ACTIVE_BALANCED_POLICY, GROWTH45_BALANCED_POLICY } from "../lib/annual-core-policy.ts";
import { verifiedScoreEvidence, fixtureFinancialSource, fixturePriceAsOf } from "./helpers/score-evidence-fixture.mjs";

test("opens AI Opportunities entries only from 11:30 through 14:29 New York time", () => {
  assert.equal(isAiOpportunitiesEntryWindow("2026-08-27T15:29:59.000Z"), false);
  assert.equal(isAiOpportunitiesEntryWindow("2026-08-27T15:30:00.000Z"), true);
  assert.equal(isAiOpportunitiesEntryWindow("2026-08-27T18:29:59.000Z"), true);
  assert.equal(isAiOpportunitiesEntryWindow("2026-08-27T18:30:00.000Z"), false);
  assert.equal(isAiOpportunitiesEntryWindow("2026-08-29T16:00:00.000Z"), false);
});

function stock(overrides = {}) {
  return {
    ticker: "TEST",
    name: "Test AI",
    aiTheme: "AI software",
    currentPrice: 100,
    priceChangePercent: 0,
    priceAsOf: "2026-08-27T15:00:00.000Z",
    revenueGrowth3y: 0.2,
    netMargin: 0.2,
    opportunityScore: 80,
    signal: "Strong opportunity",
    qualityScore: 80,
    confidence: 0.8,
    redFlags: [],
    dataQuality: "pass",
    scoreEvidence: { missingMetrics: [], unavailableRiskChecks: [], missingEvidencePenalty: 0 },
    ...overrides,
  };
}

const annualModel = "annual-core-v2-2026-09-29";
const annualPolicy = ACTIVE_BALANCED_POLICY;
function annualStock(score, buyReasons = [], overrides = {}) {
  return stock({
    opportunityScore: score, revenueGrowth3y: verifiedScoreEvidence(score).revenue_cagr_3y.value,
    legacyOpportunityScore: 80,
    dataBasis: "annual", financialSourceUrl: fixtureFinancialSource, priceAsOf: fixturePriceAsOf,
    researchV2: {
      version: annualModel, scoringRevision: ACTIVE_SCORING_REVISION, score, researchRanked: true,
      reportingPeriod: "2026-07-31", evidence: verifiedScoreEvidence(score), missingCore: [], rankReasons: [],
      simulatedBuyEligible: buyReasons.length === 0, buyReasons,
    },
    ...overrides,
  });
}

function annualRun(stocks, previous) {
  return buildResearchRun({ stocks, previous, balancedPolicy: annualModel,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z", now: "2026-08-27T16:00:00.000Z" });
}

test("annual-core evidence verification is separate from numeric entry thresholds", () => {
  for (const reason of ["Candidate score below 65", "Candidate score below 70", "Revenue growth below 10%", "Revenue growth below 20%",
    "Free cash flow margin not positive", "Net margin not positive", "Neither net profit nor free cash flow is positive"]) {
    const reviewed = annualRun([annualStock(48.8, [reason])]).candidateResearch[0];
    assert.equal(reviewed.verification, "verified", reason);
    assert.equal(reviewed.eligibleForAutopilot, false, reason);
    assert.deepEqual(reviewed.entryReasons, /^Candidate score below (65|70)$|^Revenue growth below 20%$/.test(reason)
      ? [] : [reason]);
  }
});

test("annual-core incomplete, unsafe or inconsistent evidence remains unverified", () => {
  const below = annualStock(48.8, ["Candidate score below 65"]);
  const cases = [
    { researchV2: { ...below.researchV2, researchRanked: false } },
    { researchV2: { ...below.researchV2, score: null } },
    { researchV2: { ...below.researchV2, score: NaN } },
    { dataQuality: "excluded" }, { currentPrice: null }, { currentPrice: 0 },
    { priceAsOf: null }, { priceAsOf: "invalid" }, { redFlags: ["Material risk"] },
    { researchV2: { ...below.researchV2, buyReasons: ["Debt-service evidence: unavailable_source"] } },
    { researchV2: { ...below.researchV2, buyReasons: ["Net debt / EBITDA above 3"] } },
    { researchV2: { ...below.researchV2, buyReasons: ["Unknown future restriction"] } },
    { researchV2: { ...below.researchV2, buyReasons: [] } },
  ];
  for (const changes of cases) {
    const reviewed = annualRun([{ ...below, ...changes }]).candidateResearch[0];
    assert.equal(reviewed.verification, "needs review", JSON.stringify(changes));
    assert.equal(reviewed.eligibleForAutopilot, false);
  }
});

test("cached annual-core conclusions reclassify entry failures without creating another scan", () => {
  const below = annualStock(48.8, ["Candidate score below 65"]);
  const previous = annualRun([below]);
  // A graph saved by the installed version incorrectly equated this with an evidence gap.
  previous.candidateResearch[0].verification = "needs review";
  previous.candidateResearch[0].verificationReason = "Candidate score below 65";
  previous.candidatesVerified = 0;
  const before = structuredClone(previous);
  const reviewed = annualRun([below], previous);
  assert.equal(reviewed.changeDetected, false);
  assert.equal(reviewed.scanGeneratedAt, previous.scanGeneratedAt);
  assert.equal(reviewed.candidateResearch[0].verification, "verified");
  assert.equal(reviewed.candidateResearch[0].eligibleForAutopilot, false);
  assert.deepEqual(previous, before);
  const incomplete = annualStock(48.8, ["Debt-service evidence: unavailable_source"]);
  const updated = annualRun([incomplete], reviewed);
  assert.equal(updated.candidateResearch[0].verification, "needs review");
  assert.equal(updated.candidateResearch[0].eligibleForAutopilot, false);
});

function annualReplacementFirst(incumbent, newcomer) {
  const full = portfolio(1_000);
  full.holdings = [{ ticker: "OLD", name: "Old", shares: 10, averageCost: 100 }];
  full.autoTrading.maxPositions = 1;
  full.autoTrading.maxPositionPercent = 0.15;
  return runAutopilot({ portfolio: full, stocks: [newcomer, incumbent],
    prices: { OLD: 100, NEW: 100 }, scanGeneratedAt: "2026-08-26T14:55:00.000Z",
    now: "2026-08-27T13:31:00.000Z", runKey: "annual-first" });
}

function annualReplacementNext(previous, incumbent, newcomer, sameScan = false) {
  return runAutopilot({ portfolio: previous.portfolio, stocks: [newcomer, incumbent],
    prices: { OLD: 100, NEW: 100 },
    scanGeneratedAt: sameScan ? "2026-08-26T14:55:00.000Z" : "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z", runKey: sameScan ? "annual-repeat" : "annual-second" });
}

test("annual-core keeps a Top 15 CLS-like holding despite a stronger newcomer and two assessments", () => {
  const incumbent = annualStock(59, ["Candidate score below 65"], { ticker: "OLD", legacyOpportunityScore: 52.9 });
  const newcomer = annualStock(87.2, [], { ticker: "NEW", aiTheme: "AI networking" });
  const first = annualReplacementFirst(incumbent, newcomer);
  const before = structuredClone(first.portfolio);
  assert.equal(first.trades.length, 0);
  const repeat = annualReplacementNext(first, incumbent, newcomer, true);
  assert.equal(repeat.trades.length, 0);
  assert.equal(repeat.portfolio.holdings[0].ticker, "OLD");
  const second = annualReplacementNext(repeat, incumbent, newcomer);
  assert.deepEqual(second.trades, []);
  assert.equal(second.portfolio.holdings[0].ticker, "OLD");
  assert.ok(second.portfolio.cash >= 2_000);
  assert.deepEqual(first.portfolio, before);
});

test("annual-core does not replace a Top 15 holding at or above a five-point advantage", () => {
  const incumbent = annualStock(60.5, ["Candidate score below 65"], { ticker: "OLD" });
  for (const [score, expected] of [[65.4, []], [65.5, []]]) {
    const newcomer = annualStock(score, [], { ticker: "NEW", aiTheme: "AI networking" });
    const first = annualReplacementFirst(incumbent, newcomer);
    const second = annualReplacementNext(first, incumbent, newcomer);
    assert.deepEqual(second.trades.map(({ side, ticker }) => [side, ticker]), expected);
  }
});

test("a regressed or future assessment cannot displace a Top 15 holding", () => {
  const incumbent = annualStock(59, ["Candidate score below 70"], { ticker: "OLD" });
  const newcomer = annualStock(87.2, [], { ticker: "NEW", aiTheme: "AI networking" });
  const first = annualReplacementFirst(incumbent, newcomer);
  for (const priorScan of ["2026-08-27T14:56:00.000Z", "2026-08-28T14:55:00.000Z"]) {
    const saved = structuredClone(first.portfolio);
    saved.autoTrading.researchAssessments[0].scanGeneratedAt = priorScan;
    const result = annualReplacementNext({ portfolio: saved }, incumbent, newcomer);
    assert.equal(result.trades.length, 0);
    assert.deepEqual(result.portfolio.holdings, saved.holdings);
  }
  const future = runAutopilot({ portfolio: first.portfolio, stocks: [newcomer, incumbent],
    prices: { OLD: 100, NEW: 100 }, scanGeneratedAt: "2026-08-28T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z", runKey: "future-replacement" });
  assert.equal(future.trades.length, 0);
});

test("annual-core protects newly incomplete holding research despite an earlier verified scan", () => {
  const incumbent = annualStock(59, ["Candidate score below 65"], { ticker: "OLD" });
  const newcomer = annualStock(87.2, [], { ticker: "NEW", aiTheme: "AI networking" });
  const first = annualReplacementFirst(incumbent, newcomer);
  // The previous scan was verified, but the current scan cannot reconcile debt service.
  const incomplete = { ...incumbent, researchV2: { ...incumbent.researchV2,
    buyReasons: ["Candidate score below 65", "Debt-service evidence: unavailable_source"] } };
  const second = annualReplacementNext(first, incomplete, newcomer);
  assert.equal(second.trades.length, 0);
  assert.deepEqual(second.portfolio.holdings, first.portfolio.holdings);
});

test("annual-core no longer exits a Top 15 holding after two below-55 assessments", () => {
  const held = annualStock(54.9, ["Candidate score below 70"], { legacyOpportunityScore: 90 });
  const first = runAutopilot({ portfolio: portfolio(1_000), stocks: [held], prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-26T22:00:00.000Z", now: "2026-08-27T13:31:00.000Z", runKey: "exit-first" });
  assert.equal(first.trades.length, 0);
  const repeat = runAutopilot({ portfolio: first.portfolio, stocks: [held], prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-26T22:00:00.000Z", now: "2026-08-27T14:00:00.000Z", runKey: "exit-repeat" });
  assert.equal(repeat.trades.length, 0);
  assert.equal(repeat.portfolio.autoTrading.researchAssessments.length, 1);
  const before = structuredClone(repeat.portfolio);
  const second = runAutopilot({ portfolio: repeat.portfolio, stocks: [held], prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-27T22:00:00.000Z", now: "2026-08-28T13:31:00.000Z", runKey: "exit-second" });
  assert.deepEqual(second.trades, []);
  assert.equal(second.portfolio.holdings[0].ticker, "TEST");
  assert.ok(second.portfolio.autoTrading.decisions.every(d => d.action !== "sell"));
  assert.deepEqual(repeat.portfolio, before);
});

test("annual-core entry has no score floor while rank governs holding exits", () => {
  for (const [score, eligible] of [[64.9, true], [65, true], [65.1, true]]) {
    const candidate = annualStock(score);
    assert.equal(isAutopilotOpportunity(candidate, annualModel), eligible);
    assert.deepEqual(autopilotEntryReasons(candidate, annualModel), eligible ? [] : ["Candidate score below 65"]);
  }
  const full = portfolio(1_000);
  const held = annualStock(62.7, [], { legacyOpportunityScore: 39 });
  const result = runAutopilot({ portfolio: full, stocks: [held], prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z", now: "2026-08-27T16:00:00.000Z", runKey: "old-saved-entry" });
  assert.equal(result.trades.length, 0);
  assert.equal(result.researchRun.candidateResearch[0].eligibleForAutopilot, true);
});

function scoreAssessment(previous, candidate, day, suffix = "") {
  return runAutopilot({ portfolio: previous?.portfolio ?? portfolio(1_000), stocks: [candidate], prices: { TEST: 100 },
    scanGeneratedAt: `2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    now: `2026-08-${String(day).padStart(2, "0")}T13:31:00.000Z`, runKey: `score-assessment-${day}-${suffix}` });
}

test("scores below and exactly 55 do not independently sell a Top 15 holding", () => {
  const low = annualStock(54, ["Candidate score below 70"]);
  const first = scoreAssessment(null, low, 24);
  const recovered = scoreAssessment(first, annualStock(55, ["Candidate score below 70"]), 25);
  const lowAgain = scoreAssessment(recovered, low, 26);
  assert.equal(recovered.trades.length, 0);
  assert.equal(lowAgain.trades.length, 0);
  assert.deepEqual(scoreAssessment(lowAgain, low, 27).trades, []);
});

test("incomplete assessments protect holdings and never become zero", () => {
  const low = annualStock(54, ["Candidate score below 70"]);
  for (const changes of [
    { dataQuality: "excluded" },
    { researchV2: { ...low.researchV2, evidence: { ...low.researchV2.evidence,
      net_margin: { ...low.researchV2.evidence.net_margin, value: null, status: "unavailable_source" } } } },
    { researchV2: { ...low.researchV2, score: null, researchRanked: false } },
    { researchV2: { ...low.researchV2, score: NaN } },
    { opportunityScore: 10 },
  ]) {
    const first = scoreAssessment(null, low, 24);
    const unavailable = scoreAssessment(first, { ...low, ...changes }, 25);
    const next = scoreAssessment(unavailable, low, 26);
    assert.equal(unavailable.trades.length, 0);
    assert.equal(next.trades.length, 0);
    assert.deepEqual(scoreAssessment(next, low, 27).trades, []);
  }
});

test("distinct assessment evidence survives more than twenty repeated loop checks", () => {
  const low = annualStock(54, ["Candidate score below 70"]);
  let repeated = scoreAssessment(null, low, 24);
  for (let i = 0; i < 25; i++) repeated = scoreAssessment(repeated, low, 24, String(i));
  assert.equal(repeated.portfolio.autoTrading.researchRuns.length, 20);
  assert.equal(repeated.portfolio.autoTrading.researchAssessments.length, 1);
  const second = scoreAssessment(repeated, low, 25);
  assert.deepEqual(second.trades, []);
  const before = structuredClone(second.portfolio);
  const empty = scoreAssessment(second, low, 25, "empty");
  assert.equal(empty.trades.length, 0);
  assert.deepEqual(second.portfolio, before);
});

function freshnessRun(saved, stocks, scanAt = '2026-08-27T15:00:00Z', now = '2026-08-27T16:00:00Z') {
  return runAutopilot({portfolio:saved,stocks,prices:Object.fromEntries(stocks.map(s=>[s.ticker,100])),scanGeneratedAt:scanAt,now,confirmationEligible:false});
}

function confirmedPortfolio(stocks, holdingTicker = 'TEST') {
  const saved=portfolio(1_000);
  saved.holdings[0].ticker=holdingTicker;
  saved.autoTrading.researchAssessments=['2026-08-26T14:55:00Z','2026-08-25T14:55:00Z'].map(scanGeneratedAt=>buildResearchRun({stocks,scanGeneratedAt,now:'2026-08-27T16:00:00Z',balancedPolicy:annualModel}));
  return saved;
}

test('repeated freshness scans update evidence without counting or evicting ordinary assessments', () => {
  const low=annualStock(54,['Candidate score below 65']);
  const first=scoreAssessment(null,low,24);
  const expected=structuredClone(first.portfolio.autoTrading.researchAssessments);
  let saved=first.portfolio;
  for(let i=0;i<25;i++) {
    const next=freshnessRun(saved,[low],`2026-08-27T15:${String(i).padStart(2,'0')}:00Z`);
    assert.equal(next.trades.length,0);assert.equal(next.researchRun.confirmationEligible,false);
    assert.deepEqual(next.portfolio.autoTrading.researchAssessments,expected);
    saved=JSON.parse(JSON.stringify(next.portfolio)); // Same classification after a restart.
  }
  assert.equal(saved.autoTrading.researchRuns.length,20);
  assert.deepEqual(scoreAssessment({portfolio:saved},low,27).trades,[]);
});

test('fresh evidence cannot reactivate retired score exits, even without separate history', () => {
  const low=annualStock(54,['Candidate score below 65']);
  const first=scoreAssessment(null,low,24);delete first.portfolio.autoTrading.researchAssessments;
  const before=structuredClone(first.portfolio);
  const next=freshnessRun(first.portfolio,[low]);
  assert.equal(next.trades.length,0);assert.equal(next.portfolio.autoTrading.researchAssessments.length,1);
  assert.deepEqual(first.portfolio,before);
});

test('two ordinary low-score assessments cannot sell a Top 15 holding', () => {
  const low=annualStock(54,['Candidate score below 65']);
  const saved=confirmedPortfolio([low]);delete saved.autoTrading.researchAssessments[0].confirmationEligible; // Unflagged older records remain compatible.
  const next=freshnessRun(saved,[low]);
  assert.deepEqual(next.trades,[]);
  assert.deepEqual(next.portfolio.autoTrading.researchAssessments,saved.autoTrading.researchAssessments);
});

test('old confirmed score exits remain retired for recovered or unavailable fresh evidence', () => {
  const low=annualStock(54,['Candidate score below 65']);
  const missing={...low,researchV2:{...low.researchV2,evidence:{...low.researchV2.evidence,net_margin:{...low.researchV2.evidence.net_margin,value:null,status:'unavailable_source'}}}};
  for(const current of [annualStock(55,['Candidate score below 65']),missing]) {
    const saved=confirmedPortfolio([low]);const result=freshnessRun(saved,[current]);
    assert.equal(result.trades.length,0);assert.deepEqual(result.portfolio.holdings,saved.holdings);
  }
});

test('regressed or future freshness timestamps cannot trigger a ranking exit', () => {
  const low=annualStock(54,['Candidate score below 65']);
  for(const scanAt of ['2026-08-25T15:00:00Z','2026-08-28T15:00:00Z','invalid']) {
    const result=freshnessRun(confirmedPortfolio([low]),[low],scanAt);
    assert.equal(result.trades.length,0,scanAt);
  }
});

test('fresh candidates cannot replace a Top 15 holding even with two ordinary eligible assessments', () => {
  const incumbent=annualStock(59,['Candidate score below 65'],{ticker:'OLD'});
  const newcomer=annualStock(87.2,[],{ticker:'NEW',aiTheme:'AI networking'});
  const first=annualReplacementFirst(incumbent,newcomer);
  const next=freshnessRun(first.portfolio,[newcomer,incumbent]);
  assert.equal(next.trades.length,0);assert.equal(next.portfolio.holdings[0].ticker,'OLD');
  const saved=confirmedPortfolio([newcomer,incumbent],'OLD');saved.autoTrading.maxPositions=1;saved.autoTrading.maxPositionPercent=.15;
  const confirmed=freshnessRun(saved,[newcomer,incumbent]);
  assert.deepEqual(confirmed.trades,[]);
  assert.deepEqual(confirmed.portfolio.autoTrading.researchAssessments,saved.autoTrading.researchAssessments);
});

test('retired replacement confirmations cannot displace holdings under any evidence variation', () => {
  const incumbent=annualStock(59,['Candidate score below 65'],{ticker:'OLD'});
  const newcomer=annualStock(87.2,[],{ticker:'NEW',aiTheme:'AI networking'});
  for(const failure of ['old-newcomer','old-incumbent','current-newcomer','current-incumbent']) {
    const saved=confirmedPortfolio([newcomer,incumbent],'OLD');saved.autoTrading.maxPositions=1;saved.autoTrading.maxPositionPercent=.15;
    let current=[newcomer,incumbent];
    if(failure==='old-newcomer') saved.autoTrading.researchAssessments[1].candidateResearch[0].eligibleForAutopilot=false;
    if(failure==='old-incumbent') saved.autoTrading.researchAssessments[1].candidateResearch[1].verification='needs review';
    if(failure==='current-newcomer') current=[{...newcomer,dataQuality:'excluded'},incumbent];
    if(failure==='current-incumbent') current=[newcomer,{...incumbent,dataQuality:'excluded'}];
    assert.equal(freshnessRun(saved,current).trades.length,0,failure);
  }
});

test('fresh buy eligibility can fill a free slot without advancing confirmation history', () => {
  const candidate=annualStock(85);const saved=portfolio(0);saved.holdings=[];
  const result=freshnessRun(saved,[candidate]);
  assert.equal(result.trades[0].side,'buy');assert.equal(result.researchRun.candidateResearch[0].eligibleForAutopilot,true);
  assert.deepEqual(result.portfolio.autoTrading.researchAssessments,[]);
});

test('fresh scans retain explicit risk exits while low growth cannot cause a sale', () => {
  const healthy=annualStock(80);
  const growth=structuredClone(healthy);growth.revenueGrowth3y=.19;growth.researchV2.evidence.revenue_cagr_3y.value=.19;
  assert.deepEqual(freshnessRun(portfolio(1_000),[growth]).trades,[]);
  assert.equal(freshnessRun(portfolio(1_000),[{...healthy,redFlags:['Verified risk flag']}]).trades[0].side,'sell');
});

test('invalid confirmation classifications fail before trading', () => {
  assert.throws(()=>runAutopilot({portfolio:portfolio(1_000),stocks:[annualStock(54)],prices:{TEST:100},scanGeneratedAt:'2026-08-27T15:00:00Z',now:'2026-08-27T16:00:00Z',confirmationEligible:'false'}),/classification is invalid/);
});

test("old-policy graphs and missing exact scores cannot reactivate retired exits", () => {
  const low = annualStock(54, ["Candidate score below 70"]);
  for (const legacy of [true, false]) {
    const first = scoreAssessment(null, low, 24);
    delete first.portfolio.autoTrading.researchAssessments;
    const graph = first.portfolio.autoTrading.researchRuns[0];
    if (legacy) graph.decisionPolicy = annualModel;
    else delete graph.candidateResearch[0].researchScore;
    assert.equal(scoreAssessment(first, low, 25).trades.length, 0);
  }
});

test("the Top 15 policy ignores old score-exit confirmations and preserves old history", () => {
  for (const previousPolicy of [GROWTH45_BALANCED_POLICY,GROWTH50_HOLDING20_POLICY]) {
  const low = annualStock(54, ['Candidate score below 65']);
  const saved = confirmedPortfolio([low]);
  for (const graph of saved.autoTrading.researchAssessments) graph.decisionPolicy=previousPolicy;
  saved.autoTrading.researchRuns=structuredClone(saved.autoTrading.researchAssessments);
  const before=structuredClone(saved);
  const fresh=freshnessRun(saved,[low]);
  assert.equal(fresh.trades.length,0);
  assert.deepEqual(fresh.portfolio.autoTrading.researchAssessments,[]);
  assert.deepEqual(fresh.portfolio.autoTrading.researchRuns.filter(run=>run.decisionPolicy===previousPolicy),before.autoTrading.researchRuns);
  const first=scoreAssessment({portfolio:fresh.portfolio},low,27);
  assert.equal(first.trades.length,0);
  const second=scoreAssessment(first,low,28);
  assert.deepEqual(second.trades,[]);
  assert.deepEqual(saved,before);
  }
});

test("older or future assessments cannot sell a retained Top 15 holding", () => {
  const low = annualStock(54, ["Candidate score below 70"]);
  const first = scoreAssessment(null, low, 26);
  assert.equal(scoreAssessment(first, low, 25).trades.length, 0);
  const future = scoreAssessment(null, low, 24);
  future.portfolio.autoTrading.researchAssessments[0].scanGeneratedAt = "2026-08-28T12:00:00.000Z";
  assert.equal(scoreAssessment(future, low, 25).trades.length, 0);
});

test("an unsupported assessment cannot switch an established annual-core portfolio to legacy exits", () => {
  const low = annualStock(54, ["Candidate score below 70"]);
  const first = scoreAssessment(null, low, 24);
  const unsupported = { ...low, researchV2: undefined, opportunityScore: 10 };
  const second = scoreAssessment(first, unsupported, 25);
  assert.equal(second.trades.length, 0);
  assert.equal(second.researchRun.decisionPolicy, annualPolicy);
  assert.equal(second.researchRun.candidateResearch[0].verification, "needs review");
});

test("explicit risk exits keep priority without waiting for score confirmation", () => {
  const risk = annualStock(80, [], { redFlags: ["New material research risk"] });
  const result = scoreAssessment(null, risk, 24);
  assert.equal(result.trades[0].side, "sell");
  assert.equal(result.portfolio.autoTrading.decisions[0].reason, "New research risk flag");
});

test("uses the approved AI Opportunities entry thresholds without weakening evidence gates", () => {
  const eligible = stock({ opportunityScore: 60, qualityScore: 65 });
  assert.equal(isAutopilotOpportunity(eligible, "ai-opportunities-v2"), true);
  assert.equal(isAutopilotOpportunity(stock({ opportunityScore: 59.99 }), "ai-opportunities-v2"), false);
  assert.equal(isAutopilotOpportunity(stock({ qualityScore: 64.99 }), "ai-opportunities-v2"), false);
  assert.equal(isAutopilotOpportunity(stock({ confidence: 0.59 }), "ai-opportunities-v2"), false);
  assert.equal(isAutopilotOpportunity(stock({ redFlags: ["New material risk"] }), "ai-opportunities-v2"), false);
  assert.match(autopilotEntryReasons(stock({ opportunityScore: 59 }), "ai-opportunities-v2")[0], /requires at least 60/);
  assert.match(autopilotEntryReasons(stock({ qualityScore: 64 }), "ai-opportunities-v2")[0], /requires at least 65/);
});

test("annual-core buys use their separate evidence gate rather than the legacy health cutoff", () => {
  const model = "annual-core-v2-2026-09-29";
  const eligible = stock({
    opportunityScore: 73.6,
    qualityScore: 40,
    confidence: 0.45,
    researchV2: { version: model, scoringRevision: ACTIVE_SCORING_REVISION, score: 73.6, researchRanked: true, simulatedBuyEligible: true, buyReasons: [] },
  });
  assert.equal(isAutopilotOpportunity(eligible, model), true);
  assert.deepEqual(autopilotEntryReasons(eligible, model), []);
  const blocked = stock({
    ...eligible,
    researchV2: { ...eligible.researchV2, simulatedBuyEligible: false, buyReasons: ["Debt-service evidence: unavailable_source"] },
  });
  assert.equal(isAutopilotOpportunity(blocked, model), false);
  assert.match(autopilotEntryReasons(blocked, model)[0], /Debt-service/);
});

test("the model transition does not sell an existing holding merely because its new score is lower", () => {
  const model = "annual-core-v2-2026-09-29";
  const result = runAutopilot({
    portfolio: portfolio(1_000),
    stocks: [stock({
      opportunityScore: 30,
      legacyOpportunityScore: 80,
      researchV2: { version: model, scoringRevision: ACTIVE_SCORING_REVISION, score: 30, researchRanked: true, simulatedBuyEligible: false, buyReasons: ["Candidate score below 65"] },
    })],
    prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T15:00:00.000Z",
    runKey: "annual-core-held-transition",
  });
  assert.equal(result.portfolio.autoTrading.researchRuns[0].decisionPolicy, annualPolicy);
  assert.equal(result.trades.length, 0);
  assert.equal(result.portfolio.holdings[0].shares, 10);
});

test("sizes balanced opportunities from ten to fifteen percent within the configured cap", () => {
  assert.equal(convictionWeight(60, 0.15, "ai-opportunities-v2"), 0.1);
  assert.equal(convictionWeight(65, 0.15, "ai-opportunities-v2"), 0.12);
  assert.equal(convictionWeight(75, 0.15, "ai-opportunities-v2"), 0.15);
  assert.equal(convictionWeight(90, 0.12, "ai-opportunities-v2"), 0.12);
});

test("keeps twenty percent cash for up to three opportunities and ten percent for four or more", () => {
  const candidates = Array.from({ length: 4 }, (_, index) => stock({
    ticker: `AI${index}`,
    aiTheme: ["AI software", "AI chips", "AI networking", "AI data centres"][index],
  }));
  assert.equal(dynamicGuardrails([], "ai-opportunities-v2").cashReservePercent, 1);
  assert.equal(dynamicGuardrails(candidates.slice(0, 1), "ai-opportunities-v2").cashReservePercent, 0.2);
  assert.equal(dynamicGuardrails(candidates.slice(0, 3), "ai-opportunities-v2").cashReservePercent, 0.2);
  assert.equal(dynamicGuardrails(candidates, "ai-opportunities-v2").cashReservePercent, 0.1);
});

test("uses the strategy policy itself for the current-rules display", () => {
  const unavailable = aiOpportunitiesRuleDisplay({
    qualifyingOpportunityCount: null,
    maxPositionPercent: null,
    maxPositions: null,
  });
  assert.equal(unavailable.effectiveCashReservePercent, null);
  assert.equal(unavailable.maxPositionPercent, null);
  assert.equal(unavailable.maxPositions, null);

  for (const [qualifyingOpportunityCount, expectedReserve] of [[0, 1], [1, 0.2], [3, 0.2], [4, 0.1]]) {
    const rules = aiOpportunitiesRuleDisplay({
      qualifyingOpportunityCount,
      maxPositionPercent: 0.15,
      maxPositions: 10,
    });
    assert.equal(rules.effectiveCashReservePercent, expectedReserve);
    assert.equal(rules.maxPositionPercent, 0.15);
    assert.equal(rules.maxPositions, 10);
    assert.equal("cashReservePolicy" in rules, false);
    assert.equal("qualifyingOpportunityCount" in rules, false);
  }
  assert.deepEqual(aiOpportunitiesRuleDisplay({
    qualifyingOpportunityCount: 4,
    maxPositionPercent: 0.15,
    maxPositions: 10,
  }).themeExposurePolicy, undefined);
});

test("allocates the approved conviction weights while preserving the opportunity reserve", () => {
  const emptyPortfolio = portfolio(0);
  emptyPortfolio.holdings = [];
  emptyPortfolio.autoTrading.maxPositionPercent = 0.15;
  const candidates = [
    stock({ ticker: "HIGH", aiTheme: "AI chips", opportunityScore: 80 }),
    stock({ ticker: "MID", aiTheme: "AI networking", opportunityScore: 68 }),
    stock({ ticker: "BASE", aiTheme: "AI data centres", opportunityScore: 60 }),
  ];
  const result = runAutopilot({
    portfolio: emptyPortfolio,
    stocks: candidates,
    prices: { HIGH: 100, MID: 100, BASE: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-approved-allocation",
  });

  assert.deepEqual(result.trades.map((trade) => trade.value), [1_500, 1_200, 1_000]);
  assert.equal(result.portfolio.cash, 6_300);
  assert.ok(result.portfolio.cash >= 2_000);
});

test("normalises portfolio-wide targets when independent conviction weights exceed investable capital", () => {
  const emptyPortfolio = portfolio(0);
  emptyPortfolio.holdings = [];
  emptyPortfolio.autoTrading.maxPositionPercent = 0.15;
  const themes = ["AI chips", "AI networking", "AI data centres", "AI software"];
  const candidates = Array.from({ length: 9 }, (_, index) => stock({
    ticker: `AI${index}`,
    aiTheme: themes[index % themes.length],
    opportunityScore: index < 2 ? 80 : 68,
  }));

  const result = runAutopilot({
    portfolio: emptyPortfolio,
    stocks: candidates,
    prices: Object.fromEntries(candidates.map((candidate) => [candidate.ticker, 100])),
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-normalised-allocation",
  });

  assert.equal(result.trades.length, 9);
  assert.ok(Math.abs(result.trades[0].value - 1_184.2105263157894) < 0.000001);
  assert.ok(Math.abs(result.trades[2].value - 947.3684210526316) < 0.000001);
  assert.ok(Math.abs(result.trades.reduce((sum, trade) => sum + trade.value, 0) - 9_000) < 0.000001);
  assert.equal(result.portfolio.cash, 1_000);
});

test("tops up an eligible existing holding when it is materially below target", () => {
  const underweight = portfolio(500);
  underweight.autoTrading.maxPositionPercent = 0.15;
  underweight.trades = [{
    id: "prior-buy",
    side: "buy",
    ticker: "TEST",
    name: "Test AI",
    shares: 5,
    price: 100,
    value: 500,
    createdAt: "2026-08-26T16:00:00.000Z",
  }];

  const result = runAutopilot({
    portfolio: underweight,
    stocks: [stock({ opportunityScore: 80 })],
    prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-existing-top-up",
  });

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].side, "buy");
  assert.equal(result.trades[0].ticker, "TEST");
  assert.equal(result.trades[0].value, 1_000);
  assert.equal(result.portfolio.holdings[0].shares, 15);
  assert.equal(result.portfolio.holdings[0].averageCost, 100);
  assert.equal(result.portfolio.cash, 8_500);
  assert.equal(result.portfolio.trades[1].id, "prior-buy");
  assert.match(result.portfolio.autoTrading.decisions[0].reason, /target weight/);
});

test("recalculates average cost when topping up at a different price", () => {
  const underweight = portfolio(500);
  underweight.autoTrading.maxPositionPercent = 0.15;
  const result = runAutopilot({
    portfolio: underweight,
    stocks: [stock({ opportunityScore: 80, currentPrice: 120 })],
    prices: { TEST: 120 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-top-up-cost",
  });

  const trade = result.trades[0];
  const holding = result.portfolio.holdings[0];
  assert.ok(Math.abs(trade.value - 915) < 0.000001);
  assert.ok(Math.abs(holding.averageCost - ((500 + trade.value) / holding.shares)) < 0.000001);
});

test("does not trim an intact holding merely because it is above its target weight", () => {
  const aboveTarget = portfolio(1_200);
  aboveTarget.autoTrading.maxPositionPercent = 0.15;

  const result = runAutopilot({
    portfolio: aboveTarget,
    stocks: [stock({ opportunityScore: 60 })],
    prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-soft-target-no-trim",
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.portfolio.holdings[0].shares, 12);
  assert.equal(result.portfolio.cash, 8_800);
});

test("does not fund a target-only correction by trimming intact holdings", () => {
  const themes = ["AI chips", "AI networking", "AI data centres", "AI software"];
  const candidates = Array.from({ length: 9 }, (_, index) => stock({
    ticker: `AI${index}`,
    name: `AI ${index}`,
    aiTheme: themes[index % themes.length],
    opportunityScore: index < 2 ? 80 : 68,
  }));
  const values = [500, 1_500, 1_200, 1_200, 1_200, 1_000, 900, 800, 700];
  const unbalanced = portfolio(0);
  unbalanced.cash = 1_000;
  unbalanced.holdings = candidates.map((candidate, index) => ({
    ticker: candidate.ticker,
    name: candidate.name,
    shares: values[index] / 100,
    averageCost: 100,
  }));
  unbalanced.trades = [{
    id: "preserved-history",
    side: "buy",
    ticker: "AI0",
    name: "AI 0",
    shares: 5,
    price: 100,
    value: 500,
    createdAt: "2026-08-26T16:00:00.000Z",
  }];
  unbalanced.autoTrading.maxPositionPercent = 0.15;

  const result = runAutopilot({
    portfolio: unbalanced,
    stocks: candidates,
    prices: Object.fromEntries(candidates.map((candidate) => [candidate.ticker, 100])),
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-funded-rebalance",
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.portfolio.cash, 1_000);
  assert.deepEqual(result.portfolio.holdings, unbalanced.holdings);
  assert.equal(result.portfolio.trades.at(-1).id, "preserved-history");
});

test("replaces the lowest-ranked eligible holding when a stronger candidate enters a full portfolio", () => {
  const themes = ["AI chips", "AI networking", "AI data centres", "AI software"];
  const incumbents = Array.from({ length: 10 }, (_, index) => stock({
    ticker: `OLD${index}`,
    name: `Old ${index}`,
    aiTheme: themes[index % themes.length],
    opportunityScore: 60,
  }));
  const newcomer = stock({
    ticker: "NEW",
    name: "New leader",
    aiTheme: "AI software",
    opportunityScore: 95,
  });
  const full = portfolio(0);
  full.cash = 2_000;
  full.holdings = incumbents.map((candidate) => ({
    ticker: candidate.ticker,
    name: candidate.name,
    shares: 8,
    averageCost: 100,
  }));
  full.trades = [{
    id: "preserved-full-history",
    side: "buy",
    ticker: "OLD0",
    name: "Old 0",
    shares: 8,
    price: 100,
    value: 800,
    createdAt: "2026-08-26T16:00:00.000Z",
  }];
  full.autoTrading.maxPositionPercent = 0.15;

  const prices = Object.fromEntries([...incumbents, newcomer].map((candidate) => [candidate.ticker, 100]));
  const observed = runAutopilot({
    portfolio: full,
    stocks: [newcomer, ...incumbents],
    prices,
    scanGeneratedAt: "2026-08-26T14:55:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "test-full-capacity-observation",
  });
  assert.equal(observed.trades.length, 0);
  const first = runAutopilot({
    portfolio: observed.portfolio,
    stocks: [newcomer, ...incumbents],
    prices,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-full-capacity-replacement",
  });

  assert.deepEqual(first.trades.map((trade) => [trade.side, trade.ticker]), [
    ["sell", "OLD9"],
    ["buy", "NEW"],
  ]);
  assert.equal(first.portfolio.holdings.length, 10);
  assert.ok(first.portfolio.holdings.some((holding) => holding.ticker === "NEW"));
  assert.ok(!first.portfolio.holdings.some((holding) => holding.ticker === "OLD9"));
  assert.ok(first.portfolio.cash >= 1_000);
  assert.equal(first.portfolio.trades.at(-1).id, "preserved-full-history");
  const finalValue = first.portfolio.cash + first.portfolio.holdings.reduce(
    (sum, holding) => sum + holding.shares * prices[holding.ticker],
    0,
  );
  assert.ok(Math.abs(finalValue - 10_000) <= 0.005, `cent-rounded final value ${finalValue}`);
  const unroundedCash = full.cash +
    first.trades.filter((trade) => trade.side === "sell").reduce((sum, trade) => sum + trade.value, 0) -
    first.trades.filter((trade) => trade.side === "buy").reduce((sum, trade) => sum + trade.value, 0);
  assert.equal(first.portfolio.cash, Math.round(unroundedCash * 100) / 100);

  const second = runAutopilot({
    portfolio: first.portfolio,
    stocks: [newcomer, ...incumbents],
    prices,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T17:00:00.000Z",
    runKey: "test-full-capacity-no-churn",
  });
  assert.equal(second.trades.length, 0);
  assert.deepEqual(second.portfolio.holdings, first.portfolio.holdings);
  assert.equal(second.portfolio.cash, first.portfolio.cash);
});

test("does not replace a full eligible portfolio on a new candidate's first scan", () => {
  const incumbent = stock({ ticker: "OLD", name: "Old", opportunityScore: 70 });
  const newcomer = stock({ ticker: "NEW", name: "New", opportunityScore: 90 });
  const full = portfolio(1_200);
  full.holdings = [{ ticker: "OLD", name: "Old", shares: 12, averageCost: 100 }];
  full.autoTrading.maxPositions = 1;
  full.autoTrading.maxPositionPercent = 0.15;

  const result = runAutopilot({
    portfolio: full,
    stocks: [newcomer, incumbent],
    prices: { OLD: 100, NEW: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-first-scan-no-replacement",
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.portfolio.holdings[0].ticker, "OLD");
  assert.match(result.portfolio.autoTrading.decisions[0].reason, /second distinct research scan/);
});

test("does not replace an eligible holding without a five-point score advantage", () => {
  const incumbent = stock({ ticker: "OLD", name: "Old", opportunityScore: 70 });
  const newcomer = stock({ ticker: "NEW", name: "New", opportunityScore: 74 });
  const full = portfolio(1_200);
  full.holdings = [{ ticker: "OLD", name: "Old", shares: 12, averageCost: 100 }];
  full.autoTrading.maxPositions = 1;
  full.autoTrading.maxPositionPercent = 0.15;
  const prices = { OLD: 100, NEW: 100 };
  const observed = runAutopilot({
    portfolio: full,
    stocks: [newcomer, incumbent],
    prices,
    scanGeneratedAt: "2026-08-26T14:55:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "test-small-lead-observation",
  });

  const result = runAutopilot({
    portfolio: observed.portfolio,
    stocks: [newcomer, incumbent],
    prices,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-small-lead-no-replacement",
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.portfolio.holdings[0].ticker, "OLD");
  assert.match(result.portfolio.autoTrading.decisions[0].reason, /requires a 5-point score advantage/);
});

test("replaces a verified below-entry holding only after a second distinct scan", () => {
  const incumbent = stock({ ticker: "OLD", name: "Old", opportunityScore: 55,
    scoreEvidence: { missingMetrics: ["price_return_6m", "price_return_12m"], unavailableRiskChecks: [], missingEvidencePenalty: 0 } });
  const newcomer = stock({ ticker: "NEW", name: "New", opportunityScore: 80, aiTheme: "AI networking" });
  const full = portfolio(1_000);
  full.holdings = [{ ticker: "OLD", name: "Old", shares: 10, averageCost: 100 }];
  full.autoTrading.maxPositions = 1;
  full.autoTrading.maxPositionPercent = 0.15;
  const prices = { OLD: 100, NEW: 100 };
  const observed = runAutopilot({
    portfolio: full, stocks: [newcomer, incumbent], prices,
    scanGeneratedAt: "2026-08-26T14:55:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "below-entry-first-scan",
  });
  assert.equal(observed.trades.length, 0);
  assert.ok(observed.portfolio.holdings.some((holding) => holding.ticker === "OLD"));

  const replaced = runAutopilot({
    portfolio: observed.portfolio, stocks: [newcomer, incumbent], prices,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "below-entry-second-scan",
  });
  assert.deepEqual(replaced.trades.map((trade) => [trade.side, trade.ticker]), [["sell", "OLD"], ["buy", "NEW"]]);
  assert.equal(replaced.portfolio.holdings.length, 1);
  assert.equal(replaced.portfolio.holdings[0].ticker, "NEW");
  assert.ok(replaced.portfolio.cash >= 2_000);
});

test("a missing-research holding keeps its slot even when a candidate has two eligible scans", () => {
  const full = portfolio(1_000);
  full.holdings = [{ ticker: "MISSING", name: "Missing", shares: 10, averageCost: 100 }];
  full.autoTrading.maxPositions = 1;
  full.autoTrading.maxPositionPercent = 0.15;
  const newcomer = stock({ ticker: "NEW", opportunityScore: 90 });
  const prices = { MISSING: 100, NEW: 100 };
  const observed = runAutopilot({
    portfolio: full, stocks: [newcomer], prices,
    scanGeneratedAt: "2026-08-26T14:55:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "missing-slot-first-scan",
  });
  const second = runAutopilot({
    portfolio: observed.portfolio, stocks: [newcomer], prices,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "missing-slot-second-scan",
  });
  assert.equal(second.trades.length, 0);
  assert.deepEqual(second.portfolio.holdings, full.holdings);
});

test("an incomplete score does not turn a held company into a replacement candidate", () => {
  const incumbent = stock({ ticker: "OLD", opportunityScore: 45,
    scoreEvidence: { missingMetrics: ["return_on_invested_capital", "price_return_6m", "price_return_12m"],
      unavailableRiskChecks: [], missingEvidencePenalty: 0 } });
  const newcomer = stock({ ticker: "NEW", opportunityScore: 90 });
  const full = portfolio(1_000);
  full.holdings = [{ ticker: "OLD", name: "Old", shares: 10, averageCost: 100 }];
  full.autoTrading.maxPositions = 1;
  full.autoTrading.maxPositionPercent = 0.15;
  const prices = { OLD: 100, NEW: 100 };
  const first = runAutopilot({ portfolio: full, stocks: [newcomer, incumbent], prices,
    scanGeneratedAt: "2026-08-26T14:55:00.000Z", now: "2026-08-27T13:31:00.000Z", runKey: "partial-first" });
  const second = runAutopilot({ portfolio: first.portfolio, stocks: [newcomer, incumbent], prices,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z", now: "2026-08-27T16:00:00.000Z", runKey: "partial-second" });
  assert.equal(second.trades.some((trade) => trade.ticker === "NEW" || trade.side === "sell"), false);
  assert.equal(second.portfolio.holdings[0].ticker, "OLD");
});

test("a still-eligible holding with material score gaps is not displaced by score rank", () => {
  const incumbent = stock({ ticker: "OLD", opportunityScore: 70,
    scoreEvidence: { missingMetrics: ["return_on_invested_capital"], unavailableRiskChecks: [], missingEvidencePenalty: 0 } });
  const newcomer = stock({ ticker: "NEW", opportunityScore: 90 });
  const full = portfolio(1_000);
  full.holdings = [{ ticker: "OLD", name: "Old", shares: 10, averageCost: 100 }];
  full.autoTrading.maxPositions = 1;
  full.autoTrading.maxPositionPercent = 0.15;
  const prices = { OLD: 100, NEW: 100 };
  const first = runAutopilot({ portfolio: full, stocks: [newcomer, incumbent], prices,
    scanGeneratedAt: "2026-08-26T14:55:00.000Z", now: "2026-08-27T13:31:00.000Z", runKey: "eligible-gap-first" });
  const second = runAutopilot({ portfolio: first.portfolio, stocks: [newcomer, incumbent], prices,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z", now: "2026-08-27T16:00:00.000Z", runKey: "eligible-gap-second" });
  assert.equal(second.trades.some((trade) => trade.ticker === "NEW" || trade.side === "sell"), false);
  assert.equal(second.portfolio.holdings[0].ticker, "OLD");
});

test("missing score inputs never cause a score-only exit", () => {
  for (const scoreEvidence of [undefined,
    { missingMetrics: ["free_cash_flow_margin"], unavailableRiskChecks: [], missingEvidencePenalty: 8 },
    { missingMetrics: ["return_on_invested_capital", "price_return_6m", "price_return_12m"], unavailableRiskChecks: [], missingEvidencePenalty: 0 }]) {
    const result = runAutopilot({
      portfolio: portfolio(1_000),
      stocks: [stock({ opportunityScore: 40, scoreEvidence })],
      prices: { TEST: 100 },
      scanGeneratedAt: "2026-08-27T14:55:00.000Z",
      now: "2026-08-27T16:00:00.000Z",
      runKey: `missing-score-${scoreEvidence?.missingMetrics.join("-") ?? "unknown"}`,
    });
    assert.equal(result.trades.length, 0);
    assert.equal(result.portfolio.holdings[0].ticker, "TEST");
  }
});

test("records a first-scan replacement wait without trimming an overweight incumbent", () => {
  const incumbent = stock({ ticker: "OLD", name: "Old", opportunityScore: 70 });
  const newcomer = stock({ ticker: "NEW", name: "New", opportunityScore: 90 });
  const full = portfolio(2_000);
  full.holdings = [{ ticker: "OLD", name: "Old", shares: 20, averageCost: 100 }];
  full.autoTrading.maxPositions = 1;
  full.autoTrading.maxPositionPercent = 0.15;

  const result = runAutopilot({
    portfolio: full,
    stocks: [newcomer, incumbent],
    prices: { OLD: 100, NEW: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-first-scan-wait-with-trim",
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.portfolio.holdings[0].shares, 20);
  assert.ok(result.portfolio.autoTrading.decisions.some(
    (decision) => decision.ticker === "NEW" && /second distinct research scan/.test(decision.reason),
  ));
});

test("records a small-advantage replacement wait without trimming an overweight incumbent", () => {
  const incumbent = stock({ ticker: "OLD", name: "Old", opportunityScore: 70 });
  const newcomer = stock({ ticker: "NEW", name: "New", opportunityScore: 74 });
  const observedBase = portfolio(1_200);
  observedBase.holdings = [{ ticker: "OLD", name: "Old", shares: 12, averageCost: 100 }];
  observedBase.autoTrading.maxPositions = 1;
  observedBase.autoTrading.maxPositionPercent = 0.15;
  const prices = { OLD: 100, NEW: 100 };
  const observed = runAutopilot({
    portfolio: observedBase,
    stocks: [newcomer, incumbent],
    prices,
    scanGeneratedAt: "2026-08-26T14:55:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "test-small-lead-trim-observation",
  });
  const overweight = {
    ...observed.portfolio,
    cash: 8_000,
    holdings: [{ ticker: "OLD", name: "Old", shares: 20, averageCost: 100 }],
  };

  const result = runAutopilot({
    portfolio: overweight,
    stocks: [newcomer, incumbent],
    prices,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-small-lead-wait-with-trim",
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.portfolio.holdings[0].shares, 20);
  assert.ok(result.portfolio.autoTrading.decisions.some(
    (decision) => decision.ticker === "NEW" && /requires a 5-point score advantage/.test(decision.reason),
  ));
});

test("retained ineligible holdings consume portfolio capital without restricting same-theme targets", () => {
  const retained = stock({ ticker: "RETAIN", aiTheme: "AI software", opportunityScore: 55 });
  const candidates = [
    stock({ ticker: "SOFT1", aiTheme: "AI software", opportunityScore: 80 }),
    stock({ ticker: "SOFT2", aiTheme: "AI software", opportunityScore: 80 }),
    stock({ ticker: "CHIP", aiTheme: "AI chips", opportunityScore: 75 }),
    stock({ ticker: "NET", aiTheme: "AI networking", opportunityScore: 75 }),
    stock({ ticker: "CLOUD", aiTheme: "AI data centres", opportunityScore: 75 }),
  ];
  const mixed = portfolio(0);
  mixed.cash = 9_000;
  mixed.holdings = [{ ticker: "RETAIN", name: "Retained", shares: 10, averageCost: 100 }];
  mixed.autoTrading.maxPositionPercent = 0.15;
  const prices = Object.fromEntries([retained, ...candidates].map((candidate) => [candidate.ticker, 100]));

  const result = runAutopilot({
    portfolio: mixed,
    stocks: [retained, ...candidates],
    prices,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-retained-theme-capacity",
  });

  const softwareValue = result.portfolio.holdings
    .filter((holding) => ["RETAIN", "SOFT1", "SOFT2"].includes(holding.ticker))
    .reduce((sum, holding) => sum + holding.shares * prices[holding.ticker], 0);
  assert.ok(Math.abs(softwareValue - 4_000) < 0.000001);
  assert.ok(result.portfolio.cash >= 1_000);
  assert.equal(result.portfolio.holdings.length, 6);
  assert.ok(result.portfolio.holdings.some((holding) => holding.ticker === "RETAIN"));
});

test("does not retire a displaced holding below the portfolio rebalance threshold", () => {
  const themes = ["AI chips", "AI networking", "AI data centres", "AI software"];
  const incumbents = Array.from({ length: 10 }, (_, index) => stock({
    ticker: `SMALL${index}`,
    aiTheme: themes[index % themes.length],
    opportunityScore: 60,
  }));
  const newcomer = stock({ ticker: "BEST", aiTheme: "AI software", opportunityScore: 95 });
  const full = portfolio(0);
  full.cash = 2_650;
  full.holdings = incumbents.map((candidate, index) => ({
    ticker: candidate.ticker,
    name: candidate.name,
    shares: index === 9 ? 1.5 : 8,
    averageCost: 100,
  }));
  full.autoTrading.maxPositionPercent = 0.15;
  const prices = Object.fromEntries([...incumbents, newcomer].map((candidate) => [candidate.ticker, 100]));

  const observed = runAutopilot({
    portfolio: full,
    stocks: [newcomer, ...incumbents],
    prices,
    scanGeneratedAt: "2026-08-26T14:55:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "test-small-displacement-observation",
  });

  const first = runAutopilot({
    portfolio: observed.portfolio,
    stocks: [newcomer, ...incumbents],
    prices,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-small-displacement",
  });
  assert.equal(first.trades.length, 0);
  assert.equal(first.portfolio.holdings.length, 10);
  assert.ok(first.portfolio.holdings.some((holding) => holding.ticker === "SMALL9"));
  assert.ok(!first.portfolio.holdings.some((holding) => holding.ticker === "BEST"));

  const second = runAutopilot({
    portfolio: first.portfolio,
    stocks: [newcomer, ...incumbents],
    prices,
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T17:00:00.000Z",
    runKey: "test-small-displacement-repeat",
  });
  assert.equal(second.trades.length, 0);
  assert.deepEqual(second.portfolio.holdings, first.portfolio.holdings);
  assert.equal(second.portfolio.cash, first.portfolio.cash);
});

test("waits outside the entry window without blocking protective exits", () => {
  const emptyPortfolio = portfolio(0);
  emptyPortfolio.holdings = [];
  const waiting = runAutopilot({
    portfolio: emptyPortfolio,
    stocks: [stock()],
    prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-27T13:25:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "test-opening-window",
  });
  assert.equal(waiting.trades.length, 0);
  assert.match(waiting.portfolio.autoTrading.decisions[0].reason, /11:30 a\.m\.–2:30 p\.m\./);

  const exiting = runAutopilot({
    portfolio: portfolio(50),
    stocks: [stock({ redFlags: ["New material risk"] })],
    prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-27T13:25:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "test-opening-exit",
  });
  assert.equal(exiting.trades.length, 1);
  assert.equal(exiting.trades[0].side, "sell");
});

test("protects a missing-research holding while allowing an unrelated eligible addition", () => {
  const incomplete = portfolio(1_000);
  incomplete.autoTrading.maxPositionPercent = 0.15;
  incomplete.trades = [{
    id: "preserved-buy",
    side: "buy",
    ticker: "TEST",
    name: "Test AI",
    shares: 10,
    price: 100,
    value: 1_000,
    createdAt: "2026-08-26T16:00:00.000Z",
  }];
  const replacement = stock({ ticker: "OTHER", name: "Other AI", opportunityScore: 90 });

  const result = runAutopilot({
    portfolio: incomplete,
    stocks: [replacement],
    prices: { TEST: 100, OTHER: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-missing-held-research",
  });

  assert.deepEqual(result.trades.map((trade) => [trade.side, trade.ticker]), [["buy", "OTHER"]]);
  assert.ok(result.portfolio.holdings.some((holding) => holding.ticker === "TEST" && holding.shares === 10));
  assert.ok(result.portfolio.cash >= 2_000);
  assert.equal(result.portfolio.trades.at(-1).id, "preserved-buy");
  assert.deepEqual(
    result.portfolio.autoTrading.decisions[0],
    {
      id: "test-missing-held-research-decision-0",
      createdAt: "2026-08-27T16:00:00.000Z",
      ticker: "TEST",
      action: "hold",
      reason: "Current research is unavailable; this holding is protected from a research-based exit or replacement.",
    },
  );
});

test("an unclassified holding preserves its capital while additions use full company targets", () => {
  const account = portfolio(0);
  account.cash = 9_000;
  account.holdings = [{ ticker: "UNKNOWN", name: "Unknown theme", shares: 10, averageCost: 100 }];
  account.autoTrading.maxPositionPercent = 0.15;
  const result = runAutopilot({
    portfolio: account,
    stocks: [stock({ ticker: "NEW", opportunityScore: 90 })],
    prices: { UNKNOWN: 100, NEW: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "unknown-theme-capacity",
  });
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].side, "buy");
  assert.equal(result.trades[0].value, 1_500);
  assert.equal(result.portfolio.holdings.find((holding) => holding.ticker === "UNKNOWN").shares, 10);
});

test("a balanced drawdown alone preserves the holding and pauses additions across sessions", () => {
  const adobe = portfolio(0);
  adobe.cash = 9_000;
  adobe.holdings = [{ ticker: "ADBE", name: "ADOBE INC.", shares: 4.5498, averageCost: 260.73 }];
  adobe.autoTrading.maxPositionPercent = 0.15;
  const candidate = stock({ ticker: "ADBE", name: "ADOBE INC.", currentPrice: 227.56 });
  const first = runAutopilot({
    portfolio: adobe,
    stocks: [candidate],
    prices: { ADBE: 227.56 },
    scanGeneratedAt: "2026-09-28T12:00:00.000Z",
    now: "2026-09-28T13:55:59.000Z",
    runKey: "adbe-drawdown-first",
  });
  assert.equal(first.trades.length, 0);
  assert.deepEqual(first.portfolio.holdings, adobe.holdings);
  assert.equal(first.portfolio.cash, adobe.cash);
  assert.match(first.portfolio.autoTrading.decisions[0].reason, /12% drawdown.*research review/);

  for (const [runKey, now] of [
    ["adbe-drawdown-entry-window", "2026-09-28T15:55:59.000Z"],
    ["adbe-drawdown-next-day", "2026-09-29T16:00:00.000Z"],
  ]) {
    const result = runAutopilot({
      portfolio: first.portfolio,
      stocks: [candidate],
      prices: { ADBE: 227.56 },
      scanGeneratedAt: now,
      now,
      runKey,
    });
    assert.equal(result.trades.length, 0);
    assert.deepEqual(result.portfolio.holdings, adobe.holdings);
    assert.equal(result.portfolio.cash, adobe.cash);
    assert.match(result.portfolio.autoTrading.decisions[0].reason, /12% drawdown.*research review/);
  }

  const recovered = runAutopilot({
    portfolio: first.portfolio,
    stocks: [{ ...candidate, currentPrice: 240 }],
    prices: { ADBE: 240 },
    scanGeneratedAt: "2026-09-30T15:30:00.000Z",
    now: "2026-09-30T16:00:00.000Z",
    runKey: "adbe-drawdown-recovered",
  });
  assert.deepEqual(recovered.trades.map((trade) => [trade.side, trade.ticker]), [["buy", "ADBE"]]);
  assert.match(recovered.portfolio.autoTrading.decisions[0].reason, /target weight/);
});

test("keeps a balanced drawdown under review when current holding research is missing", () => {
  const result = runAutopilot({
    portfolio: portfolio(1_000),
    stocks: [stock({ ticker: "OTHER" })],
    prices: { TEST: 80, OTHER: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "test-missing-research-stop",
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.portfolio.holdings[0].ticker, "TEST");
  assert.match(result.portfolio.autoTrading.decisions.find((decision) => decision.ticker === "TEST").reason, /12% drawdown.*research review/);
});

test("does not sell an intact balanced holding solely because it exceeds the legacy profit threshold", () => {
  const profitable = portfolio(1_000);
  profitable.autoTrading.maxPositionPercent = 0.15;

  const result = runAutopilot({
    portfolio: profitable,
    stocks: [stock()],
    prices: { TEST: 130 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "test-no-fixed-profit-exit",
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.portfolio.holdings[0].shares, 10);
  assert.equal(result.portfolio.holdings[0].averageCost, 100);
});

test("missing research is protected while same-theme additions proceed without theme sells", () => {
  const candidates = [
    stock({ ticker: "SOFT1", name: "Software 1", opportunityScore: 80 }),
    stock({ ticker: "SOFT2", name: "Software 2", opportunityScore: 75 }),
    stock({ ticker: "NEW", name: "New software", opportunityScore: 70 }),
  ];
  for (const missingValue of [1_000, 1_500]) {
    const mixed = portfolio(0);
    mixed.cash = 10_000 - missingValue - 3_000;
    mixed.holdings = [
      { ticker: "MISSING", name: "Missing research", shares: missingValue / 100, averageCost: 100 },
      { ticker: "SOFT1", name: "Software 1", shares: 15, averageCost: 100 },
      { ticker: "SOFT2", name: "Software 2", shares: 15, averageCost: 100 },
    ];
    mixed.autoTrading.maxPositionPercent = 0.15;

    const result = runAutopilot({
      portfolio: mixed,
      stocks: candidates,
      prices: { MISSING: 100, SOFT1: 100, SOFT2: 100, NEW: 100 },
      scanGeneratedAt: "2026-08-27T14:55:00.000Z",
      now: "2026-08-27T16:00:00.000Z",
      runKey: `test-missing-theme-${missingValue}`,
    });

    assert.equal(result.trades.some((trade) => trade.ticker === "MISSING"), false);
    assert.deepEqual(result.trades.map(({ side, ticker, value }) => [side, ticker, value]), [["buy", "NEW", 1_200]]);
    assert.equal(
      result.portfolio.holdings.find((holding) => holding.ticker === "MISSING").shares,
      missingValue / 100,
    );
    assert.equal(result.trades.some((trade) => trade.side === "sell"), false);
    assert.match(
      result.portfolio.autoTrading.decisions.find((decision) => decision.ticker === "MISSING").reason,
      /Current research is unavailable/,
    );
  }
});

test("a drawdown review and unrelated addition can proceed while another holding lacks research", () => {
  const mixed = portfolio(0);
  mixed.cash = 8_000;
  mixed.holdings = [
    { ticker: "STOP", name: "Stop", shares: 10, averageCost: 100 },
    { ticker: "MISSING", name: "Missing", shares: 10, averageCost: 100 },
  ];
  mixed.autoTrading.maxPositionPercent = 0.15;
  const candidate = stock({ ticker: "OTHER", opportunityScore: 90 });

  const result = runAutopilot({
    portfolio: mixed,
    stocks: [candidate, stock({ ticker: "STOP", name: "Stop", aiTheme: "AI chips", currentPrice: 80 })],
    prices: { STOP: 80, MISSING: 100, OTHER: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "test-one-missing-survives",
  });

  assert.deepEqual(result.trades.map((trade) => [trade.side, trade.ticker]), [["buy", "OTHER"]]);
  assert.ok(result.portfolio.holdings.some((holding) => holding.ticker === "STOP"));
  assert.ok(result.portfolio.holdings.some((holding) => holding.ticker === "MISSING"));
  assert.ok(result.portfolio.holdings.some((holding) => holding.ticker === "OTHER"));
  assert.match(
    result.portfolio.autoTrading.decisions.find((decision) => decision.ticker === "MISSING").reason,
    /Current research is unavailable/,
  );
});

test("preserves complete-research risk and score reason priority over overlapping price exits", () => {
  const risk = runAutopilot({
    portfolio: portfolio(1_000),
    stocks: [stock({ redFlags: ["New material risk"] })],
    prices: { TEST: 80 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "test-risk-reason-priority",
  });
  assert.equal(risk.trades.length, 1);
  assert.equal(risk.portfolio.autoTrading.decisions[0].reason, "New research risk flag");

  const lowScore = runAutopilot({
    portfolio: portfolio(1_000),
    stocks: [stock({ opportunityScore: 40, scoreEvidence: { missingMetrics: [], unavailableRiskChecks: [], missingEvidencePenalty: 0 } })],
    prices: { TEST: 80 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T13:31:00.000Z",
    runKey: "test-score-reason-priority",
  });
  assert.equal(lowScore.trades.length, 1);
  assert.equal(lowScore.portfolio.autoTrading.decisions[0].reason, "Opportunity score fell below 50");
});

test("rejects a retired strategy without changing its saved holdings or trades", () => {
  const retired = portfolio(1_000);
  retired.autoTrading.strategyProfile = "retired-profile";
  const before = structuredClone(retired);
  assert.throws(() => runAutopilot({
    portfolio: retired,
    stocks: [stock()],
    prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T16:00:00.000Z",
    runKey: "retired-strategy",
  }), /Only AI Opportunities \(balanced\)/);
  assert.deepEqual(retired, before);
});

function portfolio(holdingValue) {
  return {
    cash: 10_000 - holdingValue,
    holdings: [{ ticker: "TEST", name: "Test AI", shares: holdingValue / 100, averageCost: 100 }],
    trades: [],
    watchSymbols: ["TEST", "SPY"],
    autoTrading: {
      strategyProfile: "balanced",
      enabled: true,
      maxPositions: 10,
      maxPositionPercent: 0.1,
      stopLossPercent: 0.12,
      takeProfitPercent: 0.25,
      lastRunAt: null,
      decisions: [],
    },
  };
}

test("batches routine rebalances smaller than one percent or US$100", () => {
  assert.equal(minimumTradeValue(10_000), 100);
  assert.equal(minimumTradeValue(50_000), 500);

  const result = runAutopilot({
    portfolio: portfolio(1_005),
    stocks: [stock()],
    prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T15:00:00.000Z",
    runKey: "test-small-trim",
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.portfolio.holdings[0].shares, 10.05);
});

test("does not delay a full risk exit because it is small", () => {
  const result = runAutopilot({
    portfolio: portfolio(50),
    stocks: [stock({ redFlags: ["New material risk"] })],
    prices: { TEST: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z",
    now: "2026-08-27T15:00:00.000Z",
    runKey: "test-forced-exit",
  });

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].side, "sell");
  assert.equal(result.trades[0].value, 50);
  assert.equal(result.portfolio.holdings.length, 0);
});

test("the saved sizing ceiling keeps annual-core purchase targets at 12–15%", () => {
  assert.equal(convictionWeight(80, 0.20, annualModel), 0.15);
  assert.equal(convictionWeight(65, 0.20, annualModel), 0.12);
  const initial = portfolio(0);
  initial.holdings = [];
  initial.autoTrading.maxPositionPercent = 0.20;
  const candidates = [annualStock(80, [], { ticker: "HIGH", aiTheme: "AI chips" }),
    annualStock(65, [], { ticker: "MID", aiTheme: "AI networking" })];
  const result = runAutopilot({ portfolio: initial, stocks: candidates, prices: { HIGH: 100, MID: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z", now: "2026-08-27T16:00:00.000Z", runKey: "position20-entry" });
  assert.deepEqual(result.trades.map(trade => trade.value), [1500, 1200]);
});

test("healthy appreciated holdings above 20% stay held and receive no additions", () => {
  for (const score of [65, 75, 80]) {
    for (const value of [1800, 2000, 2030, 2200, 3000, 6000]) {
      const initial = portfolio(value);
      initial.autoTrading.maxPositionPercent = 0.20;
      initial.holdings[0].averageCost = 50;
      const before = structuredClone(initial);
      const result = runAutopilot({ portfolio: initial, stocks: [annualStock(score)], prices: { TEST: 100 },
        scanGeneratedAt: "2026-08-27T14:55:00.000Z", now: "2026-08-27T16:00:00.000Z", runKey: `no-trim-${score}-${value}` });
      assert.equal(result.trades.length, 0, `${score}/${value}: no sale or addition above purchase target`);
      assert.deepEqual(result.portfolio.holdings, before.holdings);
      assert.equal(result.portfolio.cash, before.cash);
      assert.deepEqual(initial, before, "input ledger is unchanged");
    }
  }
});

test("theme labels do not impose exposure caps or a mandatory annual-core cash reserve", () => {
  for (const count of [0, 1, 3, 4, 8]) {
    const sameTheme = Array.from({ length: count }, (_, index) => annualStock(80, [], {
      ticker: `CHIP${index}`, aiTheme: "AI compute",
    }));
    const mixedThemes = sameTheme.map((candidate, index) => ({ ...candidate,
      aiTheme: ["AI compute", "AI networking", "AI cloud", "AI software"][index % 4],
    }));
    const rules = dynamicGuardrails(sameTheme, annualModel);
    assert.equal("maxThemeExposurePercent" in rules, false);
    assert.equal(rules.cashReservePercent, 0);
    assert.equal(rules.cashReservePercent, dynamicGuardrails(mixedThemes, annualModel).cashReservePercent);
  }
});

test("same-theme new purchases use conviction targets within cash and position-count limits", () => {
  for (const [count, maxPositions, expectedCash] of [[5, 10, 2_500], [8, 10, 0], [8, 3, 5_500]]) {
    const initial = portfolio(0);
    initial.holdings = [];
    initial.autoTrading.maxPositionPercent = 0.20;
    initial.autoTrading.maxPositions = maxPositions;
    const candidates = Array.from({ length: count }, (_, index) => annualStock(80, [], {
      ticker: `CHIP${index}`, aiTheme: "AI compute",
    }));
    const original = structuredClone(initial);
    const result = runAutopilot({ portfolio: initial, stocks: candidates,
      prices: Object.fromEntries(candidates.map(candidate => [candidate.ticker, 100])),
      scanGeneratedAt: "2026-08-27T14:55:00.000Z", now: "2026-08-27T16:00:00.000Z",
      runKey: `same-theme-entry-${count}-${maxPositions}` });
    assert.equal(result.portfolio.cash, expectedCash);
    assert.equal(result.portfolio.holdings.length, Math.min(count, maxPositions));
    assert.ok(result.trades.every(trade => trade.side === "buy" && trade.value <= 1_500));
    assert.ok(result.portfolio.holdings.every(holding => holding.shares * 100 <= 2_000));
    assert.deepEqual(initial, original);
  }
});

test("same-theme top-ups proceed without trimming other companies or rewriting trade history", () => {
  const initial = portfolio(0);
  initial.cash = 4_500;
  initial.autoTrading.maxPositionPercent = 0.20;
  const candidates = Array.from({ length: 5 }, (_, index) => annualStock(80, [], {
    ticker: `CHIP${index}`, aiTheme: "AI compute",
  }));
  initial.holdings = candidates.map((candidate, index) => ({ ticker: candidate.ticker,
    name: candidate.name, shares: index < 3 ? 15 : 5, averageCost: 100 }));
  initial.trades = [{ id: "historical-theme-sale", side: "sell", ticker: "OLD", name: "Old",
    shares: 1, price: 100, value: 100, createdAt: "2026-08-26T16:00:00.000Z" }];
  const original = structuredClone(initial);
  const result = runAutopilot({ portfolio: initial, stocks: candidates,
    prices: Object.fromEntries(candidates.map(candidate => [candidate.ticker, 100])),
    scanGeneratedAt: "2026-08-27T14:55:00.000Z", now: "2026-08-27T16:00:00.000Z",
    runKey: "same-theme-topups" });
  assert.deepEqual(result.trades.map(({ side, ticker, value }) => [side, ticker, value]),
    [["buy", "CHIP3", 1_000], ["buy", "CHIP4", 1_000]]);
  assert.equal(result.portfolio.cash, 2_500);
  assert.ok(result.portfolio.holdings.every(holding => holding.shares === 15));
  assert.deepEqual(result.portfolio.trades.at(-1), initial.trades[0]);
  assert.deepEqual(initial, original);
});

test("pending research weighting cannot cause theme sells when no candidates qualify", () => {
  const initial = portfolio(0);
  initial.cash = 4_000;
  initial.autoTrading.maxPositionPercent = 0.20;
  const candidates = Array.from({ length: 4 }, (_, index) => {
    const candidate = annualStock(80, [], { ticker: `CHIP${index}`, aiTheme: "AI compute" });
    candidate.researchV2.scoringRevision = "superseded-weighting";
    return candidate;
  });
  initial.holdings = candidates.map(candidate => ({ ticker: candidate.ticker,
    name: candidate.name, shares: 15, averageCost: 100 }));
  const result = runAutopilot({ portfolio: initial, stocks: candidates,
    prices: Object.fromEntries(candidates.map(candidate => [candidate.ticker, 100])),
    scanGeneratedAt: "2026-08-27T14:55:00.000Z", now: "2026-08-27T16:00:00.000Z",
    runKey: "pending-weighting-no-theme-sales" });
  assert.equal(dynamicGuardrails(candidates, annualModel).opportunities.length, 0);
  assert.deepEqual(result.trades, []);
  assert.deepEqual(result.portfolio.holdings, initial.holdings);
  assert.equal(result.portfolio.cash, initial.cash);
});


test("oversized holdings retain independent risk exits while score-only exits stay retired", () => {
  for (const [candidate, sells] of [[annualStock(80, [], { redFlags: ["Material research risk"] }), true],
    [annualStock(48.8, ["Candidate score below 65"]), false]]) {
    const initial = confirmedPortfolio([candidate]);
    initial.cash = 4000; initial.holdings[0].shares = 60; initial.autoTrading.maxPositionPercent = 0.20;
    const result = runAutopilot({ portfolio: initial, stocks: [candidate], prices: { TEST: 100 },
      scanGeneratedAt: "2026-08-27T14:55:00.000Z", now: "2026-08-27T16:00:00.000Z", runKey: `oversized-exit-${candidate.researchV2.score}` });
    assert.equal(result.trades.length, sells ? 1 : 0);
    if (sells) {
      assert.equal(result.trades[0].side, "sell"); assert.equal(result.trades[0].shares, 60);
      assert.equal(result.portfolio.holdings.length, 0);
      assert.match(result.portfolio.autoTrading.decisions.find(item => item.action === "sell").reason, /risk flag/);
    } else assert.deepEqual(result.portfolio.holdings, initial.holdings);
  }
});

test("oversized Top 15 holdings are protected from the retired replacement rule", () => {
  const incumbent = annualStock(70, [], { ticker: "OLD" });
  const newcomer = annualStock(90, [], { ticker: "NEW", aiTheme: "AI networking" });
  const initial = confirmedPortfolio([newcomer, incumbent], "OLD");
  initial.cash = 4000;
  initial.holdings[0].shares = 60;
  initial.autoTrading.maxPositionPercent = 0.20;
  initial.autoTrading.maxPositions = 1;
  const result = runAutopilot({ portfolio: initial, stocks: [newcomer, incumbent], prices: { OLD: 100, NEW: 100 },
    scanGeneratedAt: "2026-08-27T14:55:00.000Z", now: "2026-08-27T16:00:00.000Z", runKey: "oversized-replacement" });
  assert.deepEqual(result.trades, []);
  assert.deepEqual(result.portfolio.holdings, initial.holdings);
});
