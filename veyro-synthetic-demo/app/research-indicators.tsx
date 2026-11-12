"use client";

import { claimCitation } from "../lib/claim-citations";
import { compactDiscoverRiskText, type DiscoverRiskPresentation } from "../lib/discover-risk-presentation";

export function ClaimSource({ ticker, kind, claim }: { ticker: string; kind: "evidence" | "risk"; claim: string }) {
  const citation = claimCitation(ticker, kind, claim);
  if (!citation) return <small className="claim-citation">Citation not yet verified.</small>;
  return <div className="claim-citation">
    <a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title}</a>
    <span>{citation.support}</span>
    <small>Source reviewed {citation.reviewedAt}</small>
  </div>;
}

export function financialHealthLabel(score: number | null) {
  if (score === null) return "Unavailable";
  if (score >= 80) return "Strong";
  if (score >= 60) return "Sound";
  if (score >= 40) return "Mixed";
  return "Weak";
}

function financialHealthTone(score: number | null) {
  if (score === null) return "unavailable";
  if (score >= 80) return "strong";
  if (score >= 60) return "sound";
  if (score >= 40) return "mixed";
  return "weak";
}

export function FinancialHealthIndicator({ score }: { score: number | null }) {
  return (
    <span className="financial-health-indicator">
      <strong className={`financial-health-label financial-health-${financialHealthTone(score)}`}>
        {financialHealthLabel(score)}
      </strong>
      <small>
        {score === null
          ? "Score unavailable"
          : `${Math.round(score)} / 100`}
      </small>
    </span>
  );
}

export function RiskIndicator({ risk, compact = false }: { risk: DiscoverRiskPresentation; compact?: boolean }) {
  const visibleText = compact ? compactDiscoverRiskText(risk.text) : risk.text;
  return (
    <span className={`risk-indicator risk-${risk.kind}`} aria-label={`${risk.label}: ${risk.text}`} title={compact && visibleText !== risk.text ? risk.text : undefined}>
      <span className="risk-label">{risk.label}</span>
      {risk.kind === "material" ? <span className="risk-separator" aria-hidden="true">·</span> : null}
      <span>{visibleText}</span>
    </span>
  );
}
