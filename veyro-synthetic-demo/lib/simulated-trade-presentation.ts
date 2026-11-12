export type SimulatedTradeQuantity = {
  ticker: string;
  side: "buy" | "sell";
  createdAt: string;
  shares: number;
};

export type SimulatedDecisionIdentity = {
  ticker: string | null;
  action: "buy" | "sell" | "hold";
  createdAt: string;
};

export type SimulatedHoldingMarketInput = {
  shares: number;
  averageCost: number;
  livePrice: number | null;
  previousClose: number | null;
};

export type DailyCloseEvidence = {
  symbol: string;
  price: number;
  marketAsOf: string;
  marketDay: string;
  source: string;
  interval: string;
  adjustmentBasis: string;
  completed: boolean;
};

const MARKET_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const newYorkDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function validMarketDay(value: string) {
  if (!MARKET_DAY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function previousWeekday(value: string) {
  if (!validMarketDay(value)) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  do date.setUTCDate(date.getUTCDate() - 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

function wellFormedCloseRecord(value: unknown): value is DailyCloseEvidence {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<DailyCloseEvidence>;
  if (typeof record.marketAsOf !== "string") return false;
  const observedAt = new Date(record.marketAsOf);
  return typeof record.symbol === "string" &&
    typeof record.marketDay === "string" &&
    validMarketDay(record.marketDay) &&
    Number.isFinite(observedAt.getTime()) &&
    newYorkDayFormatter.format(observedAt) === record.marketDay &&
    typeof record.source === "string" &&
    typeof record.interval === "string" &&
    typeof record.adjustmentBasis === "string" &&
    typeof record.completed === "boolean" &&
    Number.isFinite(record.price) && Number(record.price) > 0;
}

function verifiedClose(record: DailyCloseEvidence, symbol: string, marketDay: string) {
  return record.symbol === symbol &&
    record.marketDay === marketDay &&
    record.source === "Veyro authored synthetic fixture v1" &&
    record.interval === "1d" &&
    record.adjustmentBasis === "unadjusted regular-market close" &&
    record.completed === true;
}

export function verifiedPreviousClose({
  evidence,
  ticker,
  currentMarketDay,
}: {
  evidence: unknown;
  ticker: string;
  currentMarketDay: string;
}) {
  const expectedDay = previousWeekday(currentMarketDay);
  if (!expectedDay || !Array.isArray(evidence) || !evidence.every(wellFormedCloseRecord)) return null;
  const recordsFor = (symbol: string) => evidence.filter((record) =>
    record.symbol === symbol && record.marketDay === expectedDay);
  const spyRecords = recordsFor("SPY");
  if (spyRecords.length !== 1 || !verifiedClose(spyRecords[0], "SPY", expectedDay)) return null;
  const matches = recordsFor(ticker);
  if (matches.length !== 1 || !verifiedClose(matches[0], ticker, expectedDay)) return null;
  return matches[0].price;
}

export function sharedQuoteMarketDay(
  symbols: string[],
  priceAsOf: Record<string, string>,
) {
  if (!symbols.length) return "";
  const days = symbols.map((symbol) => {
    const parsed = new Date(priceAsOf[symbol] ?? "");
    return Number.isFinite(parsed.getTime()) ? newYorkDayFormatter.format(parsed) : "";
  });
  return days.every(Boolean) && new Set(days).size === 1 ? days[0] : "";
}

function decisionKey(value: { ticker: string; side: "buy" | "sell"; createdAt: string }) {
  return `${value.ticker}:${value.side}:${value.createdAt}`;
}

export function uniqueTradeByDecisionKey<T extends SimulatedTradeQuantity>(trades: T[]) {
  const matches = new Map<string, T | null>();
  for (const trade of trades) {
    const key = decisionKey(trade);
    matches.set(key, matches.has(key) ? null : trade);
  }
  return matches;
}

export function tradeForDecision<T extends SimulatedTradeQuantity>(
  matches: Map<string, T | null>,
  decision: SimulatedDecisionIdentity,
) {
  if (!decision.ticker || decision.action === "hold") return null;
  return matches.get(decisionKey({
    ticker: decision.ticker,
    side: decision.action,
    createdAt: decision.createdAt,
  })) ?? null;
}

export function uniqueDecisionByTradeKey<T extends SimulatedDecisionIdentity>(decisions: T[]) {
  const matches = new Map<string, T | null>();
  for (const decision of decisions) {
    if (!decision.ticker || decision.action === "hold") continue;
    const key = decisionKey({
      ticker: decision.ticker,
      side: decision.action,
      createdAt: decision.createdAt,
    });
    matches.set(key, matches.has(key) ? null : decision);
  }
  return matches;
}

export function decisionForTrade<T extends SimulatedDecisionIdentity>(
  matches: Map<string, T | null>,
  trade: SimulatedTradeQuantity,
) {
  return matches.get(decisionKey(trade)) ?? null;
}

export function simulatedHoldingMarketValues({
  shares,
  averageCost,
  livePrice,
  previousClose,
}: SimulatedHoldingMarketInput) {
  if (livePrice === null || !Number.isFinite(livePrice) || livePrice <= 0) {
    return {
      value: null,
      gain: null,
      dailyGain: null,
      dailyReturn: null,
      totalReturn: null,
    };
  }
  const hasPreviousClose = previousClose !== null && previousClose > 0;
  return {
    value: shares * livePrice,
    gain: shares * (livePrice - averageCost),
    dailyGain: hasPreviousClose ? shares * (livePrice - previousClose) : null,
    dailyReturn: hasPreviousClose ? livePrice / previousClose - 1 : null,
    totalReturn: averageCost > 0 ? livePrice / averageCost - 1 : 0,
  };
}
