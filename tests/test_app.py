import copy,json,sqlite3,time
from pathlib import Path
import pytest
from cryptography.fernet import Fernet
from werkzeug.security import generate_password_hash
from backend.app import create_app,CONSENT_VERSION

PASSWORD='Synthetic-test-password-only-2026'
@pytest.fixture
def env(tmp_path):
    app=create_app(dict(TESTING=True,DATA_DIR=str(tmp_path),DATA_KEY=Fernet.generate_key(),ADMIN_HASH=generate_password_hash(PASSWORD),TRUSTED_HOSTS=['localhost'],ADMIN_EMAIL='admin@example.test'))
    return app,app.test_client(),tmp_path

def login(c):
    r=c.post('/api/admin/login',json=dict(email='admin@example.test',password=PASSWORD));assert r.status_code==200
    return {'X-CSRF-Token':r.json['csrf']}

def inquiry(c):
    return dict(name='Synthetic QA Patient',email='qa@example.test',symptoms='Synthetic cataract care inquiry; not a real patient',
        progress='Synthetic test only',tests_opinions='Synthetic test findings',needs=['accompaniment'],city='Tianjin',
        routing_basis='prior_diagnosis',topic_keys=['cataract'],consent_health=True,adult_or_guardian=True,consent_version=c.get("/api/health").json["consent_version"])

def test_public_surface_and_security_headers(env):
    _,c,_=env
    assert c.get('/').status_code==200
    assert c.get('/admin').status_code==200
    r=c.get('/api/catalog');assert r.status_code==200
    assert len(r.json['hospitals'])==9
    assert r.json['service_config']['service_fee']==10000
    assert r.json['service_config']['medical_estimate'] is None
    assert 'X-Frame-Options' in r.headers
    for path in ['/api/admin/inquiries','/api/admin/catalog','/api/admin/settings','/api/admin/audit','/api/admin/export/catalog']:
        assert c.get(path).status_code==401
    for path in ['/.env','/runtime/care.sqlite3','/admin-access.txt','/data/catalog.seed.json']:
        assert c.get(path).status_code==404

def test_match_no_diagnosis_fabrication_or_wrong_expert(env):
    _,c,_=env
    assert c.post('/api/match',json={'symptoms':'headache'}).json['status']=='manual_review'
    r=c.post('/api/match',json=dict(routing_basis='prior_diagnosis',topic_keys=['hallux_valgus'],city='Tianjin')).json
    assert r['status']=='directory_candidates'
    assert [e['id'] for h in r['candidates'] for e in h['experts']]==['wan_dongdong']
    assert c.post('/api/match',json=dict(routing_basis='clinician_recommended_specialty',specialty_key='endocrinology',city='Tianjin')).json['candidates']==[]
    assert c.post('/api/match',json=dict(routing_basis='prior_diagnosis',topic_keys=['cataract'],specialty_key='neurosurgery')).json['status']=='manual_review'
    assert c.post('/api/match',json=dict(urgent=True)).json['status']=='urgent_care'

def test_consent_validation_and_cross_origin(env):
    _,c,_=env
    d=inquiry(c);d['consent_health']=False
    assert c.post('/api/inquiries',json=d).status_code==400
    d=inquiry(c);d['consent_version']='old'
    assert c.post('/api/inquiries',json=d).status_code==400
    assert c.post('/api/inquiries',json=inquiry(c),headers={'Origin':'https://untrusted.example'}).status_code==403
    d=inquiry(c);d['email']='bad'
    assert c.post('/api/inquiries',json=d).status_code==400
    d=inquiry(c);d['needs']=['bad']
    assert c.post('/api/inquiries',json=d).status_code==400

def test_submit_encrypt_follow_up_and_erasure(env):
    _,c,p=env
    r=c.post('/api/inquiries',json=inquiry(c));assert r.status_code==201
    ident=r.json['id'];h=login(c)
    rows=c.get('/api/admin/inquiries').json['items'];assert rows[0]['body']['email']=='qa@example.test'
    assert rows[0]['body']['candidate_hospital_ids']==['tj_eye']
    with sqlite3.connect(p/'care.sqlite3') as con:
        raw=con.execute('SELECT body FROM leads WHERE id=?',(ident,)).fetchone()[0]
        assert b'qa@example.test' not in raw and b'cataract' not in raw
        logs=str(con.execute('SELECT action,target FROM audits').fetchall())
        assert 'qa@example.test' not in logs and 'Synthetic QA Patient' not in logs
    change=dict(status='contacted',assigned_to='QA Coordinator',notes='Synthetic private note',version=rows[0]['version'])
    assert c.patch('/api/admin/inquiries/'+ident,json=change).status_code==403
    assert c.patch('/api/admin/inquiries/'+ident,json=change,headers=h).status_code==200
    assert c.patch('/api/admin/inquiries/'+ident,json=change,headers=h).status_code==409
    assert c.get('/api/admin/inquiries').json['items'][0]['body']['notes']=='Synthetic private note'
    assert c.delete('/api/admin/inquiries/'+ident,json={'confirmation':'wrong'},headers=h).status_code==400
    assert c.delete('/api/admin/inquiries/'+ident,json={'confirmation':ident},headers=h).status_code==200
    assert c.get('/api/admin/inquiries').json['items']==[]

