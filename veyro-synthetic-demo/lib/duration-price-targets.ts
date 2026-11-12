/** Original dated cash-flow valuation. No prices, ranks, analyst targets or execution inputs. */
export type DurationPeriod = {
  label: string; start: string; end: string; annualDays: number; annualRevenueBn: number; operatingMargin: number;
  taxRate: number; depreciationBn: number; acquisitionAmortisationBn: number; sbcBn: number;
  capitalSpendingBn: number; workingCapitalInvestmentBn: number; acquisitionInvestmentBn: number;
  minorityCashFlowBn: number; interestBn: number;
};
export type DurationCase = {
  name: string; weight: number; reason: string; periods: DurationPeriod[];
  discountRate: number; terminalGrowth: number; terminalSalesToCapital: number;
  cashOpeningBn: number; debtOpeningBn: number; knownNetFinancingBn: number;
  knownDebtAddedBn: number; principalRepaidBn: number; committedPayoutBn: number;
  discretionaryPayoutFraction: number; listedEconomicSharesBn: number;
  additionalClaimsReason: string;
};
export type DurationModel = {
  currency: 'USD' | 'TWD'; unitsPerUSD: number; ordinarySharesPerListedShare: number;
  openingDate: string; openingSharesBn: number; sourceQuality: string; confidence: string;
  growthReason: string; investmentReason: string; compensationReason: string; bridgeReason: string;
  horizonConvention: string; cases: DurationCase[];
};
export type DurationFlow = DurationPeriod & {
  operatingIncomeBn: number; nopatBn: number; reinvestmentBn: number; annualFcfBn: number;
  remainingFraction: number; yearsFromTarget: number; remainingFcfBn: number; pvBn: number;
};
export type DurationCaseResult = {
  name: string; weight: number; price: number; enterpriseValueBn: number; cashAtTargetBn: number;
  debtAtTargetBn: number; equityValueBn: number; listedEconomicSharesBn: number;
  preTargetOperatingCashBn: number; preTargetPayoutBn: number; terminalFcfBn: number;
  terminalReinvestmentBn: number; terminalPvBn: number; terminalShare: number;
  impliedTerminalRoic: number; minimumPostTargetCashBn: number; flows: DurationFlow[];
};
export type DurationValuation = { unroundedTarget: number; cases: DurationCaseResult[] };
const DAY = 86400_000;
const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
const n = (v: number, label: string, min = -Infinity, max = Infinity) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`Missing or invalid ${label}.`);
  return v;
};
const positive = (v: number, label: string) => n(v, label, Number.MIN_VALUE);
const ratio = (v: number, label: string) => n(v, label, 0, 1);

export function durationCashFlow(p: DurationPeriod) {
  positive(p.annualRevenueBn, 'revenue'); n(p.operatingMargin, 'operating margin', -Infinity, 1); ratio(p.taxRate, 'tax');
  for (const k of ['depreciationBn','acquisitionAmortisationBn','sbcBn','capitalSpendingBn','acquisitionInvestmentBn','minorityCashFlowBn','interestBn'] as const) n(p[k], k, 0);
  n(p.workingCapitalInvestmentBn, 'working capital');
  const operatingIncomeBn = p.annualRevenueBn * p.operatingMargin;
  // GAAP-style margin already includes SBC and D&A. SBC is NOT added back after the horizon.
  const nopatBn = operatingIncomeBn - Math.max(operatingIncomeBn,0) * p.taxRate - p.minorityCashFlowBn;
  const reinvestmentBn = p.capitalSpendingBn + p.workingCapitalInvestmentBn + p.acquisitionInvestmentBn
    - p.depreciationBn - p.acquisitionAmortisationBn;
  return { operatingIncomeBn, nopatBn, reinvestmentBn, annualFcfBn: nopatBn - reinvestmentBn };
}

