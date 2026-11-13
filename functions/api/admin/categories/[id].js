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

    // 只写请求实际带了的字段：全字段写回会让并发的两个局部修改互相覆盖（各自拿着旧快照）
    const sets = [];
    const binds = [];
    let newParentId = null; // null = 本次不改父级

    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim();
      if (!name) return json({ error: "分类名必填" }, 400);
      if (name.length > 20) return json({ error: "分类名不能超过 20 个字符" }, 400);
      if (name !== row.name) {
        const dup = await env.NAV_DB.prepare("SELECT id FROM category WHERE name=? AND id<>?").bind(name, id).first();
        if (dup) return json({ error: "这个分类名已经被占用" }, 409);
      }
      sets.push("name = ?");
      binds.push(name);
    }

    if (body.parent_id !== undefined) {
      const pv = await validParent(env.NAV_DB, Number(body.parent_id) || 0, id);
      if (!pv.ok) return json({ error: pv.error }, 400);
      // 自己有子分类时不能降为二级（会变三级）
      if (pv.parentId) {
        const kid = await env.NAV_DB.prepare("SELECT id FROM category WHERE parent_id=? LIMIT 1").bind(id).first();
        if (kid) return json({ error: "这个分类下有子分类，不能再降为二级" }, 400);
      }
      newParentId = pv.parentId;
      sets.push("parent_id = ?");
      binds.push(newParentId);
    }

    const privRaw = body.private ?? body.is_private;
    if (privRaw !== undefined) {
      sets.push("is_private = ?");
      binds.push(privRaw ? 1 : 0);
    }

    if (body.sort_order !== undefined && Number.isFinite(+body.sort_order)) {
      sets.push("sort_order = ?");
      binds.push(+body.sort_order);
    }

    if (!sets.length) return json({ ok: true });

    if (newParentId) {
      // 防环：把「目标父级不在自身子树内」的校验做进同一条 UPDATE——
      // anc 是目标父级一路向上（含其自身）的祖先集合，自身 id 出现在里面即成环，WHERE 直接挡下。
      // 与前面的 validParent 预检不同，这条校验与写入是同一条语句、同一时刻的快照：
      // 两处并发互设父级时，后执行的那条必然看到先执行的结果，环造不出来
      const res = await env.NAV_DB.prepare(
        `WITH RECURSIVE anc(id) AS (
           SELECT ?
           UNION ALL
           SELECT c.parent_id FROM category AS c INNER JOIN anc ON c.id = anc.id
           WHERE c.parent_id IS NOT NULL AND c.parent_id <> 0
         )
         UPDATE category SET ${sets.join(", ")} WHERE id = ? AND NOT EXISTS (SELECT 1 FROM anc WHERE anc.id = ?)`
      ).bind(newParentId, ...binds, id, id).run();
      if (!res.meta.changes) {
        return json({ error: "不能这样设置父级：会形成循环层级" }, 400);
      }
    } else {
      await env.NAV_DB.prepare(`UPDATE category SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
    }
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
