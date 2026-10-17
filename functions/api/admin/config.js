// GET / PUT /api/admin/config
// 读取与保存后台配置（WebDAV 备份与 AI 补简介）
// 需管理员会话 Cookie 或 Bearer ADMIN_API_TOKEN。

import { json, requireAuth } from "../../_lib/util.js";
import {
  getConfigSummary,
  getKvConfig,
  saveKvConfig,
  AI_PROVIDERS,
  DEFAULT_FLOCCUS_PATH,
} from "../../_lib/config.js";

export async function onRequestGet(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;

  const { env } = context;
  const summary = await getConfigSummary(env);
  return json(summary);
}

export async function onRequestPut(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;

  const { request, env } = context;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "请求体不是有效的 JSON 数据" }, 400);
  }
  const kv = await getKvConfig(env);

  const groupErrors = {};
  let updatedWd = false;
  let updatedAi = false;

  // 1. 处理 WebDAV 配置
  if (body.webdav && typeof body.webdav === "object") {
    if (body.webdav.clear === true) {
      delete kv.webdav;
      updatedWd = true;
    } else {
      const inputUrl = String(body.webdav.url || "").trim();
      if (inputUrl && !/^https?:\/\//i.test(inputUrl)) {
        groupErrors.webdav = "WebDAV 网址必须以 http:// 或 https:// 开头";
      } else {
        const prevWd = kv.webdav || {};
        const submittedPass = typeof body.webdav.pass === "string" ? body.webdav.pass.trim() : "";
        const existingPass = prevWd.pass || "";

        if (!existingPass && !submittedPass) {
          groupErrors.webdav = "该配置尚未在后台存过密钥，环境变量里的密钥不会自动搬入，请重新输入一次密钥再保存。";
        } else {
          kv.webdav = {
            url: inputUrl || prevWd.url || "",
            user: typeof body.webdav.user === "string" ? body.webdav.user.trim() : (prevWd.user || ""),
            pass: submittedPass || existingPass,
          };
          updatedWd = true;
        }
      }
    }
  }

  // 2. 处理 AI 配置
  if (body.ai && typeof body.ai === "object") {
    if (body.ai.clear === true) {
      delete kv.ai;
      updatedAi = true;
    } else {
      const provider = String(body.ai.provider || "").trim();
      if (provider && !AI_PROVIDERS.includes(provider)) {
        groupErrors.ai = `不支持的 AI 服务商：${provider}`;
      } else {
        const prevAi = kv.ai || {};
        const submittedKey = typeof body.ai.api_key === "string" ? body.ai.api_key.trim() : "";
        const existingKey = prevAi.api_key || "";

        if (!existingKey && !submittedKey) {
          groupErrors.ai = "该配置尚未在后台存过密钥，环境变量里的密钥不会自动搬入，请重新输入一次密钥再保存。";
        } else {
          kv.ai = {
            provider: provider || prevAi.provider || "cloudflare",
            account_id: typeof body.ai.account_id === "string" ? body.ai.account_id.trim() : (prevAi.account_id || ""),
            api_key: submittedKey || existingKey,
            base_url: typeof body.ai.base_url === "string" ? body.ai.base_url.trim() : (prevAi.base_url || ""),
            model: typeof body.ai.model === "string" ? body.ai.model.trim() : (prevAi.model || ""),
          };
          updatedAi = true;
        }
      }
    }
  }

  // 3. 处理 floccus 配置
  let updatedFl = false;
  if (body.floccus && typeof body.floccus === "object") {
    if (body.floccus.clear === true) {
      delete kv.floccus;
      updatedFl = true;
    } else {
      const p = String(body.floccus.xbel_path || "").trim();
      if (p && (p.includes("://") || p.startsWith("//") || p.includes(".."))) {
        groupErrors.floccus = "floccus 路径必须是相对路径，禁止跨域或跨根访问（防 SSRF）";
      } else {
        kv.floccus = {
          xbel_path: p || DEFAULT_FLOCCUS_PATH,
        };
        updatedFl = true;
      }
    }
  }

  // 4. 处理站点品牌文案配置（site_title / site_footer，明文存储与回显）
  let updatedSite = false;
  if (typeof body.site_title === "string") {
    kv.site_title = body.site_title.trim();
    updatedSite = true;
  }
  if (typeof body.site_footer === "string") {
    kv.site_footer = body.site_footer.trim();
    updatedSite = true;
  }
  if (body.site && typeof body.site === "object") {
    if (typeof body.site.title === "string") {
      kv.site_title = body.site.title.trim();
      updatedSite = true;
    }
    if (typeof body.site.footer === "string") {
      kv.site_footer = body.site.footer.trim();
      updatedSite = true;
    }
  }

  // 若存在有效修改则落库
  if (updatedWd || updatedAi || updatedFl || updatedSite) {
    try {
      await saveKvConfig(env, kv);
    } catch (err) {
      return json({ error: "保存失败：" + (err.message || "KV 写入异常") }, 500);
    }
  }

  const errList = Object.values(groupErrors);
  if (errList.length > 0) {
    const errMsg = errList.join("；");
    // 若同时提交多组且其中一组保存成功，则返回 200 并附带 error 提示
    if (updatedWd || updatedAi || updatedFl || updatedSite) {
      const updatedSummary = await getConfigSummary(env);
      return json({ ok: true, partial: true, error: errMsg, ...updatedSummary });
    }
    // 否则直接以 400 拒绝
    return json({ error: errMsg }, 400);
  }

  const updatedSummary = await getConfigSummary(env);
  return json({ ok: true, ...updatedSummary });
}

