import {messages, languages} from './translations.js';
export {messages, languages};
export function normalizeLanguage(value) {
  const key=String(value||'').toLowerCase().split('-')[0];
  return Object.hasOwn(languages,key)?key:'en';
}
let language='en';
if(typeof window!=='undefined') {
  let saved;try{saved=localStorage.getItem('ccw_language');}catch{}
  const requested=new URL(location.href).searchParams.get('lang');
  language=normalizeLanguage(requested||saved||navigator.language);
}
export const getLanguage=()=>language;
export function setLanguage(value) {
  language=normalizeLanguage(value);
  if(typeof window==='undefined')return;
  try{localStorage.setItem('ccw_language',language);}catch{}
  document.documentElement.lang=language==='zh'?'zh-CN':language;
  const url=new URL(location.href);url.searchParams.set('lang',language);
  history.replaceState(null,'',url);
}
export function t(key,params={},locale=language) {
  const text=messages[locale]?.[key]??messages.en[key]??key;
  return text.replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??''));
}
export const localeMoney=value=>new Intl.NumberFormat(language,{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
export const localeDate=value=>{
  const date=new Date(value+'T12:00:00Z');
  return Number.isNaN(date.valueOf())?value:new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(date);
};
