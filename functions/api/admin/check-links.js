// POST /api/admin/check-links {urls:[{id,url}]} — 死链巡检（手动触发，后台分批调用）。
// 每批最多 30 条（Workers 免费版单次调用子请求上限 50，留足余量）。
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
      redirect: "follow",
      signal: ctl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
    });
    try { await r.body?.cancel(); } catch {}
    if (r.status >= 500) return { id, status: "warn", code: r.status, note: "服务器错误" };
    return { id, status: "ok", code: r.status };
  } catch (e) {
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
