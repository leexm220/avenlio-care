"""Create local credentials. Secrets are never printed or tracked in Git."""
import json,secrets,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from cryptography.fernet import Fernet
from werkzeug.security import generate_password_hash
from backend.catalog import public_catalog,validate_catalog

def build_public():
    d=json.loads((ROOT/'data/catalog.seed.json').read_text())
    validate_catalog(d)
    out=public_catalog(d)
    out['site_settings']=dict(retention_days=90,service_scope='Specific deliverables, service duration and accompaniment days are agreed in writing before payment.',
        cancellation_policy='Cancellation and refund terms are provided in your individual service agreement before payment.')
    (ROOT/'web/assets/catalog.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':
    env=ROOT/'.env'
    if not env.exists():
        password=secrets.token_urlsafe(22)
        env.write_text('CCW_DATA_KEY='+Fernet.generate_key().decode()+'\nCCW_ADMIN_HASH='+generate_password_hash(password)+'\nCCW_ADMIN_EMAIL=leexm220@gmail.com\nCCW_SECURE_COOKIE=0\nCCW_HOSTS=localhost,127.0.0.1\nCCW_INTAKE_ENABLED=1\n')
        env.chmod(0o600)
        access=ROOT/'admin-access.txt'
        access.write_text('仅限本机，切勿上传或分享本文件\n后台：http://127.0.0.1:8850/admin\n管理员邮箱：leexm220@gmail.com\n初始密码：'+password+'\n\n登录后可在“服务与费用”里修改密码。密码修改后本文件中的初始密码失效。\n.env 中加密密钥需单独安全备份，丢失后无法解密患者资料。\n')
        access.chmod(0o600)
        print('Local credentials created in admin-access.txt. Encryption key saved in .env (both excluded from Git).')
    else:print('Existing local credentials retained.')
    build_public();print('Public catalog generated. Start: python -m backend.app')
