import {messages,t,getLanguage} from './i18n.js';
import {contentTranslations} from './content-i18n.js';

// Editorial search shortcuts, not additional hospitals or clinical claims.
// Bound to the published Chinese name so renamed records cannot retain another hospital's aliases.
const hospitalAliases={
  '北京协和医院':['PUMCH','协和','北京协和','协和医院','Peking Union','Beijing Xiehe','Xiehe'],
  '北京大学第一医院':['PKUFH','北大医院','北大一院','北医一院','北大第一医院','PKU First Hospital','Peking University 1st Hospital'],
  '北京大学第三医院':['PKU3','北医三院','北大三院','北大第三医院','PKU Third Hospital','Peking University 3rd Hospital'],
  '首都医科大学附属北京天坛医院':['天坛医院','北京天坛','Tiantan'],
  '中国医学科学院肿瘤医院':['CICAMS','医科院肿瘤医院','医科院肿瘤','中国医科院肿瘤医院','中国医学科学院肿瘤医院','CAMS Cancer Hospital'],
  '天津医科大学总医院':['天津总医院','天津医大总医院','天津医科大总医院','天医总医院','Tianjin General Hospital','TMUGH'],
  '天津医科大学肿瘤医院（天津市肿瘤医院）':['天津肿瘤医院','天津肿瘤','天津市肿瘤医院','天津医大肿瘤医院','天津医科大学肿瘤医院','Tianjin Cancer Hospital','TMUCIH'],
  '天津市第一中心医院':['天津一中心','天津第一中心医院','天津市一中心医院','一中心医院','Tianjin First Central'],
  '天津市眼科医院':['天津眼科医院','天津眼科','Tianjin Eye']
};
const specialtyAliases={
  rheumatology:['风湿科','风湿免疫','风湿免疫内科'],
  nephrology:['肾科','肾内科','肾病科','肾脏内科','kidney'],
  sports_medicine:['运动医学科','运动损伤','sports medicine'],
  neurosurgery:['脑外科','脑神经外科','neuro surgery'],
  oncology:['肿瘤','癌症','cancer','tumor','tumour'],
  endocrinology:['内分泌','内分泌代谢科'],
  orthopedics:['骨外科','orthopaedics','orthopaedic'],
  ophthalmology:['眼科','eye care']
};
const traditional='醫學國協腫內腎風濕經腦臟運動體關節專門診術總臺灣療檢查證實進發變紅斑瘡乾綜徵類傷韌帶鏡視網膜異頸脊髓壓慶張夢濤萬曉劑壇';
const simplified ='医学国协肿内肾风湿经脑脏运动体关节专门诊术总台湾疗检查证实进发变红斑疮干综征类伤韧带镜视网膜异颈脊髓压庆张梦涛万晓剂坛';
const hanVariants=new Map([...traditional].map((char,i)=>[char,[...simplified][i]]));
export function normalizeSearch(value){
  return String(value??'').normalize('NFKC').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').normalize('NFC')
    .replace(/[\u200b-\u200d\ufeff]/g,'').replace(/[\u3400-\u9fff]/g,char=>hanVariants.get(char)||char)
    .replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
const compact=value=>normalizeSearch(value).replace(/ /g,'');
const localizedTerm=(key,value)=>messages.en[key]===value?Object.values(messages).map(m=>m[key]):[value];
const termLabel=(key,value)=>messages.en[key]===value?t(key):value;
const name=record=>getLanguage()==='zh'?record.name_zh:record.name_en;
const indexCache=new WeakMap();
function searchIndex(data){
  // Reuse normalization while typing; any public record edit or language change invalidates it.
  const signature=JSON.stringify([getLanguage(),data.hospitals,data.departments,data.experts,data.specialties,data.topics]);
  let index=indexCache.get(data);
  if(index?.signature!==signature){index={signature,fields:new Map(data.hospitals.filter(h=>h.published!==false).map(h=>[h.id,fieldsFor(h,data)]))};indexCache.set(data,index);}
  return index.fields;
}
function profileText(record){
  const source=record.overview_en??record.scope_en,translated=contentTranslations[record.id];
  return [record.overview_zh,record.scope_zh,source,...(translated?.source===source?Object.entries(translated).filter(([k])=>k!=='source').map(([,v])=>v):[])];
}
function fieldsFor(h,data){
  const fields=[];
  const add=(type,label,values,score)=>{
    for(const value of values.filter(Boolean))fields.push({type,label,text:normalizeSearch(value),compact:compact(value),score});
  };
  add('name',name(h),[h.name_zh,h.name_en],500);
  for(const alias of Object.hasOwn(hospitalAliases,h.name_zh)?hospitalAliases[h.name_zh]:[])add('alias',alias,[alias],450);
  add('city',t(h.city),[h.city,...Object.values(messages).map(m=>m[h.city])],10);
  for(const key of h.specialty_keys||[]){
    const value=data.specialties[key];
    add('specialty',termLabel(key,value),[...localizedTerm(key,value),...(messages.en[key]===value?specialtyAliases[key]||[]:[])],150);
  }
  add('profile',name(h),profileText(h),50);
  const ds=(data.departments||[]).filter(d=>d.hospital_id===h.id&&d.published!==false);
  for(const d of ds){
    add('department',name(d),[d.name_zh,d.name_en],240);
    add('profile',name(d),profileText(d),50);
    for(const e of (data.experts||[]).filter(e=>e.department_id===d.id&&e.published!==false)){
      add('expert',name(e),[e.name_zh,e.name_en],220);
      add('profile',name(e),profileText(e),50);
      // A condition enters the index only through an associated published expert's evidence.
      for(const topic of (data.topics||[]).filter(topic=>(e.topic_keys||[]).includes(topic.id)&&(topic.evidence_expert_ids||[]).includes(e.id)))
        add('topic',termLabel(topic.id,topic.label_en),localizedTerm(topic.id,topic.label_en),200);
    }
  }
  return fields;
}
export function searchHospitalDirectory(data,{query='',city='',specialty=''}={}){
  const q=normalizeSearch(query),tokens=q.split(' ').filter(Boolean),joined=compact(query);
  const index=q?searchIndex(data):null;
  return data.hospitals.filter(h=>h.published!==false&&(!city||h.city===city)&&(!specialty||(h.specialty_keys||[]).includes(specialty)))
    .map(hospital=>{
      if(!q)return {hospital,score:0,match:null};
      const fields=index.get(hospital.id);
      if(!tokens.every(token=>fields.some(f=>f.text.includes(token)||f.compact.includes(token))))return null;
      const hits=fields.filter(f=>tokens.some(token=>f.text.includes(token)||f.compact.includes(token)))
        .map(f=>({...f,score:f.score+(f.compact===joined?100:f.compact.includes(joined)?40:0)})).sort((a,b)=>b.score-a.score);
      const best=hits[0];return {hospital,score:best.score,match:{type:best.type,label:best.label}};
    }).filter(Boolean).sort((a,b)=>b.score-a.score);
}
export const filterHospitals=(data,filters)=>searchHospitalDirectory(data,filters).map(result=>result.hospital);
