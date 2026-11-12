import assert from 'node:assert/strict';
import test from 'node:test';
import { riskCalculations, currentRiskCalculationSource } from '../lib/risk-calculations.ts';

test('saved risk values distinguish ratios, percentages and percentage points', () => {
  const rows = riskCalculations({netDebtToEbitda: 4.1, interestCoverage: 1.4, shareCountGrowth3y: 0.06, operatingMarginChange3y: -0.06});
  assert.equal(rows[0].formatted, '4.10×');
  assert.equal(rows[1].formatted, '1.40×');
  assert.equal(rows[4].formatted, '6.00%');
  assert.equal(rows[5].formatted, '-6.00 percentage points');
  assert.equal(rows[2].formatted, 'Unavailable');
  assert.equal(rows[0].trace, null);
});

test('mismatched, non-finite or missing saved results never acquire calculation provenance', () => {
  const trace = {value: 4.1, inputs: [], notes: []};
  for (const value of [4.2, null, undefined, NaN, Infinity]) {
    assert.equal(riskCalculations({netDebtToEbitda: value, riskCalculationTraces: {netDebtToEbitda: trace}})[0].trace, null);
  }
  assert.equal(riskCalculations({netDebtToEbitda: 4.1, riskCalculationTraces: {netDebtToEbitda: trace}})[0].trace, trace);
  assert.equal(riskCalculations({freeCashFlowMargin: 0})[2].formatted, '0.00%');
});

// SEC ingestion is outside this offline edition; pure trace presentation remains covered.

test('current SEC review stays separate from saved values and retains missing-input evidence', () => {
  const saved = {netDebtToEbitda: 4.1};
  const traces = {netDebtToEbitda: {value: 3, inputs: [], notes: []}, interestCoverage: {value:null, inputs:[{label:'Interest',value:null}],notes:[]}};
  const current = riskCalculations(currentRiskCalculationSource(traces));
  assert.equal(current[0].formatted,'3.00×');
  assert.equal(riskCalculations(saved)[0].formatted,'4.10×');
  assert.equal(current[1].formatted,'Unavailable');
  assert.equal(current[1].trace.inputs[0].value,null);
});
