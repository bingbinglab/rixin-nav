// POST /api/admin/reorder — 批量排序接口。需会话或机器令牌。
// 收 { type: "site" | "category", ids: [id1, id2, ...] }
// 服务端按数组顺序重写 sort_order（D1 batch 一次写完）。
// 任何 id 不存在或重复时整单拒绝、不许写一半。
import { json, requireAuth } from "../../_lib/util.js";

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;

  const { request, env } = context;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "请求体不是有效的 JSON 数据" }, 400);
    }
    const { type, ids } = body;

    if (type !== "site" && type !== "category") {
      return json({ error: "类型必须为 site 或 category" }, 400);
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return json({ error: "ids 必须为非空数组" }, 400);
    }

    const cleanIds = ids.map(Number);
    if (cleanIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return json({ error: "ids 包含无效的 ID" }, 400);
    }

    if (new Set(cleanIds).size !== cleanIds.length) {
      return json({ error: "ids 包含重复的 ID" }, 400);
    }

    // 存在性检查按 50 条切片查询：整表 IN 绑定全部 ID 会撞 D1 的 SQL 变量上限（批量删除同病，2026-10-21 实测）
    async function selectInChunks(selectHead) {
      const out = [];
      for (let i = 0; i < cleanIds.length; i += 50) {
        const chunk = cleanIds.slice(i, i + 50);
        const ph = chunk.map(() => "?").join(",");
        const rows = await env.NAV_DB.prepare(`${selectHead} (${ph})`).bind(...chunk).all();
        out.push(...(rows.results || []));
      }
      return out;
    }

    if (type === "site") {
      // 1. 严格检查全部 ID 是否存在，并按所属分类分组
      const results = await selectInChunks("SELECT id, category_id FROM sites WHERE id IN");
      if (results.length !== cleanIds.length) {
        return json({ error: "存在不存在的 ID，整单拒绝" }, 400);
      }

      const groups = new Map();
      for (const r of results) {
        if (!groups.has(r.category_id)) groups.set(r.category_id, new Set());
        groups.get(r.category_id).add(r.id);
      }

      // 每组必须恰好等于该分类下的全部站点 ID 集合
      for (const [catId, submittedSet] of groups.entries()) {
        const allRows = await env.NAV_DB.prepare(
          "SELECT id FROM sites WHERE category_id = ?"
        ).bind(catId).all();
        const allIds = (allRows.results || []).map((r) => r.id);
        if (submittedSet.size !== allIds.length || allIds.some((id) => !submittedSet.has(id))) {
          return json({ error: "排序提交不完整：必须包含所涉分类下的全部书签（缺一不可）" }, 400);
        }
      }
    } else {
      // type === "category"
      // 1. 严格检查全部 ID 是否存在，并按 parent_id 分组
      const results = await selectInChunks("SELECT id, parent_id FROM category WHERE id IN");
      if (results.length !== cleanIds.length) {
        return json({ error: "存在不存在的 ID，整单拒绝" }, 400);
      }

      const groups = new Map();
      for (const r of results) {
        const pid = Number(r.parent_id) || 0;
        if (!groups.has(pid)) groups.set(pid, new Set());
        groups.get(pid).add(r.id);
      }

      // 每组必须恰好等于该父级下的全部同级分类 ID 集合
      for (const [pid, submittedSet] of groups.entries()) {
        const allRows = await env.NAV_DB.prepare(
          "SELECT id FROM category WHERE parent_id = ?"
        ).bind(pid).all();
        const allIds = (allRows.results || []).map((r) => r.id);
        if (submittedSet.size !== allIds.length || allIds.some((id) => !submittedSet.has(id))) {
          return json({ error: "排序提交不完整：必须包含同级分类的全部条目（缺一不可）" }, 400);
        }
      }
    }

    // 2. D1 batch 原子重写 sort_order（按数组顺序间隔 10 赋序）
    const table = type === "site" ? "sites" : "category";
    const stmts = cleanIds.map((id, index) =>
      env.NAV_DB.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).bind((index + 1) * 10, id)
    );

    // 与批量接口同口径：每 50 条一批执行，避免大分类排序时撞 D1 批量上限
    for (let i = 0; i < stmts.length; i += 50) {
      await env.NAV_DB.batch(stmts.slice(i, i + 50));
    }

    return json({ ok: true, count: cleanIds.length });
  } catch (err) {
    return json({ error: err.message || "更新排序失败" }, 500);
  }
}

