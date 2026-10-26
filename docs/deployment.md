# 部署与维护

## 分清三个位置

| 位置 | 内容 | 可完成的功能 |
| --- | --- | --- |
| GitHub 仓库 | 源码、公开医院资料、测试、部署配置 | 保存版本和协作 |
| GitHub Pages | `web/` 静态预览 | 公开目录、界面和候选探索；不接收真实咨询，不运行后台 |
| Python 服务端 | 同源网页与 API、运行数据库、加密密钥 | 完整登录后台、资料维护、患者提交和跟进 |

## 服务器上使用 Docker

1. 准备域名并将 DNS 指向服务器，开放 80 和 443 端口。
2. 在服务器拉取本项目，安装官方 Docker Engine 与 Compose 2.30 或更高版本（使用 raw 格式读取环境文件）。
3. 在服务器虚拟环境执行 `scripts/setup.py`，为该环境生成独立 `.env` 和初始密码。不要复制本机患者运行数据到 GitHub。
4. 在服务器 `.env` 增加 `SITE_DOMAIN=你的域名`，修改 `CCW_HOSTS=你的域名`、`CCW_SECURE_COOKIE=1`。提供的配置使用 raw 格式读取环境文件，保留密码哈希中的 `$`；首启后账号密码哈希存于运行数据库。
5. 执行 `docker compose up -d --build`。Caddy 为正确解析的域名申请证书，将请求反向代理到应用。加密密钥只在服务器环境中，SQLite 存放于 `care_data` 私有数据卷。
6. 登录后台设置真实的服务名称、服务范围和退款条款，确认隐私告知与实际部署一致。用合成数据测试提交与读取，随后删除该测试咨询。

医院资料和患者数据有独立发布路径。不要把 `runtime` 数据卷、`.env` 或备份放入 Web 根目录。

## 备份和保留期限

本机／普通部署可运行 `python scripts/backup.py` 创建加密数据库快照。`.env` 中的加密密钥需单独安全保管。默认保留期为 90 天，可在后台设置为 1–365 天。

应用在 API 请求前清理超过设置期限的咨询。另可每日执行 `python scripts/purge_expired.py`，同时清理过期咨询和旧备份；长期无人访问的部署需配置系统调度（例如 cron/systemd timer）。项目不使用 GitHub Actions 访问患者运行数据。备份与删除申请要在同一保留策略下管理，不能声称删除主库即删除全部历史备份。

Docker 容器中也可以通过 `docker compose exec app python scripts/backup.py` 和 `docker compose exec app python scripts/purge_expired.py` 执行。恢复时先停止写入，用相同环境密钥解密恢复的数据库，并验证一致性；不要在旧备份上继续接收新咨询。

## 安全边界

- 后台仅同源访问；不为跨域 GitHub Pages 页面开放患者资料接口或后台 Cookie。
- 生产环境必须使用 HTTPS 和 Secure Cookie。提供的 Compose 仅对外开放 Caddy，应用端口不直接暴露。
- Compose 中仅信任前置的一层 Caddy 代理，以正确识别 HTTPS 和来访地址；不要在直接对外开放应用端口时启用 `CCW_TRUST_PROXY`。
- 密码使用 Werkzeug scrypt 哈希；患者健康、联系和跟进文本使用 Fernet 认证加密。会话令牌只保存哈希，Cookie 为 HttpOnly / SameSite Strict。
- 只保存咨询必要信息；没有真实患者信息时，不需要导入任何患者数据。源码公开不表示公开运行数据。
- GitHub 预览不会向服务端发送密码或病情。管理入口在静态环境显示服务端未运行的说明。
- 操作记录包含事件、时间和咨询编号，不包含病情、邮箱、手机号或内部备注正文。

功能已实现不等于部署条件已具备。未连接服务器前，应称为“GitHub 静态预览 + 可运行完整应用源码”，不能称为全部功能已在 GitHub 在线运行。

参考：[Flask 安全说明](https://flask.palletsprojects.com/en/stable/web-security/)、[Fernet 说明](https://cryptography.io/en/latest/fernet/)、[GitHub Pages 使用限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。
