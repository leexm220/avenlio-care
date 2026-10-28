import {esc,statusLabels,formatServiceFee} from './shared.js';
const taskLabels={materials:'资料已核对',hospital:'院方回复已核实',agreement:'服务范围与条款已书面确认',travel:'行程已确认',visit:'到院协调已完成',discharge:'出院资料已交付',followup:'随访衔接已安排'};
const stateLabels={not_requested:'未联系院方',requested:'等待院方回复',confirmed:'已取得预约确认',unavailable:'院方暂未接诊／无法安排'};
export const todayInChina=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function coordinationEditor(lead,catalog,{field,select,op}){
 const c=lead.body.coordination||{},config=catalog.service_config;
 return `<section class="coordination-section"><h3>就医协调计划</h3><p class="fine">以下为人工跟进记录，不会自动预约、发送消息或向医院传送病历。预约确认须记录实际院区、北京时间和院方凭据。</p><div class="operations-checks">${Object.entries(taskLabels).map(([key,label])=>`<label class="check-row"><input type="checkbox" name="task_${key}" ${c.tasks?.[key]?'checked':''}>${label}</label>`).join('')}</div><div class="form-grid">${field('下一步行动','coord_next_action',c.next_action||'','textarea',true)}${field('下次跟进日期（北京时间）','coord_next_action_on',c.next_action_on||'','date')}${select('院方确认状态','coord_hospital_state',Object.entries(stateLabels).map(([key,label])=>op(key,label,c.hospital_state||'not_requested')).join(''))}${select('协调医院','coord_hospital_id',op('','尚未确定',c.hospital_id||'')+catalog.hospitals.map(h=>op(h.id,h.name_zh,c.hospital_id||'')).join(''),true)}${field('预约日期（北京时间）','coord_appointment_on',c.appointment_on||'','date')}${field('预约时间（北京时间）','coord_appointment_time',c.appointment_time||'','time')}${field('实际院区／到院地点','coord_campus',c.campus||'','text',true)}${field('院方确认凭据／出处','coord_confirmation_reference',c.confirmation_reference||'','textarea',true)}${field('具体服务报价（USD，仅服务费）','coord_service_quote_usd',c.service_quote_usd??'','number')}${field('书面服务范围／报价文件参考','coord_quote_scope',c.quote_scope||'','textarea',true)}</div><div class="notice">配置服务费：${formatServiceFee(config)} USD。医疗与行程费由客户另付。此处仅记录内部服务报价，不代表客户已签约、付款或医院已接诊。</div></section>`;
}
export function coordinationFromForm(form){
 const f=new FormData(form),result={tasks:{}};
 for(const key of Object.keys(taskLabels))result.tasks[key]=f.has('task_'+key);
 for(const key of ['next_action','next_action_on','hospital_state','hospital_id','appointment_on','appointment_time','campus','confirmation_reference','quote_scope'])result[key]=String(f.get('coord_'+key)||'').trim();
 const quote=f.get('coord_service_quote_usd');result.service_quote_usd=quote===''?null:Number(quote);
 return result;
}
export function bindCoordinationValidation(form,catalog){
 const confirmed=()=>{const active=form.elements.coord_hospital_state.value==='confirmed';for(const key of ['hospital_id','appointment_on','appointment_time','campus','confirmation_reference'])form.elements['coord_'+key].required=active;};
 form.elements.coord_hospital_state.addEventListener('change',confirmed);confirmed();
 const quote=form.elements.coord_service_quote_usd,original=quote.value,minimum=catalog.service_config.service_fee_min??catalog.service_config.service_fee,maximum=catalog.service_config.service_fee;
 quote.min='.01';quote.max='1000000';quote.step='.01';
 const scope=()=>{form.elements.coord_quote_scope.required=quote.value!=='';const changed=quote.value!==''&&Number(quote.value)!==Number(original||0);quote.setCustomValidity(changed&&(Number(quote.value)<minimum||Number(quote.value)>maximum)?'新报价须在当前配置的服务费区间内；历史报价不修改时可保留。':'');};quote.addEventListener('input',scope);scope();
}
export function operationsQueue(leads,today=todayInChina()){
 return leads.filter(lead=>!['closed','archived'].includes(lead.status)).map(lead=>{
  const plan=lead.body.coordination||{};return {lead,due:plan.next_action_on||'',action:plan.next_action||'',overdue:!!plan.next_action_on&&plan.next_action_on<today,done:Object.values(plan.tasks||{}).filter(v=>v===true).length};
 }).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
}
export function operationsPage(el,leads){
 const queue=operationsQueue(leads),today=todayInChina();
 el.innerHTML=`<div class="admin-top"><div><span class="eyebrow">AVENLIO CARE / COORDINATION</span><h1>协调工作台</h1><p>按北京时间跟进；这里不会自动向客户或医院发送提醒。</p></div></div><div class="stats">${[['进行中',queue.length],['已逾期',queue.filter(x=>x.overdue).length],['今日跟进',queue.filter(x=>x.due===today).length],['尚未安排日期',queue.filter(x=>!x.due).length]].map(([label,n])=>`<div class="stat"><span>${label}</span><strong>${n}</strong></div>`).join('')}</div><div class="table-wrap operations-queue"><table><thead><tr><th>咨询／客户</th><th>状态／负责人</th><th>下一行动</th><th>跟进日期</th><th>完成事项</th><th></th></tr></thead><tbody>${queue.map(({lead,due,action,overdue,done})=>`<tr><td><strong>${esc(lead.body.name)}</strong><small>${esc(lead.id)}</small></td><td>${esc(statusLabels[lead.status])}<small>${esc(lead.body.assigned_to||'未分配')}</small></td><td>${esc(action||'尚未填写')}</td><td class="${overdue?'task-late':''}">${esc(due||'待安排')}${overdue?'<small>已逾期</small>':''}</td><td>${done} / 7</td><td><button class="text-button" data-lead="${esc(lead.id)}">打开跟进 →</button></td></tr>`).join('')||'<tr><td colspan="6">暂无进行中的咨询。</td></tr>'}</tbody></table></div>`;
}
export function qualityIssues(catalog,today=todayInChina()){
 const end=Date.parse(today+'T12:00:00Z'),issues=[];
 for(const group of ['hospitals','departments','experts'])for(const record of catalog[group]){
  const age=Math.floor((end-Date.parse(record.verified_on+'T12:00:00Z'))/86400000);
  const reasons=[];if(record.verification_status==='historical_needs_update')reasons.push('历史资料待更新');if(!Number.isFinite(age)||age>90)reasons.push('核查日期超过90天或无效');if(record.published===false)reasons.push('草稿／已下架');
  if(reasons.length)issues.push({group,record,reasons,age});
 }
 return issues;
}
export function qualityPage(el,catalog,onEdit){
 const issues=qualityIssues(catalog),unknown=catalog.hospitals.filter(h=>h.published!==false&&['current_booking_status','international_access_status','english_service_status'].some(key=>h[key]!=='confirmed')).length;
 el.innerHTML=`<div class="admin-top"><div><span class="eyebrow">AVENLIO CARE / SOURCES</span><h1>资料核查</h1><p>90天为内部复核阈值，不代表医疗质量认证；医院网页已阅读也不等于当前号源或外籍患者接诊已确认。</p></div></div><div class="stats"><div class="stat"><span>待复核条目</span><strong>${issues.length}</strong></div><div class="stat"><span>接诊／语言／号源仍需逐案确认的医院</span><strong>${unknown}</strong></div></div><div class="table-wrap"><table><thead><tr><th>条目</th><th>核查日期</th><th>原因</th><th></th></tr></thead><tbody>${issues.map(({group,record,reasons})=>`<tr><td><strong>${esc(record.name_zh)}</strong><small>${esc(record.id)}</small></td><td>${esc(record.verified_on)}</td><td>${esc(reasons.join('；'))}</td><td><button class="text-button" data-quality-group="${group}" data-quality-id="${esc(record.id)}">编辑核查 →</button></td></tr>`).join('')||'<tr><td colspan="4">当前没有超过复核阈值的条目。仍需逐案确认实际接诊安排。</td></tr>'}</tbody></table></div>`;
 el.querySelectorAll('[data-quality-id]').forEach(button=>button.addEventListener('click',()=>onEdit(button.dataset.qualityGroup,button.dataset.qualityId)));
}
