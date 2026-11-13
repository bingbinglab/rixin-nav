// /api/admin/sites/:id — 修改（PUT）与删除（DELETE）。需会话。
import { json, requireAuth, cleanSite, ensureCategory, addTombstones } from "../../../_lib/util.js";

export async function onRequestPut(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { request, env, params } = context;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "请求体不是有效的 JSON 数据" }, 400);
    }
    const site = cleanSite(body);
    if (!site) return json({ error: "站名必填，网址须以 http:// 或 https:// 开头" }, 400);
    const id = +params.id;
    const dup = await env.NAV_DB.prepare("SELECT id FROM sites WHERE url = ? AND id <> ?").bind(site.url, id).first();
    if (dup) return json({ error: "这个网址已经在库里了" }, 409);

    // 先取旧行：未传 sort_order 时保留原值；floccus 来源改址时还要按旧网址处理同步归属（见下）
    const oldRow = await env.NAV_DB.prepare("SELECT url, origin, sort_order FROM sites WHERE id=?").bind(id).first();
    if (body.sort_order === undefined && oldRow) {
      site.sort_order = oldRow.sort_order;
    }
    // 同步来的书签一旦改址，原同步关系即失效：归属转 manual（走站→浏览器写回通道推送新网址），
    // 否则下一轮同步会按「新网址不在 XBEL」把编辑成果删掉、旧网址又被重新导回
    const urlChangedFromFloccus = Boolean(oldRow) && oldRow.origin === "floccus" && oldRow.url !== site.url;
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
      if (site.category.length > 20) {
        return json({ error: "分类名不能超过 20 个字符" }, 400);
      }
      catId = await ensureCategory(env.NAV_DB, site.category);
    } else {
      return json({ error: "未指定分类（需提供 category 或有效 category_id）" }, 400);
    }
    const sortOrder = site.sort_order ?? 0;
    const res = urlChangedFromFloccus
      ? await env.NAV_DB.prepare(
          "UPDATE sites SET name=?, url=?, desc=?, category_id=?, icon=?, pinned=?, is_private=?, sort_order=?, origin='manual' WHERE id=?"
        ).bind(site.name, site.url, site.desc, catId, site.icon, site.pinned, site.is_private, sortOrder, id).run()
      : await env.NAV_DB.prepare(
          "UPDATE sites SET name=?, url=?, desc=?, category_id=?, icon=?, pinned=?, is_private=?, sort_order=? WHERE id=?"
        ).bind(site.name, site.url, site.desc, catId, site.icon, site.pinned, site.is_private, sortOrder, id).run();
    if (!res.meta.changes) return json({ error: "没有这条书签" }, 404);
    if (urlChangedFromFloccus) {
      // 旧网址登记墓碑：同步时从浏览器 XBEL 移除旧条目，且不让它作为「新书签」复活。
      // 墓碑只挡从 XBEL 回流；旧条目被移除后，墓碑会被同步末尾的陈旧修剪清掉，
      // 日后在浏览器侧重新添加该网址仍可正常同步进来，不会被永久封死
      await addTombstones(env, [oldRow.url]);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message || "修改书签失败" }, 500);
  }
}

export async function onRequestDelete(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { env, params } = context;
  try {
    const id = +params.id;
    const site = await env.NAV_DB.prepare("SELECT url, origin FROM sites WHERE id=?").bind(id).first();
    if (!site) return json({ error: "没有这条书签" }, 404);
    // 先登记墓碑、后删行：墓碑写失败则整单报错且行还在，
    // 不会出现「接口报错但行已删、无墓碑」导致下一轮同步把书签复活
    if (site.origin === "floccus") {
      await addTombstones(env, [site.url]);
    }
    const res = await env.NAV_DB.prepare("DELETE FROM sites WHERE id=?").bind(id).run();
    if (!res.meta.changes) return json({ error: "没有这条书签" }, 404);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message || "删除书签失败" }, 500);
  }
}
