// Original reviewed Nebius duration engine, promoted without app/network/state dependencies.
// All money/share quantities are billions. Capacity is MW. Estimates are NOT a financing guarantee.
const number = (v, label, min=-Infinity, max=Infinity) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v<min || v>max) throw new Error(`Unavailable ${label}`);
  return v;
};
const finite=number, ratio=(v,label)=>number(v,label,0,1);
const positive=(v,label)=>number(v,label,Number.MIN_VALUE);
const sum=a=>a.reduce((v,x)=>v+x,0);
export function allocateConvertibleClaims(valueBeforeNotesBn, sharesBn, notes) {
  number(valueBeforeNotesBn, 'enterprise/cash less senior claims');
  positive(sharesBn, 'ordinary plus warrant/employee shares');
  notes.forEach(note => {
    number(note.redemptionClaimBn, 'note redemption claim', 0);
    number(note.conversionSharesBn, 'note conversion shares', 0);
  });
  if (valueBeforeNotesBn <= sum(notes.map(n => n.redemptionClaimBn))) {
    return { price: 0, economicConversionSharesBn: 0, retainedNoteClaimsBn:
      sum(notes.map(n => n.redemptionClaimBn)), noteTreatments: notes.map(n => ({
        name: n.name, treatment: 'redemption allowance', claimBn: n.redemptionClaimBn })) };
  }
  let low = 0;
  let high = valueBeforeNotesBn / sharesBn;
  for (let i = 0; i < 120; i++) {
    const price = (low + high) / 2;
    const claims = price * sharesBn + sum(notes.map(n =>
      Math.max(n.redemptionClaimBn, price * n.conversionSharesBn)));
    if (claims > valueBeforeNotesBn) high = price; else low = price;
  }
  const price = (low + high) / 2;
  const noteTreatments = notes.map(n => ({ name: n.name,
    treatment: price * n.conversionSharesBn > n.redemptionClaimBn ? 'economic conversion' : 'redemption allowance',
    claimBn: Math.max(n.redemptionClaimBn, price * n.conversionSharesBn) }));
  return { price, economicConversionSharesBn: sum(notes.filter((n, i) =>
    noteTreatments[i].treatment === 'economic conversion').map(n => n.conversionSharesBn)),
    retainedNoteClaimsBn: sum(noteTreatments.filter(n => n.treatment === 'redemption allowance').map(n => n.claimBn)),
    noteTreatments };
}
export function postTargetLiquidityStress(company, scenario, rows, cashAtTargetBn,
  debtFundingAtTargetBn, sharesAtTargetBn) {
  let cashBn = cashAtTargetBn;
  let cumulativeDebtBn = debtFundingAtTargetBn;
  let cumulativeEquityBn = 0;
  let cumulativeIssuedSharesBn = 0;
  const fraction = number(company.bridge2027Fraction, 'target fraction', 0, 1);
  const borrowingRate = ratio(scenario.newBorrowingRate, 'new borrowing rate');
  const ledger = rows.slice(1).map((row, i) => {
    const years = i === 0 ? 1 - fraction : 1;
    const financingInterestBn = scenario.cashInterestAnnualBn * years
      + cumulativeDebtBn * borrowingRate * years;
    // Future SBC is noncash for liquidity, but remains deducted in valuation FCFF.
    const operatingCashChangeBn = (row.fcffBn + row.sbcBn) * years - financingInterestBn;
    const cashBeforeFundingBn = cashBn + operatingCashChangeBn;
    const fundingNeedBn = Math.max(scenario.cashFloorBn - cashBeforeFundingBn, 0);
    const debtRaisedBn = Math.min(fundingNeedBn,
      Math.max(scenario.additionalDebtCapacityBn - cumulativeDebtBn, 0));
    const equityRaisedBn = fundingNeedBn - debtRaisedBn;
    const newSharesBn = equityRaisedBn / positive(scenario.equityIssuePriceUSD, 'financing issue price');
    cumulativeDebtBn += debtRaisedBn;
    cumulativeEquityBn += equityRaisedBn;
    cumulativeIssuedSharesBn += newSharesBn;
    cashBn = cashBeforeFundingBn + debtRaisedBn + equityRaisedBn;
    return { label: row.label, years, financingInterestBn, operatingCashChangeBn,
      cashBeforeFundingBn, fundingNeedBn, debtRaisedBn, equityRaisedBn, newSharesBn,
      cashEndBn: cashBn, incrementalSharesEndBn: cumulativeIssuedSharesBn };
  });
  return { ledger, additionalDebtRaisedBn: cumulativeDebtBn - debtFundingAtTargetBn,
    additionalEquityRaisedBn: cumulativeEquityBn, additionalSharesBn: cumulativeIssuedSharesBn,
    shareExpansionRelativeToHorizon: cumulativeIssuedSharesBn / sharesAtTargetBn,
    valuationCondition: 'Future capital is available at fair economic terms in DCF. Diagnostic equity prices are separate stress assumptions, not embedded financing dilution in the headline target.',
    limitations: 'Existing convertible maturities assumed refinanced; no make-whole/option pricing, covenant or issuance-fee model. Future employee claims are charged through recurring SBC in valuation, not added again here.' };
}
export function stableForwardEvEbit(taxRate, growth, roic, rate) {
  ratio(taxRate, 'tax'); finite(growth, 'stable growth', 0);
  finite(roic, 'stable return on capital', Number.MIN_VALUE);
  finite(rate, 'discount rate', growth + Number.EPSILON);
  if (growth > roic) throw new Error('Stable reinvestment would exceed earnings');
  return (1 - taxRate) * (1 - growth / roic) / (rate - growth);
}
export function discountAtTarget(rows, fraction, terminalFcfBn, rate, growth) {
  ratio(fraction, 'target-year fraction');
  finite(growth, 'terminal growth', 0);
  finite(rate, 'discount rate', growth + Number.EPSILON);
  finite(terminalFcfBn, 'terminal cash flow', 0);
  const forecasts = rows.filter(r => r.label !== '2026 H2');
  if (forecasts[0]?.label !== 'CY2027' || forecasts.at(-1)?.label !== 'CY2038'
    || forecasts.some((r, i) => r.label !== `CY${2027 + i}`)) throw new Error('Non-contiguous duration forecast');
  const stub = 1 - fraction;
  const flows = forecasts.map((r, i) => {
    const duration = i === 0 ? stub : 1;
    const time = stub + i;
    const cash = finite(r.fcffBn, 'forecast FCFF');
    return { label: r.label, yearsFromTarget: time, cashFlowBn: cash * duration,
      pvBn: cash * duration / (1 + rate) ** time };
  });
  const terminalValueBn = terminalFcfBn / (rate - growth);
  const terminalPvBn = terminalValueBn / (1 + rate) ** flows.at(-1).yearsFromTarget;
  return { discountedFlows: flows, terminalValueBn, terminalPvBn,
    enterpriseValueBn: sum(flows.map(r => r.pvBn)) + terminalPvBn };
}
export function reserveFutureEquity(baseValueBn, baseSharesBn, ledger, rate, fraction) {
  finite(baseValueBn, 'equity pool'); finite(baseSharesBn, 'base shares', Number.MIN_VALUE);
  finite(rate, 'equity contribution discount rate', 0); ratio(fraction, 'target fraction');
  const pvContributionsBn = sum(ledger.map((r, i) => finite(r.equityRaisedBn, 'future equity', 0)
    / (1 + rate) ** (1 - fraction + i)));
  const extraSharesBn = sum(ledger.map(r => finite(r.newSharesBn, 'future share claims', 0)));
  return { valueBn: baseValueBn + pvContributionsBn, sharesBn: baseSharesBn + extraSharesBn,
    pvContributionsBn, extraSharesBn, price: (baseValueBn + pvContributionsBn) / (baseSharesBn + extraSharesBn) };
}
export function fairFutureDebt(ledger, rate) {
  finite(rate, 'borrowing rate', Number.MIN_VALUE);
  ledger.forEach(r => finite(r.debtRaisedBn, 'future debt proceeds', 0));
  const loans = ledger.filter(r => r.debtRaisedBn > 0).map(r => {
    const index = ledger.indexOf(r), years = ledger.length - index;
    const principalBn = r.debtRaisedBn;
    const couponPvBn = sum(Array.from({ length: years }, (_, j) => principalBn * rate / (1 + rate) ** (j + 1)));
    const repaymentPvBn = principalBn / (1 + rate) ** years;
    return { issuedIn: r.label, principalBn, assumedCouponRate: rate, yearsToRepayment: years,
      proceedsBn: principalBn, couponPvBn, repaymentPvBn, netFinancingPvBn: principalBn - couponPvBn - repaymentPvBn };
  });
  return { loans, netFinancingPvBn: sum(loans.map(r => r.netFinancingPvBn)),
    condition: 'New debt is assumed issued at fair value, bullet-refinanced through explicit forecast end. No default, fees or covenant costs modelled.' };
}
export function cloudDurationPeriods(company, scenario) {
  const o = company.opening, d = scenario.duration;
  for (const key of ['hardwareShare','partnerFeeShare','partnerGrossMargin','otherGrossMargin','sbcRevenueShare',
    'prepaymentCapexCoverage','prepaidRevenueShare','workingCapitalRevenueShare','taxRate']) ratio(d[key], key);
  for (const key of ['hardwareLifeYears','facilityLifeYears']) finite(d[key], key, 1);
  const cohorts = d.openingCohorts.map(c => ({ ...c }));
  for (const c of cohorts) {
    if (!['hardware','facility'].includes(c.kind)) throw new Error('Unsupported asset cohort');
    finite(c.grossCostBn, 'cohort gross cost', 0); finite(c.netBookBn, 'cohort net book', 0, c.grossCostBn);
    finite(c.lifeYears, 'cohort life', 1); finite(c.remainingLifeYears, 'cohort remaining life', 0, c.lifeYears);
    finite(c.mwEquivalent, 'asset MW-equivalent', 0);
  }
  let owned = o.ownedMWEstimate, partner = o.partnerMWEstimate;
  let cip = o.assetsNotYetInUseBn, deferred = o.deferredRevenueBn;
  let previousAnnualRevenue = o.annualRevenueRunRateEstimateBn;
  return d.periods.map(p => {
    const years = finite(p.years, 'period length', Number.MIN_VALUE, 1);
    for (const key of ['utilisation','ownedCashGrossMargin']) ratio(p[key], key);
    for (const key of ['yieldBnPerMW','capitalBnPerMW','cashOperatingCostsBn','otherRevenueBn','endCipBn']) finite(p[key], key, 0);
    const addedMW = finite(p.endOwnedMW - owned, 'new commissioned owned MW', 0);
    const partnerAdded = finite(p.endPartnerMW - partner, 'new partner MW', 0);
    const deploymentBn = addedMW * p.capitalBnPerMW;
    let replacementBn = 0, daBn = 0;
    for (const c of cohorts) {
      if (c.remainingLifeYears <= years) {
        const before = c.remainingLifeYears;
        daBn += c.netBookBn;
        const newCost = c.mwEquivalent * p.capitalBnPerMW
          * (c.kind === 'hardware' ? d.hardwareShare : 1 - d.hardwareShare);
        replacementBn += newCost;
        const life = c.kind === 'hardware' ? d.hardwareLifeYears : d.facilityLifeYears;
        const after = years - before;
        daBn += newCost / life * after;
        c.grossCostBn = newCost; c.netBookBn = newCost * (1 - after / life);
        c.remainingLifeYears = life - after; c.lifeYears = life;
      } else {
        const dep = c.grossCostBn / c.lifeYears * years;
        daBn += Math.min(dep, c.netBookBn);
        c.netBookBn = Math.max(c.netBookBn - dep, 0);
        c.remainingLifeYears -= years;
      }
    }
    for (const kind of ['hardware', 'facility']) {
      const share = kind === 'hardware' ? d.hardwareShare : 1 - d.hardwareShare;
      const life = kind === 'hardware' ? d.hardwareLifeYears : d.facilityLifeYears;
      const cost = deploymentBn * share;
      const dep = cost / life * years / 2;
      daBn += dep;
      if (cost > 0) cohorts.push({ kind, grossCostBn: cost, netBookBn: cost - dep,
        lifeYears: life, remainingLifeYears: life - years / 2, mwEquivalent: addedMW });
    }
    const revenueOwned = (owned + p.endOwnedMW) / 2 * p.utilisation * p.yieldBnPerMW * years;
    const revenuePartner = (partner + p.endPartnerMW) / 2 * p.utilisation * p.yieldBnPerMW
      * years * d.partnerFeeShare;
    const revenueBn = revenueOwned + revenuePartner + p.otherRevenueBn;
    const cashGrossProfitBn = revenueOwned * p.ownedCashGrossMargin
      + revenuePartner * d.partnerGrossMargin + p.otherRevenueBn * d.otherGrossMargin;
    const cashEbitdaBn = cashGrossProfitBn - p.cashOperatingCostsBn;
    const sbcBn = revenueBn * d.sbcRevenueShare;
    const ebitBn = cashEbitdaBn - sbcBn - daBn;
    const nopatBn = ebitBn - Math.max(ebitBn, 0) * d.taxRate;
    const capexBn = deploymentBn + replacementBn + p.endCipBn - cip;
    if (capexBn < 0) throw new Error('Unsupported negative capex');
    const receipts = finite(p.newPrepaymentsBn ?? deploymentBn * d.prepaymentCapexCoverage, 'customer prepayment', 0);
    const prepaidRevenueRecognisedBn = Math.min(deferred + receipts, revenueBn * d.prepaidRevenueShare);
    const changeDeferredBn = receipts - prepaidRevenueRecognisedBn;
    deferred += changeDeferredBn;
    const workingCapitalIncreaseBn = (revenueBn / years - previousAnnualRevenue) * d.workingCapitalRevenueShare;
    const fcffBn = nopatBn + daBn - capexBn - workingCapitalIncreaseBn + changeDeferredBn;
    const inServiceNetBn = sum(cohorts.map(c => c.netBookBn));
    const row = { label: p.label, years, endOwnedMW: p.endOwnedMW, endPartnerMW: p.endPartnerMW,
      ownedRevenueBn: revenueOwned, partnerRevenueBn: revenuePartner, revenueBn, cashEbitdaBn,
      sbcBn, daBn, ebitBn, nopatBn, deploymentBn, replacementBn, startCipBn: cip,
      endCipBn: p.endCipBn, capexBn, newPrepaymentsBn: receipts, prepaidRevenueRecognisedBn,
      changeDeferredBn, deferredRevenueEndBn: deferred, workingCapitalIncreaseBn, fcffBn,
      inServiceNetBn, netPpeBn: inServiceNetBn + p.endCipBn, partnerAddedMW: partnerAdded };
    owned = p.endOwnedMW; partner = p.endPartnerMW; cip = p.endCipBn;
    previousAnnualRevenue = revenueBn / years;
    return row;
  });
}
export function nbisDurationScenario(company, scenario) {
  const d = scenario.duration, periods = cloudDurationPeriods(company, scenario);
  const o = company.opening, fraction = company.bridge2027Fraction;
  const cashBeforeFundingBn = o.cashBn + o.knownNetFinancingBn
    + periods[0].fcffBn + periods[0].sbcBn - d.cashInterestAnnualBn * .5
    + fraction * (periods[1].fcffBn + periods[1].sbcBn - d.cashInterestAnnualBn);
  const fundingNeedBn = Math.max(d.cashFloorBn - cashBeforeFundingBn, 0);
  const debtFundingBn = Math.min(fundingNeedBn, d.additionalDebtCapacityBn);
  const equityFundingBn = fundingNeedBn - debtFundingBn;
  const sharesAtTargetBn = o.commonSharesBn + o.preFundedWarrantSharesBn + o.exchangeSharesBn
    + d.employeeSharesAtTargetBn + equityFundingBn / d.equityIssuePriceUSD;
  const cashAtTargetBn = cashBeforeFundingBn + fundingNeedBn;
  const final = periods.at(-1), last = d.periods.at(-1), growth = d.terminalGrowth;
  // Stable replacements are physical capital at current cost / useful life. No
  // perpetual growth of deferred receipts or early release of construction assets.
  const terminalRevenueBn = final.revenueBn * (1 + growth);
  const replacementBn = final.endOwnedMW * (1 + growth) * last.capitalBnPerMW
    * (d.hardwareShare / d.hardwareLifeYears + (1 - d.hardwareShare) / d.facilityLifeYears);
  const stableDaBn = replacementBn;
  const stableEbitBn = final.cashEbitdaBn * (1 + growth)
    - final.sbcBn * (1 + growth) - stableDaBn;
  const stableNopatBn = stableEbitBn - Math.max(stableEbitBn, 0) * d.taxRate;
  const growthCapexBn = final.endOwnedMW * growth * last.capitalBnPerMW;
  const constructionIncreaseBn = final.endCipBn * growth;
  const workingCapitalBn = (terminalRevenueBn - final.revenueBn) * d.workingCapitalRevenueShare;
  const stableReinvestmentBn = growthCapexBn + constructionIncreaseBn + workingCapitalBn;
  const terminalFcfBn = stableNopatBn - stableReinvestmentBn;
  if (terminalFcfBn <= 0) throw new Error('Unsupported stable going concern: terminal cash flow is not positive');
  const valuation = discountAtTarget(periods, fraction, terminalFcfBn, d.discountRate, growth);
  // Charge remaining prepaid obligations once in 2039 cash. This conservative
  // runoff prevents positive terminal funding from being silently forgiven.
  const terminalDeferredRunoffBn = final.deferredRevenueEndBn;
  const terminalDeferredRunoffPvBn = terminalDeferredRunoffBn
    / (1 + d.discountRate) ** (valuation.discountedFlows.at(-1).yearsFromTarget + 1);
  valuation.enterpriseValueBn -= terminalDeferredRunoffPvBn;
  const funding = postTargetLiquidityStress(company, d, periods, cashAtTargetBn, debtFundingBn, sharesAtTargetBn);
  funding.valuationCondition = 'Future equity claims and discounted contributions are embedded in a pooled headline approximation. Fair-term future debt has zero net financing PV; maturity refinancing and exact dated ownership remain unresolved.';
  const nonConvertibleDebtBn = o.otherDebtBn + o.knownSecuredDebtBn + debtFundingBn;
  const reserve = reserveFutureEquity(valuation.enterpriseValueBn + cashAtTargetBn - nonConvertibleDebtBn,
    sharesAtTargetBn, funding.ledger, d.discountRate, fraction);
  const { pvContributionsBn, sharesBn: economicSharesBn, valueBn: poolBn } = reserve;
  const allocation = allocateConvertibleClaims(poolBn, economicSharesBn, o.notes);
  const noLaterEquity = allocateConvertibleClaims(valuation.enterpriseValueBn + cashAtTargetBn
    - nonConvertibleDebtBn, sharesAtTargetBn, o.notes);
  const p28 = periods.find(p => p.label === 'CY2028');
  const terminalIncrementalRoic = stableReinvestmentBn > 0 && stableNopatBn > stableReinvestmentBn
    ? stableNopatBn * growth / stableReinvestmentBn : null;
  return { name: scenario.name, weight: scenario.weight, periods, ...valuation,
    cashBeforeFundingBn, fundingNeedBn, debtFundingBn, equityFundingBn,
    cashAtTargetBn, sharesAtTargetBn, economicSharesBn, nonConvertibleDebtBn,
    postTargetFunding: funding, futureEquityPvBn: pvContributionsBn, noLaterEquityPrice: noLaterEquity.price,
    terminalFcfBn, stableEbitBn, stableNopatBn, stableReinvestmentBn,
    terminalReplacementBn: replacementBn, terminalGrowthCapexBn: growthCapexBn,
    terminalConstructionIncreaseBn: constructionIncreaseBn, terminalWorkingCapitalBn: workingCapitalBn,
    terminalRevenueBn, terminalDeferredIncreaseBn: 0,
    terminalDeferredRunoffBn, terminalDeferredRunoffPvBn, fairFutureDebt: fairFutureDebt(funding.ledger, d.newBorrowingRate),
    stableDepreciationChangePercent: (stableDaBn / final.daBn - 1) * 100,
    terminalIncrementalRoic, stableForwardMultiple: terminalIncrementalRoic === null ? null
      : stableForwardEvEbit(d.taxRate, growth, terminalIncrementalRoic, d.discountRate),
    implied2028EvEbit: p28.ebitBn > 0 ? valuation.enterpriseValueBn / p28.ebitBn : null,
    terminalShare: valuation.enterpriseValueBn > 0 ? valuation.terminalPvBn / valuation.enterpriseValueBn : null,
    ...allocation };
}

