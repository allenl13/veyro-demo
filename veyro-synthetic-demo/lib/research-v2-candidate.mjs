// Shared scorer with frozen offline defaults and explicit production policy parameters.
export const RESEARCH_V2_CANDIDATE = 'annual-core-v2-shadow-2026-09-28';

const core = [
  {key: 'ai_linkage', weight: 0.15, low: 0, high: 100},
  {key: 'revenue_cagr_3y', weight: 0.20, low: -0.05, high: 0.25},
  {key: 'free_cash_flow_margin', weight: 0.20, low: -0.05, high: 0.25},
  {key: 'net_margin', weight: 0.15, low: 0, high: 0.30},
  {key: 'free_cash_flow_yield', weight: 0.20, low: 0.005, high: 0.08},
  {key: 'share_count_cagr_3y', weight: 0.10, low: 0, high: 0.05, reverse: true},
];

// Share frozen default ranges; production growth ceilings are revision-specific.
export const RESEARCH_V2_CORE_FACTORS = Object.freeze(core.map(factor => Object.freeze({...factor})));

const traceNames = {
  revenue_cagr_3y: 'revenueGrowth3y',
  free_cash_flow_margin: 'freeCashFlowMargin',
  share_count_cagr_3y: 'shareCountGrowth3y',
  net_debt_to_ebitda: 'netDebtToEbitda',
  interest_coverage: 'interestCoverage',
  eps_cagr_3y: 'epsGrowth3y',
  operating_margin_change_3y: 'operatingMarginChange3y',
};

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value) => Math.max(0, Math.min(100, value));
const round = (value) => Math.round(value * 10) / 10;

function metricValue(company, key) {
  if (key === 'ai_linkage') return company.referenceStock?.exposureScore;
  if (key === 'net_margin') return company.annual?.financials?.netMargin;
  return company.annual?.metrics?.[key];
}

function periodProblem(trace, period, key) {
  if (!trace?.inputs?.length) return false;
  const ending = key === 'revenue_cagr_3y' || key === 'share_count_cagr_3y' || key === 'operating_margin_change_3y' || key === 'eps_cagr_3y'
    ? trace.inputs.filter((input) => /Ending/.test(input.label ?? ''))
    : trace.inputs;
  return ending.some((input) => finite(input.value) && input.end && input.end !== period);
}

function notApplicable(company, key, trace) {
  const inputs = trace?.inputs ?? [];
  if (key === 'eps_cagr_3y') {
    const start = inputs.find((input) => input.label === 'Starting net income')?.value;
    const end = inputs.find((input) => input.label === 'Ending net income')?.value;
    return finite(start) && finite(end) && (start <= 0 || end <= 0);
  }
  if (key === 'net_debt_to_ebitda') {
    const operating = inputs.find((input) => input.label === 'Operating income')?.value;
    const depreciation = inputs.find((input) => input.label === 'Depreciation and amortisation')?.value;
    return finite(operating) && finite(depreciation) && operating + depreciation <= 0;
  }
  if (key === 'interest_coverage') {
    const interest = inputs.find((input) => input.label === 'Interest expense')?.value;
    return interest === 0;
  }
  if (key === 'ev_to_ebitda') {
    const debtTrace = company.annual?.riskCalculationTraces?.netDebtToEbitda;
    const operating = debtTrace?.inputs?.find((input) => input.label === 'Operating income')?.value;
    const depreciation = debtTrace?.inputs?.find((input) => input.label === 'Depreciation and amortisation')?.value;
    return finite(operating) && finite(depreciation) && operating + depreciation <= 0;
  }
  return false;
}

