type TrackerPortfolio = {
  id: string;
  kind: "ai-paper-portfolio";
  initialCash: number;
  cash: number;
  holdings: unknown[];
  trades: unknown[];
  snapshots: unknown[];
  autoTrading: { enabled: boolean };
};

function validPersistedPortfolio(value: unknown, expectedId: string): value is TrackerPortfolio {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TrackerPortfolio>;
  return candidate.id === expectedId
    && candidate.kind === "ai-paper-portfolio"
    && typeof candidate.initialCash === "number" && Number.isFinite(candidate.initialCash)
    && typeof candidate.cash === "number" && Number.isFinite(candidate.cash)
    && Array.isArray(candidate.holdings)
    && Array.isArray(candidate.trades)
    && Array.isArray(candidate.snapshots)
    && Boolean(candidate.autoTrading)
    && typeof candidate.autoTrading?.enabled === "boolean";
}

export async function savePersistedTrackerPortfolio<T extends TrackerPortfolio>(
  trackerService: string,
  next: T,
  fetchImplementation: typeof fetch = fetch,
) {
  const response = await fetchImplementation(`${trackerService}/tests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test: next }),
  });
  const payload = await response.json() as { test?: unknown };
  if (!response.ok || !validPersistedPortfolio(payload.test, next.id)) {
    throw new Error("Paper account could not be saved and verified");
  }
  return payload.test as T;
}
