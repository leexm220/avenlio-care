"""Published directory and conservative, evidence-based candidate retrieval."""
from copy import deepcopy
from datetime import date
from urllib.parse import urlparse
import re


def public_catalog(data):
    d=deepcopy(data)
    d['hospitals']=[x for x in d['hospitals'] if x.get('published',True)]
    hs={x['id'] for x in d['hospitals']}
    d['departments']=[x for x in d['departments'] if x.get('published',True) and x['hospital_id'] in hs]
    ds={x['id'] for x in d['departments']}
    d['experts']=[x for x in d['experts'] if x.get('published',True) and x['department_id'] in ds]
    used={s for group in ('hospitals','departments','experts') for x in d[group] for s in x['source_ids']}
    d['sources']=[{k:v for k,v in s.items() if k not in ('capture_file',)} for s in d['sources'] if s['id'] in used]
    d.pop('matching_policy',None)
    return d


def validate_catalog(d):
    if not isinstance(d,dict):raise ValueError('Expected a directory object')
    if not isinstance(d.get('specialties'),dict) or not d['specialties']:raise ValueError('Specialty classifications are required')
    for key,label in d['specialties'].items():
        if not re.fullmatch(r'[a-z0-9_-]{1,80}',key) or not isinstance(label,str) or not label.strip() or len(label)>120:raise ValueError('Invalid specialty classification')
    for group in ('hospitals','departments','experts','sources','topics'):
        if not isinstance(d.get(group),list) or len(d[group])>2000:
            raise ValueError('Invalid directory collection: '+group)
        ids=[x.get('id') for x in d[group]]
        if len(set(ids))!=len(ids) or any(not isinstance(x,str) or not re.fullmatch(r'[a-z0-9_-]{1,80}',x) for x in ids):
            raise ValueError('IDs must be unique letters, numbers, underscores or hyphens: '+group)
    source_ids={x['id'] for x in d['sources']}
    hs={x['id'] for x in d['hospitals']}; ds={x['id'] for x in d['departments']}
    topics={x['id'] for x in d['topics']}
    for t in d['topics']:
        if t.get('specialty_key') not in d['specialties'] or not isinstance(t.get('label_en'),str) or not t['label_en'].strip():raise ValueError('Invalid condition mapping')
    for s in d['sources']:
        u=urlparse(s.get('url',''))
        if u.scheme not in ('http','https') or not u.netloc or u.username or u.password:
            raise ValueError('Source URLs must be public HTTP(S) addresses')
        date.fromisoformat(s.get('retrieved_on',''))
        if s.get('published_on'): date.fromisoformat(s['published_on'])
    for group in ('hospitals','departments','experts'):
        for x in d[group]:
            if not str(x.get('name_zh','')).strip() or not str(x.get('name_en','')).strip():
                raise ValueError('Chinese and English names are required')
            if not x.get('source_ids') or not set(x['source_ids'])<=source_ids:
                raise ValueError('Every entry requires an existing official source')
            date.fromisoformat(x.get('verified_on',''))
            if x['verified_on']>date.today().isoformat(): raise ValueError('Verification date cannot be in the future')
            if x.get('verification_status')=='historical_needs_update' and x.get('match_eligible'):
                raise ValueError('Historical entries cannot be eligible for matching')
            if group=='hospitals' and x.get('city') not in ('Beijing','Tianjin'): raise ValueError('City must be Beijing or Tianjin')
            if group=='hospitals':
                if not isinstance(x.get('specialty_keys'),list) or not set(x['specialty_keys'])<=set(d['specialties']):raise ValueError('Invalid hospital specialty keys')
                u=urlparse(x.get('website',''))
                if u.scheme not in ('http','https') or not u.netloc:raise ValueError('Invalid hospital website')
                if x.get('hospital_grade')=='tertiary_a':
                    if not x.get('grade_source_ids') or not set(x['grade_source_ids'])<=set(x['source_ids']):
                        raise ValueError('Grade A hospitals require an attached official grade source')
                    date.fromisoformat(x.get('grade_verified_on',''))
                    if x['grade_verified_on']>date.today().isoformat():raise ValueError('Grade verification date cannot be in the future')
            if group=='departments' and x.get('hospital_id') not in hs: raise ValueError('Department hospital is missing')
            if group=='departments' and x.get('specialty_key') not in d['specialties']:raise ValueError('Department specialty is missing')
            if group=='experts' and (x.get('department_id') not in ds or not set(x.get('topic_keys',[]))<=topics):
                raise ValueError('Expert department or condition codes are invalid')
    f=d['service_config']
    if f.get('currency')!='USD' or not isinstance(f.get('service_fee'),(int,float)) or not 0<f['service_fee']<=1000000:
        raise ValueError('Invalid USD service fee')
    lower=f.get('service_fee_min',f['service_fee'])
    if not isinstance(lower,(int,float)) or isinstance(lower,bool) or not 0<lower<=f['service_fee']:
        raise ValueError('Service fee minimum must be positive and no greater than the maximum')
    if f.get('price_type')!='service_fee_only' or f.get('medical_cost_included') or f.get('travel_cost_included'):
        raise ValueError('Medical and travel costs must remain separate from the service fee')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',f.get('contact_email','')): raise ValueError('Invalid contact email')