export function candidateEvidence(company, key, options = {}) {
  const annual = company.annual;
  const trace = annual?.riskCalculationTraces?.[traceNames[key]];
  const value = metricValue(company, key);
  const sourceInputs = (trace?.inputs ?? []).filter((input) => input.filingUrl);
  const metricPeriod = options.metricPeriods?.[key];
  const result = {
    key,
    value: finite(value) ? value : null,
    status: 'unavailable_source',
    source: key === 'ai_linkage' ? 'saved qualitative research assessment' : 'saved annual financial assessment',
    sourceUrls: [...new Set([...sourceInputs.map((input) => input.filingUrl),
      ...(key === 'free_cash_flow_yield' && annual?.valuationShareEvidence?.sourceUrl ? [annual.valuationShareEvidence.sourceUrl] : [])])],
    reportingPeriod: metricPeriod?.end ?? annual?.asOfDate ?? null,
    currency: key === 'ai_linkage' ? null : (annual?.currency ?? null),
    observationTime: company.observedAt ?? null,
    adjustmentBasis: key === 'free_cash_flow_yield' ? company.quote?.adjustmentBasis ?? null : null,
    ...(key === 'free_cash_flow_yield' ? { shareBasis: annual?.valuationShareEvidence ?? null } : {}),
    marketPrice: key === 'free_cash_flow_yield' ? {
      value: finite(company.quote?.price) ? company.quote.price : null,
      asOf: company.quote?.asOf ?? null,
      source: company.quote?.source ?? null,
      currency: company.quote?.currency ?? null,
      adjustmentBasis: company.quote?.adjustmentBasis ?? null,
    } : null,
  };
  if (!annual || annual.dataBasis !== 'annual') {
    return {...result, value: null, status: 'unsupported_reporting_basis'};
  }
  if (!annual.asOfDate || !annual.sourceUrl) {
    return {...result, value: null, status: 'unavailable_source'};
  }
  if (metricPeriod) {
    const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
      Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
    const age=(Date.parse(company.observedAt)-Date.parse(metricPeriod.end))/86400000;
    const years=(Date.parse(metricPeriod.end)-Date.parse(metricPeriod.start))/86400000;
    const ending=trace?.inputs?.find(input=>/Ending/.test(input.label??''));
    const starting=trace?.inputs?.find(input=>/Starting/.test(input.label??''));
    if (!['revenue_cagr_3y','share_count_cagr_3y'].includes(key)||metricPeriod.basis!=='annual'||
      !validDate(metricPeriod.start)||!validDate(metricPeriod.end)||metricPeriod.end>annual.asOfDate||
      !Number.isFinite(age)||age<0||age>400||Math.abs(years-3*365.25)>7||
      starting?.end!==metricPeriod.start||ending?.end!==metricPeriod.end||
      !starting.filingUrl||!ending.filingUrl||!Array.isArray(metricPeriod.sourceUrls)||!metricPeriod.sourceUrls.length||
      !metricPeriod.sourceUrls.every(url=>typeof url==='string'&&url.startsWith('https://www.sec.gov/Archives/edgar/data/'))||
      !Number.isFinite(Date.parse(metricPeriod.sourceObservationTime))||metricPeriod.sourceObservationTime>company.observedAt||
      metricPeriod.sourceObservationTime<(ending.filed??ending.end)) {
      return {...result,value:null,status:'unsupported_reporting_basis'};
    }
    result.source='verified three-year annual history; independently dated from current profitability';
    result.sourceUrls=[...new Set([...result.sourceUrls,...metricPeriod.sourceUrls])];
    result.sourceObservationTime=metricPeriod.sourceObservationTime;
    result.reportingPeriodStart=metricPeriod.start;
    result.periodBasis='annual';
    result.currency=metricPeriod.currency;
    result.adjustmentBasis=metricPeriod.adjustmentBasis;
  }
  if (key === 'ai_linkage' && (!finite(value) || !Array.isArray(company.referenceStock?.aiEvidence) || !company.referenceStock.aiEvidence.length)) {
    return {...result, value: null};
  }
  if (periodProblem(trace, metricPeriod?.end??annual.asOfDate, key)) {
    return {...result, value: null, status: 'incompatible_period'};
  }
  if (trace && finite(value) && (!finite(trace.value) || Math.abs(trace.value - value) > Math.max(1e-9, Math.abs(value) * 1e-9))) {
    return {...result, value: null, status: 'unsupported_reporting_basis'};
  }
  if (key === 'free_cash_flow_yield' && (!finite(company.quote?.price) || company.quote.price <= 0 || !company.quote?.asOf || !company.quote?.source || !company.quote?.currency || !/regular-market/i.test(company.quote?.adjustmentBasis ?? ''))) {
    return {...result, value: null, status: 'unavailable_source'};
  }
  if (key === 'free_cash_flow_yield' && company.quote.currency !== annual.currency) {
    return {...result, value: null, status: 'incompatible_period'};
  }
  if (key === 'free_cash_flow_yield' && (!finite(annual.price) || Math.abs(annual.price - company.quote.price) > Math.max(1e-6, company.quote.price * 1e-9))) {
    return {...result, value: null, status: 'unsupported_reporting_basis'};
  }
  if (finite(value)) return {...result, status: value === 0 ? 'verified_zero' : 'verified_numeric'};
  if (notApplicable(company, key, trace)) return {...result, status: 'not_applicable'};
  return result;
}

function sourceVerifiedZeroBorrowings(company) {
  const trace = company.annual?.riskCalculationTraces?.netDebtToEbitda;
  const zero = trace?.inputs?.find((input) => /borrowings/i.test(input.label ?? '') && input.value === 0);
  return Boolean(zero?.filingUrl && zero.end === company.annual?.asOfDate &&
    /reviewed annual filing/i.test(zero.label ?? ''));
}

function safetyReasons(company, evidence) {
  const reasons = [];
  const debt = evidence.net_debt_to_ebitda;
  const coverage = evidence.interest_coverage;
  if (!finite(debt.value)) reasons.push(`Net debt safety evidence: ${debt.status}`);
  else if (debt.value > 4) reasons.push('Net debt/EBITDA exceeds 4x');
  if (!finite(coverage.value)) {
    // Zero *borrowings* is documented separately; missing interest is never treated as zero.
    if (!sourceVerifiedZeroBorrowings(company)) reasons.push(`Debt-service evidence: ${coverage.status}`);
  } else if (coverage.value < 1.5) reasons.push('Interest coverage below 1.5x');
  const dilution = evidence.share_count_cagr_3y;
  if (finite(dilution.value) && dilution.value > 0.05) reasons.push('Share-count growth above 5% annually');
  const operatingMargin = evidence.operating_margin_change_3y;
  if (!finite(operatingMargin.value)) reasons.push(`Operating-margin risk evidence: ${operatingMargin.status}`);
  else if (operatingMargin.value < -0.05) reasons.push('Operating margin fell more than 5 points');
  return reasons;
}

