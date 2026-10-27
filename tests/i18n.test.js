import assert from 'node:assert/strict';
import fs from 'node:fs';
import {messages,languages,t,setLanguage,normalizeLanguage} from '../web/assets/i18n.js';
import {contentTranslations} from '../web/assets/content-i18n.js';
import {filterHospitals,recordCopy,topicName,specialtyName} from '../web/assets/localized-catalog.js';
const data=JSON.parse(fs.readFileSync(new URL('../web/assets/catalog.json',import.meta.url)));
const keys=Object.keys(messages.en).sort();
const slots=value=>[...value.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort();
for(const locale of Object.keys(languages)) {
  assert.deepEqual(Object.keys(messages[locale]).sort(),keys,locale+' has all UI keys');
  for(const key of keys){assert.ok(messages[locale][key].trim(),locale+':'+key);assert.deepEqual(slots(messages[locale][key]),slots(messages.en[key]),locale+':'+key+' placeholders');}
  setLanguage(locale);
  assert.equal(t('brandName'),locale==='zh'?'安诺医伴':'Avenlio Care',locale+' uses the current brand');
  assert.ok(!/China|Beijing|Tianjin|Wayfinder/i.test(t('brandName')+' '+t('brandDescriptor')),locale+' brand has no regional wording');
  for(const group of ['hospitals','departments','experts'])for(const record of data[group])assert.equal(recordCopy(record).fallback,false,locale+':'+record.id);
  for(const topic of data.topics)assert.notEqual(topicName(topic),topic.id);
  assert.equal(filterHospitals(data,{query:locale==='zh'?'眼科':specialtyName('ophthalmology',data)})[0].id,'tj_eye');
  assert.equal(filterHospitals(data,{query:'   Peking Union   '})[0].id,'pumch');
  assert.equal(filterHospitals(data,{city:'Tianjin'}).length,4);
  assert.equal(filterHospitals(data,{query:'unmatched-synthetic-query'}).length,0);
  if(locale!=='en'&&locale!=='zh')assert.equal(recordCopy({...data.hospitals[0],overview_en:'A newly edited source'}).fallback,true);
  assert.ok(!t('healthConsent',{days:90}).includes('{days}'));
}
for(const group of ['hospitals','departments','experts'])for(const record of data[group])assert.equal(contentTranslations[record.id].source,record.overview_en||record.scope_en);
assert.equal(normalizeLanguage('zh-CN'),'zh');assert.equal(normalizeLanguage('fr-CA'),'fr');assert.equal(normalizeLanguage('xx'),'en');
setLanguage('fr');assert.equal(topicName({id:'cataract',label_en:'Edited diagnosis label'}),'Edited diagnosis label');
const app=fs.readFileSync(new URL('../web/assets/app.js',import.meta.url),'utf8');
const used=[...app.matchAll(/\bt\('([^']+)'/g)].map(x=>x[1]);
for(const key of used)assert.ok(messages.en[key],'Unknown UI key '+key);
console.log(`8 languages × ${keys.length} complete UI messages; 22 source-bound profile translations, localized search, edited-source fallback and placeholders verified.`);
