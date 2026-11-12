export type NebiusInput = {
  ticker: string; bridge2027Fraction: number; weightReason: string; limitations: string[];
  opening: Record<string, unknown>;
  scenarios: {name: string; weight: number; reason: string; duration: Record<string, unknown>}[];
};
export type NebiusCase = {
  name: string; weight: number; price: number; enterpriseValueBn: number; cashAtTargetBn: number;
  nonConvertibleDebtBn: number; economicSharesBn: number; futureEquityPvBn: number;
  retainedNoteClaimsBn: number; economicConversionSharesBn: number; terminalShare: number;
  terminalReplacementBn: number; terminalFcfBn: number; terminalDeferredRunoffBn: number;
  postTargetFunding: { additionalDebtRaisedBn: number; additionalEquityRaisedBn: number; additionalSharesBn: number; ledger: {label: string; debtRaisedBn: number; equityRaisedBn: number; newSharesBn: number; cashEndBn: number}[] };
  periods: {label: string; revenueBn: number; endOwnedMW: number; endPartnerMW: number; replacementBn: number; capexBn: number; daBn: number; sbcBn: number; ebitBn: number; fcffBn: number; changeDeferredBn: number}[];
};
export type NebiusValuation = {unroundedTarget: number; scenarios: NebiusCase[]};
export function calculateNebiusDuration(company: NebiusInput, targetDate: string): NebiusValuation;
