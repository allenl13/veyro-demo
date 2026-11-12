import reviewedTargets from '../demo/price-targets.json' with { type: 'json' };
import { calculateDurationModel, type DurationModel, type DurationValuation } from './duration-price-targets.ts';
import { calculateNebiusDuration, type NebiusInput, type NebiusValuation } from './nbis-duration-model.mjs';
import type { DisplayQuote } from './research-display-price';

export type TargetSource = { label: string; url: string; publishedAt: string; periodEnd: string; observedAt: string; currency: string; basis: string; figures: {label: string; value: number; unit: string; basis: string}[] };
export type TargetForecast = {
  currency: 'USD' | 'TWD' | 'EUR'; unitsPerUSD: number; fxReason: string;
  earningsPeriod: {label: string; end: string; basis: 'forward' | 'completed'};
  contextPeriod: {label: string; end: string; revenue: number} | null;
  earningsBasis: string; method: 'operating-margin' | 'gross-margin'; revenue: number;
  operatingMargin: number | null; grossMargin: number | null; operatingExpenses: number | null;
  taxRate: number; netNonOperatingIncome: number; nonControllingIncome: number;
  dilutedOrdinaryShares: number; ordinarySharesPerListedShare: number; earningsMultiple: number; cycleHaircut: number;
};
export type PriceTargetReview = {
  ticker: string; status: 'reviewed' | 'unavailable'; reason: string | null; reviewedAt: string; targetDate: string;
  reviewDueAt: string; currency: string; roundingIncrement: number; forecastBasis: string; priceBasis: string;
  forecast: TargetForecast | null; revenueAndMarginReason: string; multipleReason: string;
  shareAndFinancingReason: string; earningsAndCapitalReason: string; shareBasis: string; modelReview: string;
  auditChange: string; risks: string; sources: TargetSource[];
  growth?: DurationModel | null;
  cloudGrowth?: NebiusInput | null; confidenceLabel?: string;
  sensitivities?: {label:string; changePercent:number|null; status:string}[];
  reviewPolicy?: 'dated-estimate'; confidence?: string;
  conditionalShareClaims?: {label:string; redemptionUSD:number; conversionShares:number}[];
  dilutedShareComponents?: {label:string; shares:number; basis:string}[];
};
type AvailableReview = PriceTargetReview & { forecast: TargetForecast };
export const PRICE_TARGET_VERSION = reviewedTargets.version;
export const priceTargetReviews = reviewedTargets.companies as readonly PriceTargetReview[];
export type PriceTargetResult = {
  status: 'available'; method: 'earnings-multiple'; target: number; unroundedTarget: number; operatingIncome: number;
  pretaxIncome: number; netIncome: number; eps: number; normalizedEps: number; reviewNote?: string; review: AvailableReview;
} | { status: 'available'; method: 'growth-cash-flow'; target: number; unroundedTarget: number;
  valuation: DurationValuation; reviewNote?:string; review: PriceTargetReview & {growth: DurationModel} }
  | {status:'available'; method:'cloud-growth-cash-flow'; target:number; unroundedTarget:number;
    valuation:NebiusValuation; reviewNote?:string; review:PriceTargetReview & {cloudGrowth:NebiusInput}}
  | { status: 'unavailable' | 'stale'; reason: string; review?: PriceTargetReview };

const date = (value: string) => Date.parse(value);
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date(value)) && new Date(value).toISOString().slice(0,10) === value;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const margin = (value: unknown): value is number => positive(value) && value <= 1;

