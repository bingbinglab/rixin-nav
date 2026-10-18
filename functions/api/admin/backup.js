// WebDAV 备份（标准 WebDAV）。需会话或机器令牌。
// 优先读环境变量，兜底读后台 KV 配置（functions/_lib/config.js）。
import { json, requireAuth, resolveBackupUrls, toBase64 } from "../../_lib/util.js";
import { getWebdavConfig } from "../../_lib/config.js";

async function exportData(env) {
  const cats = await env.NAV_DB.prepare("SELECT id, name, parent_id, is_private, sort_order FROM category ORDER BY sort_order, id").all();
  const nameById = new Map(cats.results.map((c) => [c.id, c.name]));
  const rows = await env.NAV_DB.prepare(
    `SELECT s.name, s.url, s.desc, s.icon, s.pinned, s.is_private, s.sort_order, s.origin, c.name AS category
       FROM sites s JOIN category c ON c.id = s.category_id ORDER BY c.sort_order, s.sort_order, s.id`
  ).all();
  return {
    app: "rixin-jilan",
    version: 2,
    exported_at: new Date().toISOString(),
    categories: cats.results.map((c) => ({
      name: c.name, parent: c.parent_id ? nameById.get(c.parent_id) || null : null,
      private: c.is_private === 1, sort_order: c.sort_order,
    })),
    sites: rows.results.map((r) => ({
      name: r.name, url: r.url, desc: r.desc || "", category: r.category, icon: r.icon || "",
      pinned: r.pinned === 1, private: r.is_private === 1, sort_order: r.sort_order,
      origin: r.origin || "manual",
    })),
  };
}

// POST /api/admin/backup — WebDAV 双轨制备份：主文件直写 ＋ 4 槽位轮换快照
export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { env } = context;
  if (context.request.method !== "POST") return json({ error: "method" }, 405);

  const cfg = await getWebdavConfig(env);
  if (!cfg) {
    return json({ error: "未配置 WebDAV（请先在后台设置或环境变量中配置 WebDAV 地址、账号与应用密码）" }, 503);
  }

  const { mainUrl, currentSlot, slotUrl } = resolveBackupUrls(cfg.url);
  const auth = "Basic " + toBase64(`${cfg.user}:${cfg.pass}`);
  const data = await exportData(env);
  const jsonBody = JSON.stringify(data, null, 2);

  // 1. 写入站长指定的主文件（永远是最新全量镜像）
  const rMain = await fetch(mainUrl, {
    method: "PUT",
    headers: { "Authorization": auth, "Content-Type": "application/json; charset=utf-8" },
    body: jsonBody,
  });
  if (!rMain.ok) return json({ error: `WebDAV 主备份写入失败（HTTP ${rMain.status}），检查地址与应用密码` }, 502);

  // 2. 轮换写入当前周对应的历史快照槽位 (slot1 ~ slot4)
  let slotSaved = false;
  let slotError = null;
  try {
    const rSlot = await fetch(slotUrl, {
      method: "PUT",
      headers: { "Authorization": auth, "Content-Type": "application/json; charset=utf-8" },
      body: jsonBody,
    });
    slotSaved = rSlot.ok;
    if (!rSlot.ok) {
      slotError = `HTTP ${rSlot.status}`;
      console.warn(`WebDAV 轮换槽位备份写入失败：HTTP ${rSlot.status}`);
    }
  } catch (err) {
    slotSaved = false;
    slotError = err ? (err.message || String(err)) : "网络异常";
    console.warn("WebDAV 轮换槽位备份写入异常：", err);
  }

  return json({
    ok: true,
    sites: data.sites.length,
    categories: data.categories.length,
    at: data.exported_at,
    slot: currentSlot,
    slotSaved,
    slotError,
  });
}
