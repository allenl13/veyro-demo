import { companyPriceTarget, priceTargetComparison, priceTargetPotentialLabel, type TargetSource, type PriceTargetResult } from '../lib/price-targets';
import type { DisplayQuote } from '../lib/research-display-price';

type Props = { ticker: string; financialPeriodEnd?: string | null; quote?: DisplayQuote };
const usd = (n: number, decimals = 0) => `US$${n.toLocaleString('en-NZ', {minimumFractionDigits:decimals, maximumFractionDigits:decimals})}`;
const day = (value: string) => new Intl.DateTimeFormat('en-NZ', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value));
const pct = (n: number) => `${(n * 100).toLocaleString('en-NZ', {maximumFractionDigits:1})}%`;
const money = (n: number, currency = 'USD') => `${currency === 'USD' ? 'US$' : currency === 'TWD' ? 'TWD' : 'EUR'}${(n / 1e9).toLocaleString('en-NZ', {maximumFractionDigits:3})}bn`;
const shares = (n: number) => n >= 1e9 ? `${(n / 1e9).toLocaleString('en-NZ', {maximumFractionDigits:3})}bn` : `${(n / 1e6).toLocaleString('en-NZ', {maximumFractionDigits:3})}m`;

function Sources({ sources }: {sources: readonly TargetSource[]}) {
  return <>{sources.map(source => <div className="price-target-source" key={source.url}>
    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
    {source.figures.map(figure => <p key={figure.label}>{figure.label}: {figure.unit === 'shares' ? shares(figure.value) : money(figure.value, figure.unit)}. {figure.basis}.</p>)}
    <small>Published {day(source.publishedAt)} · period ended {day(source.periodEnd)} · currency / unit: {source.currency} · observed {source.observedAt}. {source.basis}.</small>
  </div>)}</>;
}

function Sensitivities({review}:{review:Extract<PriceTargetResult,{status:'available'}>['review']}) {
  if(!review.sensitivities?.length)return null;
  return <details><summary>How assumptions change the estimate</summary><dl className="price-target-inputs">
    {review.sensitivities.map(s=><div key={s.label}><dt>{s.label}</dt><dd>{s.changePercent===null?s.status:`${s.changePercent>=0?'+':''}${s.changePercent.toFixed(1)}% model value`}</dd></div>)}
  </dl><p>Change one stated assumption at a time. These are valuation sensitivities, not outcome probabilities or extra price targets.</p></details>;
}

