export type DisplayQuote = {
  symbol:string; price:number; asOf:string; observedAt:string; source:string; currency:string;
  interval:'5m'|'1d'; adjustmentBasis:string; closeStatus?:string;
  displayDailyChange?: {percent:number; previousClose:number; previousCloseAsOf:string; asOf:string; source:string; currency:string; adjustmentBasis:string} | null;
};

/** Validate each independent display observation; absent symbols never borrow another quote. */
export function verifiedResearchQuotes(quotes:unknown, symbols:string[], now=Date.now()):Record<string,DisplayQuote> {
  if (!Array.isArray(quotes)) throw Error('Display quotes unavailable');
  const result:Record<string,DisplayQuote> = {};
  for (const q of quotes) {
    const basis = q?.interval === '1d' ? 'unadjusted regular-market close' : q?.interval === '5m' ? 'unadjusted regular-market five-minute bar close' : null;
    if (!symbols.includes(q?.symbol) || result[q.symbol] || !Number.isFinite(q.price) || q.price <= 0
      || q.currency !== 'USD' || q.source !== 'Veyro authored synthetic fixture v1' || !basis || q.adjustmentBasis !== basis
      || !Number.isFinite(Date.parse(q.asOf)) || Date.parse(q.asOf) > now
      || !Number.isFinite(Date.parse(q.observedAt)) || Date.parse(q.observedAt) > now + 30_000) throw Error('Invalid display observation');
    result[q.symbol] = q;
  }
  return result;
}

export function researchDisplayPrice(stock:{ticker:string;currentPrice:number|null;priceAsOf:string|null}, quote?:DisplayQuote) {
  if (quote && (!stock.priceAsOf || Date.parse(quote.asOf) >= Date.parse(stock.priceAsOf))) {
    const d=quote.displayDailyChange;
    const valid = d && d.asOf === quote.asOf && d.currency === quote.currency && d.source === quote.source
      && d.adjustmentBasis === quote.adjustmentBasis && Number.isFinite(d.previousClose) && d.previousClose > 0
      && Number.isFinite(Date.parse(d.previousCloseAsOf)) && Date.parse(d.previousCloseAsOf) < Date.parse(quote.asOf)
      && Number.isFinite(d.percent) && Math.abs(d.percent - (quote.price / d.previousClose - 1) * 100) < 0.00001;
    return {price:quote.price, asOf:quote.asOf, percent:valid ? d.percent : null, source:quote.source, basis:quote.adjustmentBasis,
      label:quote.interval === '1d' ? 'Close' : quote.closeStatus === 'pending' ? 'Close pending · 5-min bar' : '5-min bar'};
  }
  return {price:stock.currentPrice, asOf:stock.priceAsOf, percent:null, source:null, basis:null, label:'Assessment price'};
}

export function displayPriceTime(asOf:string|null) {
  if (!asOf || !Number.isFinite(Date.parse(asOf))) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-NZ',{timeZone:'America/New_York', day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(asOf)) + ' NY';
}
