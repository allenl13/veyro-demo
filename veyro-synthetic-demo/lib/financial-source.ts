import type { RiskCalculationTraces } from "./risk-calculations";
type ReportingSource = { end: string; filed: string; accn?: string; form?: string; sourceUrl?: string; sourceObservedAt?: string; reviewedLatest?: boolean };
export type FinancialSource = {
  calculationReview?: { observedAt: string; periodEnd: string; traces: RiskCalculationTraces };
  filingUrl: string | null;
  companyUrl: string;
  filingDate: string | null;
  form: string | null;
  periodEnd: string;
};

/** Resolve the revenue reporting period without substituting a newer filing
 * for the evidence available when a saved research scan was generated. */
export function financialSourceForPeriod(
  company: { cik: string; reportingSources: ReportingSource[] },
  periodEnd: string,
  scanAsOf: string,
  expectedFilingDate?: string,
): FinancialSource {
  if (!/^\d{1,10}$/.test(company.cik)) throw new Error("Invalid SEC company identifier");
  const companyUrl = `https://www.sec.gov/edgar/browse/?CIK=${Number(company.cik)}`;
  const unavailable = { filingUrl: null, companyUrl, filingDate: null, form: null, periodEnd };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || !Number.isFinite(Date.parse(scanAsOf))) return unavailable;
  const source = company.reportingSources.find((item) => item.end === periodEnd);
  const reviewedEvent = source?.reviewedLatest === true && ["6-K", "8-K"].includes(source.form ?? "") &&
    source.sourceUrl?.startsWith(`https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${source.accn?.replaceAll("-", "")}/`) &&
    Number.isFinite(Date.parse(source.sourceObservedAt ?? "")) && source.sourceObservedAt! <= scanAsOf;
  if (!source || !/^\d{10}-\d{2}-\d{6}$/.test(source.accn ?? "") ||
      (!["10-K", "10-K/A", "20-F", "20-F/A", "10-Q", "10-Q/A"].includes(source.form ?? "") && !reviewedEvent) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(source.filed) || !Number.isFinite(Date.parse(source.filed)) ||
      source.filed > new Date(scanAsOf).toISOString().slice(0, 10) ||
      (expectedFilingDate && source.filed !== expectedFilingDate)) return unavailable;
  const accession = source.accn!;
  return {
    filingUrl: reviewedEvent ? source.sourceUrl! : `https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${accession.replaceAll("-", "")}/${accession}-index.html`,
    companyUrl, filingDate: source.filed, form: source.form!, periodEnd,
  };
}
