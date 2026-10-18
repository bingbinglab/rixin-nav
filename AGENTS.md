# 本仓库协作规则（给 AI 代理）

## 项目
日新辑览：个人书签导航站。原生 HTML/CSS/JS + Cloudflare Pages Functions + D1 + KV，无构建步骤：public/ 为发布目录，functions/ 为接口与后台页。推送 main 自动部署到演示站。

## 硬规矩
- 提交信息用英文短句，不用中文、不用长篇；重要改动几个词即可，小改动可更短。作者与提交者固定用 rixin <rixin@localhost>，禁止用真实姓名或真实邮箱提交；本地 git 配置不是这个身份时，先改配置（git config user.name "rixin"、git config user.email "rixin@localhost"）再提交。
- 改动 public/ 下的 JS/CSS 后，必须同步递增引用处的 ?v= 版本戳（public/index.html、functions/admin/index.js）。
- 一切功能必须按 Cloudflare 免费额度设计，不引入付费服务，不假设可以超额。
- 不提交 .dev.vars、.secrets 及任何令牌、口令；管理员口令只存在于平台环境变量，代码与文档中不得出现其值。
- 本仓另有姊妹仓库（私有生产版）：功能改动通常需要两仓同步，但两仓结构不完全相同，禁止整文件覆盖，按各自结构落点。
- Floccus 双向同步只同步书签的存在性（增与删）；站名、简介、置顶、私密、排序等策展内容不得回写浏览器。改同步逻辑前先读完现有实现再动手。
- 未登录接口永不下发私密站点与私密分类，改动数据接口时必须守住这条。
- 完工标准：已提交并推送，并给出实测证据（接口返回、页面渲染或真实点击结果）；只改本地不算完工。
