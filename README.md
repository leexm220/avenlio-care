# China Care Wayfinder

面向海外英语用户的中国就医信息与协调网站。首批北京、天津；英文客户网页、中文管理后台。

## 已实现

- 医院名称、城市、专业方向查询；医院、科室、专家详情和官方来源。
- 症状、病情进展、已知诊断、检查及医生意见录入；陪诊、手术评估、检查、翻译等需求。
- 有依据的医院／专家候选检索。仅有症状、专业方向冲突、未覆盖或超过核查时效时转人工，不生成诊断。
- 固定口径的 USD 10,000 纯服务费，医疗费与行程费由客户另付；可在后台修改服务费和公开说明。
- 联系方式与独立健康信息同意、提交回执；未提交的健康内容不写入浏览器存储。
- 受保护的管理员登录、退出、密码修改与会话撤销，登录限速、CSRF、同源检查。
- 医院、科室、专家、来源的新增和编辑，草稿／发布／下架、公开资料 JSON 导出和并发更新冲突检查。
- 专业分类和已知诊断条件维护，可扩展目录覆盖；没有专家临床资料依据时不会凭空补出推荐。
- 客户查询、状态和负责人、加密跟进记录、客户资料删除，以及不含病情正文的操作记录。
- 加密数据库备份、保留期清理工具、Docker + HTTPS 反向代理部署配置和 GitHub Actions 检查／预览发布配置。

这是协调与信息检索工具，不是临床诊断系统。专家简介不证明当前出诊、英语服务、可预约或与平台合作。首批来源和覆盖缺口见 [医院资料核查说明](docs/hospital-sources.md)。

## 本机运行

需要 Python 3.12 或更高版本；Node.js 22 仅用于前端检查，不需要前端安装依赖。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/setup.py
.venv/bin/gunicorn --bind 127.0.0.1:8850 --workers 1 --threads 2 'backend.app:create_app()'
```

客户网页：`http://127.0.0.1:8850/`；后台：`http://127.0.0.1:8850/admin`。

macOS 可双击 `Start.command`。首次启动生成本机 `.env` 和 `admin-access.txt`；初始管理员密码只保存在本机文件中。项目不包含默认密码。登录后可在“服务与费用”修改密码。

`.env` 包含患者数据库加密密钥，必须安全备份；丢失密钥后无法解密既有咨询。`runtime/` 中的数据库和备份、`.env`、`admin-access.txt` 均禁止上传 GitHub。

## GitHub 托管范围

GitHub 仓库保存整个应用源码。GitHub Pages 只发布 `web/` 目录，作为公开资料查询和界面预览；**它不运行 Python、管理后台或患者资料库**。预览模式可检索医院并查看候选选项，明确不接收真实病情或密码，不假装咨询已提交。

在仓库 Settings → Pages 选择 GitHub Actions，随后运行 `Publish public directory preview`。访问地址以 GitHub 部署返回结果为准。不能把计划中的地址当作已发布成功。

实际服务端需部署在服务器或支持 Python 的云环境，并使用同一 HTTPS 域名提供网页和 API。GitHub Pages 不作为商业业务或敏感资料提交的生产托管平台。参见 [GitHub Pages 说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) 和 [使用限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。

## 服务端部署

详见 [部署与维护](docs/deployment.md)。项目提供 Dockerfile、Compose 和 Caddy 配置。不要在公网直接运行 Flask 开发服务器。

## 测试

```sh
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
npm run check
npm run test:matching
```

测试使用隔离目录和合成数据，覆盖登录与权限、健康授权、加密、候选检索、资料发布下架、并发修改、咨询跟进删除、费用快照及会话失效。通过测试不等于完成临床或法律合规认证。

## 资料结构

`data/catalog.seed.json` 为公开资料种子；服务端初次启动导入运行数据库。后台修改后以运行数据库为准，修改种子文件不会覆盖运行数据。`web/assets/catalog.json` 是 GitHub 公开预览快照，不会自动获得服务端后台的新编辑。

需要更新预览时，从后台导出公开资料，审核后更新种子与公开快照，再提交 GitHub。不要导出患者数据库作为网页数据。

## 运营设置

服务价格默认 USD 10,000，只含平台服务；不包含医疗和行程费用。服务范围和取消／退款内容仍需由经营者填写最终可交付条款。本系统不收款、不自动向医院发送病历，也不发送电子邮件。咨询在后台查看；公开邮箱只供客户一般联系和提出隐私请求。

此版本不包含患者账户、文件上传、保险理赔、在线支付、医院号源接口和在线诊疗，符合本项目精简范围。
