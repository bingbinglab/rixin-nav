// POST /api/admin/config/test-webdav
// 测试 WebDAV 连通性（向目标发送 Depth: 0 PROPFIND 请求）。
// 需管理员会话 Cookie 或 Bearer ADMIN_API_TOKEN。

import { json, requireAuth, toBase64 } from "../../../_lib/util.js";
import { getWebdavConfig } from "../../../_lib/config.js";

function getHostname(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getParentDirUrl(u) {
  try {
    const parsed = new URL(u);
    let pathname = parsed.pathname;
    const clean = pathname.replace(/\/+$/, "");
    const lastSlash = clean.lastIndexOf("/");
    if (lastSlash >= 0) {
      parsed.pathname = clean.slice(0, lastSlash + 1);
      return parsed.toString();
    }
    parsed.pathname = "/";
    return parsed.toString();
  } catch {
    return null;
  }
}

async function propfind(url, auth, signal) {
  return await fetch(url, {
    method: "PROPFIND",
    headers: {
      Authorization: auth,
      Depth: "0",
    },
    signal,
  });
}

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;

  const { request, env } = context;
  const body = await request.json().catch(() => ({}));

  let targetUrl = String(body.url || "").trim();
  let targetUser = String(body.user || "").trim();
  let targetPass = typeof body.pass === "string" ? body.pass.trim() : "";

  // P06: 仅当草稿 url 的域名与已存生效配置的域名一致时才允许密码留空复用；域名不同且未填密码 -> 报错
  const activeCfg = await getWebdavConfig(env);
  if (!targetPass) {
    if (activeCfg && activeCfg.pass) {
      const activeHost = getHostname(activeCfg.url);
      const targetHost = getHostname(targetUrl);
      if (targetUrl && activeHost && targetHost !== activeHost) {
        return json({ error: "地址已变更，请填写新地址对应的密码" }, 400);
      }
      targetPass = activeCfg.pass;
      if (!targetUrl) targetUrl = activeCfg.url;
      if (!targetUser) targetUser = activeCfg.user;
    }
  }

  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return json({ error: "WebDAV 网址格式不正确（需以 http:// 或 https:// 开头）" }, 400);
  }
  if (!targetUser) {
    return json({ error: "请填写 WebDAV 账号" }, 400);
  }
  if (!targetPass) {
    return json({ error: "请填写 WebDAV 应用密码（未提供且无已存密码）" }, 400);
  }

  const authHeader = "Basic " + toBase64(`${targetUser}:${targetPass}`);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);

  try {
    const isJsonFile = /\.json$/i.test(targetUrl);

    // P03: 目标本身是 .json 文件路径时先测父目录再下结论
    if (isJsonFile) {
      const parentUrl = getParentDirUrl(targetUrl);
      if (parentUrl && parentUrl !== targetUrl) {
        const rParent = await propfind(parentUrl, authHeader, ctl.signal);
        if (rParent.status === 401 || rParent.status === 403) {
          return json({
            error: "账号或密码不对。若使用坚果云，请使用坚果云「账户信息 - 安全设置」中生成的应用密码，而非登录密码。",
          }, 400);
        }
        if (rParent.ok || rParent.status === 207) {
          // 父级目录通畅，再检查文件是否已存在
          const rFile = await propfind(targetUrl, authHeader, ctl.signal);
          if (rFile.ok || rFile.status === 207) {
            return json({ ok: true, message: `连接成功，备份文件已存在（HTTP ${rFile.status}）` });
          }
          return json({ ok: true, message: "目标文件尚不存在（首次备份时会自动创建），目录连通正常" });
        }
        return json({
          error: `WebDAV 父目录探测返回状态码 HTTP ${rParent.status}，请核对地址与权限`,
        }, 400);
      }
    }

    // 常规目录探测
    const r = await propfind(targetUrl, authHeader, ctl.signal);

    // WebDAV 标准响应：207 Multi-Status 或 2xx 均视为连通正常
    if (r.ok || r.status === 207) {
      return json({ ok: true, message: `连接成功（HTTP ${r.status}）` });
    }

    if (r.status === 401 || r.status === 403) {
      return json({
        error: "账号或密码不对。若使用坚果云，请使用坚果云「账户信息 - 安全设置」中生成的应用密码，而非登录密码。",
      }, 400);
    }

    // P03: 若目标返回 404，自动对父级目录再 PROPFIND 一次
    if (r.status === 404) {
      const parentUrl = getParentDirUrl(targetUrl);
      if (parentUrl && parentUrl !== targetUrl) {
        const rParent = await propfind(parentUrl, authHeader, ctl.signal);
        if (rParent.status === 401 || rParent.status === 403) {
          return json({
            error: "账号或密码不对。若使用坚果云，请使用坚果云「账户信息 - 安全设置」中生成的应用密码，而非登录密码。",
          }, 400);
        }
        if (rParent.ok || rParent.status === 207) {
          return json({ ok: true, message: "目标文件尚不存在（首次备份时会自动创建），目录连通正常" });
        }
        return json({
          error: "WebDAV 目标及父级目录均不存在（HTTP 404），请核对地址与目录结构",
        }, 400);
      }
    }

    return json({
      error: `WebDAV 服务器返回状态码 HTTP ${r.status}，请核对地址与权限`,
    }, 400);
  } catch (err) {
    if (err.name === "AbortError") {
      return json({ error: "连接超时（12 秒），请检查网络或 WebDAV 服务地址" }, 504);
    }
    return json({ error: "连接失败：" + (err.message || "网络请求异常") }, 502);
  } finally {
    clearTimeout(timer);
  }
}
