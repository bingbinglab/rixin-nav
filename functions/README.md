# Pages Functions（第二阶段后端，已上线代码，待绑定 D1/KV 后生效）

- `_lib/util.js` — 共用工具：JSON 响应、会话（KV 存 `session:<token>`，Cookie 名 `nav_session`，7 天）、口令校验、数据清洗
- `api/sites.js` — 前台数据接口：未登录不下发私密；D1 未绑定返回 503，前台自动回退 `data.js`
- `api/admin/*` — 后台接口（需会话或机器令牌）：书签/分类增删改、批量导入、导出 JSON/书签 HTML
- `api/admin/ai-desc.js` — AI 补简介：抓目标页标题/meta 生成一句话；环境变量配了 CF_ACCOUNT_ID＋CF_AI_TOKEN 时再用 Workers AI 润色
- `api/admin/backup.js` / `restore.js` — WebDAV 备份/恢复：环境变量 WEBDAV_URL / WEBDAV_USER / WEBDAV_PASS
- 机器令牌：环境变量 ADMIN_API_TOKEN，后台接口认 `Authorization: Bearer <令牌>`，供助理自动化与验收；删除该变量即作废
- `admin/index.js` — `/admin` 页面：未登录出登录页，登录后出管理页
- `admin/login.js` / `admin/logout.js` — 表单登录（口令走环境变量 `ADMIN_PASSWORD`）与注销

接口规划详见 `docs/后端说明.md`。
