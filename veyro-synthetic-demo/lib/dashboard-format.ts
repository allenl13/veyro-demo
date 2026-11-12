import { normaliseReturn } from "./financial-metrics.ts";

export function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function percent(value: number) {
  const normalised = normaliseReturn(value);
  return `${normalised >= 0 ? "+" : ""}${(normalised * 100).toFixed(2)}%`;
}
