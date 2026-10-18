// POST /api/admin/sites/batch — 批量操作接口（删除、移动分类、设为私密）。需会话。
// 采用 D1 batch 事务按每批 50 条切片执行，极省 Worker 额度与请求数并规避 D1 批量上限。
import { json, requireAuth, ensureCategory, addTombstones } from "../../../_lib/util.js";

async function batchInChunks(db, stmts, chunkSize = 50) {
  for (let i = 0; i < stmts.length; i += chunkSize) {
    await db.batch(stmts.slice(i, i + chunkSize));
  }
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
    const { action, ids, target_category, is_private } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return json({ error: "请至少选择一项书签" }, 400);
    }

    const cleanIds = Array.from(new Set(ids.map(Number))).filter((n) => Number.isInteger(n) && n > 0);
    if (!cleanIds.length) {
      return json({ error: "无效的站点 ID 集合" }, 400);
    }

    // 1. 批量删除
    if (action === "delete") {
      const placeholders = cleanIds.map(() => "?").join(",");
      const floccusRows = (
        await env.NAV_DB.prepare(
          `SELECT url FROM sites WHERE id IN (${placeholders}) AND origin = 'floccus'`
        ).bind(...cleanIds).all()
      ).results;

      const stmts = cleanIds.map((id) =>
        env.NAV_DB.prepare("DELETE FROM sites WHERE id = ?").bind(id)
      );
      await batchInChunks(env.NAV_DB, stmts, 50);

      if (floccusRows && floccusRows.length > 0) {
        await addTombstones(env, floccusRows.map((r) => r.url));
      }
      return json({ ok: true, count: cleanIds.length, action: "delete" });
    }

    // 2. 批量设为私密 / 公开
    if (action === "set_private") {
      const privVal = is_private ? 1 : 0;
      const stmts = cleanIds.map((id) =>
        env.NAV_DB.prepare("UPDATE sites SET is_private = ? WHERE id = ?").bind(privVal, id)
      );
      await batchInChunks(env.NAV_DB, stmts, 50);
      return json({ ok: true, count: cleanIds.length, action: "set_private", private: !!is_private });
    }

    // 2.5 批量设为置顶 / 取消置顶
    if (action === "set_pinned") {
      const pinVal = (body.is_pinned ?? body.pinned) ? 1 : 0;
      const stmts = cleanIds.map((id) =>
        env.NAV_DB.prepare("UPDATE sites SET pinned = ? WHERE id = ?").bind(pinVal, id)
      );
      await batchInChunks(env.NAV_DB, stmts, 50);
      return json({ ok: true, count: cleanIds.length, action: "set_pinned", pinned: !!pinVal });
    }

    // 3. 批量移动分类（新站的 sort_order 追加在目标分类现有最大值之后，+10 递增）
    if (action === "move") {
      const targetCatName = String(target_category || "").trim();
      if (!targetCatName) {
        return json({ error: "目标分类名不能为空" }, 400);
      }
      if (targetCatName.length > 20) {
        return json({ error: "分类名不能超过 20 个字符" }, 400);
      }

      const catId = await ensureCategory(env.NAV_DB, targetCatName);
      const maxRow = await env.NAV_DB.prepare(
        "SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM sites WHERE category_id = ?"
      ).bind(catId).first();
      let currentMax = Number(maxRow && maxRow.max_sort) || 0;

      const stmts = cleanIds.map((id) => {
        currentMax += 10;
        return env.NAV_DB.prepare(
          "UPDATE sites SET category_id = ?, sort_order = ? WHERE id = ?"
        ).bind(catId, currentMax, id);
      });

      await batchInChunks(env.NAV_DB, stmts, 50);
      return json({ ok: true, count: cleanIds.length, action: "move", target_category: targetCatName });
    }

    return json({ error: "不支持的批量操作类型" }, 400);
  } catch (err) {
    return json({ error: err.message || "批量操作失败" }, 500);
  }
}
