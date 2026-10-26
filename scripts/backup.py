"""Back up the encrypted database. Keep .env/key separately, never in GitHub."""
import os,sqlite3,sys
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.app import load_env
load_env()
runtime=Path(os.environ.get('CCW_DATA_DIR',str(ROOT/'runtime')))
target=runtime/'backups';target.mkdir(parents=True,exist_ok=True);target.chmod(0o700)
db=runtime/'care.sqlite3'
if not db.exists():raise SystemExit('No runtime database exists yet.')
path=target/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')+'.sqlite3')
with sqlite3.connect(db) as source,sqlite3.connect(path) as dest:source.backup(dest)
path.chmod(0o600)
print('Encrypted database backup created. Store the encryption key separately. Never commit runtime data.')
