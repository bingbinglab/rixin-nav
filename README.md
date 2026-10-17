# rixin-nav

米纸墨线风、全套运行在 Cloudflare 免费层上的个人自用轻量现代化书签导航系统。

> 名字出自《大学》「苟日新，日日新，又日新」——纸本雅致，辑录常看常新之站，打开即达。

---

## 核心功能清单

- **二级分类**：支持一级分类与二级子分类树形排布，侧边索引与分区画卷清晰明了；
- **私密体系（站点级＋分类级继承）**：支持单站标记私密，亦支持整分类标记私密；父级私密自动向下继承，未通过站长验身时接口绝不下发私密数据；
- **拼音首字母搜索**：内置轻量汉字拼音首字母计算引擎，支持输入拼音首字母（如 `fs` 飞书、`zh` 知乎、`ssp` 少数派）及英文简称随手检索，回车直达首站；
- **AI 智能补简介**：一键调用大模型为缺简介的书签批量生成精准简炼的一句话说明。原生支持 Cloudflare Workers AI，并深度兼容 OpenAI / Google Gemini / DeepSeek 等主流服务商；
- **WebDAV 备份双轨**：内置坚果云、Nextcloud 及自定义 WebDAV 一键双向备份与快照还原，并支持标准浏览器书签 HTML 与全量备份 JSON 双向导入导出；
- **Floccus 双向同步（可选组件）**：深度支持与跨平台浏览器书签插件 Floccus 进行 XBEL 双向同步联动；更提供独立定时同步 Worker，实现全天候无感自动同步（详见 [workers/floccus-sync/README.md](workers/floccus-sync/README.md)）；
- **站内设置中心**：站长后台内置可视化设置中心，WebDAV 账号密钥、AI 服务商与令牌、Floccus 相对路径、站点自定义名称（`site_title`）与页脚文案（`site_footer`）均可直接在界面保存并即时生效；
- **夜间沉墨主题**：报头右侧阴阳太极印钮一键流转日间「澄怀素笺」与夜间「深夜沉墨」主题，记住偏好并支持系统深色模式自适应。

> **免费额度**：全套架构与数据存储完全运行在 **Cloudflare 免费层（Free Tier）** 之内，零服务器成本开销，享有全球 CDN 加速与毫秒级冷启动。

---

## 三步快速部署

### 第一步：创建 D1 与 KV，执行建表脚本

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)；
2. 进入 **Storage & Databases** → **D1**，创建一个 D1 数据库（例如命名为 `rixin-db`）；
3. 打开该 D1 数据库控制台的 **Console** 标签页，复制本仓库根目录的 [`schema.sql`](schema.sql) 内容粘贴并执行建表；
   - *（可选演示数据）*：若需要灌入 49 个精选站点演示数据，可继续执行 [`schema-seed.sql`](schema-seed.sql)；
4. 进入 **Storage & Databases** → **KV**，创建一个 KV 命名空间（例如命名为 `rixin-kv`），用于存储登录会话凭据及后台设置中心配置。

### 第二步：Pages 关联仓库、绑定资源与唯一环境变量（路线 A 口径）

1. 在 Cloudflare 控制台进入 **Compute (Workers & Pages)** → **Create application** → **Pages** → **Connect to Git**，选择本仓库；
2. 构建与部署配置：
   - **Framework preset（框架预设）**：无（None）；
   - **Build command（构建命令）**：留空；
   - **Build output directory（输出目录）**：填 `public`；
3. 点击保存并部署；首次部署完成后，进入该 Pages 项目的 **Settings（设置）**：
   - **Bindings（函数绑定）**：
     - 添加 **D1 database binding**：变量名必须填写 `NAV_DB`，绑定刚才创建的 D1 数据库；
     - 添加 **KV namespace binding**：变量名必须填写 `NAV_KV`，绑定刚才创建的 KV 命名空间；
   - **Environment variables（环境变量）**：
     - 添加环境变量 `ADMIN_PASSWORD`（站长后台口令，**仅此一个必填**）；其余所有配置（WebDAV、AI、站名等）均在后台设置中心直接填写，无需配置环境变量；
4. 进入 **Deployments（部署）** 重新重试或触发一次部署，使绑定与环境变量生效。

### 第三步：打开站点，使用口令进入后台

1. 打开 Cloudflare 为你生成的 `*.pages.dev` 访问地址（亦可在 Custom domains 中绑定自己的个性域名）；
2. 点击报头右上角「门牌」印章（或直接访问 `/admin`），输入刚才在环境变量中设定的 `ADMIN_PASSWORD` 口令，即可原地验身或进入管理后台；
3. 进入管理后台「设置与工具」区域，可在「站点与品牌设置」中按需设置个性站名与页脚文案，并在 WebDAV 与 AI 设置区绑定个人服务。

---

## 可选组件：Floccus 自动定时同步 Worker

若希望将 Chrome / Edge / Firefox 浏览器的书签与本站长期保持全自动后台无感定时双向同步，可参考 [`workers/floccus-sync/README.md`](workers/floccus-sync/README.md) 将独立的 Cron Trigger Worker 部署至 Cloudflare Workers。

---

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。
