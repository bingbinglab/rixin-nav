// /api/admin/sites — 后台书签列表（GET，含私密）与新增（POST）。需会话。
import { json, requireAuth, cleanSite, ensureCategory, ensureOriginColumn } from "../../_lib/util.js";

export async function onRequestGet(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { env } = context;
  await ensureOriginColumn(env.NAV_DB);
  try {
    const [cats, rows] = await env.NAV_DB.batch([
      env.NAV_DB.prepare("SELECT id, name, parent_id, is_private, sort_order FROM category ORDER BY sort_order, id"),
      env.NAV_DB.prepare(
        `SELECT s.id, s.name, s.url, s.desc, s.icon, s.pinned, s.is_private, s.sort_order, s.origin, c.name AS category
           FROM sites s JOIN category c ON c.id = s.category_id
          ORDER BY c.sort_order, s.sort_order, s.id`
      ),
    ]);
    return json({ categories: cats.results, sites: rows.results });
  } catch (err) {
    return json({ error: err.message || "获取书签列表失败" }, 500);
  }
}

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { request, env } = context;
  await ensureOriginColumn(env.NAV_DB);
  try {
    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object") {
      return json({ error: "请求体不是有效的 JSON 数据" }, 400);
    }
    const site = cleanSite(raw);
    if (!site) return json({ error: "站名必填，网址须以 http:// 或 https:// 开头" }, 400);
    const dup = await env.NAV_DB.prepare("SELECT id FROM sites WHERE url = ?").bind(site.url).first();
    let catId;
    if (site.category_id !== null) {
      if (site.category_id === 0) {
        return json({ error: "分类 ID 无效（需为有效正整数）" }, 400);
      }
      const catRow = await env.NAV_DB.prepare("SELECT id, name FROM category WHERE id = ?").bind(site.category_id).first();
      if (!catRow) {
        return json({ error: "指定的分类不存在" }, 400);
      }
      if (site.category && site.category !== catRow.name) {
        return json({ error: `指定的分类 ID (${site.category_id}) 与分类名称「${site.category}」不一致` }, 400);
      }
      catId = catRow.id;
    } else if (site.category) {
      catId = await ensureCategory(env.NAV_DB, site.category);
    } else {
      return json({ error: "未指定分类（需提供 category 或有效 category_id）" }, 400);
    }

    let sortOrder = site.sort_order;
    if (sortOrder === undefined) {
      const maxRow = await env.NAV_DB.prepare(
        "SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM sites WHERE category_id = ?"
      ).bind(catId).first();
      sortOrder = ((maxRow && maxRow.max_sort) || 0) + 10;
    }

    const res = await env.NAV_DB.prepare(
      "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')"
    ).bind(site.name, site.url, site.desc, catId, site.icon, site.pinned, site.is_private, sortOrder).run();
    return json({ ok: true, id: res.meta.last_row_id });
  } catch (err) {
    return json({ error: err.message || "新增书签失败" }, 500);
  }
}
