"""Enforce configured retention period for inquiries and old encrypted backups.
Run daily on the server. Does not send data or store health details in logs.
"""
import json,os,sqlite3,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.app import load_env
load_env();runtime=Path(os.environ.get('CCW_DATA_DIR',str(ROOT/'runtime')))
with sqlite3.connect(runtime/'care.sqlite3') as con:
    settings=json.loads(con.execute('SELECT body FROM settings WHERE id=1').fetchone()[0])
    cutoff=time.time()-settings['retention_days']*86400
    count=con.execute('DELETE FROM leads WHERE created<?',(cutoff,)).rowcount
    con.execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
    con.execute('INSERT INTO audits(created,action,target) VALUES(?,?,?)',(time.time(),'retention_cleanup',str(count)))
for p in (runtime/'backups').glob('*.sqlite3'):
    if p.stat().st_mtime<cutoff:p.unlink()
print('Retention cleanup complete; records removed:',count)
