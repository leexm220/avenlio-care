import {t,getLanguage,messages} from './i18n.js';
import {contentTranslations} from './content-i18n.js';
export {filterHospitals,searchHospitalDirectory} from './hospital-search.js';
export const recordName=r=>getLanguage()==='zh'?(r.name_zh||r.name_en):r.name_en;
export const specialtyName=(key,data)=>Object.hasOwn(messages.en,key)&&messages.en[key]===data.specialties[key]?t(key):data.specialties[key]||key;
export const topicName=topic=>Object.hasOwn(messages.en,topic.id)&&messages.en[topic.id]===topic.label_en?t(topic.id):topic.label_en;
export function recordCopy(record) {
  const field=Object.hasOwn(record,'overview_en')?'overview':'scope',language=getLanguage();
  if(language==='zh'&&record[field+'_zh'])return {text:record[field+'_zh'],lang:'zh',fallback:false};
  if(language==='en')return {text:record[field+'_en'],lang:'en',fallback:false};
  const translated=contentTranslations[record.id];
  if(translated?.source===record[field+'_en']&&translated[language])return {text:translated[language],lang:language,fallback:false};
  return {text:record[field+'_en'],lang:'en',fallback:true};
}
export function departmentName(record,data) {
  if(getLanguage()==='zh')return record.name_zh;
  if(record.id==='tj_eye_cataract'&&record.name_en==='Cataract Center')return t('cataractCenter');
  if(record.id==='tj_general_endo'&&record.name_en==='Endocrinology and Metabolism')return t('endoMetabolism');
  return record.name_en===data.specialties[record.specialty_key]?specialtyName(record.specialty_key,data):record.name_en;
}
