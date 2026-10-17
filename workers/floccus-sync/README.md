# rixin-floccus-sync 定时调度 Worker 部署说明

本 Worker 专用于为「日新辑览」导航站提供 **每 12 小时一次的 floccus 双向书签自动同步与微信通知服务**，运行在 Cloudflare Workers 免费额度内。

---

## 一、部署前准备

确保你的导航站主站（Cloudflare Pages）已经配置好了 `ADMIN_API_TOKEN`（在 Pages 项目的 **设置 → 环境变量** 中查看或生成）。

---

## 二、部署步骤（两分钟搞定）

在项目根目录下或本目录打开终端：

### 1. 修改接口地址
打开本目录下的 `wrangler.toml` 文件，将 `NAV_SYNC_URL` 修改为你导航站线上实际部署的同步接口：
```toml
[vars]
NAV_SYNC_URL = "https://你的域名/api/admin/sync-floccus"
```

### 2. 录入机密令牌 (Secrets)
运行以下命令录入令牌（输入时控制台不显明文，直接粘贴回车）：

```bash
# 1. 导航站管理员机器令牌（必须填）
npx wrangler secret put ADMIN_API_TOKEN

# 2. WxPusher 微信推送 AppToken（选填，若需微信提醒则配置）
npx wrangler secret put WXPUSHER_APP_TOKEN

# 3. 站长接收推送的 WxPusher UID（选填，若需微信提醒则配置）
npx wrangler secret put WXPUSHER_UID
```

### 3. 一键部署上线
```bash
npx wrangler deploy
```

部署成功后，Cloudflare 会自动设置 `0 */12 * * *` 的 Cron Trigger，每 12 小时在后台无感执行一次。

---

## 三、手动调试与验证

部署完成后，可通过带鉴权的 HTTP 请求立即触发一次真同步测试（`/run` 入口需要与 `ADMIN_API_TOKEN` 相同的 Bearer 令牌）：

```bash
curl -X GET \
  -H "Authorization: Bearer <你的 ADMIN_API_TOKEN>" \
  https://rixin-floccus-sync.<你的名字>.workers.dev/run
```

成功时返回详细的执行结果 JSON；未携带或令牌不符时返回 `401 unauthorized`。

> 定时触发（Cron Trigger）不受鉴权影响，仍按计划自动运行。
