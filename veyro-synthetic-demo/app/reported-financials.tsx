import type { ReportedFinancials } from '../lib/reported-financial-types';

export function ReportedFinancialsPanel({ report }: { report?: ReportedFinancials | null }) {
  if (!report) return null;
  const amount = (value: number, currency: string) => new Intl.NumberFormat('en-NZ', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 2 }).format(value);
  return <section className="company-research-section" aria-label="Latest reported figures">
    <h4>Latest reported figures</h4>
    <p>{report.basis} · {report.periodStart} to {report.periodEnd} · {report.currency}</p>
    <p>These reported amounts are shown separately from the research score. They are not annualised or used to fill missing score inputs.</p>
    {report.status === 'reported_only' && <dl className="score-breakdown">{report.figures.map(figure => <div key={figure.label}>
      <dt>{figure.label}</dt><dd>{amount(figure.value, figure.unit)}</dd>
    </div>)}</dl>}
    <ul className="research-limitations">{report.limitations.map(note => <li key={note}>{note}</li>)}</ul>
    <details><summary>Reporting source and basis</summary>
      <p>Filed {report.source.target.filed} · observed {report.source.observedAt}.</p>
      <a href={report.source.url} target="_blank" rel="noopener noreferrer">Open {report.source.target.form} financial report</a>
      <ul>{report.figures.map(figure => <li key={figure.label}>{figure.label}: {figure.scope}. {figure.adjustmentBasis}.</li>)}</ul>
    </details>
  </section>;
}
