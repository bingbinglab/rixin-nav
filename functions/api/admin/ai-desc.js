// POST /api/admin/ai-desc {url} — 给站点补一句话简介。需会话或机器令牌。
// 先抓目标页的标题与 meta 描述；若配了 AI（优先环境变量，兜底后台 KV 配置），再让模型润成一句 ≤24 字的中文简介；
// AI 不可用时直接用抓取结果兜底，保证功能永远可用。
import { json, requireAuth } from "../../_lib/util.js";
import { getAiConfig } from "../../_lib/config.js";
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

// --- SSRF 防护：抓取目标与每一跳重定向都必须是公网地址 ---
function ipv4Blocked(ip) {
  const parts = String(ip).split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

// 把 IPv6 地址解析为 8 组 16 位整数（支持 :: 压缩与末尾点分 IPv4 写法）；形状非法返回 null
function parseIpv6Groups(ip) {
  let host = String(ip).toLowerCase().split("%")[0];
  // 末尾点分 IPv4（如 ::ffff:1.2.3.4）先换成两组十六进制
  if (host.includes(".")) {
    const idx = host.lastIndexOf(":");
    if (idx < 0) return null;
    const v4 = host.slice(idx + 1).split(".").map((x) => Number(x));
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    host = host.slice(0, idx + 1) + hi + ":" + lo;
  }
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const parsePart = (part) => {
    if (!part) return [];
    const groups = part.split(":");
    if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
    return groups.map((g) => parseInt(g, 16));
  };
  const head = parsePart(halves[0]);
  if (head === null) return null;
  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }
  const tail = parsePart(halves[1]);
  if (tail === null) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...Array(missing).fill(0), ...tail];
}

function ipv6Blocked(ip) {
  const host = String(ip).toLowerCase();
  if (/^fe[89ab]/.test(host) || /^f[cd]/.test(host)) return true;
  const g = parseIpv6Groups(host);
  if (!g) return true; // 形状不合法的 IPv6 字面量一律拒绝
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 链路本地
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 唯一本地
  const low32 = [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join(".");
  // ::/96 兼容段（::、::1 与 ::点分形式都落在这里）：低 32 位即 IPv4 本身
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return ipv4Blocked(low32);
  }
  // ::ffff:x:x（IPv4 映射段，含 ::ffff:7f00:1 这类十六进制写法）与 ::ffff:0:x（IPv4 翻译段）：按内嵌 IPv4 判定
  if (
    g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 &&
    ((g[4] === 0 && g[5] === 0xffff) || (g[4] === 0xffff && g[5] === 0))
  ) {
    return ipv4Blocked(low32);
  }
  return false;
}

function ipBlocked(ip) {
  return String(ip).includes(":") ? ipv6Blocked(ip) : ipv4Blocked(ip);
}

function hostnameBlocked(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return ipBlocked(host);
  return false;
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
    clearTimeout(timer);
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
