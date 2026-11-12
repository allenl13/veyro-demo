import { autopilotEntryReasons, isAutopilotOpportunity } from './autopilot-engine.ts';

type ShortlistStock = {
  ticker: string; name: string; aiTheme: string; currentPrice: number | null;
  priceChangePercent: number | null; priceAsOf: string | null;
  revenueGrowth3y: number | null; netMargin: number | null;
  opportunityScore: number; signal: string; qualityScore: number | null;
  confidence: number; redFlags: string[]; dataQuality?: string;
};
function entryInput(stock: ShortlistStock) {
  return { ticker: stock.ticker, name: stock.name, aiTheme: stock.aiTheme,
    currentPrice: stock.currentPrice, priceChangePercent: stock.priceChangePercent,
    priceAsOf: stock.priceAsOf, revenueGrowth3y: stock.revenueGrowth3y, netMargin: stock.netMargin,
    opportunityScore: stock.opportunityScore, signal: stock.signal, qualityScore: stock.qualityScore,
    confidence: stock.confidence, redFlags: stock.redFlags,
    dataQuality: stock.dataQuality === 'pass' ? 'pass' as const : 'excluded' as const };
}
export function qualifiesForResearchShortlist(stock: ShortlistStock) {
  return isAutopilotOpportunity(entryInput(stock), 'ai-opportunities-v2');
}
export function researchEntryReasons(stock: ShortlistStock) {
  return autopilotEntryReasons(entryInput(stock), 'ai-opportunities-v2');
}
