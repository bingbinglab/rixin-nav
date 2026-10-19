// POST /api/admin/import — 批量导入 { sites: [{name,url,desc,category,parent_category,icon,pinned,private}], overwrite?: boolean }。需会话。
// 解析书签 HTML 在后台页面端完成（与口令无关的纯文本活），这里只负责落库：分类自动建（带 parent_category 时建二级）、按网址去重跳过，开启 overwrite 时更新同网址已存在站点。
import { json, requireAuth, cleanSite, ensureCategory, normalizeUrl } from "../../_lib/util.js";

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
    const overwrite = Boolean(body.overwrite);

    let skipped = 0;
    const newCats = new Set();
    const siteRows = (await env.NAV_DB.prepare("SELECT id, url FROM sites").all()).results || [];
    const existingMap = new Map();
    for (const r of siteRows) {
      const n = normalizeUrl(r.url);
      if (n && !existingMap.has(n)) {
        existingMap.set(n, r);
      }
    }

    const catRows = (await env.NAV_DB.prepare("SELECT id, name, parent_id FROM category").all()).results || [];
    const catMap = new Map(catRows.map((c) => [c.name, c.id]));

    const insertStmts = [];
    const updateStmts = [];
    const seenBatchUrls = new Set();

    for (const raw of list) {
      const site = cleanSite(raw);
      if (!site) { skipped++; continue; }
      const normUrl = normalizeUrl(site.url);
      if (!normUrl) { skipped++; continue; }

      if (seenBatchUrls.has(normUrl)) {
        skipped++;
        continue;
      }
      seenBatchUrls.add(normUrl);

      const existing = existingMap.get(normUrl);
      if (existing && !overwrite) {
        skipped++;
        continue;
      }

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

      if (existing && overwrite) {
        updateStmts.push(
          env.NAV_DB.prepare(
            "UPDATE sites SET name = ?, desc = ?, category_id = ? WHERE id = ?"
          ).bind(site.name, site.desc, catId, existing.id)
        );
      } else {
        insertStmts.push(
          env.NAV_DB.prepare(
            "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')"
          ).bind(site.name, site.url, site.desc, catId, site.icon, site.pinned, site.is_private, site.sort_order ?? 0)
        );
      }
    }

    const allStmts = [...updateStmts, ...insertStmts];
    const CHUNK_SIZE = 50;
    for (let i = 0; i < allStmts.length; i += CHUNK_SIZE) {
      await env.NAV_DB.batch(allStmts.slice(i, i + CHUNK_SIZE));
    }

    return json({
      ok: true,
      added: insertStmts.length,
      updated: updateStmts.length,
      skipped,
      newCategories: [...newCats],
    });
  } catch (err) {
    return json({ error: err.message || "批量导入失败" }, 500);
  }
}
