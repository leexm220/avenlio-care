#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/python -m pip install -r requirements.txt
fi
.venv/bin/python scripts/setup.py
echo '客户网页：http://127.0.0.1:8850'
echo '管理后台：http://127.0.0.1:8850/admin'
.venv/bin/gunicorn --bind 127.0.0.1:8850 --workers 1 --threads 2 'backend.app:create_app()'