/** Forecast inputs are independent of research scores, market prices and execution. */
export function calculatePriceTarget(review: PriceTargetReview | undefined, now = Date.now(), financialPeriodEnd?: string | null): PriceTargetResult {
  if (!review) return { status: 'unavailable', reason: 'Price targets are unavailable in this synthetic demonstration.' };
  const unavailable = (reason: string): PriceTargetResult => ({status:'unavailable', reason, review});
  const invalid = () => unavailable('Forecast inputs or source evidence need review.');
  const reviewedAt = date(review.reviewedAt);
  const horizon = date(review.targetDate);
  const due = date(review.reviewDueAt);
  const expectedDate = `${Number(review.reviewedAt.slice(0, 4)) + 1}${review.reviewedAt.slice(4, 10)}`;
  if (!Number.isFinite(now) || !Number.isFinite(reviewedAt) || reviewedAt > now
    || !validDay(review.targetDate) || review.targetDate !== expectedDate
    || !Number.isFinite(due) || due <= reviewedAt || due >= horizon || review.currency !== 'USD') return invalid();
  if (review.status === 'unavailable') return unavailable(review.reason?.trim() || 'A defensible valuation model is not yet supported.');
  if (review.status !== 'reviewed' || !Array.isArray(review.sources)) return invalid();
  const validSources = review.sources.length > 0 && review.sources.every(s =>
    s && /^https:\/\//.test(s.url) && s.basis && ['USD','TWD','EUR','shares'].includes(s.currency) && s.label && Array.isArray(s.figures)
    && Number.isFinite(date(s.observedAt)) && date(s.observedAt) <= reviewedAt
    && validDay(s.publishedAt) && date(s.publishedAt) <= date(s.observedAt)
    && validDay(s.periodEnd) && date(s.periodEnd) <= date(s.publishedAt)
    && s.figures.every(v => Number.isFinite(v.value) && ['USD','TWD','EUR','shares'].includes(v.unit) && v.basis && v.label));
  if (!validSources || !review.sources.some(s => s.figures.length > 0) || !positive(review.roundingIncrement)) return invalid();
  if (now >= horizon) return {status:'stale', reason:'Target horizon has passed; a new dated review is needed.', review};
  const latestSourcePeriod = Math.max(...review.sources.map(s => date(s.periodEnd)));
  const newerEvidence=financialPeriodEnd && (!validDay(financialPeriodEnd) || date(financialPeriodEnd) > latestSourcePeriod);
  const reviewNote=newerEvidence ? 'New financial evidence is available; this dated estimate needs review.'
    : now >= due ? 'Review due; showing the original dated estimate.' : undefined;
  if (review.growth) {
    try {
      const valuation = calculateDurationModel(review.growth, review.targetDate);
      const target = Math.round(valuation.unroundedTarget / review.roundingIncrement) * review.roundingIncrement;
      if (!positive(target)) return invalid();
      return {status:'available', method:'growth-cash-flow', target, unroundedTarget:valuation.unroundedTarget,
        valuation, reviewNote, review:review as PriceTargetReview & {growth:DurationModel}};
    } catch (error) { return unavailable(error instanceof Error ? error.message : 'Duration model needs review.'); }
  }
  if (review.cloudGrowth) {
    try {
      const valuation = calculateNebiusDuration(review.cloudGrowth, review.targetDate);
      const target = Math.round(valuation.unroundedTarget / review.roundingIncrement) * review.roundingIncrement;
      if (!positive(target)) return invalid();
      return {status:'available', method:'cloud-growth-cash-flow', target, unroundedTarget:valuation.unroundedTarget,
        valuation, reviewNote, review:review as PriceTargetReview & {cloudGrowth:NebiusInput}};
    } catch(error) { return unavailable(error instanceof Error ? error.message : 'Cloud funding model needs review.'); }
  }
  if (!review.forecast) return invalid();
  if (reviewNote && review.reviewPolicy !== 'dated-estimate') return {status:'stale',reason:reviewNote,review};
  const f = review.forecast;
  const periodEnd = date(f.earningsPeriod?.end);
  const validPeriod = f.earningsPeriod?.label && validDay(f.earningsPeriod.end) && periodEnd > reviewedAt
    && ((f.earningsPeriod.basis === 'forward' && periodEnd > horizon)
      || (f.earningsPeriod.basis === 'completed' && periodEnd <= horizon));
  const validOperating = (f.method === 'operating-margin' && margin(f.operatingMargin)
    && f.grossMargin === null && f.operatingExpenses === null)
    || (f.method === 'gross-margin' && margin(f.grossMargin) && f.operatingMargin === null
      && typeof f.operatingExpenses === 'number' && Number.isFinite(f.operatingExpenses) && f.operatingExpenses >= 0);
  if (!review.forecastBasis || !review.priceBasis || !review.shareBasis || !review.earningsAndCapitalReason
    || !review.revenueAndMarginReason || !review.multipleReason || !review.shareAndFinancingReason || !review.risks
    || !validSources || !review.sources.some(s => s.figures.length > 0)
    || !validPeriod || !validOperating || !positive(f.revenue) || !f.earningsBasis || !f.fxReason
    || !['USD','TWD','EUR'].includes(f.currency) || !positive(f.unitsPerUSD) || (f.currency === 'USD' && f.unitsPerUSD !== 1)
    || (f.contextPeriod !== null && (!f.contextPeriod?.label || !positive(f.contextPeriod.revenue)
      || !validDay(f.contextPeriod.end) || date(f.contextPeriod.end) >= periodEnd || date(f.contextPeriod.end) <= reviewedAt))
    || !Number.isFinite(f.taxRate) || f.taxRate < 0 || f.taxRate >= 1
    || !Number.isFinite(f.netNonOperatingIncome) || !Number.isFinite(f.nonControllingIncome) || f.nonControllingIncome < 0
    || !positive(f.dilutedOrdinaryShares) || !positive(f.ordinarySharesPerListedShare) || !positive(f.earningsMultiple)
    || !Number.isFinite(f.cycleHaircut) || f.cycleHaircut < 0 || f.cycleHaircut >= 1 || !positive(review.roundingIncrement)) return invalid();
  const operatingIncome = f.method === 'gross-margin'
    ? f.revenue * f.grossMargin! - f.operatingExpenses! : f.revenue * f.operatingMargin!;
  const pretaxIncome = operatingIncome + f.netNonOperatingIncome;
  const netIncome = pretaxIncome * (1 - f.taxRate) - f.nonControllingIncome;
  // Income is in the forecast currency. Convert once, then allocate to each listed share/ADR.
  const eps = netIncome / f.unitsPerUSD / f.dilutedOrdinaryShares * f.ordinarySharesPerListedShare;
  const normalizedEps = eps * (1 - f.cycleHaircut);
  const unroundedTarget = normalizedEps * f.earningsMultiple;
  const target = Math.round(unroundedTarget / review.roundingIncrement) * review.roundingIncrement;
  if (![operatingIncome, pretaxIncome, netIncome, eps, normalizedEps, unroundedTarget, target].every(positive)) {
    return unavailable('Positive comparable forecast earnings are required for this method.');
  }
  if (review.reviewPolicy === 'dated-estimate' && ['NBIS','AMD'].includes(review.ticker)
    && (!review.dilutedShareComponents || (review.ticker === 'NBIS' && !review.conditionalShareClaims))) return invalid();
  if (review.dilutedShareComponents !== undefined && (!Array.isArray(review.dilutedShareComponents)
    || !review.dilutedShareComponents.length || review.dilutedShareComponents.some(c => !c.label || !c.basis || !positive(c.shares))
    || review.dilutedShareComponents.reduce((total,c)=>total+c.shares,0) > f.dilutedOrdinaryShares + 1)) return invalid();
  // Full economic conversion is only coherent above each reserved redemption claim.
  // Below that price the retained-debt and earnings/share bridge must be reviewed.
  if (review.conditionalShareClaims !== undefined && (!Array.isArray(review.conditionalShareClaims)
    || !review.conditionalShareClaims.length || review.conditionalShareClaims.some(claim => !claim.label
      || !positive(claim.redemptionUSD) || !positive(claim.conversionShares)
      || unroundedTarget * claim.conversionShares < claim.redemptionUSD))) {
    return unavailable('Convertible debt/share assumptions need a retained-debt review at this valuation.');
  }
  return {status:'available', method:'earnings-multiple', target, unroundedTarget, operatingIncome, pretaxIncome, netIncome, eps, normalizedEps, reviewNote, review: review as AvailableReview};
}

