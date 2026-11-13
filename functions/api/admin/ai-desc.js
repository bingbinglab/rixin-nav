// POST /api/admin/ai-desc {url} — 给站点补一句话简介。需会话或机器令牌。
// 先抓目标页的标题与 meta 描述；若配了 AI（优先环境变量，兜底后台 KV 配置），再让模型润成一句 ≤24 字的中文简介；
// AI 不可用时直接用抓取结果兜底，保证功能永远可用。
import { json, requireAuth } from "../../_lib/util.js";
import { getAiConfig } from "../../_lib/config.js";
import { hostnameBlocked, ipBlocked } from "../../_lib/netguard.js";
import { generateDesc } from "../../_lib/ai.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function pick(html, re) {
  const m = html.match(re);
  return m ? m[1].trim().replace(/\s+/g, " ") : "";
}

function extract(html) {
  const title = pick(html, /<title[^>]*>([^<]{1,200})<\/title>/i);
  const meta =
    pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i) ||
    pick(html, /<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i) ||
    pick(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,300})["']/i) ||
    pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,200})["']/i);
  return { title, meta };
}

function blockedError(message) {
  const e = new Error(message);
  e.blocked = true;
  return e;
}

async function assertPublicUrl(raw, signal) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw blockedError("网址不合法");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw blockedError("只允许 http/https 网址");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (hostnameBlocked(host)) throw blockedError("目标地址属于内网或保留地址，已拒绝抓取");
  // 域名再查解析结果，防公网域名指向内网地址。
  // 校验口径 fail-closed：DoH 查询失败（网络错/非 200/响应不可解析）直接拒绝抓取，不放行未验地址。
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(":")) {
    const types = [1, 28];
    const queries = await Promise.all(
      types.map((t) =>
        fetch("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(host) + "&type=" + t, {
          headers: { Accept: "application/dns-json" },
          signal,
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch((e) => {
            if (e && e.name === "AbortError") throw e; // 整体超时按原样上抛，不误报为 DoH 故障
            return null;
          })
      )
    );
    if (queries.some((j) => !j)) {
      throw blockedError("域名解析校验失败（DoH 查询不可用），已拒绝抓取");
    }
    for (const j of queries) {
      const answers = Array.isArray(j.Answer) ? j.Answer : [];
      for (const an of answers) {
        if ((an.type === 1 || an.type === 28) && ipBlocked(an.data)) {
          throw blockedError("目标域名解析到内网或保留地址，已拒绝抓取");
        }
      }
    }
  }
  return u.toString();
}

function fallbackDesc({ title, meta }, url) {
  let d = meta || title || "";
  // 标题里常见的「- 站点名」「_副标题」尾巴砍掉，留主体
  if (!meta && d) d = d.split(/\s*[-_|–—]\s*/)[0];
  // meta 常带「站名 - 」前缀（如「斗鱼 - 看见每种热爱…」），砍掉，只留正文
  if (meta) d = d.replace(/^.{1,10}?\s+[-–—]\s+/, "");
  // 全站简介都是十来字的一句话：超 24 字时优先在标点处收尾，没有标点才硬截
  if (d.length > 24) {
    const head = d.slice(0, 24);
    const cut = Math.max(...["，", "。", "、", "；", "：", "·", "！", "？"].map((p) => head.lastIndexOf(p)));
    d = cut >= 8 ? head.slice(0, cut) : head;
  }
  return d || ("访问 " + (() => { try { return new URL(url).hostname; } catch { return url; } })());
}

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  const url = String(body.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return json({ error: "网址不合法" }, 400);

  let info = { title: "", meta: "" };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    // 手动跟随重定向：每一跳都重新做 SSRF 校验，防跳转到内网地址
    let current = url;
    let r = null;
    for (let hop = 0; hop <= 5; hop++) {
      current = await assertPublicUrl(current, ctl.signal);
      r = await fetch(current, { headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" }, signal: ctl.signal, redirect: "manual" });
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const loc = r.headers.get("location");
        if (!loc) break;
        current = new URL(loc, current).toString();
        r = null;
        continue;
      }
      break;
    }
    // 计时器不在这里清：9 秒预算要连响应体一起管，
    // 否则对方回完响应头后慢吞吞滴响应体，reader.read() 能无限期挂住
    if (!r) return json({ error: "目标网站重定向次数过多，已停止抓取" }, 422);
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html")) {
      return json({ error: "目标地址不是 HTML 网页，无法提取简介" }, 422);
    }
    let html = "";
    if (r.body) {
      const reader = r.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      let totalBytes = 0;
      const MAX_BYTES = 200 * 1024; // 200KB

      try {
        while (totalBytes < MAX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          html += decoder.decode(value, { stream: true });
          if (totalBytes >= MAX_BYTES) {
            await reader.cancel();
            break;
          }
        }
      } catch {
        // stream cancel
      }
    } else {
      html = (await r.text()).slice(0, 200000);
    }
    clearTimeout(timer);
    info = extract(html);

  } catch (e) {
    if (e && e.blocked) return json({ error: e.message }, 400);
    return json({ error: "抓不到这个网站（可能需要登录或拒绝访问），请手动填简介" }, 422);
  }
  if (!info.title && !info.meta) return json({ error: "这个网站没给出可用的标题/描述，请手动填简介" }, 422);

  // AI 润色（可选）：优先读环境变量，兜底读后台 KV 配置
  const aiConfig = await getAiConfig(env);
  if (aiConfig) {
    try {
      const text = await generateDesc(aiConfig, { title: info.title, meta: info.meta, url });
      if (text) {
        return json({ ok: true, desc: text, source: "ai", title: info.title });
      }
    } catch {
      // AI 失败静默落到下方抓取兜底，保证功能永远可用
    }
  }

  return json({ ok: true, desc: fallbackDesc(info, url), source: "meta", title: info.title });
}
