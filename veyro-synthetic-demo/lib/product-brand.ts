export const PRODUCT_NAME = "Veyro";
export const PRODUCT_DESCRIPTION =
  "Explainable research on companies shaping and applying AI, with visible evidence, risk and a simulated portfolio.";

export function brandedCopy(value: string): string {
  return value
    .replaceAll("ClearSignal AI", PRODUCT_NAME)
    .replaceAll("ClearSignal Research", PRODUCT_NAME)
    .replaceAll("ClearSignal", PRODUCT_NAME);
}
