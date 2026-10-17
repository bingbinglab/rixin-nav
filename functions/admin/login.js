// POST /admin/login — 口令校验（环境变量 ADMIN_PASSWORD），成功发 HttpOnly 会话 Cookie（KV 存 token，7 天）。
// 登录限速：以 CF-Connecting-IP 为单位，连续失败 5 次锁定 15 分钟；锁定期直接 429 且不校验口令；登录成功立即清零。
import { json, createSession, sessionCookieHeader, passwordMatches } from "../_lib/util.js";

const FAIL_LIMIT = 5;
const LOCK_TTL = 15 * 60; // 15 分钟（900 秒）

export async function onRequestPost(context) {
  const { request, env } = context;

  const isJson = (request.headers.get("Accept") || "").includes("application/json") ||
                 (request.headers.get("Content-Type") || "").includes("application/json");

  if (!env.NAV_KV) {
    return isJson
      ? json({ error: "KV 未绑定（NAV_KV），先完成第二阶段绑定再登录。" }, 503)
      : new Response("KV 未绑定（NAV_KV），先完成第二阶段绑定再登录。", { status: 503 });
  }
  if (!env.ADMIN_PASSWORD) {
    return isJson
      ? json({ error: "未设置环境变量 ADMIN_PASSWORD，先在 Pages 设置里添加。" }, 503)
      : new Response("未设置环境变量 ADMIN_PASSWORD，先在 Pages 设置里添加。", { status: 503 });
  }

  const ip = (request.headers.get("CF-Connecting-IP") || "unknown").trim();
  const failKey = `login_fail:${ip}`;

  // 1. 锁定期内该 IP 的登录请求直接报错或 302 重定向
  const currentFails = Number(await env.NAV_KV.get(failKey)) || 0;
  if (currentFails >= FAIL_LIMIT) {
    if (isJson) {
      return json({ error: "尝试次数过多，请 15 分钟后再试" }, 429);
    }
    return new Response(null, {
      status: 302,
      headers: { Location: "/admin?err=limit" },
    });
  }

  let input = "";
  if (isJson) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "请求体不是有效的 JSON 数据" }, 400);
    }
    input = String(body.password || "");
  } else {
    const form = await request.formData().catch(() => new FormData());
    input = String(form.get("password") || "");
  }

  // 2. 口令错误：累计失败次数，窗口/锁定保护期为 15 分钟
  if (!passwordMatches(input, env.ADMIN_PASSWORD)) {
    const nextFails = currentFails + 1;
    await env.NAV_KV.put(failKey, String(nextFails), { expirationTtl: LOCK_TTL });
    if (isJson) {
      return json({ error: "管理口令不正确" }, 401);
    }
    return new Response(null, {
      status: 302,
      headers: { Location: "/admin?err=1" },
    });
  }

  // 3. 登录成功：立即清零该 IP 的失败计数，正常发放会话 Cookie
  if (currentFails > 0) {
    await env.NAV_KV.delete(failKey);
  }

  const token = await createSession(env);
  if (isJson) {
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookieHeader(token) });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: "/admin", "Set-Cookie": sessionCookieHeader(token) },
  });
}