function GrowthDetails({ result, quote }: {result: Extract<PriceTargetResult, {method:'growth-cash-flow'}>; quote?: DisplayQuote}) {
  const {review, valuation} = result, m = review.growth;
  const comparison = priceTargetComparison(result, quote);
  const per = m.ordinarySharesPerListedShare !== 1 ? 'ADR' : review.ticker === 'ARM' ? 'ADS' : 'share';
  const bn = (n: number) => money(n * 1e9, m.currency);
  return <article className="price-target-details">
    <h5>Veyro’s 12-month price target</h5>
    <p className="price-target-heading"><strong>{usd(result.target)}</strong><span>per {per} · {day(review.targetDate)}</span></p>
    {result.reviewNote&&<p>{result.reviewNote}</p>}
    {comparison && <p>{priceTargetPotentialLabel(comparison.percent)} compared with {usd(comparison.price,2)} on {day(comparison.asOf)}. Price source: {comparison.source}; {comparison.basis}. Observed {comparison.observedAt}.</p>}
    <p>Independent longer-growth estimate, reviewed {day(review.reviewedAt)}. Estimated price excludes dividends. This values cash remaining at {day(review.targetDate)}; it is not a price target for 2038.</p>
    <p><strong>Discounted future operating cash + projected cash − debt, divided by economic share claims{m.currency !== 'USD' ? ` and ${m.unitsPerUSD} TWD per US$1` : ''} = {usd(result.unroundedTarget,2)}, rounded to {usd(result.target)}.</strong></p>
    <p>{m.growthReason}</p><p>{m.investmentReason}</p>
    <p><strong>Confidence:</strong> {m.confidence}</p>
    <p><strong>Main risks:</strong> {review.risks}</p>
    <Sensitivities review={review}/>
    <details><summary>Growth, investment and valuation assumptions</summary>
      <p>All forecasts below are Veyro estimates. Operating margins include stock compensation, depreciation and acquired amortisation. Operating cash = after-tax operating income − minority cash claims + depreciation/amortisation − capital spending − working-capital investment − acquisition spending. No earnings multiple, score premium or market price enters the target.</p>
      {valuation.cases.map((c,index) => {
        const input = m.cases[index];
        return <section key={c.name} className="price-target-source">
          <h6>{c.name}{valuation.cases.length > 1 ? ` · ${pct(c.weight)} judgmental weight` : ' · single central estimate'}</h6>
          <p>{input.reason}</p>
          <dl className="price-target-inputs">
            <div><dt>Discount rate / stable growth</dt><dd>{pct(input.discountRate)} / {pct(input.terminalGrowth)}</dd></div>
            <div><dt>Discounted operating cash value</dt><dd>{bn(c.enterpriseValueBn)}</dd></div>
            <div><dt>Projected cash / debt at target</dt><dd>{bn(c.cashAtTargetBn)} / {bn(c.debtAtTargetBn)}</dd></div>
            <div><dt>Equity value for share claims</dt><dd>{bn(c.equityValueBn)}</dd></div>
            <div><dt>Economic listed-share claims</dt><dd>{shares(c.listedEconomicSharesBn * 1e9)}</dd></div>
            <div><dt>Stable incremental sales / capital</dt><dd>{input.terminalSalesToCapital.toFixed(2)}×</dd></div>
            <div><dt>Implied stable operating-capital return</dt><dd>{pct(c.impliedTerminalRoic)}</dd></div>
            <div><dt>Value from cash after 2038</dt><dd>{pct(c.terminalShare)}</dd></div>
            <div><dt>Minimum post-target cash in funding stress</dt><dd>{bn(c.minimumPostTargetCashBn)}</dd></div>
          </dl>
          <p>{input.additionalClaimsReason} The implied capital return excludes expensed R&amp;D; it is a model identity, not measured company ROIC.</p>
          <div style={{overflowX:'auto',maxWidth:'100%'}} tabIndex={0} role="region" aria-label={`${review.ticker} ${c.name} annual cash-flow assumptions`}>
            <table className="price-target-cashflows"><thead><tr><th>Estimated period</th><th>Revenue</th><th>Operating margin</th><th>Net investment</th><th>Operating cash</th><th>Cash remaining</th></tr></thead>
              <tbody>{c.flows.map(p => <tr key={p.label}><td>{p.label}<br /><small>{day(p.start)}–{day(p.end)}</small></td><td>{bn(p.annualRevenueBn)}</td><td>{pct(p.operatingMargin)}</td><td>{bn(p.reinvestmentBn)}</td><td>{bn(p.annualFcfBn)}</td><td>{pct(p.remainingFraction)} of annual flow</td></tr>)}</tbody>
            </table>
          </div>
          <p>Stable annual cash: {bn(c.terminalFcfBn)}, after {bn(c.terminalReinvestmentBn)} growth investment. Replacement spending matches physical and acquired-intangible depreciation/amortisation; growth investment is separately funded. No permanent customer-prepayment funding credit.</p>
        </section>;
      })}
      <p>{m.compensationReason}</p><p>{m.bridgeReason}</p><p>{m.horizonConvention}</p>
      {m.currency !== 'USD' && <p>All cash values above are in TWD. Convert equity value once at the assumed {m.unitsPerUSD} TWD per US$1; each ADR represents {m.ordinarySharesPerListedShare} ordinary shares. The FX rate is a forecast assumption.</p>}
    </details>
    <details><summary>Reported evidence and model limits</summary><p>{m.sourceQuality}</p><Sources sources={review.sources} />
      <p>Review due {day(review.reviewDueAt)}, or earlier when newer financial evidence or corporate actions appear. The target horizon does not roll forward with market prices.</p>
    </details>
  </article>;
}

