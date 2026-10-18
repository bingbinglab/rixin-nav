// 日新辑览 · 后台配置解析与管理模块
// 原则：环境变量优先，后台 KV 兜底；敏感密钥绝不回显明文。

export const KV_CONFIG_KEY = "app_config";
export const AI_PROVIDERS = ["cloudflare", "openai", "google", "deepseek", "custom"];
export const DEFAULT_CF_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const DEFAULT_FLOCCUS_PATH = "bookmarks.xbel";

// 掩码处理：仅保留末 4 位，其余遮蔽为 ••••；不足 4 位则回 ••••；空值回 ""
export function maskSecret(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim();
  if (!s) return "";
  if (s.length < 4) return "••••";
  return "••••" + s.slice(-4);
}

// 读取 KV 完整原始配置对象
export async function getKvConfig(env) {
  if (!env || !env.NAV_KV) return {};
  try {
    const val = await env.NAV_KV.get(KV_CONFIG_KEY, "json");
    return val && typeof val === "object" ? val : {};
  } catch {
    return {};
  }
}

// 保存完整原始配置对象到 KV
export async function saveKvConfig(env, config) {
  if (!env || !env.NAV_KV) throw new Error("NAV_KV 未绑定");
  await env.NAV_KV.put(KV_CONFIG_KEY, JSON.stringify(config || {}));
}

// 获取生效的 WebDAV 配置
// 优先级：env 三项（URL/USER/PASS）齐全走 env；否则走 KV；否则返回 null
export async function getWebdavConfig(env) {
  const envUrl = String((env && env.WEBDAV_URL) || "").trim();
  const envUser = String((env && env.WEBDAV_USER) || "").trim();
  const envPass = String((env && env.WEBDAV_PASS) || "").trim();

  if (envUrl && envUser && envPass) {
    return {
      url: envUrl,
      user: envUser,
      pass: envPass,
      source: "env",
    };
  }

  const kv = await getKvConfig(env);
  const wd = kv.webdav || {};
  const kvUrl = String(wd.url || "").trim();
  const kvUser = String(wd.user || "").trim();
  const kvPass = String(wd.pass || "").trim();

  if (/^https?:\/\//i.test(kvUrl) && kvUser && kvPass) {
    return {
      url: kvUrl,
      user: kvUser,
      pass: kvPass,
      source: "kv",
    };
  }

  return null;
}

// 获取生效的 AI 配置
// 优先级：env 两项（CF_ACCOUNT_ID 与 CF_AI_TOKEN）齐全走 env（provider 固定 cloudflare）；
// 否则走 KV；否则返回 null
export async function getAiConfig(env) {
  const cfAccount = String((env && env.CF_ACCOUNT_ID) || "").trim();
  const cfToken = String((env && env.CF_AI_TOKEN) || "").trim();

  if (cfAccount && cfToken) {
    return {
      provider: "cloudflare",
      account_id: cfAccount,
      api_key: cfToken,
      base_url: "",
      model: DEFAULT_CF_MODEL,
      source: "env",
    };
  }

  const kv = await getKvConfig(env);
  const ai = kv.ai || {};
  const provider = String(ai.provider || "").trim();

  if (provider === "cloudflare") {
    const account_id = String(ai.account_id || "").trim();
    const api_key = String(ai.api_key || "").trim();
    const model = String(ai.model || DEFAULT_CF_MODEL).trim() || DEFAULT_CF_MODEL;
    if (account_id && api_key) {
      return {
        provider,
        account_id,
        api_key,
        base_url: "",
        model,
        source: "kv",
      };
    }
  } else if (AI_PROVIDERS.includes(provider)) {
    const api_key = String(ai.api_key || "").trim();
    const base_url = String(ai.base_url || "").trim();
    const model = String(ai.model || "").trim();
    if (api_key && base_url && model) {
      return {
        provider,
        account_id: "",
        api_key,
        base_url,
        model,
        source: "kv",
      };
    }
  }

  return null;
}

