import type { FinancialSource } from './financial-source';

type ResearchPresentationSource = {
  currentPrice: number | null;
  priceChangePercent: number | null;
  priceAsOf: string | null;
  displayDailyChange?: { percent: number; previousClose: number; previousCloseAsOf: string; asOf: string; source: string; currency: string; adjustmentBasis: string } | null;
  asOfDate?: string | null;
  filingDate?: string | null;
  dataBasis?: 'annual' | 'annualised-interim' | 'ttm';
  latestFinancialEvidence?: { form: string; assurance?: string };
  confidence: number;
  aiExposureConfidence?: 'High' | 'Medium' | 'Low';
};

export function researchDailyChange(stock: Pick<ResearchPresentationSource, 'currentPrice' | 'priceChangePercent' | 'priceAsOf' | 'displayDailyChange'>) {
  const evidence = stock.displayDailyChange;
  const priced = stock.currentPrice !== null && Number.isFinite(stock.currentPrice);
  const verifiedClose = priced && evidence && evidence.asOf === stock.priceAsOf
    && Number.isFinite(evidence.percent) && Number.isFinite(evidence.previousClose) && evidence.previousClose > 0;
  const percent = verifiedClose ? evidence.percent
    : priced && stock.priceChangePercent !== null && Number.isFinite(stock.priceChangePercent) ? stock.priceChangePercent : null;
  return { percent, basisLabel: verifiedClose ? 'vs previous close' : 'regular-session change', previousClose: verifiedClose ? evidence : null };
}

function validDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
}

/** Label the saved financial period, independently of the scan and price dates. */
export function companyFinancialPeriod(stock?: { asOfDate?: string | null; dataBasis?: string } | null) {
  if (!validDate(stock?.asOfDate)) return 'Financial period unavailable';
  const date = new Date(`${stock.asOfDate}T00:00:00Z`).toLocaleDateString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  const basis = stock.dataBasis === 'annual' ? 'year ended'
    : stock.dataBasis === 'ttm' ? '12 months ended' : stock.dataBasis === 'annualised-interim' ? 'interim period ended' : 'period ended';
  return `Financials: ${basis} ${date}`;
}

/** Resolve presentation only; never replace a saved score or its observations. */
export function companyResearchPresentation(stock: ResearchPresentationSource, scanAsOf: string | undefined, source?: FinancialSource | null) {
  const scanTime = Date.parse(scanAsOf ?? '');
  const cutoff = Number.isFinite(scanTime) ? new Date(scanTime).toISOString().slice(0,10) : null;
  const compatibleDate = (date: string | null | undefined): date is string => validDate(date)
    && validDate(stock.asOfDate) && date >= stock.asOfDate && cutoff !== null && date <= cutoff;
  const savedDate = compatibleDate(stock.filingDate) ? stock.filingDate : null;
  // A recorded but incompatible date must not be quietly replaced with another filing.
  const canResolve = !stock.filingDate || stock.filingDate === 'Unknown';
  const resolvedDate = canResolve && source?.filingUrl && source.periodEnd === stock.asOfDate && compatibleDate(source.filingDate)
    ? source.filingDate : null;
  return {
    dailyChange: researchDailyChange(stock),
    financialBasis: stock.latestFinancialEvidence?.form === '8-K' ? 'Full year · unaudited earnings release' : stock.dataBasis === 'annual' ? 'Annual'
      : stock.dataBasis === 'ttm' ? 'Trailing twelve months · filed statements' : stock.dataBasis === 'annualised-interim' ? 'Provisional · annualised interim' : 'Reporting basis unavailable',
    filingDate: savedDate ?? resolvedDate,
    filingDateBasis: savedDate ? 'saved-scan' : resolvedDate ? 'resolved-period' : 'unavailable',
    financialCoverage: Number.isFinite(stock.confidence) && stock.confidence >= 0 && stock.confidence <= 1
      ? `${Math.round(stock.confidence * 100)}%` : 'Unavailable',
    aiEvidenceConfidence: stock.aiExposureConfidence ?? 'Unavailable',
  };
}
