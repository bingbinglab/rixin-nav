# Pages Functions（后端接口，已上线）

## 配置口径（先看这条）

- 配置以**后台设置中心**为主，存 KV 单键 `app_config`（`_lib/config.js`）；环境变量同名项可覆盖。
- 只有两样必须走环境变量：登录口令 `ADMIN_PASSWORD`、机器令牌 `ADMIN_API_TOKEN`。

## 文件

- `_lib/util.js` — 共用工具：JSON 响应、会话（KV 存 `session:<token>`，Cookie 名 `nav_session`，7 天）、口令校验（恒定时间比对）、数据清洗
- `_lib/config.js` — 配置读写：设置中心（KV）为主，环境变量兜底覆盖
- `api/sites.js` — 前台数据接口：未登录不下发私密站点；D1 未绑定返回 503，前台自动回退 `data.js`
- `api/icon.js` — 图标代理：按域名取站点图标（公开接口，带缓存头）；本地已有图标时前台优先走本地
- `api/admin/*` — 后台接口（需会话或机器令牌）：书签/分类增删改、批量操作、导入、导出 JSON/书签 HTML、死链巡检、AI 补简介、WebDAV 备份/恢复、Floccus 同步
- `api/admin/ai-desc.js` — AI 补简介：先抓目标页标题/meta，再用设置中心里配好的 AI 服务商生成一句话；AI 不可用时回退正文清洗
- `api/admin/backup.js` / `restore.js` — WebDAV 备份/恢复：地址、账号、应用密码在设置中心里配，环境变量 `WEBDAV_URL / WEBDAV_USER / WEBDAV_PASS` 可覆盖
- 机器令牌：环境变量 `ADMIN_API_TOKEN`，后台接口认 `Authorization: Bearer <令牌>`，供自动化与验收调用；删除该变量即作废
- `admin/index.js` — `/admin` 页面：未登录出登录页，登录后出管理页
- `admin/login.js` / `admin/logout.js` — 表单登录与注销；登录失败按 IP 计数（KV `login_fail:<ip>`），连续失败会锁定一段时间
