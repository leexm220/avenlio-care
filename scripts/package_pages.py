"""Package only public files for a direct Cloudflare Pages upload."""
from pathlib import Path
import argparse, hashlib, json, re, shutil, zipfile
ROOT=Path(__file__).resolve().parents[1]

def package(destination,release):
    destination=Path(destination);stage=destination/'public';stage.mkdir(parents=True,exist_ok=True)
    for old in stage.rglob('*'):
        if old.is_file():old.unlink()
    for src in (ROOT/'web').rglob('*'):
        if not src.is_file() or src.name in ('.DS_Store','.nojekyll'):continue
        target=stage/src.relative_to(ROOT/'web');target.parent.mkdir(parents=True,exist_ok=True)
        if src.suffix in ('.js','.html'):
            content=src.read_text()
            # Every module and entry asset shares a release tag so old cached imports cannot mix with new code.
            content=re.sub(r"((?:from\s*|import\s*)['\"])(\./[^'\"]+\.js)(['\"])",lambda m:m[1]+m[2]+'?v='+release+m[3],content)
            content=re.sub(r'((?:src|href)=[\"\'])(assets/[^\"\']+\.(?:js|css)|config\.js)([\"\'])',lambda m:m[1]+m[2]+'?v='+release+m[3],content)
            content=content.replace("new URL('assets/catalog.json',", "new URL('assets/catalog.json?v="+release+"',")
            target.write_text(content)
        else:shutil.copy2(src,target)
    (stage/'config.js').write_text("// Public directory only.\nwindow.CCW_CONFIG = { mode: 'static' };\n")
    (stage/'_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cache-Control: no-cache\n')
    files=sorted(p for p in stage.rglob('*') if p.is_file())
    assert not any(p.suffix in ('.sqlite3','.db') or p.name in ('.env','admin-access.txt') for p in files)
    archive=destination/'avenlio-care-pages.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for path in files:z.write(path,path.relative_to(stage))
    manifest={'release':release,'scope':'Public static directory; no private records or backend credentials','files':{str(p.relative_to(stage)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},'archive':str(archive)}
    (destination/'package-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print(json.dumps({'archive':str(archive),'files':len(files),'bytes':archive.stat().st_size},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('destination');parser.add_argument('--release',required=True)
    args=parser.parse_args();package(args.destination,args.release)
