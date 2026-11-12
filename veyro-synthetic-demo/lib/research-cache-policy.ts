// Filing research is refreshed on its own daily cadence. Market quotes are
// fetched separately and cannot make a financial filing scan due sooner.
export const RESEARCH_SCAN_INTERVAL_MS = 24 * 60 * 60_000;
export const RESEARCH_READ_CACHE_MS = 15 * 60_000;

type ResearchObservation = {
  generatedAt: string;
};

export function researchCacheExpiresAt(scan: ResearchObservation) {
  const generatedAt = Date.parse(scan.generatedAt);
  return Number.isFinite(generatedAt) ? generatedAt + RESEARCH_SCAN_INTERVAL_MS : 0;
}
