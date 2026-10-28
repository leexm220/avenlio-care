import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateBudget,budgetAmount,toggleShortlist,selectedHospitals,careStages,careResources,blankSummaryText,checklistText} from '../web/assets/care-tools.js';
import {operationsQueue,qualityIssues} from '../web/assets/operations.js';
import {languages,messages,setLanguage} from '../web/assets/i18n.js';
const data=JSON.parse(fs.readFileSync(new URL('../web/assets/catalog.json',import.meta.url)));
test('budget leaves blank entries unknown and uses integer cents',()=>{
 const a=calculateBudget({},data.service_config);assert.equal(a.unknown,4);assert.equal(a.minMinor,100000);assert.equal(a.maxMinor,1000000);
 const b=calculateBudget({medical:'.10',travel:'.20',stay:'0',other:'0'},data.service_config);assert.equal(b.unknown,0);assert.equal(b.knownMinor,30);assert.equal(b.minMinor,100030);
 for(const v of ['-1','Infinity','NaN','1e4','1000001','1.001','1,000'])assert.throws(()=>budgetAmount(v),v);
 assert.equal(budgetAmount('1000000.00'),100000000);assert.equal(budgetAmount(''),null);assert.equal(budgetAmount('0'),0);
});
test('shortlist caps at three, respects publication state and supports removal',()=>{
 for(const h of data.hospitals.slice(0,3))assert.equal(toggleShortlist(data,h.id),'added');
 assert.equal(toggleShortlist(data,data.hospitals[3].id),'limit');assert.equal(selectedHospitals(data).length,3);
 assert.equal(toggleShortlist(data,data.hospitals[0].id),'removed');assert.equal(toggleShortlist(data,data.hospitals[3].id),'added');
 const changed=structuredClone(data);changed.hospitals[1].published=false;assert.equal(selectedHospitals(changed).length,2);
 assert.equal(toggleShortlist(changed,changed.hospitals[1].id),'missing');assert.equal(toggleShortlist(data,'not_a_hospital'),'missing');
 for(const h of selectedHospitals(data))toggleShortlist(data,h.id);
});
test('guides and templates have eight complete language versions and no patient data',()=>{
 for(const locale of Object.keys(languages)){
  setLanguage(locale);
  for(const stage of careStages)for(const key of [stage.title,stage.body,...stage.checks])assert.ok(messages[locale][key]);
  for(const resource of careResources)assert.ok(messages[locale][resource.title]);
  for(const text of [blankSummaryText(),checklistText()]){assert.ok(text.length>200);assert.ok(!text.includes('undefined'));assert.ok(!text.includes('qa@example.test'));assert.ok(!text.includes('CCW-'));}
 }
 for(const file of ['care-tools.js']){
  const code=fs.readFileSync(new URL('../web/assets/'+file,import.meta.url),'utf8');
  for(const key of [...code.matchAll(/\bt\('([^']+)'/g)].map(x=>x[1]))assert.ok(messages.en[key],key);
  assert.ok(!code.includes('localStorage'));assert.ok(!/\bfetch\(/.test(code));
 }
});
test('operations queue orders due work, excludes closed cases and handles legacy records',()=>{
 const leads=[{id:'closed',status:'closed',body:{coordination:{next_action_on:'2026-10-01'}}},{id:'legacy',status:'new',body:{}},{id:'due',status:'contacted',body:{coordination:{next_action_on:'2026-10-28',next_action:'Synthetic task',tasks:{materials:true,hospital:false}}}}];
 const q=operationsQueue(leads,'2026-10-29');assert.equal(q.length,2);assert.equal(q[0].lead.id,'due');assert.equal(q[0].overdue,true);assert.equal(q[0].done,1);assert.equal(q[1].due,'');
});
test('data-quality review separates historical data from freshness',()=>{
 const issues=qualityIssues(data,'2026-10-29');assert.ok(issues.some(x=>x.record.id==='tj_general'&&x.reasons.includes('历史资料待更新')));
 assert.ok(qualityIssues(data,'2027-02-01').length>issues.length);
});
