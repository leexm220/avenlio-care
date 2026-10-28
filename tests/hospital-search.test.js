import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {filterHospitals,searchHospitalDirectory,normalizeSearch} from '../web/assets/hospital-search.js';
import {languages,setLanguage,messages} from '../web/assets/i18n.js';
const data=JSON.parse(fs.readFileSync(new URL('../web/assets/catalog.json',import.meta.url)));
const ids=(query,filters={},catalog=data)=>filterHospitals(catalog,{query,...filters}).map(h=>h.id);

test('common hospital abbreviations and Chinese aliases',()=>{
  const cases={PUMCH:'pumch','协和医院':'pumch',Xiehe:'pumch','北大医院':'pkufh','北大一院':'pkufh',PKUFH:'pkufh','北医三院':'pku3','北大三院':'pku3','PKU Third Hospital':'pku3','天坛医院':'tiantan','医科院肿瘤医院':'cicams',CICAMS:'cicams','天津总医院':'tj_general',TMUGH:'tj_general','天津肿瘤医院':'tj_cancer','天津市肿瘤医院':'tj_cancer','天津一中心':'tj_first','天津眼科医院':'tj_eye'};
  for(const [q,id] of Object.entries(cases))assert.deepEqual(ids(q),[id],q);
});
test('keywords work independently of the display language',()=>{
  for(const locale of Object.keys(languages)){
    setLanguage(locale);
    assert.deepEqual(ids('肾内科'),['pkufh'],locale);
    assert.deepEqual(new Set(ids('肿瘤科')),new Set(['cicams','tj_cancer']),locale);
    assert.deepEqual(ids('白内障'),['tj_eye'],locale);
    assert.deepEqual(ids('Peking Union'),['pumch'],locale);
    assert.deepEqual(ids('Zhang Wen'),['pumch'],locale);
    assert.deepEqual(ids('张文'),['pumch'],locale);
    for(const sourceLocale of Object.keys(languages)){
      assert.deepEqual(ids(messages[sourceLocale].nephrology),['pkufh'],`${locale}/${sourceLocale}`);
      assert.deepEqual(ids(messages[sourceLocale].cataract),['tj_eye'],`${locale}/${sourceLocale}`);
    }
  }
});
test('separate keywords are ANDed, independent of their order',()=>{
  for(const q of ['北京 协和','协和 风湿','风湿 协和 北京',' Peking   Union ','天津 白内障','eye Tianjin','Tianjin eye','Tianjin cataract'])
    assert.deepEqual(ids(q),[q.includes('天津')||/Tianjin/.test(q)?'tj_eye':'pumch'],q);
  assert.deepEqual(ids('天津 骨科'),['tj_first']);
  assert.deepEqual(ids('Beijing cataract'),[]);
});
test('case, full width, punctuation, accents, and common traditional characters',()=>{
  for(const q of ['ＰＵＭＣＨ','pumch','北京／協和','北京 協和 醫院'])assert.deepEqual(ids(q),['pumch'],q);
  for(const q of ['Sjogren','Sjögren','Ｓｊöｇｒｅｎ'])assert.deepEqual(ids(q),['pumch'],q);
  assert.deepEqual(ids('腎內科'),['pkufh']);
  assert.equal(normalizeSearch('風濕免疫科'),'风湿免疫科');
});
test('conditions are indexed from associated experts and departments',()=>{
  assert.deepEqual(ids('肩袖撕裂'),['pku3']);
  assert.deepEqual(ids('腰椎间盘突出'),['tj_first']);
  assert.deepEqual(ids('类风湿关节炎'),['pumch']);
  assert.deepEqual(ids('headache'),[]);
  assert.deepEqual(ids('胸痛'),[]);
  assert.deepEqual(ids('阑尾炎'),[]);
});
test('specialty and city filters are respected; no silent filter changes',()=>{
  assert.deepEqual(ids('协和',{city:'Tianjin'}),[]);
  assert.deepEqual(ids('协和',{specialty:'ophthalmology'}),[]);
  assert.deepEqual(ids('',{city:'Beijing'}).length,5);
  assert.deepEqual(ids('',{city:'Tianjin'}).length,4);
  assert.deepEqual(ids('肿瘤',{city:'Tianjin'}),['tj_cancer']);
});
test('all listed hospital names find the right hospital first',()=>{
  for(const h of data.hospitals)for(const q of [h.name_zh,h.name_en])assert.equal(ids(q)[0],h.id,q);
  assert.equal(ids('天津眼科医院')[0],'tj_eye');
});
test('unpublished hospitals, departments, and experts cannot leak into results',()=>{
  const d=structuredClone(data);
  d.hospitals.find(h=>h.id==='pku3').published=false;
  assert.deepEqual(ids('北医三院',{},d),[]);
  d.departments.find(d=>d.id==='pumch_rheum').published=false;
  assert.deepEqual(ids('张文',{},d),[]);
  d.experts.find(e=>e.id==='yuan_xiaoyong').published=false;
  assert.deepEqual(ids('苑晓勇',{},d),[]);
});
test('renamed hospitals and changed translations cannot reuse stale aliases or copy',()=>{
  const d=structuredClone(data);
  d.hospitals[0].name_zh='已编辑名称';
  assert.deepEqual(ids('PUMCH',{},d),[]);
  d.hospitals[0].name_zh='__proto__';
  assert.doesNotThrow(()=>ids('PUMCH',{},d));
  d.specialties.ophthalmology='Edited specialty';
  assert.deepEqual(ids('Oftalmologi',{},d),[]);
});
test('search reasons distinguish names, specialists, and condition terms',()=>{
  setLanguage('zh');
  assert.equal(searchHospitalDirectory(data,{query:'北医三院'})[0].match.type,'alias');
  assert.equal(searchHospitalDirectory(data,{query:'张文'})[0].match.type,'expert');
  assert.equal(searchHospitalDirectory(data,{query:'肾脏内科'})[0].match.type,'department');
  assert.ok(searchHospitalDirectory(data,{query:'白内障'})[0].match.label.includes('白内障'));
  assert.equal(filterHospitals(data).length,9);
  assert.equal(filterHospitals(data,{query:'　　'}).length,9);
  assert.deepEqual(ids('不存在的医院'),[]);
  // Do not confuse the distinct, unlisted Beijing Cancer Hospital with CICAMS.
  assert.deepEqual(ids('北京肿瘤医院'),[]);
  for(const locale of Object.keys(languages))for(const type of ['name','alias','city','specialty','department','expert','topic','profile'])assert.ok(messages[locale]['match_'+type]);
});
