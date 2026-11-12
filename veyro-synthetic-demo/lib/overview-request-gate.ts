export class OverviewRequestGate {
  private generation = 0;
  private controlPending = false;

  beginRefresh() {
    if (this.controlPending) return null;
    this.generation += 1;
    return this.generation;
  }

  beginControl() {
    if (this.controlPending) return null;
    this.controlPending = true;
    this.generation += 1;
    return this.generation;
  }

  accepts(generation: number) {
    return generation === this.generation;
  }

  finishControl(generation: number) {
    if (generation === this.generation) this.controlPending = false;
  }

  cancelAll() {
    this.generation += 1;
    this.controlPending = false;
  }
}

export function freshnessDelay(completedAt: string | null, staleAfterSeconds: number | null, nowMs: number) {
  if (!completedAt || staleAfterSeconds === null || !Number.isFinite(staleAfterSeconds) || staleAfterSeconds < 0) return null;
  const expiresAt = Date.parse(completedAt) + staleAfterSeconds * 1_000;
  if (!Number.isFinite(expiresAt)) return null;
  return Math.min(Math.max(0, expiresAt - nowMs + 1), 2_147_483_647);
}
