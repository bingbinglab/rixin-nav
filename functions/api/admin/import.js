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
    const catParentMap = new Map(catRows.map((c) => [c.id, c.parent_id || 0]));

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

      // 解析导入指定的父级：不存在则新建（新建的必然是一级分类）；
      // 解析到的若本身是二级分类，按站内「最多两级」口径不能再作父级，降级为无父级（防导入造出三级）
      let wantParentId = 0;
      if (parentName && parentName !== targetCat) {
        wantParentId = catMap.get(parentName) || 0;
        if (!wantParentId) {
          wantParentId = await ensureCategory(env.NAV_DB, parentName);
          catMap.set(parentName, wantParentId);
          catParentMap.set(wantParentId, 0);
          newCats.add(parentName);
        } else if (catParentMap.get(wantParentId)) {
          wantParentId = 0;
        }
      }

      if (!catId) {
        catId = await ensureCategory(env.NAV_DB, targetCat, { parentId: wantParentId });
        catMap.set(targetCat, catId);
        catParentMap.set(catId, wantParentId);
        newCats.add(targetCat);
      } else if (wantParentId && (catParentMap.get(catId) || 0) !== wantParentId) {
        // 分类已存在但父级与导入指定不一致：按导入结构归位（旧实现直接跳过、父子关系静默丢失）。
        // 底线：有子分类的分类不能降为二级（子分类会变三级）；父级已保证是一级且非自身，不可能成环
        const hasKids = [...catParentMap.values()].some((pid) => pid === catId);
        if (!hasKids) {
          await env.NAV_DB.prepare("UPDATE category SET parent_id = ? WHERE id = ?").bind(wantParentId, catId).run();
          catParentMap.set(catId, wantParentId);
        }
      }

      if (existing && overwrite) {
        // 覆盖导入写导入数据里实际带了的策展字段；没带的（图标/置顶/私密/排序）不许冲掉现有值
        const sets = ["name = ?", "desc = ?", "category_id = ?"];
        const binds = [site.name, site.desc, catId];
        if (raw.icon !== undefined) { sets.push("icon = ?"); binds.push(site.icon); }
        if (raw.pinned !== undefined) { sets.push("pinned = ?"); binds.push(site.pinned); }
        if (raw.private !== undefined || raw.is_private !== undefined) { sets.push("is_private = ?"); binds.push(site.is_private); }
        if (site.sort_order !== undefined) { sets.push("sort_order = ?"); binds.push(site.sort_order); }
        binds.push(existing.id);
        updateStmts.push(
          env.NAV_DB.prepare(`UPDATE sites SET ${sets.join(", ")} WHERE id = ?`).bind(...binds)
        );
      } else {
        insertStmts.push(
          env.NAV_DB.prepare(
            "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')"
          ).bind(site.name, site.url, site.desc, catId, site.icon, site.pinned, site.is_private, site.sort_order ?? 0)
        );
      }
    }

    // 站点写入一整个 batch 提交（batch 内是事务）：分多次 batch 中途失败会留半成品导入
    const allStmts = [...updateStmts, ...insertStmts];
    if (allStmts.length) {
      await env.NAV_DB.batch(allStmts);
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
