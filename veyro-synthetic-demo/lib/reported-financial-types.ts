export type ReportedFinancials = {
  status: 'reported_only' | 'unavailable' | 'stale';
  periodStart: string;
  periodEnd: string;
  basis: string;
  currency: string;
  source: { url: string; sha256: string; observedAt: string; target: { filed: string; form: string } };
  figures: Array<{ label: string; value: number; unit: string; start: string; end: string; scope: string; adjustmentBasis: string; sourceUrl: string; sourceSha256: string; observedAt: string }>;
  limitations: string[];
};