export function assessResearchV2Candidate(company, options = {}) {
  const weights = options.weights ?? RESEARCH_V2_CORE_WEIGHTS;
  const buyScoreThreshold = options.buyScoreThreshold === null ? null : options.buyScoreThreshold ?? 65;
  const revenueGrowthScoreCeiling = options.revenueGrowthScoreCeiling ?? 0.25;
  const minRevenueGrowth = options.minRevenueGrowth === null ? null : options.minRevenueGrowth ?? 0.10;
  // Keep frozen/offline defaults intact; production explicitly selects its approved entry rule.
  const profitabilityRequirement = options.profitabilityRequirement ?? 'positive_net_and_fcf';
  if (core.some((item) => !finite(weights[item.key]) || weights[item.key] < 0) ||
      Object.keys(weights).length !== core.length ||
      Math.abs(core.reduce((sum, item) => sum + weights[item.key], 0) - 1) > 1e-9 ||
      (buyScoreThreshold !== null && (!finite(buyScoreThreshold) || buyScoreThreshold < 0 || buyScoreThreshold > 100)) ||
      !finite(revenueGrowthScoreCeiling) || revenueGrowthScoreCeiling <= -0.05 ||
      (minRevenueGrowth !== null && (!finite(minRevenueGrowth) || minRevenueGrowth < 0)) ||
      !['positive_net_and_fcf', 'positive_net_or_fcf'].includes(profitabilityRequirement)) {
    throw new Error('Invalid offline v2 sensitivity parameters');
  }
  const evidence = Object.fromEntries([
    ...core.map((item) => item.key),
    'net_debt_to_ebitda', 'interest_coverage', 'operating_margin_change_3y',
    'eps_cagr_3y', 'return_on_invested_capital', 'ev_to_ebitda',
  ].map((key) => [key, candidateEvidence(company, key, options)]));
  const missingCore = core.filter((item) => !finite(evidence[item.key].value)).map((item) => `${item.key}: ${evidence[item.key].status}`);
  const score = missingCore.length ? null : round(core.reduce((sum, item) => {
    const high = item.key === 'revenue_cagr_3y' ? revenueGrowthScoreCeiling : item.high;
    const normal = clamp(100 * (evidence[item.key].value - item.low) / (high - item.low));
    return sum + weights[item.key] * (item.reverse ? 100 - normal : normal);
  }, 0));
  const rankReasons = [...missingCore];
  if (score !== null && evidence.ai_linkage.value < 60) rankReasons.push('AI linkage below 60');
  if (score !== null && !finite(company.referenceStock?.aiEvidenceScore)) rankReasons.push('AI evidence score unavailable');
  const riskReasons = safetyReasons(company, evidence);
  const buyReasons = [...rankReasons, ...riskReasons];
  if (score !== null && buyScoreThreshold !== null && score < buyScoreThreshold) buyReasons.push(`Candidate score below ${buyScoreThreshold}`);
  if (minRevenueGrowth !== null && finite(evidence.revenue_cagr_3y.value) && evidence.revenue_cagr_3y.value < minRevenueGrowth) buyReasons.push(`Revenue growth below ${Math.round(minRevenueGrowth * 100)}%`);
  if (profitabilityRequirement === 'positive_net_or_fcf') {
    // Missing evidence already fails the completeness gate; never substitute zero.
    if (finite(evidence.net_margin.value) && finite(evidence.free_cash_flow_margin.value) &&
        evidence.net_margin.value <= 0 && evidence.free_cash_flow_margin.value <= 0) {
      buyReasons.push('Neither net profit nor free cash flow is positive');
    }
  } else {
    if (finite(evidence.free_cash_flow_margin.value) && evidence.free_cash_flow_margin.value <= 0) buyReasons.push('Free cash flow margin not positive');
    if (finite(evidence.net_margin.value) && evidence.net_margin.value <= 0) buyReasons.push('Net margin not positive');
  }
  if (!finite(company.quote?.price) || !company.quote?.asOf) buyReasons.push('Observed regular-market price unavailable');
  if (company.referenceStock?.dataQuality !== 'pass') buyReasons.push('Saved data quality did not pass');
  if (company.referenceStock?.redFlags?.length) buyReasons.push('Existing research risk flags');
  return {
    ticker: company.ticker,
    version: RESEARCH_V2_CANDIDATE,
    reportingPeriod: company.annual?.asOfDate ?? null,
    score,
    scoreable: score !== null,
    researchRanked: score !== null && rankReasons.length === 0,
    simulatedBuyEligible: buyReasons.length === 0,
    missingCore,
    rankReasons,
    buyReasons,
    evidence,
  };
}

export const RESEARCH_V2_CORE_WEIGHTS = Object.freeze(Object.fromEntries(core.map(({key, weight}) => [key, weight])));
