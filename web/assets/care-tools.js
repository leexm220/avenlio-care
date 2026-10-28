import {t,getLanguage,localeDate} from './i18n.js';
import {esc,safeURL,serviceFeeBounds} from './shared.js';
import {recordName,specialtyName} from './localized-catalog.js';

export const careStages=[
  {title:'stepExplore',body:'stepExploreBody',checks:['checkHospital','checkQuestions']},
  {title:'stepRecords',body:'stepRecordsBody',checks:['checkReports','checkMeds']},
  {title:'stepConfirm',body:'stepConfirmBody',checks:['checkAppointment','checkAgreement']},
  {title:'stepTravel',body:'stepTravelBody',checks:['checkEntry','checkPayment']},
  {title:'stepVisit',body:'stepVisitBody',checks:['checkOriginals','checkInterpreter']},
  {title:'stepReturn',body:'stepReturnBody',checks:['checkDischarge','checkFollowup']}
];
export const careResources=[
  {title:'resourceMedical',publisher:'Beijing Municipal Government',checked:'2026-10-29',url:'https://english.beijing.gov.cn/quickguideservices/medicalguide/step/202312/t20231220_3505652.html'},
  {title:'resourceEntry',publisher:'National Immigration Administration',checked:'2026-10-29',url:'https://en.nia.gov.cn/'},
  {title:'resourcePayment',publisher:'The State Council website · Xinhua · 2024-04-11',checked:'2026-10-29',url:'https://english.www.gov.cn/news/202404/11/content_WS6617c858c6d0868f4e8e5f4d.html'},
  {title:'resourceIMS',publisher:'Beijing Municipal Government',checked:'2026-10-29',url:'https://english.beijing.gov.cn/quickguideservices/medicalguide/majormedicalinstitutions/202510/t20251021_4234727.html'}
];
const shortlist=new Set(),completed=new Set(),budgetDraft={medical:'',travel:'',stay:'',other:''};
let chosenZone;
export function selectedHospitals(data){return data.hospitals.filter(h=>h.published!==false&&shortlist.has(h.id));}
export function toggleShortlist(data,id){
  for(const old of shortlist)if(!data.hospitals.some(h=>h.published!==false&&h.id===old))shortlist.delete(old);
  if(!data.hospitals.some(h=>h.id===id&&h.published!==false))return 'missing';
  if(shortlist.has(id)){shortlist.delete(id);return 'removed';}
  if(shortlist.size>=3)return 'limit';shortlist.add(id);return 'added';
}
export const shortlistButton=h=>`<button class="text-button shortlist-button" type="button" data-shortlist="${esc(h.id)}" aria-pressed="${shortlist.has(h.id)}" aria-label="${esc(t(shortlist.has(h.id)?'compareRemove':'compareAdd')+' · '+recordName(h))}">${esc(t(shortlist.has(h.id)?'compareRemove':'compareAdd'))}</button>`;
export function refreshShortlistControls(data){
  document.querySelectorAll('[data-shortlist]').forEach(button=>{
    const h=data.hospitals.find(h=>h.id===button.dataset.shortlist);if(!h)return;
    button.textContent=t(shortlist.has(h.id)?'compareRemove':'compareAdd');button.setAttribute('aria-pressed',String(shortlist.has(h.id)));
    button.setAttribute('aria-label',button.textContent+' · '+recordName(h));
  });
  document.querySelectorAll('[data-shortlist-count]').forEach(el=>el.textContent=t('compareOpen',{n:selectedHospitals(data).length}));
}
export function budgetAmount(value){
  const raw=String(value??'').trim();if(!raw)return null;
  if(!/^(?:\d{1,7}(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)||Number(raw)>1000000)throw Error('invalid_budget');
  const [whole,decimal='']=raw.split('.');return Number(whole)*100+Number(decimal.padEnd(2,'0'));
}
export function calculateBudget(entries,config){
  const values=['medical','travel','stay','other'].map(key=>budgetAmount(entries[key]));
  const known=values.reduce((sum,value)=>sum+(value??0),0),fees=serviceFeeBounds(config);
  return {minMinor:Math.round(fees.min*100)+known,maxMinor:Math.round(fees.max*100)+known,unknown:values.filter(v=>v===null).length,knownMinor:known};
}
export function checklistText(){
  return [t('brandName')+' · '+t('navGuide'),t('careGuideLead'),'',...careStages.flatMap(s=>[t(s.title),t(s.body),...s.checks.map(key=>`${completed.has(key)?'[x]':'[ ]'} ${t(key)}`),'']),t('contractIdentity'),t('nonEmergency'),'',...careResources.map(r=>`${t(r.title)}\n${r.url}\n${t('checked',{date:localeDate(r.checked)})}`)].join('\n');
}
export function blankSummaryText(){
  return [t('brandName')+' · '+t('templatesTitle'),t('templateLead'),'',...['symptoms','onset','progress','known','tests','checkMeds','needs','checkQuestions'].flatMap(key=>[t(key), '________________________________________','']),t('nonEmergency')].join('\n');
}
function download(text,name){
  const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const heading=(title,lead)=>`<div class="page-title"><span class="eyebrow">${esc(t('brandName'))}</span><h1>${esc(t(title))}</h1><p>${esc(t(lead))}</p></div>`;
const privacyNote=()=>`<p class="tool-privacy" role="note">${esc(t('localToolsNote'))}</p>`;
const resourceList=()=>`<section class="resource-section"><h2>${esc(t('resourcesTitle'))}</h2><div class="resource-grid">${careResources.map(r=>`<a class="resource-card" href="${esc(safeURL(r.url))}" target="_blank" rel="noopener noreferrer"><strong>${esc(t(r.title))} ↗</strong><small>${esc(r.publisher)}</small><small>${esc(t('checked',{date:localeDate(r.checked)}))}</small></a>`).join('')}</div><p class="fine">${esc(t('resourceNote',{date:localeDate('2026-10-29')}))}</p></section>`;
function guide(el){
  el.innerHTML=`<div class="container care-page">${heading('careGuideTitle','careGuideLead')}${privacyNote()}<div class="guide-toolbar no-print"><span id="check-progress" role="status" aria-live="polite"></span><div><button class="button secondary" type="button" data-download-checklist>${esc(t('downloadChecklist'))}</button><button class="text-button" type="button" data-print>${esc(t('printGuide'))}</button></div></div><div class="care-stages">${careStages.map((s,i)=>`<section class="care-stage"><span class="stage-number">0${i+1}</span><div><h2>${esc(t(s.title))}</h2><p>${esc(t(s.body))}</p><div class="care-checks">${s.checks.map(key=>`<label class="check-row"><input type="checkbox" data-care-check="${key}" ${completed.has(key)?'checked':''}><span>${esc(t(key))}</span></label>`).join('')}</div></div></section>`).join('')}</div>${resourceList()}<div class="notice">${esc(t('contractIdentity'))}</div><div class="hero-actions no-print"><a class="button" href="#plan">${esc(t('navPlan'))} ↗</a><a class="button secondary" href="#tools">${esc(t('navTools'))}</a></div></div>`;
  const progress=()=>el.querySelector('#check-progress').textContent=t('checkProgress',{done:completed.size,total:careStages.flatMap(s=>s.checks).length});progress();
  el.querySelectorAll('[data-care-check]').forEach(input=>input.addEventListener('change',()=>{input.checked?completed.add(input.dataset.careCheck):completed.delete(input.dataset.careCheck);progress();}));
  el.querySelector('[data-download-checklist]').addEventListener('click',()=>download(checklistText(),`Avenlio-preparation-${getLanguage()}.txt`));
  el.querySelector('[data-print]').addEventListener('click',()=>window.print());
}
const decimalMoney=minor=>new Intl.NumberFormat(getLanguage(),{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(minor/100);
function tools(el,data){
  el.innerHTML=`<div class="container care-page">${heading('toolsTitle','careStart')}${privacyNote()}<div class="tools-layout"><section class="panel"><h2>${esc(t('budgetTitle'))}</h2><p>${esc(t('budgetLead'))}</p><form id="budget-form" novalidate><div class="form-grid">${[['medical','budgetMedical'],['travel','budgetTravel'],['stay','budgetStay'],['other','budgetOther']].map(([key,label])=>`<div class="field"><label for="budget-${key}">${esc(t(label))} · USD</label><input id="budget-${key}" name="${key}" type="number" min="0" max="1000000" step="0.01" inputmode="decimal" value="${esc(budgetDraft[key])}" aria-describedby="budget-note budget-error"></div>`).join('')}</div><p id="budget-error" class="error" role="alert"></p><div class="budget-result" role="status" aria-live="polite"><span>${esc(t('budgetKnown'))}</span><strong id="budget-total"></strong><small id="budget-missing"></small></div><p id="budget-note" class="fine">${esc(t('budgetUnknown'))}</p></form></section><aside><section class="panel"><h2>${esc(t('templatesTitle'))}</h2><p>${esc(t('templateLead'))}</p><button type="button" class="button secondary" data-download-template>${esc(t('downloadTemplate'))}</button></section><section class="panel"><h3>${esc(t('compareTitle'))}</h3><p>${esc(t('compareNote'))}</p><a class="button secondary" href="#compare" data-shortlist-count>${esc(t('compareOpen',{n:selectedHospitals(data).length}))}</a></section><a class="text-button" href="#guide">${esc(t('downloadChecklist'))} ↗</a></aside></div></div>`;
  const form=el.querySelector('#budget-form'),calculate=()=>{
    for(const input of form.querySelectorAll('input'))budgetDraft[input.name]=input.value;
    try{if([...form.querySelectorAll('input')].some(x=>x.validity.badInput))throw Error();const result=calculateBudget(budgetDraft,data.service_config);
      el.querySelector('#budget-error').textContent='';el.querySelector('#budget-total').textContent=`${decimalMoney(result.minMinor)}–${decimalMoney(result.maxMinor)} USD`;
      el.querySelector('#budget-missing').textContent=t('budgetMissing',{n:result.unknown});
    }catch{el.querySelector('#budget-error').textContent=t('budgetError');el.querySelector('#budget-total').textContent='—';el.querySelector('#budget-missing').textContent='';}
  };
  form.addEventListener('submit',e=>{e.preventDefault();calculate();});form.addEventListener('input',calculate);calculate();
  el.querySelector('[data-download-template]').addEventListener('click',()=>download(blankSummaryText(),`Avenlio-record-outline-${getLanguage()}.txt`));
}
function compare(el,data){
  const hs=selectedHospitals(data);
  el.innerHTML=`<div class="container care-page">${heading('compareTitle','compareNote')}${privacyNote()}<div class="hero-actions"><a class="button secondary" href="#directory">${esc(t('returnDirectory'))}</a><a href="#guide">${esc(t('navGuide'))} ↗</a></div>${hs.length?`<div class="comparison-grid">${hs.map(h=>`<article class="panel comparison-card"><span class="eyebrow">${esc(t(h.city))}</span><h2>${esc(recordName(h))}</h2><p class="name-zh">${esc(getLanguage()==='zh'?h.name_en:h.name_zh)}</p>${shortlistButton(h)}<dl><dt>${esc(t('specialty'))}</dt><dd>${h.specialty_keys.map(key=>esc(specialtyName(key,data))).join(' · ')}</dd><dt>${esc(t('gradeA'))}</dt><dd>${esc(h.hospital_grade==='tertiary_a'?t('gradeA'):t('unknownStatus'))}</dd><dt>${esc(t('checked',{date:localeDate(h.verified_on)}))}</dt><dd>${h.verification_status==='historical_needs_update'?esc(t('historical')):esc(t('trustLead'))}</dd><dt>${esc(t('accessStatus'))}</dt><dd>${esc(t('unknownStatus'))}</dd></dl><button type="button" class="text-button" data-hospital="${esc(h.id)}">${esc(t('profile'))}</button><a class="source-link" href="${esc(safeURL(h.website))}" target="_blank" rel="noopener noreferrer">${esc(t('hospitalWebsite'))} ↗</a></article>`).join('')}</div>`:`<div class="empty">${esc(t('compareEmpty'))}</div>`}</div>`;
}
const mail=(email,subject='')=>'mailto:'+email+(subject?'?subject='+encodeURIComponent(subject):'');
export const correctionLink=(email,h)=>mail(email,'Avenlio Care directory correction — '+(h?.name_en||'Public information'));
function trust(el,data){
  el.innerHTML=`<div class="container care-page">${heading('trustTitle','trustLead')}<div class="notice">${esc(t('searchCoverage',{n:data.hospitals.filter(h=>h.published!==false).length}))}</div><div class="table-wrap"><table><thead><tr><th>${esc(t('navHospitals'))}</th><th>${esc(t('checked',{date:''}))}</th><th>${esc(t('official'))}</th></tr></thead><tbody>${data.hospitals.filter(h=>h.published!==false).map(h=>`<tr><td><button type="button" class="text-button" data-hospital="${esc(h.id)}">${esc(recordName(h))}</button>${h.verification_status==='historical_needs_update'?`<small>${esc(t('historical'))}</small>`:''}</td><td>${esc(localeDate(h.verified_on))}</td><td>${h.source_ids.map(id=>data.sources.find(s=>s.id===id)).filter(Boolean).map(s=>`<a class="source-link" href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title||t('official'))} ↗</a>`).join('<br>')}</td></tr>`).join('')}</tbody></table></div><div class="notice">${esc(t('contractIdentity'))}</div><a class="button secondary" href="${esc(correctionLink(data.service_config.contact_email))}">${esc(t('reportInfo'))}</a>${resourceList()}</div>`;
}
function contact(el,data){
  const email=data.service_config.contact_email;
  if(!chosenZone){try{chosenZone=Intl.DateTimeFormat().resolvedOptions().timeZone;}catch{chosenZone='UTC';}}
  const zones=[...new Set([chosenZone,'UTC','America/Los_Angeles','America/New_York','Europe/London','Europe/Paris','Asia/Tokyo','Asia/Seoul','Asia/Kolkata','Asia/Bangkok','Asia/Jakarta','Asia/Shanghai'])];
  el.innerHTML=`<div class="container care-page">${heading('contactTitle','contactLead')}<div class="tools-layout"><section class="panel"><span class="eyebrow">${esc(t('brandName'))}</span><h2 class="contact-email"><a href="${esc(mail(email))}">${esc(email)}</a></h2><p>${esc(t('templateLead'))}</p><a class="button" href="${esc(mail(email,t('emailSubject')))}">${esc(t('emailGeneral'))} ↗</a><p>${esc(t('contractIdentity'))}</p><div class="contact-links"><button class="text-button" data-legal="privacy">${esc(t('privacy'))}</button><a class="text-button" href="#trust">${esc(t('trustLink'))}</a></div><p class="fine">${esc(t('nonEmergency'))}</p></section><section class="panel"><h2>${esc(t('timezoneTitle'))}</h2><div class="field"><label for="contact-zone">${esc(t('yourTimezone'))}</label><select id="contact-zone">${zones.map(zone=>`<option value="${esc(zone)}" ${zone===chosenZone?'selected':''}>${esc(zone.replaceAll('_',' '))}</option>`).join('')}</select></div><dl class="clock-grid"><dt>${esc(t('chinaTime'))}</dt><dd id="china-clock"></dd><dt id="zone-label">${esc(chosenZone)}</dt><dd id="zone-clock"></dd></dl><button class="text-button" type="button" id="refresh-clock">${esc(t('refreshClock'))}</button><p class="fine">${esc(t('clockNote'))}</p></section></div></div>`;
  const refresh=()=>{const now=new Date(),format=zone=>new Intl.DateTimeFormat(getLanguage(),{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(now);el.querySelector('#china-clock').textContent=format('Asia/Shanghai');el.querySelector('#zone-clock').textContent=format(chosenZone);el.querySelector('#zone-label').textContent=chosenZone.replaceAll('_',' ');};refresh();
  el.querySelector('#contact-zone').addEventListener('change',e=>{chosenZone=e.target.value;refresh();});el.querySelector('#refresh-clock').addEventListener('click',refresh);
}
export function renderCarePage(el,page,data){({guide,tools,compare,trust,contact}[page])(el,data);}
export const careLanding=()=>`<section class="care-landing"><div><span class="eyebrow">${esc(t('navGuide'))}</span><h2>${esc(t('careGuideTitle'))}</h2><p>${esc(t('careStart'))}</p></div><div class="hero-actions"><a class="button secondary" href="#guide">${esc(t('navGuide'))} ↗</a><a class="text-button" href="#tools">${esc(t('navTools'))} ↗</a></div></section>`;
