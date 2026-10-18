// POST /api/admin/check-links {urls:[{id,url}]} — 死链巡检（手动触发，后台分批调用）。
// 每批最多 30 条；抓取不跟随重定向（3xx 本身即存活证据），子请求与网址严格 1:1，
// 不会被跳转跳数放大而顶破 Workers 免费版单次 50 个子请求的上限。
// 判定：能连上且状态码 <500 = ok（401/403/405 等说明主机活着）；5xx = warn（服务器异常）；连不上/超时/DNS 失败 = dead。
// 只报告、永不自动删除，删不删由站长在结果里逐条决定。
import { json, requireAuth } from "../../_lib/util.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TIMEOUT_MS = 6000;
const MAX_BATCH = 30;

async function checkOne(u) {
  const id = u?.id;
  const url = String(u?.url || "").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return { id, status: "dead", code: 0, note: "网址格式不对" };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: ctl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
    });
    try { await r.body?.cancel(); } catch {}
    // Workers 抓无法解析的域名时可能回 530 而非抛错，对访客而言等于站点不存在，归失联
    if (r.status === 530) return { id, status: "dead", code: 530, note: "域名解析失败" };
    if (r.status >= 500) return { id, status: "warn", code: r.status, note: "服务器错误" };
    return { id, status: "ok", code: r.status };
  } catch (e) {
    // 平台子请求额度耗尽是巡检自身的问题，绝不能误报成站点失联（会诱导误删）
    const msg = String(e?.message || "") + " " + String(e?.name || "");
    if (/subrequest/i.test(msg)) {
      return { id, status: "error", code: 0, note: "平台子请求额度不足，本条未检完，请稍后重试" };
    }
    return { id, status: "dead", code: 0, note: e?.name === "AbortError" ? "超时" : "连不上" };
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: "请求格式不对" }, 400); }
  const urls = Array.isArray(body?.urls) ? body.urls.slice(0, MAX_BATCH) : [];
  if (!urls.length) return json({ error: "没有要巡检的网址" }, 400);
  const results = await Promise.all(urls.map(checkOne));
  return json({ results });
}
