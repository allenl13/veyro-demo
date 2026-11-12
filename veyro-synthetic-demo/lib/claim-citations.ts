export type ClaimCitation = {
  ticker: string;
  kind: "evidence" | "risk";
  claim: string;
  title: string;
  url: string;
  support: string;
  reviewedAt: string;
};

// Demo-only authored citation register. No issuer material is included.
export const CLAIM_CITATIONS: readonly ClaimCitation[] = [];

export function claimCitation(ticker: string, kind: ClaimCitation["kind"], claim: string): ClaimCitation | null {
  return CLAIM_CITATIONS.find((item) => item.ticker === ticker && item.kind === kind && item.claim === claim) ?? null;
}

export function reviewedRiskCitations(ticker: string, existingClaims: readonly string[] = []): ClaimCitation[] {
  return CLAIM_CITATIONS.filter((item) => item.ticker === ticker && item.kind === "risk" && !existingClaims.includes(item.claim));
}
