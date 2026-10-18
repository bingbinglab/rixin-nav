# 日新辑览-个人书签导航管理

一个自托管的个人书签管理站。它不是那种站长精选一批网址给你用的公共导航页——这里面装的全是你自己的书签：收藏、整理、标私密、做备份，再和浏览器双向同步。前台是一张报刊式的纸墨页，白天米纸底、夜间暖黑，打开搜一下就到。数据存在自己的 Cloudflare 账号里，整套跑在免费额度内，不用买服务器。

名字出自《大学》「苟日新，日日新，又日新」。站名和页脚文案都能在后台改，默认显示「书签导航」。

**在线演示**：[bmk.navv.eu.cc](https://bmk.navv.eu.cc)——里面是 50 个演示站点，后台口令是 `demo`。

## 界面一览

**桌面浏览器 · 前台**

| 日间 | 夜间 |
| --- | --- |
| <img src="docs/screenshots/front-day.png" width="400" alt="前台·日间"> | <img src="docs/screenshots/front-night.png" width="400" alt="前台·夜间"> |

**桌面浏览器 · 后台**

| 日间 | 夜间 |
| --- | --- |
| <img src="docs/screenshots/admin-day.png" width="400" alt="后台·日间"> | <img src="docs/screenshots/admin-night.png" width="400" alt="后台·夜间"> |

**手机浏览器**

| 前台 · 日间 | 前台 · 夜间 | 后台 · 日间 | 后台 · 夜间 |
| --- | --- | --- | --- |
| <img src="docs/screenshots/front-mobile.png" width="200" alt="手机前台·日间"> | <img src="docs/screenshots/front-mobile-night.png" width="200" alt="手机前台·夜间"> | <img src="docs/screenshots/admin-mobile.png" width="200" alt="手机后台·日间"> | <img src="docs/screenshots/admin-mobile-night.png" width="200" alt="手机后台·夜间"> |

## 功能

### 管理

- 分类、置顶、私密、排序、批量操作都在后台完成，书签 HTML 和 JSON 两种格式可导入导出，换浏览器、换设备不丢收藏
- 私密：单个站点或整个分类可以标私密，未登录时服务器不下发这些数据，不是前端遮一下就算数
- AI 补简介：缺简介的站一键生成一句说明，内置 5 家服务商预设（Cloudflare Workers AI、OpenAI、Gemini、DeepSeek、自定义）
- 设置中心：站名、页脚、WebDAV、AI、同步路径都在后台页面里配，保存即生效

### 同步与备份

- Floccus 双向同步（可选）：浏览器装了 Floccus 插件后，书签和本站互通——哪边加站，另一边出现；哪边删站，另一边跟着删。防误删有三道：来源标记（手工加的站首次同步前不受浏览器影响，合流后由置顶豁免与熔断保护）、删除墓碑、单次变动过多自动熔断
- WebDAV 备份：后台一键备份和恢复；备份主文件之外另有 4 个按周轮换的槽位，主文件损坏时从槽位恢复

### 浏览

- 搜索认拼音首字母：输 `fs` 找飞书、`zh` 找知乎，回车直达第一个结果
- A–Z 字母索引，键盘 ↑↓ 选卡
- 二级分类，左侧索引滚动跟随高亮；手机上换成顶部横排
- 夜间主题「沉墨」，报头按钮切换，记住选择；紧凑、舒适两种密度
- 接口不可用时用本地快照渲染，页面不会白屏

## 最省事的部署方式：交给你的 AI Agent

如果你在用 Antigravity、Claude Code、Cursor 这类带终端的 AI 工具，把下面这段话粘给它，剩下的它会自己干完：

```
帮我部署这个项目：https://github.com/bingbinglab/rixin-nav
1. 克隆仓库，读 README 的「快速开始」一节照着做；
2. 用 wrangler 在我的 Cloudflare 账号里建 D1 数据库，执行 schema.sql 建表（想要演示数据再执行 schema-seed.sql），再建一个 KV 命名空间；
3. 部署到 Cloudflare Pages：输出目录 public，绑定 D1 为 NAV_DB、KV 为 NAV_KV；
4. 部署完把访问地址告诉我。
需要登录授权时停下来喊我；ADMIN_PASSWORD 环境变量我自己在 Cloudflare 后台设，不要替我设。
```

三件事还得你本人来：注册 Cloudflare 账号、授权时点确认、在后台设口令。其余的建库、建表、部署、绑定，agent 都能包办。

## 快速开始

想自己动手也行。需要一个 Cloudflare 账号，免费版即可。三步：

**1. 建数据库**

在 D1 里新建一个数据库，打开它的 Console，把仓库根目录的 `schema.sql` 粘贴执行。想先看效果，再执行 `schema-seed.sql`，会灌入 50 个演示站点（就是在线演示里那一批）。然后在 KV 里新建一个命名空间。

**2. 部署**

Pages 里选 Connect to Git 连接这个仓库：构建命令留空，输出目录填 `public`。部署完成后进项目 Settings，加两条绑定——D1 绑为 `NAV_DB`，KV 绑为 `NAV_KV`；再加一个环境变量 `ADMIN_PASSWORD`，值是你的后台口令，自己设。绑完重新部署一次生效。

环境变量只需要这一个。站名、AI 密钥、WebDAV 账号这些都进后台设置中心，不写进代码，也不会提交到 Git。

**3. 打开**

访问 Pages 给的地址，点报头右上角的「门牌」，或直接进 `/admin`，用口令登录。站名在后台「站点与品牌设置」里改。

成本：D1、KV、Pages 的免费额度对个人使用足够，正常使用不产生费用。AI 补简介如果选 Cloudflare Workers AI，走它每天 10,000 Neurons 的免费额度（一次批量补几百条也够用），不用这个功能就不涉及。

## 设计要点

- **同步只对账「有没有」**：站内的简介、排序、私密属于策展，浏览器的书签只是一份清单。两边按网址对账增删，策展内容永不回写浏览器——在站里改站名、写简介，不会弄乱浏览器那边的书签。
- **私密在服务器侧过滤**：未登录拿到的 JSON 里根本没有私密站。前端隐藏只是样子，接口漏了等于没藏。分类标了私密，会向下继承到它的子分类和站点。
- **配置只留一个环境变量**：口令放环境变量，其余进 KV。改配置不用动代码、不用重新部署，密钥也不会进 Git 历史。

## 项目结构

```
public/           前台页面与静态资源（Pages 输出目录）
functions/        接口与后台（Pages Functions）
workers/          可选组件：Floccus 定时同步 Worker
demo-reset-worker/ 可选组件：演示站定时自动重置 Worker（每天两次）
schema.sql        建表
schema-seed.sql   50 条演示数据
```

## 可选组件

Floccus 定时同步 Worker：每 12 小时自动对账一次，部署方法见 [workers/floccus-sync/README.md](workers/floccus-sync/README.md)。不用它的话，在后台手动点同步也一样。

演示站定时重置 Worker：如果你也对外开一个公开演示站，可以部署 [demo-reset-worker/worker.js](demo-reset-worker/worker.js)——一个带定时触发的 Worker，每天两次把演示数据清回种子状态，并把设置恢复成 KV 里 `factory_settings_v1` 键存的出厂快照。部署时给它绑演示站的 D1（绑定名 `DB`）和 KV（绑定名 `KV`）即可，在线演示站用的就是它。

## 许可证

[MIT License](LICENSE)。项目在 [LINUX DO](https://linux.do) 社区发布与讨论。
