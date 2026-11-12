export type AutopilotOperationalState = {
  enabled: boolean;
  trackerStatus: string | null;
  schedulerStatus: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
};

export type AutopilotOperationalStatus = {
  label: string;
  healthy: boolean;
  detail?: string;
};

const MAX_CHECK_AGE_MS = 25 * 60_000;

export function autopilotOperationalStatus(
  state: AutopilotOperationalState | null,
  marketIsOpen: boolean,
  now = Date.now(),
): AutopilotOperationalStatus {
  if (!state) return { label: "Unavailable", healthy: false };
  if (!state.enabled || state.schedulerStatus === "paused") return { label: "Paused", healthy: false };
  if (state.trackerStatus !== "ready") return { label: "Status unavailable", healthy: false };
  if (state.lastError || state.schedulerStatus === "error" || state.schedulerStatus === "cooling-down") {
    const missingQuote = state.lastError?.match(/^A current regular-session quote is unavailable for ([A-Z][A-Z0-9.-]{0,9})$/);
    if (missingQuote) return {
      label: `Waiting for ${missingQuote[1]} price`,
      healthy: false,
      detail: "The simulation needs a recent market price before it can evaluate trades. It will retry automatically; old prices are not used to bypass this check.",
    };
    return { label: "Unable to check", healthy: false, detail: "The latest simulation check failed. Automatic checks will retry; the last successful check is shown below." };
  }
  if (state.schedulerStatus === "waiting-for-data") return { label: "Waiting for recent prices", healthy: false, detail: "Waiting for matching price times after the latest research and portfolio change." };
  if (state.schedulerStatus === "checking") return { label: "Checking", healthy: true };
  if (!["waiting", "ready", "completed", "held", "not-due", "already-checked"].includes(state.schedulerStatus ?? "")) {
    return { label: "Status unavailable", healthy: false };
  }
  if (!marketIsOpen) return { label: "Market closed", healthy: true };
  if (state.schedulerStatus === "waiting") return { label: "Waiting for check", healthy: false };
  const checkedAt = state.lastCheckedAt ? Date.parse(state.lastCheckedAt) : NaN;
  if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > MAX_CHECK_AGE_MS) {
    return { label: "Check overdue", healthy: false };
  }
  return { label: "Monitoring", healthy: true };
}