export function calculateNebiusDuration(company, targetDate) {
  if (company?.ticker !== 'NBIS' || targetDate !== '2027-10-04' || company.scenarios?.length !== 3) throw new Error('Unsupported Nebius model date or shape');
  const fraction=(Date.parse(targetDate)-Date.parse('2027-01-01'))/(Date.parse('2028-01-01')-Date.parse('2027-01-01'));
  if (Math.abs(company.bridge2027Fraction-fraction)>1e-12) throw new Error('Target cash-flow boundary mismatch');
  for(const key of ['cashBn','commonSharesBn','preFundedWarrantSharesBn','exchangeSharesBn','knownNetFinancingBn','otherDebtBn','knownSecuredDebtBn']) finite(company.opening[key],key,0);
  for(const s of company.scenarios) {
    ratio(s.weight,'weight'); if(!s.reason) throw new Error('Missing joint-driver reason');
    for(const key of ['cashFloorBn','additionalDebtCapacityBn','cashInterestAnnualBn','employeeSharesAtTargetBn','equityIssuePriceUSD']) finite(s.duration[key],key,0);
    positive(s.duration.equityIssuePriceUSD,'financing price');
  }
  if(Math.abs(sum(company.scenarios.map(s=>s.weight))-1)>1e-10)throw new Error('Weights must sum to one');
  const scenarios=company.scenarios.map(s=>nbisDurationScenario(company,s));
  for(const s of scenarios){finite(s.price,'target',0);finite(s.enterpriseValueBn,'enterprise value');positive(s.economicSharesBn,'economic shares');}
  return {unroundedTarget:sum(scenarios.map(s=>s.price*s.weight)),scenarios};
}
