// User-approved 10 October 2026 entry/exit revisions. Missing ratios stay
// unavailable, and negative cash flows still earn no relevant scoring points.
export const ACTIVE_PURCHASE_RISK_POLICY = 'debt-gaps-dilution-expansion-coverage-warnings-2026-10-10';
export const DILUTION_WARNING = 'Material dilution: share count grew more than 5% annually';
const NON_BLOCKING_WARNINGS = new Set([
  DILUTION_WARNING,
  'Weak debt service: interest coverage is below 1.5x',
  'Expansion spending exceeds operating cash flow',
]);

export function purchaseBlockingRiskFlags(flags) {
  return flags.filter(flag => !NON_BLOCKING_WARNINGS.has(flag));
}

export function removedPurchaseRestriction(reason) {
  return /^(Net debt safety evidence|Debt-service evidence): (unavailable_source|not_applicable)$/.test(reason) ||
    reason === 'Share-count growth above 5% annually' ||
    reason === 'Interest coverage below 1.5x' ||
    reason === 'Free cash flow margin not positive';
}

export function applyPurchaseRiskPolicy(assessment, flags) {
  const blockingFlags = purchaseBlockingRiskFlags(flags);
  const buyReasons = assessment.buyReasons.filter(reason => !removedPurchaseRestriction(reason) &&
    (reason !== 'Existing research risk flags' || flags.length === 0 || blockingFlags.length > 0));
  return {
    ...assessment,
    purchaseRiskPolicy: ACTIVE_PURCHASE_RISK_POLICY,
    buyReasons,
    simulatedBuyEligible: assessment.researchRanked && Number.isFinite(assessment.score) && buyReasons.length === 0 &&
      (assessment.simulatedBuyEligible || assessment.buyReasons.length > 0),
  };
}

// The six core inputs are verified separately. Unknown aggregate exclusions
// cannot use this exception; retained operating-margin checks still apply.
export function knownNonCoreFinancialExclusion(stock) {
  return stock.dataQuality === 'excluded' && Boolean(stock.coverageIssues?.length) &&
    stock.coverageIssues.every(issue => ['debt_cash', 'metric_coverage'].includes(issue.code));
}
