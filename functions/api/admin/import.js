// POST /api/admin/import — 批量导入 { sites: [{name,url,desc,category,parent_category,icon,pinned,private}] }。需会话。
// 解析书签 HTML 在后台页面端完成（与口令无关的纯文本活），这里只负责落库：分类自动建（带 parent_category 时建二级）、按网址去重跳过。
import { json, requireAuth, cleanSite, ensureCategory } from "../../_lib/util.js";

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "请求体不是有效的 JSON 数据" }, 400);
    }
    const list = Array.isArray(body.sites) ? body.sites : [];
    if (!list.length) return json({ error: "没有可导入的条目" }, 400);

    let skipped = 0;
    const newCats = new Set();
    const existingUrls = new Set((await env.NAV_DB.prepare("SELECT url FROM sites").all()).results.map((r) => r.url));
    const catRows = (await env.NAV_DB.prepare("SELECT id, name, parent_id FROM category").all()).results;
    const catMap = new Map(catRows.map((c) => [c.name, c.id]));

    const insertStmts = [];
    for (const raw of list) {
      const site = cleanSite(raw);
      if (!site) { skipped++; continue; }
      if (existingUrls.has(site.url)) { skipped++; continue; }
      existingUrls.add(site.url);

      const parentName = String(raw.parent_category || "").trim();
      const targetCat = site.category || "未分类";
      let catId = catMap.get(targetCat);
      if (!catId) {
        let parentId = 0;
        if (parentName) {
          parentId = catMap.get(parentName);
          if (!parentId) {
            parentId = await ensureCategory(env.NAV_DB, parentName);
            catMap.set(parentName, parentId);
            newCats.add(parentName);
          }
        }
        catId = await ensureCategory(env.NAV_DB, targetCat, { parentId });
        catMap.set(targetCat, catId);
        newCats.add(targetCat);
      }

      insertStmts.push(
        env.NAV_DB.prepare(
          "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')"
        ).bind(site.name, site.url, site.desc, catId, site.icon, site.pinned, site.is_private, site.sort_order ?? 0)
      );
    }

    const CHUNK_SIZE = 50;
    for (let i = 0; i < insertStmts.length; i += CHUNK_SIZE) {
      await env.NAV_DB.batch(insertStmts.slice(i, i + CHUNK_SIZE));
    }

    return json({ ok: true, added: insertStmts.length, skipped, newCategories: [...newCats] });
  } catch (err) {
    return json({ error: err.message || "批量导入失败" }, 500);
  }
}