def test_catalog_crud_visibility_sources_and_conflict(env):
    _,c,_=env;h=login(c);base=c.get('/api/admin/catalog').json;d=base['catalog']
    x=copy.deepcopy(d['hospitals'][0]);x.update(id='qa_hospital',name_zh='合成测试医院',name_en='Synthetic Test Hospital',published=False)
    d['hospitals'].append(x)
    assert c.put('/api/admin/catalog',json={'catalog':d,'version':base['version']},headers=h).status_code==200
    assert len(c.get('/api/catalog').json['hospitals'])==9
    assert c.put('/api/admin/catalog',json={'catalog':d,'version':base['version']},headers=h).status_code==409
    base=c.get('/api/admin/catalog').json;d=base['catalog'];d['hospitals'][-1]['published']=True
    assert c.put('/api/admin/catalog',json={'catalog':d,'version':base['version']},headers=h).status_code==200
    assert len(c.get('/api/catalog').json['hospitals'])==10
    base=c.get('/api/admin/catalog').json;d=base['catalog'];d['experts'][0]['source_ids']=[]
    assert c.put('/api/admin/catalog',json={'catalog':d,'version':base['version']},headers=h).status_code==400
    base=c.get('/api/admin/catalog').json;d=base['catalog'];d['sources'][0]['url']='javascript:alert(1)'
    assert c.put('/api/admin/catalog',json={'catalog':d,'version':base['version']},headers=h).status_code==400

def test_pause_settings_fee_snapshot_and_password_revoke(env):
    _,c,_=env;h=login(c)
    assert c.post('/api/inquiries',json=inquiry(c)).status_code==201
    base=c.get('/api/admin/catalog').json;d=base['catalog'];d['service_config']['service_fee']=12000
    assert c.put('/api/admin/catalog',json={'catalog':d,'version':base['version']},headers=h).status_code==200
    assert c.get('/api/admin/inquiries').json['items'][0]['body']['service_fee_at_submission']==10000
    s=c.get('/api/admin/settings').json;s['intake_enabled']=False
    assert c.put('/api/admin/settings',json=s,headers=h).status_code==200
    assert c.post('/api/inquiries',json=inquiry(c)).status_code==503
    assert c.post('/api/admin/password',json={'current_password':PASSWORD,'new_password':'New-Synthetic-Password-Long'},headers=h).status_code==200
    assert c.get('/api/admin/inquiries').status_code==401
    assert c.post('/api/admin/login',json=dict(email='admin@example.test',password=PASSWORD)).status_code==401

def test_login_throttling(env):
    _,c,_=env
    for _ in range(8):assert c.post('/api/admin/login',json=dict(email='admin@example.test',password='wrong')).status_code==401
    assert c.post('/api/admin/login',json=dict(email='admin@example.test',password='wrong')).status_code==429

def test_retention_clears_expired_records_and_archiving_preserves_active(env):
    _,c,p=env
    ident=c.post('/api/inquiries',json=inquiry(c)).json['id'];h=login(c)
    row=c.get('/api/admin/inquiries').json['items'][0]
    assert c.patch('/api/admin/inquiries/'+ident,json=dict(status='archived',assigned_to='',notes='',version=row['version']),headers=h).status_code==200
    assert c.get('/api/admin/inquiries').json['items'][0]['status']=='archived'
    with sqlite3.connect(p/'care.sqlite3') as con:con.execute('UPDATE leads SET created=?',(time.time()-91*86400,))
    assert c.get('/api/admin/inquiries').json['items']==[]

def test_privacy_change_requires_current_consent(env):
    _,c,_=env;d=inquiry(c);h=login(c)
    s=c.get('/api/admin/settings').json;s['retention_days']=30
    assert c.put('/api/admin/settings',json=s,headers=h).status_code==200
    assert c.post('/api/inquiries',json=d).status_code==400
    d['consent_version']=c.get('/api/health').json['consent_version']
    assert c.post('/api/inquiries',json=d).status_code==201

def test_https_reverse_proxy_configuration(env):
    app,_,p=env
    secure=create_app(dict(TESTING=True,DATA_DIR=str(p),DATA_KEY=app.config['DATA_KEY'],ADMIN_HASH=generate_password_hash(PASSWORD),
        SECURE_COOKIE=True,TRUST_PROXY=True,TRUSTED_HOSTS=['localhost'],ADMIN_EMAIL='admin@example.test'))
    c=secure.test_client()
    assert c.get('/api/health').status_code==400
    r=c.post('/api/admin/login',json=dict(email='admin@example.test',password=PASSWORD),
        headers={'X-Forwarded-Proto':'https','Origin':'https://localhost'})
    assert r.status_code==200
    cookie=r.headers['Set-Cookie']
    assert 'Secure' in cookie and 'HttpOnly' in cookie and 'SameSite=Strict' in cookie

def test_extend_taxonomy_without_fabricated_specialist(env):
    _,c,_=env;h=login(c);base=c.get('/api/admin/catalog').json;d=base['catalog']
    d['specialties']['cardiology']='Cardiology'
    d['topics'].append(dict(id='qa_uncovered_condition',label_en='Synthetic uncovered condition',specialty_key='cardiology',evidence_expert_ids=[]))
    assert c.put('/api/admin/catalog',json={'catalog':d,'version':base['version']},headers=h).status_code==200
    assert c.post('/api/match',json=dict(routing_basis='prior_diagnosis',topic_keys=['qa_uncovered_condition'])).json['candidates']==[]
    base=c.get('/api/admin/catalog').json;d=base['catalog'];d['topics'][-1]['specialty_key']='nonexistent'
    assert c.put('/api/admin/catalog',json={'catalog':d,'version':base['version']},headers=h).status_code==400