def match_candidates(req,data):
    d=public_catalog(data); sources={s['id']:s for s in d['sources']}
    response=dict(status='manual_review',candidates=[],pricing=d['service_config'],
                  notice='Directory options only. Clinical suitability and current appointments require hospital confirmation.')
    def stop(reason,status='manual_review'):
        return dict(response,reason=reason,status=status)
    if req.get('urgent') is True:
        return stop('Please seek local urgent or emergency care instead of waiting for overseas coordination.','urgent_care')
    basis=req.get('routing_basis')
    if basis not in ('prior_diagnosis','clinician_recommended_specialty'):
        return stop('Symptoms alone do not identify a specialty. A coordinator can help you prepare for an appropriate clinical assessment.')
    keys=req.get('topic_keys',[])
    if not isinstance(keys,list) or len(keys)>1 or any(not isinstance(k,str) for k in keys):
        return stop('Multiple or unclear diagnoses need review before selecting a specialty.')
    topic=next((t for t in d['topics'] if keys and t['id']==keys[0]),None)
    if keys and not topic: return stop('This diagnosis is not yet covered by verified directory mappings.')
    if basis=='prior_diagnosis' and not topic: return stop('Please provide an existing clinician diagnosis or a clinician-recommended specialty.')
    specialty=req.get('specialty_key') or (topic['specialty_key'] if topic else None)
    if specialty not in d['specialties']: return stop('The specialty is missing or is not covered by this directory.')
    if topic and topic['specialty_key']!=specialty: return stop('The diagnosis and specialty require review together.')
    city=req.get('city','Either')
    if city not in ('Either','Beijing','Tianjin'): return stop('The initial directory covers Beijing and Tianjin.')
    active_ds=[x for x in d['departments'] if x.get('match_eligible') and x['specialty_key']==specialty]
    # Automatic selection requires recently checked profiles; browsing still shows dated records.
    fresh=lambda x:(date.today()-date.fromisoformat(x['verified_on'])).days<=90
    active_ds=[x for x in active_ds if fresh(x)]
    es=[e for e in d['experts'] if topic and topic['id'] in e.get('topic_keys',[]) and fresh(e)]
    if topic: active_ds=[x for x in active_ds if x['id'] in {e['department_id'] for e in es}]
    hs={x['hospital_id'] for x in active_ds}
    for h in sorted(d['hospitals'],key=lambda x:x['name_en']):
        if h.get('verification_status')=='historical_needs_update' or not fresh(h): continue
        if city!='Either' and h['city']!=city: continue
        if h['id'] not in hs and not (not topic and specialty in h['specialty_keys'] and h['id'] not in {x['hospital_id'] for x in d['departments'] if not x.get('match_eligible')}): continue
        departments=[x for x in active_ds if x['hospital_id']==h['id']]
        experts=[x for x in es if x['department_id'] in {x['id'] for x in departments}]
        sid=list(dict.fromkeys(h['source_ids']+[s for e in experts for s in e['source_ids']]))
        response['candidates'].append(dict(hospital=h,departments=departments,experts=experts,
            reason=f'Official profile scope includes {topic["label_en"]}.' if topic else 'The directory describes the specialty recommended by your clinician.',
            sources=[sources[s] for s in sid if s in sources],
            needs_confirmation=['Clinical and subspecialty suitability','Current doctor affiliation and appointments','Visit campus and foreign-patient registration','Language support and actual medical charges']))
    response['candidates']=response['candidates'][:3]
    if not response['candidates']: return stop('No verified option is currently covered for this selection. We can review your request; this does not mean no suitable care exists.')
    response['status']='directory_candidates'
    response['reason']='Alphabetical directory order, not a clinical ranking.'
    return response
