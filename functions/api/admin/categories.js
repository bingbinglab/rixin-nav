// /api/admin/categories — 分类新增（POST，可带 parent_id 建二级分类）。列表随 /api/admin/sites 一并返回。需会话。
import { json, requireAuth } from "../../_lib/util.js";

// 父级校验：必须存在且本身是顶级分类（最多两级，防止树失控）
export async function validParent(db, parentId, selfId = 0) {
  if (!parentId) return { ok: true, parentId: 0 };
  if (parentId === selfId) return { ok: false, error: "不能把自己设为父级" };
  const p = await db.prepare("SELECT id, parent_id FROM category WHERE id=?").bind(parentId).first();
  if (!p) return { ok: false, error: "父级分类不存在" };
  if (p.parent_id) return { ok: false, error: "最多两级分类：父级必须是一级分类" };
  return { ok: true, parentId: p.id };
}

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "请求体不是有效的 JSON 数据" }, 400);
    }
    const name = String(body.name || "").trim();
    if (!name) return json({ error: "分类名必填" }, 400);
    const dup = await env.NAV_DB.prepare("SELECT id FROM category WHERE name=?").bind(name).first();
    if (dup) return json({ error: "这个分类已经有了" }, 409);
    const pv = await validParent(env.NAV_DB, Number(body.parent_id) || 0);
    if (!pv.ok) return json({ error: pv.error }, 400);
    const res = await env.NAV_DB.prepare(
      "INSERT INTO category (name, parent_id, is_private, sort_order) VALUES (?, ?, ?, ?)"
    ).bind(name, pv.parentId, body.private || body.is_private ? 1 : 0,
      Number.isFinite(+body.sort_order) ? +body.sort_order : 0).run();
    return json({ ok: true, id: res.meta.last_row_id });
  } catch (err) {
    return json({ error: err.message || "新增分类失败" }, 500);
  }
}