export function companyPriceTarget(ticker: string, financialPeriodEnd?: string | null, now = Date.now()): PriceTargetResult {
  return calculatePriceTarget(priceTargetReviews.find(r => r.ticker === ticker), now, financialPeriodEnd);
}

/** A dated comparison uses only a separately verified regular-market USD quote. */
export function priceTargetComparison(result: PriceTargetResult, quote?: DisplayQuote, now = Date.now()) {
  if (result.status !== 'available' || !quote || quote.symbol !== result.review.ticker
    || !positive(quote.price) || quote.currency !== result.review.currency || !quote.source
    || !Number.isFinite(date(quote.asOf)) || date(quote.asOf) > now
    || !Number.isFinite(date(quote.observedAt)) || date(quote.observedAt) < date(quote.asOf) || date(quote.observedAt) > now + 30_000
    || now - date(quote.asOf) > 7 * 86400_000
    || !((quote.interval === '1d' && quote.adjustmentBasis === 'unadjusted regular-market close')
      || (quote.interval === '5m' && quote.adjustmentBasis === 'unadjusted regular-market five-minute bar close'))) return null;
  return {percent:(result.target / quote.price - 1) * 100, price:quote.price, asOf:quote.asOf,
    observedAt:quote.observedAt, source:quote.source, basis:quote.adjustmentBasis};
}

export function priceTargetPotentialLabel(percent: number | null | undefined) {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return 'Price comparison unavailable';
  const magnitude = Math.abs(percent).toFixed(1);
  if (Number(magnitude) === 0) return '0.0% potential change';
  return `${magnitude}% ${percent > 0 ? 'upside' : 'downside'}`;
}