/** Value only cash still to be earned AFTER targetDate; completed years only enter the cash bridge. */
export function calculateDurationModel(model: DurationModel, targetDate: string): DurationValuation {
  if (!validDay(targetDate) || !validDay(model.openingDate) || model.openingDate >= targetDate
    || !['USD','TWD'].includes(model.currency) || !Array.isArray(model.cases) || !model.cases.length
    || !model.sourceQuality || !model.confidence || !model.growthReason || !model.investmentReason
    || !model.compensationReason || !model.bridgeReason || !model.horizonConvention) throw new Error('Incomplete duration model evidence or date.');
  positive(model.unitsPerUSD, 'FX'); positive(model.ordinarySharesPerListedShare, 'ADR ratio'); positive(model.openingSharesBn, 'opening shares');
  if (model.currency === 'USD' && model.unitsPerUSD !== 1) throw new Error('USD conversion mismatch.');
  const target = Date.parse(targetDate), first = Date.parse(model.openingDate) + DAY;
  let weights = 0;
  const cases = model.cases.map(c => {
    weights += ratio(c.weight, 'case weight');
    if (!c.name || !c.reason || !c.additionalClaimsReason || !Array.isArray(c.periods) || !c.periods.length) throw new Error('Incomplete forecast case.');
    const rate = positive(c.discountRate, 'discount rate'), growth = n(c.terminalGrowth, 'stable growth', 0);
    if (rate <= growth) throw new Error('Discount rate must exceed stable growth.');
    const turnover = positive(c.terminalSalesToCapital, 'stable sales / capital');
    for (const k of ['cashOpeningBn','debtOpeningBn','knownNetFinancingBn','knownDebtAddedBn','principalRepaidBn','committedPayoutBn'] as const) n(c[k], k, 0);
    ratio(c.discretionaryPayoutFraction, 'payout fraction'); positive(c.listedEconomicSharesBn, 'economic shares');
    if (c.listedEconomicSharesBn < model.openingSharesBn / model.ordinarySharesPerListedShare) throw new Error('Unfunded reduction in share claims.');
    let expected = first, preTargetOperatingCashBn = 0;
    const flows = c.periods.map(p => {
      if (!validDay(p.start) || !validDay(p.end) || Date.parse(p.start) !== expected || p.start > p.end) throw new Error('Forecast dates are not contiguous.');
      const start = Date.parse(p.start), end = Date.parse(p.end) + DAY; expected = end;
      const length = (end - start) / DAY;
      const annualDays = n(p.annualDays, 'annual normalization days', 360, 371);
      if (length > annualDays) throw new Error('Forecast period exceeds its annual cash-flow interval.');
      const calc = durationCashFlow(p);
      const elapsedDays = Math.max(0, Math.min(target, end) - start) / DAY;
      const remainingDays = Math.max(0, end - Math.max(target, start)) / DAY;
      // Actual cash generated before the horizon adds SBC back; its equity claims are reserved once.
      const preTax = calc.operatingIncomeBn - p.interestBn;
      const cashAnnual = preTax - Math.max(preTax, 0) * p.taxRate - p.minorityCashFlowBn
        + p.sbcBn + p.depreciationBn + p.acquisitionAmortisationBn
        - p.capitalSpendingBn - p.workingCapitalInvestmentBn - p.acquisitionInvestmentBn;
      preTargetOperatingCashBn += cashAnnual * elapsedDays / annualDays;
      const yearsFromTarget = Math.max(0, end - target) / DAY / 365.25;
      const remainingFraction = remainingDays / annualDays;
      const remainingFcfBn = calc.annualFcfBn * remainingFraction;
      return { ...p, ...calc, remainingFraction, yearsFromTarget, remainingFcfBn,
        pvBn: remainingFcfBn / (1 + rate) ** yearsFromTarget };
    });
    const remaining = flows.filter(p => p.remainingFraction > 0);
    if (remaining.length < 10 || remaining.at(-1)!.yearsFromTarget < 10) throw new Error('Long-growth forecast is incomplete.');
    const final = flows.at(-1)!;
    if (final.end.slice(0,4) !== '2038') throw new Error('Expected explicit forecast through 2038.');
    // Terminal growth uses the SAME operating margin and explicit capital productivity.
    // Replacement capex equals depreciation; growth capex/working capital = incremental sales / turnover.
    const stableRevenueBn = final.annualRevenueBn * (1 + growth);
    const stableNopatBn = stableRevenueBn * final.operatingMargin * (1 - final.taxRate)
      - final.minorityCashFlowBn * (1 + growth);
    const terminalReinvestmentBn = stableRevenueBn * growth / turnover;
    const terminalFcfBn = stableNopatBn - terminalReinvestmentBn;
    positive(terminalFcfBn, 'stable cash flow');
    const terminalPvBn = terminalFcfBn / (rate - growth) / (1 + rate) ** final.yearsFromTarget;
    const enterpriseValueBn = remaining.reduce((v,p) => v + p.pvBn, 0) + terminalPvBn;
    const preTargetPayoutBn = Math.max(preTargetOperatingCashBn, 0) * c.discretionaryPayoutFraction + c.committedPayoutBn;
    const cashAtTargetBn = c.cashOpeningBn + c.knownNetFinancingBn + preTargetOperatingCashBn - c.principalRepaidBn - preTargetPayoutBn;
    const debtAtTargetBn = c.debtOpeningBn + c.knownDebtAddedBn - c.principalRepaidBn;
    n(cashAtTargetBn, 'funded horizon cash', 0); n(debtAtTargetBn, 'funded horizon debt', 0);
    // Liquidity stress retains future residual cash and rolls existing debt at unchanged principal.
    // It gives no valuation credit for a new financing round or a lender's willingness to fund a deficit.
    let liquidity = cashAtTargetBn, minimumPostTargetCashBn = liquidity;
    for (const p of remaining) {
      const interestAfterTax = p.interestBn * (1 - p.taxRate);
      liquidity += (p.annualFcfBn - interestAfterTax) * p.remainingFraction;
      minimumPostTargetCashBn = Math.min(minimumPostTargetCashBn, liquidity);
    }
    n(minimumPostTargetCashBn, 'post-target funding', 0);
    const equityValueBn = enterpriseValueBn + cashAtTargetBn - debtAtTargetBn;
    positive(equityValueBn, 'positive equity value');
    const price = equityValueBn / model.unitsPerUSD / c.listedEconomicSharesBn;
    positive(price, 'price target');
    return { name:c.name, weight:c.weight, price, enterpriseValueBn, cashAtTargetBn, debtAtTargetBn,
      equityValueBn, listedEconomicSharesBn:c.listedEconomicSharesBn, preTargetOperatingCashBn, preTargetPayoutBn,
      terminalFcfBn, terminalReinvestmentBn, terminalPvBn, terminalShare:terminalPvBn / enterpriseValueBn,
      impliedTerminalRoic: (final.nopatBn / final.annualRevenueBn) * turnover, minimumPostTargetCashBn, flows };
  });
  if (Math.abs(weights - 1) > 1e-10) throw new Error('Scenario weights do not sum to one.');
  return { unroundedTarget: cases.reduce((v,c) => v + c.price * c.weight, 0), cases };
}
