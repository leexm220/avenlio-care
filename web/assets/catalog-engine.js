// The GitHub Pages preview can retrieve candidates from public information only.
// No symptoms, contact data or medical records are stored in the browser.
export function matchCandidates(req,d){
 const out={status:'manual_review',candidates:[],pricing:d.service_config};
 const stop=(reason,status='manual_review')=>({...out,reason,status});
 if(req.urgent===true)return stop('Please seek local urgent or emergency care instead of waiting for overseas coordination.','urgent_care');
 if(!['prior_diagnosis','clinician_recommended_specialty'].includes(req.routing_basis))return stop('Symptoms alone do not identify a specialty. A coordinator can help you prepare for an appropriate clinical assessment.');
 const keys=req.topic_keys||[];
 if(!Array.isArray(keys)||keys.length>1||keys.some(x=>typeof x!=='string'))return stop('Multiple or unclear diagnoses need review before selecting a specialty.');
 const topic=d.topics.find(x=>keys.length&&x.id===keys[0]);
 if(keys.length&&!topic)return stop('This diagnosis is not yet covered by verified directory mappings.');
 if(req.routing_basis==='prior_diagnosis'&&!topic)return stop('Please provide an existing clinician diagnosis or a clinician-recommended specialty.');
 const specialty=req.specialty_key||topic?.specialty_key;
 if(!d.specialties[specialty])return stop('The specialty is missing or is not covered by this directory.');
 if(topic&&topic.specialty_key!==specialty)return stop('The diagnosis and specialty require review together.');
 const city=req.city||'Either';if(!['Either','Beijing','Tianjin'].includes(city))return stop('The initial directory covers Beijing and Tianjin.');
 const fresh=x=>(Date.now()-Date.parse(x.verified_on+'T00:00:00Z'))/86400000<=90;
 let deps=d.departments.filter(x=>x.match_eligible&&x.specialty_key===specialty&&fresh(x));
 const experts=d.experts.filter(e=>topic&&e.topic_keys.includes(topic.id)&&fresh(e));
 if(topic)deps=deps.filter(x=>experts.some(e=>e.department_id===x.id));
 const hs=new Set(deps.map(x=>x.hospital_id));
 for(const h of [...d.hospitals].sort((a,b)=>a.name_en.localeCompare(b.name_en,'en'))){
  if(h.verification_status==='historical_needs_update'||!fresh(h)||(city!=='Either'&&h.city!==city))continue;
  if(!hs.has(h.id)&&!(!topic&&h.specialty_keys.includes(specialty)&&!d.departments.some(x=>x.hospital_id===h.id&&!x.match_eligible)))continue;
  const ds=deps.filter(x=>x.hospital_id===h.id),es=experts.filter(x=>ds.some(y=>y.id===x.department_id));
  const ids=new Set([...h.source_ids,...es.flatMap(x=>x.source_ids)]);
  out.candidates.push({hospital:h,departments:ds,experts:es,reason:topic?`Official profile scope includes ${topic.label_en}.`:'The directory describes the specialty recommended by your clinician.',sources:d.sources.filter(s=>ids.has(s.id)),needs_confirmation:['Clinical and subspecialty suitability','Current doctor affiliation and appointments','Visit campus and foreign-patient registration','Language support and actual medical charges']});
 }
 out.candidates=out.candidates.slice(0,3);
 if(!out.candidates.length)return stop('No verified option is currently covered for this selection. We can review your request; this does not mean no suitable care exists.');
 return {...out,status:'directory_candidates',reason:'Alphabetical directory order, not a clinical ranking.'};
}
