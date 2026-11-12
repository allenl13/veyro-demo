import assert from "node:assert/strict";
import test from "node:test";

import {
  allDiscoverRisks,
  compactDiscoverRiskText,
  principalDiscoverRisk,
} from "../lib/discover-risk-presentation.ts";

test("presents qualitative thesis risks as watch items, never positive evidence", () => {
  assert.deepEqual(
    principalDiscoverRisk({ aiThesisRisks: ["AI features commoditise"], redFlags: [] }),
    { text: "AI features commoditise", kind: "watch", label: "Watch" },
  );
});

test("presents existing financial flags as material risks", () => {
  assert.deepEqual(
    principalDiscoverRisk({
      aiThesisRisks: ["Cloud optimisation"],
      redFlags: ["Material dilution: share count grew more than 5% annually"],
    }),
    {
      text: "Material dilution: share count grew more than 5% annually",
      kind: "material",
      label: "Material risk",
    },
  );
});

test("keeps drawer risks deduplicated and upgrades duplicate financial flags to material", () => {
  assert.deepEqual(
    allDiscoverRisks({
      aiThesisRisks: ["Capital spending outruns returns", "Shared risk"],
      redFlags: ["Shared risk"],
    }),
    [
      { text: "Capital spending outruns returns", kind: "watch", label: "Watch" },
      { text: "Shared risk", kind: "material", label: "Material risk" },
    ],
  );
  assert.equal(principalDiscoverRisk({ aiThesisRisks: [], redFlags: [] }), null);
});

test("shortens only known table summaries while preserving the underlying risk text", () => {
  assert.equal(compactDiscoverRiskText("Capital spending outruns returns"), "Capex outruns returns");
  assert.equal(compactDiscoverRiskText("AI infrastructure spending outruns monetisation"), "AI spend outruns monetisation");
  assert.equal(compactDiscoverRiskText("Material dilution: share count grew more than 5% annually"), "Dilution");
  assert.equal(compactDiscoverRiskText("Hyperscaler capital spending slows"), "Hyperscaler capex slows");
  assert.equal(compactDiscoverRiskText("Accelerator adoption trails competitors"), "Accelerator adoption lags");
  assert.equal(compactDiscoverRiskText("AI demand is diluted across a diversified portfolio"), "Diversification dilutes AI demand");
  assert.equal(compactDiscoverRiskText("Company-specific execution risk"), "Company-specific execution risk");
});
