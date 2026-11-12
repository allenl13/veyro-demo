import assert from 'node:assert/strict';
import test from 'node:test';
import {formatResearchScore, materialResearchScoreGaps, researchScoreExplanation} from '../lib/research-score-presentation.ts';

test('the cutoff uses the saved tenth of a point rather than rounding 59.9 to 60', () => {
  assert.equal(formatResearchScore(59.9), '59.9 / 100');
  assert.equal(formatResearchScore(Number.NaN), 'Unavailable');
  assert.equal(formatResearchScore(null), 'Unavailable');
});

test('holding status distinguishes material evidence gaps from missing price history', () => {
  const base = {missingMetrics: ['price_return_6m', 'price_return_12m'], unavailableRiskChecks: [], missingEvidencePenalty: 0, previousScore: null, previousScanAt: null};
  assert.deepEqual(materialResearchScoreGaps(base), []);
  assert.deepEqual(materialResearchScoreGaps({...base, missingMetrics: ['return_on_invested_capital', ...base.missingMetrics]}),
    ['Missing score inputs: Return on invested capital']);
  assert.deepEqual(materialResearchScoreGaps({...base, unavailableRiskChecks: ['interest_coverage'], missingEvidencePenalty: 7.5}),
    ['Risk checks unavailable: Interest coverage']);
  assert.deepEqual(materialResearchScoreGaps({...base, missingMetrics: ['interest_coverage', 'eps_cagr_3y'], unavailableRiskChecks: ['interest_coverage'], missingEvidencePenalty: 7.5}),
    ['Missing score inputs: Three-year earnings-per-share growth', 'Risk checks unavailable: Interest coverage']);
  assert.deepEqual(materialResearchScoreGaps(undefined), ['Saved score evidence is unavailable']);
});

test('missing inputs and unverified risk checks come only from saved score evidence', () => {
  const stock = {opportunityScore: 49.4, scoreEvidence: {
    missingMetrics: ['return_on_invested_capital', 'price_return_6m', 'price_return_12m'],
    unavailableRiskChecks: ['share_count_cagr_3y'],
    missingEvidencePenalty: 7.5,
    previousScore: 66.4,
    previousScanAt: '2026-09-26T00:00:00.000Z',
  }};
  assert.deepEqual(researchScoreExplanation(stock), {
    comparison: {previous: '66.4 / 100', current: '49.4 / 100', observedAt: '2026-09-26T00:00:00.000Z'},
    missingInputs: ['Return on invested capital', 'Six-month price return', 'Twelve-month price return'],
    riskChecks: ['Three-year share-count growth'],
    uncertainty: '7.5',
  });
  assert.equal(researchScoreExplanation({opportunityScore: 49.4}), null);
  assert.equal(researchScoreExplanation({...stock, scoreEvidence: {...stock.scoreEvidence, previousScanAt: null}}).comparison, null);
});
