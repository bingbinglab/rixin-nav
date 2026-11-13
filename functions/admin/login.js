// POST /admin/login — 口令校验（环境变量 ADMIN_PASSWORD），成功发 HttpOnly 会话 Cookie（KV 存 token，7 天）。
// 登录限速：以 CF-Connecting-IP 为单位，连续失败 5 次锁定 15 分钟；锁定期直接 429 且不校验口令；登录成功立即清零。
// 计数主存 D1：单条 UPSERT 原子自增，消除 KV 读-改-写在并发下丢计数的毛病（同 IP 并发错登曾可绕过锁定）；
// D1 不可用时回退原 KV 逻辑。阈值与窗口口径与旧版完全一致（5 次 / 最近一次失败起 15 分钟滑动窗口）。
import { json, createSession, sessionCookieHeader, passwordMatches } from "../_lib/util.js";

const FAIL_LIMIT = 5;
const LOCK_TTL = 15 * 60; // 15 分钟（900 秒）

let ipFailTableChecked = false;

async function ensureIpFailTable(db) {
  if (ipFailTableChecked) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS login_failures_ip (
      ip           TEXT PRIMARY KEY,
      fail_count   INTEGER NOT NULL DEFAULT 0,
      last_fail_at INTEGER NOT NULL DEFAULT 0
    )
  `).run();
  ipFailTableChecked = true;
}

async function readFails(env, ip, failKey) {
  if (env.NAV_DB) {
    try {
      await ensureIpFailTable(env.NAV_DB);
      const row = await env.NAV_DB.prepare(
        "SELECT fail_count, last_fail_at FROM login_failures_ip WHERE ip = ?"
      ).bind(ip).first();
      if (!row) return 0;
      const nowSec = Math.floor(Date.now() / 1000);
      return nowSec - (Number(row.last_fail_at) || 0) < LOCK_TTL ? Number(row.fail_count) || 0 : 0;
    } catch (err) {
      console.error("D1 登录限速查询异常，回退 KV 逻辑：", err);
    }
  }
  return Number(await env.NAV_KV.get(failKey)) || 0;
}

async function recordFail(env, ip, failKey) {
  if (env.NAV_DB) {
    try {
      await ensureIpFailTable(env.NAV_DB);
      const nowSec = Math.floor(Date.now() / 1000);
      const row = await env.NAV_DB.prepare(`
        INSERT INTO login_failures_ip (ip, fail_count, last_fail_at)
        VALUES (?1, 1, ?2)
        ON CONFLICT(ip) DO UPDATE SET
          fail_count = CASE WHEN ?2 - login_failures_ip.last_fail_at >= ?3 THEN 1 ELSE login_failures_ip.fail_count + 1 END,
          last_fail_at = ?2
        RETURNING fail_count
      `).bind(ip, nowSec, LOCK_TTL).first();
      if (row) return Number(row.fail_count);
    } catch (err) {
      console.error("D1 登录限速记录异常，回退 KV 逻辑：", err);
    }
  }
  const cur = Number(await env.NAV_KV.get(failKey)) || 0;
  const next = cur + 1;
  await env.NAV_KV.put(failKey, String(next), { expirationTtl: LOCK_TTL });
  return next;
}

async function clearFails(env, ip, failKey) {
  if (env.NAV_DB) {
    try {
      await ensureIpFailTable(env.NAV_DB);
      await env.NAV_DB.prepare("DELETE FROM login_failures_ip WHERE ip = ?").bind(ip).run();
    } catch (err) {
      console.error("D1 登录限速清零异常：", err);
    }
  }
  // KV 里的旧计数一并清掉，避免日后 D1 故障回退时读到陈旧计数
  await env.NAV_KV.delete(failKey);
}

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
  const currentFails = await readFails(env, ip, failKey);
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
    await recordFail(env, ip, failKey);
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
    await clearFails(env, ip, failKey);
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
