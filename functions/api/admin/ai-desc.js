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
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" }, signal: ctl.signal, redirect: "follow" });
    clearTimeout(timer);
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

  } catch {
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
