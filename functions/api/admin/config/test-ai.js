// POST /api/admin/config/test-ai
// 测试 AI 生成简介（对固定样本斗鱼网站跑一次生成并返回结果）。
// 需管理员会话 Cookie 或 Bearer ADMIN_API_TOKEN。

import { json, requireAuth } from "../../../_lib/util.js";
import { getAiConfig, AI_PROVIDERS, DEFAULT_CF_MODEL } from "../../../_lib/config.js";
import { generateDesc } from "../../../_lib/ai.js";

// 固定测试样本：斗鱼直播
const SAMPLE = {
  url: "https://www.douyu.com",
  title: "斗鱼 - 每个人的直播平台",
  meta: "斗鱼 - 每个人的直播平台提供高清、快捷、流畅的视频直播和游戏赛事直播服务，包含英雄联盟lol直播、穿越火线cf直播、dota2直播等热门游戏直播。",
};

function getHostname(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;

  const { request, env } = context;
  const body = await request.json().catch(() => ({}));

  let provider = String(body.provider || "").trim();
  let account_id = String(body.account_id || "").trim();
  let api_key = typeof body.api_key === "string" ? body.api_key.trim() : "";
  let base_url = String(body.base_url || "").trim();
  let model = String(body.model || "").trim();

  // M1: 仅当草稿 provider 与 base_url 的域名都与已存生效配置一致时才允许密钥留空复用；否则未填密钥 -> 报错
  const activeAi = await getAiConfig(env);
  if (!api_key) {
    if (activeAi && activeAi.api_key) {
      const activeProvider = activeAi.provider || "cloudflare";
      const targetProvider = provider || activeProvider;
      const providerChanged = targetProvider !== activeProvider;

      let hostChanged = false;
      if (targetProvider !== "cloudflare") {
        const targetHost = getHostname(base_url || activeAi.base_url || "");
        const activeHost = getHostname(activeAi.base_url || "");
        if (base_url && activeHost && targetHost !== activeHost) {
          hostChanged = true;
        }
      }

      if (providerChanged || hostChanged) {
        return json({ error: "服务商/接口地址已变更，请填写新密钥" }, 400);
      }

      api_key = activeAi.api_key;
      if (!provider) provider = activeAi.provider;
      if (!account_id && activeAi.account_id) account_id = activeAi.account_id;
      if (!base_url && activeAi.base_url) base_url = activeAi.base_url;
      if (!model && activeAi.model) model = activeAi.model;
    }
  }

  provider = provider || "cloudflare";
  if (!AI_PROVIDERS.includes(provider)) {
    return json({ error: `不支持的 AI 服务商：${provider}` }, 400);
  }

  if (provider === "cloudflare") {
    model = model || DEFAULT_CF_MODEL;
    if (!account_id) return json({ error: "Cloudflare Workers AI 需填写 Account ID" }, 400);
    if (!api_key) return json({ error: "Cloudflare Workers AI 需填写 API Token（未提供且无已存密钥）" }, 400);
  } else {
    if (!base_url) return json({ error: "请填写接口基础地址 (base_url)" }, 400);
    if (!api_key) return json({ error: "请填写 API 密钥 (api_key)（未提供且无已存密钥）" }, 400);
    if (!model) return json({ error: "请填写模型名称 (model)" }, 400);
  }

  const testConfig = {
    provider,
    account_id,
    api_key,
    base_url,
    model,
  };

  try {
    const desc = await generateDesc(testConfig, SAMPLE);
    return json({
      ok: true,
      desc,
      sample: {
        title: SAMPLE.title,
        url: SAMPLE.url,
      },
    });
  } catch (err) {
    return json({
      ok: false,
      error: err.message || "AI 简介生成测试失败",
    }, 400);
  }
}
