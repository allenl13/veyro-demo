import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifiesForResearchShortlist, researchEntryReasons } from '../lib/research-shortlist.ts';
const base={ticker:'EXAMPLE',name:'Example',aiTheme:'AI',currentPrice:10,priceChangePercent:null,priceAsOf:null,revenueGrowth3y:.2,netMargin:.1,opportunityScore:60,signal:'Promising',qualityScore:65,confidence:.6,redFlags:[],dataQuality:'pass'};
test('shortlist uses all balanced v2 gates, not just research score',()=>{
 assert.equal(qualifiesForResearchShortlist(base),true);
 for(const change of [{opportunityScore:59},{qualityScore:64},{revenueGrowth3y:.09},{confidence:.59},{currentPrice:null},{redFlags:['Risk']},{dataQuality:'excluded'},{dataQuality:undefined}]){
  assert.equal(qualifiesForResearchShortlist({...base,...change}),false);
  assert.ok(researchEntryReasons({...base,...change}).length);
 }
 assert.deepEqual(researchEntryReasons(base),[]);
});
