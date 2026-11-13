// GET/POST /api/admin/deadlink-report — 死链巡检报告留存（只存最后一份，KV 单键）。
// 巡检仍是手动触发、只报告永不自动删；这份留存只是让上次结果刷新不丢，方便站长回看。
// 报告体由前端巡检完成后提交：{ ts, total, alive, dead: [...], suspect: [...] }，
// 条目只留 id/name/url/status/code/note，入库前逐项收敛形状并限量，防脏数据撑大 KV 值。
import { json, requireAuth } from "../../_lib/util.js";

const KV_KEY = "deadlink-report";
const MAX_ITEMS = 1000;

function cleanEntry(e) {
  if (!e || typeof e !== "object") return null;
  const url = String(e.url || "").slice(0, 2048);
  if (!url) return null;
  return {
    id: Number.isFinite(+e.id) ? +e.id : 0,
    name: String(e.name || "").slice(0, 200),
    url,
    status: ["dead", "warn", "error"].includes(e.status) ? e.status : "warn",
    code: Number.isFinite(+e.code) ? +e.code : 0,
    note: String(e.note || "").slice(0, 200),
  };
}

function cleanList(v) {
  if (!Array.isArray(v)) return [];
  return v.map(cleanEntry).filter(Boolean).slice(0, MAX_ITEMS);
}

export async function onRequestGet(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const raw = await context.env.NAV_KV.get(KV_KEY);
  if (!raw) return json({ report: null });
  try {
    return json({ report: JSON.parse(raw) });
  } catch {
    return json({ report: null });
  }
}

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: "请求格式不对" }, 400); }
  const src = body && typeof body === "object" ? (body.report ?? body) : null;
  if (!src || typeof src !== "object") return json({ error: "报告格式不对" }, 400);
  const report = {
    ts: Number.isFinite(+src.ts) ? +src.ts : Date.now(),
    total: Number.isFinite(+src.total) ? Math.max(0, Math.trunc(+src.total)) : 0,
    alive: Number.isFinite(+src.alive) ? Math.max(0, Math.trunc(+src.alive)) : 0,
    dead: cleanList(src.dead),
    suspect: cleanList(src.suspect),
  };
  await context.env.NAV_KV.put(KV_KEY, JSON.stringify(report));
  return json({ ok: true });
}
