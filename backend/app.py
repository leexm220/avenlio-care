from __future__ import annotations
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from datetime import datetime,timezone
from functools import wraps
from pathlib import Path
from urllib.parse import urlparse
from cryptography.fernet import Fernet
from flask import Flask,request,jsonify,send_from_directory,g,abort,redirect
from werkzeug.security import check_password_hash,generate_password_hash
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from .catalog import public_catalog,validate_catalog,match_candidates

ROOT=Path(__file__).resolve().parents[1]
STATUSES=('new','contacted','awaiting_materials','awaiting_hospital_confirmation','closed','archived')
CONSENT_VERSION='2026-10-26-v1'
LANGUAGES=('zh','en','fr','ja','ko','hi','th','id')


def load_env():
    env=ROOT/'.env'
    if env.exists():
        for line in env.read_text().splitlines():
            if line and not line.startswith('#') and '=' in line:
                k,v=line.split('=',1);os.environ.setdefault(k,v)


def create_app(overrides=None):
    load_env()
    app=Flask(__name__,static_folder=None)
    app.config.update(DATA_DIR=os.environ.get('CCW_DATA_DIR',str(ROOT/'runtime')),
        DATA_KEY=os.environ.get('CCW_DATA_KEY'),ADMIN_HASH=os.environ.get('CCW_ADMIN_HASH'),
        ADMIN_EMAIL=os.environ.get('CCW_ADMIN_EMAIL','leexm220@gmail.com'),
        SECURE_COOKIE=os.environ.get('CCW_SECURE_COOKIE','0')=='1',
        TRUST_PROXY=os.environ.get('CCW_TRUST_PROXY','0')=='1',
        TRUSTED_HOSTS=os.environ.get('CCW_HOSTS','localhost,127.0.0.1').split(','),
        INTAKE_ENABLED=os.environ.get('CCW_INTAKE_ENABLED','1')=='1',MAX_CONTENT_LENGTH=512*1024)
    if overrides: app.config.update(overrides)
    if app.config['TRUST_PROXY']:
        app.wsgi_app=ProxyFix(app.wsgi_app,x_for=1,x_proto=1)
    if not app.config['DATA_KEY'] or not app.config['ADMIN_HASH']:
        raise RuntimeError('Run python scripts/setup.py before starting; no default credentials are provided.')
    cipher=Fernet(app.config['DATA_KEY'])
    directory=Path(app.config['DATA_DIR']);directory.mkdir(parents=True,exist_ok=True);directory.chmod(0o700)
    dbpath=directory/'care.sqlite3'
    def db():
        if 'db' not in g:
            g.db=sqlite3.connect(dbpath,timeout=15);g.db.row_factory=sqlite3.Row
            g.db.execute('PRAGMA foreign_keys=ON')
        return g.db
    @app.teardown_appcontext
    def close_db(exc):
        if 'db' in g: g.db.close()
    with app.app_context():
        db().executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS catalog(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,created REAL NOT NULL,updated REAL NOT NULL,status TEXT NOT NULL,body BLOB NOT NULL,version INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS audits(id INTEGER PRIMARY KEY,created REAL NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,started REAL NOT NULL,n INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS credentials(id INTEGER PRIMARY KEY CHECK(id=1),password_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS inquiry_requests(request_key TEXT PRIMARY KEY,lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,body_hash TEXT NOT NULL);
        ''')
        seed=json.loads((ROOT/'data/catalog.seed.json').read_text())
        for group in ('hospitals','departments','experts'):
            for x in seed[group]: x['published']=True
        db().execute('INSERT OR IGNORE INTO catalog VALUES(1,1,?)',(json.dumps(seed),))
        settings=dict(service_scope='Service scope, delivery period and accompaniment days will be agreed in writing before payment.',
            cancellation_policy='Cancellation and refund terms will be provided in the individual service agreement before payment.',
            operator_name='Avenlio Care',retention_days=90,intake_enabled=app.config['INTAKE_ENABLED'])
        db().execute('INSERT OR IGNORE INTO settings VALUES(1,?)',(json.dumps(settings),))
        # Migrate the previous stock brand without replacing an operator's customized identity.
        stored_settings=json.loads(db().execute('SELECT body FROM settings WHERE id=1').fetchone()[0])
        if stored_settings.get('operator_name')=='China Care Wayfinder':
            stored_settings['operator_name']='Avenlio Care'
            db().execute('UPDATE settings SET body=? WHERE id=1',(json.dumps(stored_settings),))
        db().execute('INSERT OR IGNORE INTO credentials VALUES(1,?)',(app.config['ADMIN_HASH'],));db().commit()
    dbpath.chmod(0o600)

    def catalog():
        r=db().execute('SELECT version,body FROM catalog WHERE id=1').fetchone()
        return r['version'],json.loads(r['body'])
    def settings(): return json.loads(db().execute('SELECT body FROM settings WHERE id=1').fetchone()[0])
    def consent_version():
        s=settings()
        policy=json.dumps({k:s[k] for k in ('operator_name','retention_days')},sort_keys=True)
        return CONSENT_VERSION+'-'+hashlib.sha256(policy.encode()).hexdigest()[:12]
    def encrypt(x): return cipher.encrypt(json.dumps(x,ensure_ascii=False).encode())
    def decrypt(x): return json.loads(cipher.decrypt(x))
    def audit(action,target=''):
        db().execute('INSERT INTO audits(created,action,target) VALUES(?,?,?)',(time.time(),action,target));db().commit()
    def limit(bucket,max_count,period):
        # HMAC the address. Never store raw IPs, health text or contact details in rate-limit keys.
        address=request.remote_addr or 'unknown'
        key=hmac.new(app.config['DATA_KEY'].encode() if isinstance(app.config['DATA_KEY'],str) else app.config['DATA_KEY'],(bucket+address).encode(),hashlib.sha256).hexdigest()
        now=time.time()
        db().execute('DELETE FROM rate_limits WHERE started<?',(now-86400,))
        db().execute('INSERT INTO rate_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET n=CASE WHEN started<? THEN 1 ELSE n+1 END,started=CASE WHEN started<? THEN excluded.started ELSE started END',(key,now,now-period,now-period))
        n=db().execute('SELECT n FROM rate_limits WHERE key=?',(key,)).fetchone()[0];db().commit()
        if n>max_count: abort(429,description='Too many requests. Please try again later.')
    def body():
        if not request.is_json: abort(415,description='JSON is required')
        d=request.get_json()
        if not isinstance(d,dict): abort(400,description='Expected a JSON object')
        return d
    def same_origin():
        origin=request.headers.get('Origin')
        if origin and origin!=request.host_url.rstrip('/'):
            abort(403,description='Cross-origin request rejected')
    def auth(fn):
        @wraps(fn)
        def wrapped(*args,**kwargs):
            token=request.cookies.get('ccw_session','')
            row=db().execute('SELECT * FROM sessions WHERE token_hash=? AND expires>?',(hashlib.sha256(token.encode()).hexdigest(),time.time())).fetchone()
            if not row: abort(401,description='Please sign in')
            if request.method not in ('GET','HEAD'):
                same_origin()
                if not secrets.compare_digest(request.headers.get('X-CSRF-Token',''),row['csrf']): abort(403,description='Invalid CSRF token')
            g.admin_session=row
            return fn(*args,**kwargs)
        return wrapped

    @app.before_request
    def expire_records():
        if request.path.startswith('/api/'):
            if app.config['SECURE_COOKIE'] and not request.is_secure:
                abort(400,description='HTTPS is required')
            cutoff=time.time()-settings()['retention_days']*86400
            deleted=db().execute('DELETE FROM leads WHERE created<?',(cutoff,)).rowcount
            if deleted:db().execute('INSERT INTO audits(created,action,target) VALUES(?,?,?)',(time.time(),'retention_cleanup',str(deleted)))
            db().commit()

    @app.after_request
    def headers(r):
        r.headers.update({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
            'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
            'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"})
        if request.path.startswith('/api/') or request.path.startswith('/admin'): r.headers['Cache-Control']='no-store'
        if app.config['SECURE_COOKIE']:r.headers['Strict-Transport-Security']='max-age=31536000'
        return r
    @app.errorhandler(HTTPException)
    def http_error(e):return jsonify(error=e.description),e.code
    @app.errorhandler(ValueError)
    def bad_input(e):return jsonify(error=str(e)),400

    @app.get('/api/health')
    def health():return jsonify(ok=True,mode='server',intake_enabled=settings()['intake_enabled'],consent_version=consent_version())
    @app.get('/api/catalog')
    def read_catalog():
        _,d=catalog();r=public_catalog(d);r['site_settings']=settings();return jsonify(r)
    @app.post('/api/match')
    def match():
        limit('match',120,600);_,d=catalog();return jsonify(match_candidates(body(),d))
    @app.post('/api/inquiries')
    def submit():
        same_origin();limit('inquiry',8,3600)
        if not settings()['intake_enabled']:abort(503,description='Online inquiries are currently paused.')
        d=body()
        if d.get('website'):abort(400,description='Unable to process request')
        language=d.get('preferred_language','en')
        if language not in LANGUAGES:raise ValueError('Invalid preferred language')
        request_key=d.get('request_id')
        if request_key is not None and (not isinstance(request_key,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{20,80}',request_key)):
            raise ValueError('Invalid request ID')
        # A retry after a lost response returns the original receipt without creating a second case.
        # HMAC prevents low-entropy medical fields being exposed through a plain content hash.
        fingerprint={k:v for k,v in d.items() if k not in ('request_id','preferred_language','consent_version')}
        secret=app.config['DATA_KEY'].encode() if isinstance(app.config['DATA_KEY'],str) else app.config['DATA_KEY']
        body_hash=hmac.new(secret,json.dumps(fingerprint,sort_keys=True).encode(),hashlib.sha256).hexdigest()
        if request_key:
            prior=db().execute('SELECT lead_id,body_hash FROM inquiry_requests WHERE request_key=?',(request_key,)).fetchone()
            if prior:
                if not secrets.compare_digest(prior['body_hash'],body_hash):abort(409,description='Request ID was already used for different information')
                return jsonify(id=prior['lead_id'],status='received'),201
        if d.get('consent_health') is not True or d.get('consent_version')!=consent_version():
            abort(400,description='Please review and accept the current health-information notice.')
        if d.get('adult_or_guardian') is not True:abort(400,description='An adult patient or a parent/legal guardian must submit this request.')
        fields={'name':120,'email':254,'phone':80,'country':100,'timezone':80,'symptoms':4000,'onset':300,
            'progress':4000,'known_diagnosis':2000,'tests_opinions':6000,'preferred_date':100,'other_need':2000}
        cleaned={}
        for key,maxlen in fields.items():
            v=d.get(key,'')
            if not isinstance(v,str) or len(v)>maxlen:raise ValueError('Invalid or overly long field: '+key)
            cleaned[key]=v.strip()
        if not cleaned['name'] or not cleaned['symptoms']:raise ValueError('Name and symptom summary are required')
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',cleaned['email']):raise ValueError('Please provide a valid email')
        needs=d.get('needs',[])
        if not isinstance(needs,list) or not needs or any(n not in ('accompaniment','surgical_evaluation','tests','translation','other') for n in needs):raise ValueError('Select a service need')
        if d.get('city') not in ('Either','Beijing','Tianjin'):raise ValueError('Invalid city')
        route={k:d.get(k) for k in ('routing_basis','topic_keys','specialty_key','city','urgent') if k in d}
        if route.get('urgent') is True:abort(400,description='Please seek local urgent care rather than submit an overseas care request.')
        _,cat=catalog();result=match_candidates(route,cat)
        cleaned.update(needs=needs,city=d['city'],routing=route,consent_version=consent_version(),consent_health=True,
            preferred_language=language,
            consent_at=datetime.now(timezone.utc).isoformat(),adult_or_guardian=True,
            service_fee_at_submission=cat['service_config']['service_fee'],currency='USD',medical_and_travel_excluded=True,
            candidate_hospital_ids=[x['hospital']['id'] for x in result['candidates']],assigned_to='',notes='')
        ident='CCW-'+secrets.token_hex(6).upper();now=time.time()
        try:
            db().execute('INSERT INTO leads(id,created,updated,status,body) VALUES(?,?,?,?,?)',(ident,now,now,'new',encrypt(cleaned)))
            if request_key:db().execute('INSERT INTO inquiry_requests VALUES(?,?,?)',(request_key,ident,body_hash))
            db().commit()
        except sqlite3.IntegrityError:
            db().rollback()
            prior=db().execute('SELECT lead_id,body_hash FROM inquiry_requests WHERE request_key=?',(request_key,)).fetchone()
            if not prior or not secrets.compare_digest(prior['body_hash'],body_hash):abort(409,description='Request ID was already used for different information')
            return jsonify(id=prior['lead_id'],status='received'),201
        audit('inquiry_created',ident)
        return jsonify(id=ident,status='received'),201

    @app.post('/api/admin/login')
    def login():
        same_origin();limit('login',8,900);d=body()
        hashed=db().execute('SELECT password_hash FROM credentials WHERE id=1').fetchone()[0]
        password=d.get('password','')
        if not isinstance(password,str) or len(password)>256 or not hmac.compare_digest(str(d.get('email','')).lower(),app.config['ADMIN_EMAIL'].lower()) or not check_password_hash(hashed,password):
            abort(401,description='Incorrect email or password')
        token=secrets.token_urlsafe(40);csrf=secrets.token_urlsafe(32)
        db().execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
        db().execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),csrf,time.time()+8*3600));db().commit()
        r=jsonify(email=app.config['ADMIN_EMAIL'],csrf=csrf)
        r.set_cookie('ccw_session',token,httponly=True,secure=app.config['SECURE_COOKIE'],samesite='Strict',max_age=8*3600,path='/')
        audit('admin_login');return r
    @app.get('/api/admin/session')
    @auth
    def admin_session():return jsonify(email=app.config['ADMIN_EMAIL'],csrf=g.admin_session['csrf'])
    @app.post('/api/admin/logout')
    @auth
    def logout():
        db().execute('DELETE FROM sessions WHERE token_hash=?',(g.admin_session['token_hash'],));db().commit()
        r=jsonify(ok=True);r.delete_cookie('ccw_session',path='/');return r
    @app.post('/api/admin/password')
    @auth
    def password():
        d=body();old=d.get('current_password','');new=d.get('new_password','')
        stored=db().execute('SELECT password_hash FROM credentials WHERE id=1').fetchone()[0]
        if not isinstance(old,str) or not isinstance(new,str) or not check_password_hash(stored,old):abort(400,description='Current password is incorrect')
        if len(new)<14 or len(new)>128:raise ValueError('Use a password of 14–128 characters')
        db().execute('UPDATE credentials SET password_hash=? WHERE id=1',(generate_password_hash(new),));db().execute('DELETE FROM sessions');db().commit()
        audit('password_changed');r=jsonify(ok=True);r.delete_cookie('ccw_session',path='/');return r
    @app.get('/api/admin/catalog')
    @auth
    def admin_catalog():
        version,d=catalog();return jsonify(version=version,catalog=d)
    @app.put('/api/admin/catalog')
    @auth
    def save_catalog():
        d=body();candidate=d.get('catalog');validate_catalog(candidate)
        for t in candidate['topics']:
            t['evidence_expert_ids']=[e['id'] for e in candidate['experts'] if t['id'] in e.get('topic_keys',[])]
        cur=db().execute('UPDATE catalog SET body=?,version=version+1 WHERE id=1 AND version=?',(json.dumps(candidate,ensure_ascii=False),d.get('version')))
        if cur.rowcount!=1:db().rollback();abort(409,description='Directory changed in another window. Reload before editing.')
        db().commit();audit('catalog_updated');return jsonify(version=catalog()[0])
    @app.get('/api/admin/inquiries')
    @auth
    def inquiries():
        out=[]
        for r in db().execute('SELECT * FROM leads ORDER BY created DESC LIMIT 1000'):
            x=dict(r);x['body']=decrypt(x['body']);out.append(x)
        audit('inquiries_read');return jsonify(items=out,statuses=STATUSES)
    @app.patch('/api/admin/inquiries/<ident>')
    @auth
    def update_inquiry(ident):
        d=body();r=db().execute('SELECT * FROM leads WHERE id=?',(ident,)).fetchone()
        if not r:abort(404)
        if d.get('status') not in STATUSES:raise ValueError('Invalid inquiry status')
        x=decrypt(r['body'])
        for k,maxlen in [('assigned_to',120),('notes',12000)]:
            if not isinstance(d.get(k,''),str) or len(d.get(k,''))>maxlen:raise ValueError('Invalid '+k)
            x[k]=d.get(k,'').strip()
        cur=db().execute('UPDATE leads SET body=?,status=?,updated=?,version=version+1 WHERE id=? AND version=?',
            (encrypt(x),d['status'],time.time(),ident,d.get('version')))
        if cur.rowcount!=1:db().rollback();abort(409,description='Inquiry changed. Reload before editing.')
        db().commit();audit('inquiry_updated',ident);return jsonify(ok=True)
    @app.delete('/api/admin/inquiries/<ident>')
    @auth
    def erase_inquiry(ident):
        if body().get('confirmation')!=ident:raise ValueError('Type the complete inquiry ID to confirm erasure')
        if db().execute('DELETE FROM leads WHERE id=?',(ident,)).rowcount!=1:abort(404)
        db().commit();audit('inquiry_erased',ident);return jsonify(ok=True)
    @app.get('/api/admin/settings')
    @auth
    def read_settings():return jsonify(settings())
    @app.put('/api/admin/settings')
    @auth
    def update_settings():
        d=body();s=settings()
        for k in ('service_scope','cancellation_policy','operator_name'):
            if not isinstance(d.get(k),str) or not d[k].strip() or len(d[k])>6000:raise ValueError('Invalid '+k)
            s[k]=d[k].strip()
        if not isinstance(d.get('retention_days'),int) or not 1<=d['retention_days']<=365:raise ValueError('Retention must be 1–365 days')
        if not isinstance(d.get('intake_enabled'),bool):raise ValueError('Intake setting must be boolean')
        s.update(retention_days=d['retention_days'],intake_enabled=d['intake_enabled'])
        if 'catalog' in d:
            validate_catalog(d['catalog'])
            cur=db().execute('UPDATE catalog SET body=?,version=version+1 WHERE id=1 AND version=?',
                (json.dumps(d['catalog'],ensure_ascii=False),d.get('catalog_version')))
            if cur.rowcount!=1:db().rollback();abort(409,description='Directory changed in another window. Reload before editing.')
        db().execute('UPDATE settings SET body=? WHERE id=1',(json.dumps(s),));db().commit();audit('settings_updated');return jsonify(ok=True,version=catalog()[0])
    @app.get('/api/admin/audit')
    @auth
    def audits():return jsonify(items=[dict(r) for r in db().execute('SELECT * FROM audits ORDER BY id DESC LIMIT 300')])
    @app.get('/api/admin/export/catalog')
    @auth
    def export_catalog():
        audit('catalog_exported');r=jsonify(catalog()[1]);r.headers['Content-Disposition']='attachment; filename=public-directory.json';return r

    @app.get('/')
    def index():return send_from_directory(ROOT/'web','index.html')
    @app.get('/admin')
    def admin():return send_from_directory(ROOT/'web','admin.html')
    @app.get('/admin/')
    def admin_slash():return redirect('/admin',code=308)
    @app.get('/<path:filename>')
    def static(filename):return send_from_directory(ROOT/'web',filename)
    return app


if __name__=='__main__':
    create_app().run(host='127.0.0.1',port=int(os.environ.get('PORT','8850')),debug=False)