// 供 GET /api/admin/config 查询使用：返回每项生效值或 KV 值、掩码及生效来源
export async function getConfigSummary(env) {
  const activeWd = await getWebdavConfig(env);
  const activeAi = await getAiConfig(env);
  const kv = await getKvConfig(env);
  const kvWd = kv.webdav || {};
  const kvAi = kv.ai || {};

  // 判定 WebDAV 来源与显式内容
  let wdSource = "none";
  let wdUrl = "";
  let wdUser = "";
  let wdPass = "";

  if (activeWd && activeWd.source === "env") {
    wdSource = "env";
    wdUrl = activeWd.url;
    wdUser = activeWd.user;
    wdPass = activeWd.pass;
  } else if (kvWd && (kvWd.url || kvWd.user || kvWd.pass)) {
    wdSource = activeWd ? "kv" : "none";
    wdUrl = String(kvWd.url || "");
    wdUser = String(kvWd.user || "");
    wdPass = String(kvWd.pass || "");
  }

  // 判定 AI 来源与显式内容
  let aiSource = "none";
  let aiProvider = "cloudflare";
  let aiAccount = "";
  let aiKey = "";
  let aiBaseUrl = "";
  let aiModel = DEFAULT_CF_MODEL;

  if (activeAi && activeAi.source === "env") {
    aiSource = "env";
    aiProvider = "cloudflare";
    aiAccount = activeAi.account_id;
    aiKey = activeAi.api_key;
    aiBaseUrl = "";
    aiModel = activeAi.model;
  } else if (kvAi && (kvAi.provider || kvAi.api_key || kvAi.account_id || kvAi.base_url)) {
    aiSource = activeAi ? "kv" : "none";
    aiProvider = String(kvAi.provider || "cloudflare");
    aiAccount = String(kvAi.account_id || "");
    aiKey = String(kvAi.api_key || "");
    aiBaseUrl = String(kvAi.base_url || "");
    aiModel = String(kvAi.model || (aiProvider === "cloudflare" ? DEFAULT_CF_MODEL : ""));
  }

  // 判定 floccus 配置
  const fl = kv.floccus || {};
  const floccusPath = String(fl.xbel_path || DEFAULT_FLOCCUS_PATH);

  // 判定站点品牌配置（明文回显）
  const siteTitle = typeof kv.site_title === "string" ? kv.site_title : "";
  const siteFooter = typeof kv.site_footer === "string" ? kv.site_footer : "";

  return {
    site_title: siteTitle,
    site_footer: siteFooter,
    ext_engines: normalizeExtEngines(kv.ext_engines),
    webdav: {
      url: wdUrl,
      user: wdUser,
      pass_set: !!wdPass,
      pass_mask: maskSecret(wdPass),
    },
    ai: {
      provider: aiProvider,
      account_id: aiAccount,
      api_key_set: !!aiKey,
      api_key_mask: maskSecret(aiKey),
      base_url: aiBaseUrl,
      model: aiModel,
    },
    floccus: {
      xbel_path: floccusPath,
    },
    source: {
      webdav: wdSource,
      ai: aiSource,
    },
  };
}

// 外搜引擎白名单（站内无结果时用）：后台可勾选启用哪几个，顺序固定为此表顺序
export const EXT_ENGINE_IDS = ["bing", "google", "github"];
export function normalizeExtEngines(v) {
  if (!Array.isArray(v)) return [...EXT_ENGINE_IDS];
  const picked = EXT_ENGINE_IDS.filter((id) => v.includes(id));
  return picked.length ? picked : [...EXT_ENGINE_IDS];
}

// 获取生效的站点品牌文案（未配置或为空时回退至中性默认值）
export async function getSiteConfig(env) {
  const kv = await getKvConfig(env);
  const site_title = typeof kv.site_title === "string" && kv.site_title.trim() ? kv.site_title.trim() : "书签导航";
  const site_footer = typeof kv.site_footer === "string" ? kv.site_footer.trim() : "";
  const ext_engines = normalizeExtEngines(kv.ext_engines);
  return { site_title, site_footer, ext_engines };
}

export async function getFloccusConfig(env) {
  const kv = await getKvConfig(env);
  const fl = kv.floccus || {};
  let xbel_path = String(fl.xbel_path || "").trim();
  if (!xbel_path) xbel_path = DEFAULT_FLOCCUS_PATH;
  return {
    xbel_path,
  };
}

export function resolveFloccusUrl(webdavUrl, relativePath) {
  const rel = String(relativePath || "").trim();
  if (!rel || rel.includes("://") || rel.startsWith("//") || rel.includes("..")) {
    throw new Error("Floccus XBEL 路径不合法（只允许相对路径，禁止跨域或跨根访问）");
  }
  const cleanRel = rel.replace(/^\/+/, "");
  const base = String(webdavUrl || "").trim();
  if (!/^https?:\/\//i.test(base)) {
    throw new Error("WebDAV 基础地址未配置或格式不正确");
  }
  const parsedBase = new URL(base);
  let basePath = parsedBase.pathname;
  if (!basePath.endsWith("/")) {
    basePath = basePath.slice(0, basePath.lastIndexOf("/") + 1);
  }
  parsedBase.pathname = basePath + cleanRel;
  return parsedBase.toString();
}