function CloudGrowthDetails({ result, quote }: {result:Extract<PriceTargetResult,{method:'cloud-growth-cash-flow'}>; quote?:DisplayQuote}) {
  const {review,valuation}=result, m=review.cloudGrowth, comparison=priceTargetComparison(result,quote);
  const bn=(n:number)=>money(n*1e9);
  return <article className="price-target-details">
    <h5>Veyro’s 12-month price target</h5>
    <p className="price-target-heading"><strong>{usd(result.target)}</strong><span>per share · {day(review.targetDate)} · Low confidence</span></p>
    {result.reviewNote&&<p>{result.reviewNote}</p>}
    {comparison&&<p>{priceTargetPotentialLabel(comparison.percent)} compared with {usd(comparison.price,2)} on {day(comparison.asOf)}. Price source: {comparison.source}; {comparison.basis}. Observed {comparison.observedAt}.</p>}
    <p>Independent longer-growth estimate, reviewed {day(review.reviewedAt)}. One weighted model estimate, not a guaranteed outcome. It values remaining cash at the 12-month horizon, excludes dividends, and reserves financing and convertible claims.</p>
    <p><strong>Discounted operating cash + cash + discounted future equity contributions − debt and convertible claims, allocated across economic share claims = {usd(result.unroundedTarget,2)}, rounded to {usd(result.target)}.</strong></p>
    <p>Owned energised capacity, utilisation and revenue per MW drive the operating forecast. Hardware refresh, facility replacement, construction and working capital consume cash. Customer prepayments are a service obligation; the remaining terminal balance is charged once.</p>
    <Sensitivities review={review}/>
    <details><summary>Capacity, financing and dilution assumptions</summary>
      <p>{m.weightReason} These weights are judgments, not calibrated probabilities. Financing availability does not mean funding is free: new share claims and debt costs remain included.</p>
      {valuation.scenarios.map((c,i)=><section className="price-target-source" key={c.name}>
        <h6>{c.name} · {pct(c.weight)} judgmental weight</h6><p>{m.scenarios[i].reason}</p>
        <dl className="price-target-inputs">
          <div><dt>Discounted operating cash value</dt><dd>{bn(c.enterpriseValueBn)}</dd></div>
          <div><dt>Cash / nonconvertible debt at target</dt><dd>{bn(c.cashAtTargetBn)} / {bn(c.nonConvertibleDebtBn)}</dd></div>
          <div><dt>Future equity contributions, discounted once</dt><dd>{bn(c.futureEquityPvBn)}</dd></div>
          <div><dt>Economic common and funding share claims</dt><dd>{shares(c.economicSharesBn*1e9)}</dd></div>
          <div><dt>Convertible claims retained / conversion shares</dt><dd>{bn(c.retainedNoteClaimsBn)} / {shares(c.economicConversionSharesBn*1e9)}</dd></div>
          <div><dt>Post-target new equity / new debt</dt><dd>{bn(c.postTargetFunding.additionalEquityRaisedBn)} / {bn(c.postTargetFunding.additionalDebtRaisedBn)}</dd></div>
          <div><dt>Annual terminal hardware/facility replacement</dt><dd>{bn(c.terminalReplacementBn)}</dd></div>
          <div><dt>Value from cash after 2038</dt><dd>{pct(c.terminalShare)}</dd></div>
        </dl>
        <div style={{overflowX:'auto',maxWidth:'100%'}} tabIndex={0} role="region" aria-label={`NBIS ${c.name} capacity and capital assumptions`}>
          <table className="price-target-cashflows"><thead><tr><th>Estimated period</th><th>Owned MW</th><th>Partner MW</th><th>Revenue</th><th>Replacement</th><th>Total capital spending</th><th>Operating cash</th></tr></thead><tbody>
            {c.periods.map(p=><tr key={p.label}><td>{p.label}</td><td>{Math.round(p.endOwnedMW).toLocaleString('en-NZ')}</td><td>{Math.round(p.endPartnerMW).toLocaleString('en-NZ')}</td><td>{bn(p.revenueBn)}</td><td>{bn(p.replacementBn)}</td><td>{bn(p.capexBn)}</td><td>{bn(p.fcffBn)}</td></tr>)}
          </tbody></table>
        </div>
      </section>)}
      <p>GPU/facility cohorts, useful lives and construction timing are estimates. SBC remains an economic cost in future operating cash, with no second employee-share charge for the same cost. Future equity contributions and claims use a pooled reservation rather than an exact dated ownership waterfall. Fair-term new debt receives no financing windfall.</p>
    </details>
    <details><summary>Reported evidence and model limits</summary><Sources sources={review.sources}/>
      {m.limitations.map(v=><p key={v}>{v}</p>)}
      <p>Restricted cash receives no liquid-equity credit. Refinancing is assumed; convertible option/make-whole values and funding below fair value remain approximations. Review due {day(review.reviewDueAt)}, or earlier with new financial evidence. Targets do not affect rankings or simulated trades.</p>
    </details>
  </article>;
}

