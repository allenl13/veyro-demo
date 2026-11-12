import assert from 'node:assert/strict';
import test from 'node:test';
import {assessHoldingGrowth,holdingGrowthStatus} from '../lib/research-holding-policy.ts';
import {runAutopilot,buildResearchRun,autopilotEntryReasons} from '../lib/autopilot-engine.ts';
import {ACTIVE_RESEARCH_MODEL,ACTIVE_SCORING_REVISION,ACTIVE_RESEARCH_WEIGHTS,ACTIVE_REVENUE_GROWTH_SCORE_CEILING,ACTIVE_BALANCED_POLICY} from '../lib/annual-core-policy.ts';
import {RESEARCH_V2_CORE_FACTORS} from '../lib/research-v2-candidate.mjs';
import {verifiedScoreEvidence,fixtureFinancialSource,fixturePriceAsOf} from './helpers/score-evidence-fixture.mjs';
const scan='2026-08-27T14:55:00.000Z', now='2026-08-27T16:00:00.000Z';
function company(growth=.1124,ticker='ADBE') {
 const evidence=verifiedScoreEvidence(64.4);
 evidence.revenue_cagr_3y={...evidence.revenue_cagr_3y,value:growth,status:growth===0?'verified_zero':'verified_numeric'};
 return {ticker,name:ticker,aiTheme:'AI software',currentPrice:100,priceAsOf:fixturePriceAsOf,priceChangePercent:0,
  dataBasis:'annual',financialSourceUrl:fixtureFinancialSource,dataQuality:'pass',revenueGrowth3y:growth,netMargin:.2,
  opportunityScore:64.4,signal:'Promising',qualityScore:80,confidence:.8,redFlags:[],
  researchV2:{version:ACTIVE_RESEARCH_MODEL,scoringRevision:ACTIVE_SCORING_REVISION,score:64.4,researchRanked:true,
   reportingPeriod:'2026-07-31',evidence,missingCore:[],rankReasons:[],simulatedBuyEligible:false,buyReasons:['Candidate score below 65']}};
}
function account(ticker='ADBE') {
 return {cash:9000,holdings:[{ticker,name:ticker,shares:10,averageCost:100}],trades:[],watchSymbols:[ticker],
  autoTrading:{enabled:true,maxPositions:10,maxPositionPercent:.20,stopLossPercent:.20,takeProfitPercent:.40,
  lastRunAt:null,decisions:[],researchRuns:[]}};
}
function run(stock,portfolio=account(stock.ticker)) {
 return runAutopilot({stocks:[stock],portfolio,prices:{[stock.ticker]:100},scanGeneratedAt:scan,now,runKey:'growth-test'});
}
test('verified growth is retained without a standalone exit, including negative and zero growth',()=>{
 for(const growth of [-.05,0,.1124,.19556,.199999,.20,.200001,.5]) {
  const result=assessHoldingGrowth(company(growth),scan,now);
  assert.equal(result.verification,'verified');assert.equal(result.exitQualified,false);assert.equal(result.revenueGrowth3y,growth);
 }
 assert.equal(holdingGrowthStatus(company(),scan,now),null);
 assert.equal(holdingGrowthStatus(company(.20),scan,now),null);
});
test('ADBE and CLS are retained when growth is below 20%, preserving the input ledger',()=>{
 for(const [ticker,growth] of [['ADBE',.1124],['CLS',.19556]]) {
  const stock=company(growth,ticker),portfolio=account(ticker),before=structuredClone(portfolio);
  const result=run(stock,portfolio);
  assert.deepEqual(result.trades,[]);
  assert.deepEqual(result.portfolio.holdings,portfolio.holdings);assert.equal(result.portfolio.cash,9000);
  assert.equal(result.researchRun.decisionPolicy,ACTIVE_BALANCED_POLICY);
  assert.equal(result.researchRun.candidateResearch[0].holdingGrowth.exitQualified,false);
  assert.deepEqual(portfolio,before);
  assert.equal(run(stock,result.portfolio).trades.length,0);
 }
});
test('missing, stale, future, mismatched or invalid growth evidence cannot trigger a growth exit',()=>{
 const base=company();
 const edits=[
  s=>{s.revenueGrowth3y=null;},s=>{s.revenueGrowth3y=.19;},s=>{delete s.researchV2.evidence.revenue_cagr_3y;},
  s=>{s.researchV2.evidence.revenue_cagr_3y.value=null;},s=>{s.researchV2.evidence.revenue_cagr_3y.value=NaN;},
  s=>{s.researchV2.evidence.revenue_cagr_3y.status='unavailable_source';},
  s=>{s.researchV2.evidence.revenue_cagr_3y.status='stale';},
  s=>{s.researchV2.evidence.revenue_cagr_3y.reportingPeriod='2024-01-01';},
  s=>{s.researchV2.evidence.revenue_cagr_3y.reportingPeriod='2026-09-01';},
  s=>{s.researchV2.evidence.revenue_cagr_3y.observationTime='2026-08-28T16:00:00Z';},
  s=>{s.researchV2.evidence.revenue_cagr_3y.sourceUrls=['http://invalid/source'];},
  s=>{s.researchV2.evidence.revenue_cagr_3y.sourceObservationTime='2026-08-25T16:00:00Z';},
  s=>{s.researchV2.evidence.revenue_cagr_3y.currency=null;},
  s=>{s.researchV2.evidence.revenue_cagr_3y.reportingPeriodStart='2024-07-31';s.researchV2.evidence.revenue_cagr_3y.periodBasis='annual';},
  s=>{s.dataQuality='excluded';},s=>{s.researchV2.version='unsupported';}
 ];
 for(const edit of edits) {
  const stock=structuredClone(base);edit(stock);
  const assessment=assessHoldingGrowth(stock,scan,now);
  assert.equal(assessment.exitQualified,false);assert.equal(assessment.revenueGrowth3y,null);
  assert.equal(assessment.verification,'needs review');assert.equal(run(stock).trades.length,0);
  assert.equal(holdingGrowthStatus(stock,scan,now).label,'Holding growth needs review');
 }
 for(const [s,n] of [['2026-08-19T14:55:00Z',now],['2026-08-28T14:55:00Z',now],['invalid',now],[scan,'invalid']]) {
  assert.equal(assessHoldingGrowth(base,s,n).exitQualified,false);
 }
});
test('growth evidence remains available while missing scoring and safety inputs protect holdings',()=>{
 const stock=company();stock.researchV2.score=null;stock.researchV2.researchRanked=false;
 stock.researchV2.evidence.net_margin.value=null;stock.researchV2.evidence.net_margin.status='unavailable_source';
 stock.researchV2.buyReasons=['Debt-service evidence: unavailable_source'];
 assert.equal(assessHoldingGrowth(stock,scan,now).exitQualified,false);assert.deepEqual(run(stock).trades,[]);
 stock.dataQuality='excluded';stock.coverageIssues=[{code:'debt_cash'}];
 assert.equal(assessHoldingGrowth(stock,scan,now).exitQualified,false);
});
test('a current verified company below 20% growth can be bought and is not immediately sold',()=>{
 const stock=company(.19);stock.researchV2.evidence=verifiedScoreEvidence(100);
 stock.researchV2.evidence.revenue_cagr_3y.value=.19;
 const score=Math.round(RESEARCH_V2_CORE_FACTORS.reduce((sum,f)=>{
  const high=f.key==='revenue_cagr_3y'?ACTIVE_REVENUE_GROWTH_SCORE_CEILING:f.high;
  const n=Math.max(0,Math.min(100,100*(stock.researchV2.evidence[f.key].value-f.low)/(high-f.low)));
  return sum+ACTIVE_RESEARCH_WEIGHTS[f.key]*(f.reverse?100-n:n);
 },0)*10)/10;
 stock.opportunityScore=stock.researchV2.score=score;
 stock.netMargin=stock.researchV2.evidence.net_margin.value;
 stock.researchV2.simulatedBuyEligible=true;stock.researchV2.buyReasons=[];
 assert.ok(score>=65);assert.deepEqual(autopilotEntryReasons(stock,ACTIVE_RESEARCH_MODEL),[]);
 const review=buildResearchRun({stocks:[stock],balancedPolicy:ACTIVE_RESEARCH_MODEL,scanGeneratedAt:scan,now});
 assert.equal(review.candidateResearch[0].eligibleForAutopilot,true);
 const empty=account(stock.ticker);empty.cash=10000;empty.holdings=[];
 const bought=run(stock,empty);assert.ok(bought.trades.some(t=>t.side==='buy'));
 assert.ok(!bought.trades.some(t=>t.side==='sell'));
 assert.ok(!run(stock,bought.portfolio).trades.some(t=>t.side==='sell'));
});
