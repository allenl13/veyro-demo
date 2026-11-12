/** Fictional, authored businesses; presentation only. */
const COMPANY_BUSINESSES: Record<string, { name: string; role: string; description: string; sourceUrl: string }> = {
  DEMO1: { name: "Aurora Compute (fictional)", role: "Synthetic compute", description: "Fictional designer of compute modules for this demonstration.", sourceUrl: "https://demo.veyro.invalid/evidence/DEMO1" },
  DEMO2: { name: "Harbor Networks (fictional)", role: "Synthetic networking", description: "Fictional provider of data-centre connectivity for this demonstration.", sourceUrl: "https://demo.veyro.invalid/evidence/DEMO2" },
  DEMO3: { name: "Cedar Applications (fictional)", role: "Synthetic software", description: "Fictional software company with negative cash flow in this example.", sourceUrl: "https://demo.veyro.invalid/evidence/DEMO3" },
};
export function companyBusiness(ticker: string) { return COMPANY_BUSINESSES[ticker.toUpperCase()] ?? null; }