export function PriceTargetCell({ ticker, financialPeriodEnd, quote }: Props) {
  const result = companyPriceTarget(ticker, financialPeriodEnd);
  if (result.status !== 'available') return <span className="price-target-cell" title={result.reason}><small>{result.status === 'stale' ? 'Needs review' : 'Unavailable'}</small></span>;
  const comparison = priceTargetComparison(result, quote);
  return <span className="price-target-cell">
    <strong>{usd(result.target)}</strong>
    {result.review.confidenceLabel && <small>{result.review.confidenceLabel}</small>}
    {'reviewNote' in result && result.reviewNote && <small title={result.reviewNote}>Review due</small>}
    <small className={!comparison || Math.abs(comparison.percent) < 0.05 ? 'muted' : comparison.percent > 0 ? 'positive' : 'negative'}>{priceTargetPotentialLabel(comparison?.percent)}</small>
  </span>;
}

export function PriceTargetDetails({ ticker, financialPeriodEnd, quote, inTop15 }: Props & {inTop15: boolean}) {
  // Membership can change independently of this dated target review. Retired members do not expose targets.
  if (!inTop15) return null;
  const result = companyPriceTarget(ticker, financialPeriodEnd);
  if (result.status !== 'available') return <article className="price-target-details">
    <h5>12-month price target · {result.status === 'stale' ? 'Needs review' : 'Unavailable'}</h5><p>{result.reason}</p>
    {result.review && <><p>{result.review.modelReview}</p><p>Reviewed {day(result.review.reviewedAt)} · horizon {day(result.review.targetDate)}. No price is inferred from missing evidence.</p>
      <details><summary>Reported evidence</summary><Sources sources={result.review.sources} /></details></>}
  </article>;
  if (result.method === 'growth-cash-flow') return <GrowthDetails result={result} quote={quote} />;
  if (result.method === 'cloud-growth-cash-flow') return <CloudGrowthDetails result={result} quote={quote} />;
  const {review, eps, normalizedEps} = result;
  const f = review.forecast;
  const comparison = priceTargetComparison(result, quote);
  const per = f.ordinarySharesPerListedShare !== 1 ? 'ADR' : ticker === 'ARM' ? 'ADS' : 'share';
  return <article className="price-target-details">
    <h5>Veyro’s 12-month price target</h5>
    <p className="price-target-heading"><strong>{usd(result.target)}</strong><span>per {per} · {day(review.targetDate)}</span></p>
    {result.reviewNote && <p>{result.reviewNote}</p>}
    {comparison && <p>{priceTargetPotentialLabel(comparison.percent)} compared with {usd(comparison.price, 2)} on {day(comparison.asOf)}. Price source: {comparison.source}; {comparison.basis}. Observed {new Date(comparison.observedAt).toISOString()}.</p>}
    <p>One central estimate, reviewed {day(review.reviewedAt)}. {f.earningsPeriod.label} earnings are {f.earningsPeriod.basis === 'completed' ? 'from a completed fiscal year' : 'forward estimates'} at the 12-month horizon. Estimated price excludes dividends.</p>
    {f.cycleHaircut > 0 && <p>{usd(eps, 2)} estimated EPS × (1 − {pct(f.cycleHaircut)} cycle haircut) = {usd(normalizedEps, 2)} normalized EPS.</p>}
    <p><strong>{usd(normalizedEps, 2)} {f.cycleHaircut > 0 ? 'normalized' : 'estimated'} earnings per {per} × {f.earningsMultiple}× earnings = {usd(result.unroundedTarget, 2)}, rounded to {usd(result.target)}.</strong></p>
    <p>{review.revenueAndMarginReason}</p>
    {review.confidence && <p><strong>Confidence:</strong> {review.confidence}</p>}
    <Sensitivities review={review} />
    <details><summary>Earnings and valuation assumptions</summary>
    <dl className="price-target-inputs">
      {f.contextPeriod && <div><dt>{f.contextPeriod.label} revenue</dt><dd>{money(f.contextPeriod.revenue, f.currency)}</dd></div>}
      <div><dt>{f.earningsPeriod.label} revenue</dt><dd>{money(f.revenue, f.currency)}</dd></div>
      {f.currency !== 'USD' && <div><dt>Revenue translated to USD</dt><dd>{money(f.revenue / f.unitsPerUSD)}</dd></div>}
      {f.method === 'gross-margin' ? <><div><dt>Adjusted gross margin</dt><dd>{pct(f.grossMargin!)}</dd></div><div><dt>Adjusted operating expenses</dt><dd>{money(f.operatingExpenses!,f.currency)}</dd></div></> : <div><dt>Operating margin</dt><dd>{pct(f.operatingMargin!)}</dd></div>}
      <div><dt>Operating income</dt><dd>{money(result.operatingIncome,f.currency)}</dd></div>
      <div><dt>Net financing / other recurring income</dt><dd>{money(f.netNonOperatingIncome,f.currency)}</dd></div>
      <div><dt>Effective tax rate</dt><dd>{pct(f.taxRate)}</dd></div>
      <div><dt>Minority-interest earnings deducted</dt><dd>{money(f.nonControllingIncome,f.currency)}</dd></div>
      <div><dt>Earnings attributable to shareholders</dt><dd>{money(result.netIncome,f.currency)}</dd></div>
      {f.currency !== 'USD' && <div><dt>Forecast currency units per US$1</dt><dd>{f.currency}{f.unitsPerUSD}</dd></div>}
      <div><dt>Diluted ordinary shares</dt><dd>{shares(f.dilutedOrdinaryShares)}</dd></div>
      {per !== 'share' && <div><dt>Ordinary shares per {per}</dt><dd>{f.ordinarySharesPerListedShare}</dd></div>}
    </dl>
    <p>All forecast inputs above are Veyro assumptions, including explicit zero amounts. {review.forecastBasis}.</p>
    <p>{f.fxReason}</p><p>{review.shareAndFinancingReason}</p><p>{review.multipleReason}</p>
    <p>{review.modelReview}</p></details><p><strong>Main risks:</strong> {review.risks}</p>
    <details><summary>Reported evidence and model basis</summary>
      <Sources sources={review.sources} /><p>{review.shareBasis}</p><p>{review.earningsAndCapitalReason}</p>
      <p>{review.priceBasis}. Corporate actions require a new review. Review due {day(review.reviewDueAt)}, or earlier when newer financial evidence appears. Its horizon does not roll forward with prices.</p>
    </details>
  </article>;
}
