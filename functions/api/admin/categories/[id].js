// /api/admin/categories/:id — 改名/父级/排序/私密（PUT）与删除（DELETE，有书签或子分类时拒绝）。需会话。
import { json, requireAuth } from "../../../_lib/util.js";
import { validParent } from "../categories.js";

export async function onRequestPut(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { request, env, params } = context;
  const id = +params.id;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "请求体不是有效的 JSON 数据" }, 400);
    }
    const row = await env.NAV_DB.prepare("SELECT * FROM category WHERE id=?").bind(id).first();
    if (!row) return json({ error: "没有这个分类" }, 404);
    const name = String(body.name ?? row.name).trim();
    if (!name) return json({ error: "分类名必填" }, 400);
    const dup = await env.NAV_DB.prepare("SELECT id FROM category WHERE name=? AND id<>?").bind(name, id).first();
    if (dup) return json({ error: "这个分类名已经被占用" }, 409);

    let parentId = row.parent_id || 0;
    if (body.parent_id !== undefined) {
      const pv = await validParent(env.NAV_DB, Number(body.parent_id) || 0, id);
      if (!pv.ok) return json({ error: pv.error }, 400);
      // 自己有子分类时不能降为二级（会变三级）
      if (pv.parentId) {
        const kid = await env.NAV_DB.prepare("SELECT id FROM category WHERE parent_id=? LIMIT 1").bind(id).first();
        if (kid) return json({ error: "这个分类下有子分类，不能再降为二级" }, 400);
      }
      parentId = pv.parentId;
    }
    const isPrivate = (body.private ?? body.is_private) !== undefined
      ? (body.private ?? body.is_private ? 1 : 0)
      : row.is_private;
    const sortOrder = Number.isFinite(+body.sort_order) && body.sort_order !== undefined
      ? +body.sort_order
      : row.sort_order;

    await env.NAV_DB.prepare("UPDATE category SET name=?, parent_id=?, is_private=?, sort_order=? WHERE id=?")
      .bind(name, parentId, isPrivate, sortOrder, id).run();
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message || "修改分类失败" }, 500);
  }
}

export async function onRequestDelete(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { env, params } = context;
  const id = +params.id;
  try {
    const [kidsRes, usedRes] = await env.NAV_DB.batch([
      env.NAV_DB.prepare("SELECT COUNT(*) AS n FROM category WHERE parent_id=?").bind(id),
      env.NAV_DB.prepare("SELECT COUNT(*) AS n FROM sites WHERE category_id=?").bind(id),
    ]);
    const kidsCount = (kidsRes.results && kidsRes.results[0] && kidsRes.results[0].n) || 0;
    if (kidsCount > 0) return json({ error: `这个分类下还有 ${kidsCount} 个子分类，先处理它们再删` }, 409);
    const usedCount = (usedRes.results && usedRes.results[0] && usedRes.results[0].n) || 0;
    if (usedCount > 0) return json({ error: `这个分类下还有 ${usedCount} 条书签，先移走再删` }, 409);
    await env.NAV_DB.prepare("DELETE FROM category WHERE id=?").bind(id).run();
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message || "删除分类失败" }, 500);
  }
}
