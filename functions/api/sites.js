// GET /api/sites — 前台拉全量站点＋分类（分类带父级，支持二级分类）。
// 私密条目（站点级/分类级）默认不下发；带有效后台会话时才下发，前台仍按本地开关显隐。
// D1 未绑定时返回 503，前台据此回退到 data.js 静态数据，网站永不白屏。
import { json, dbMissing, hasSession } from "../_lib/util.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const missing = dbMissing(env);
  if (missing) return missing;

  const authed = await hasSession(request, env);
  const [catRows, siteRows] = await env.NAV_DB.batch([
    env.NAV_DB.prepare("SELECT id, name, parent_id, is_private, sort_order FROM category ORDER BY sort_order, id"),
    env.NAV_DB.prepare(
      `SELECT s.name, s.url, s.desc, s.icon, s.pinned, s.is_private,
              c.name AS category, c.is_private AS cat_private
         FROM sites s JOIN category c ON c.id = s.category_id
        ORDER BY c.sort_order, s.sort_order, s.id`
    ),
  ]);

  const cats = catRows.results;
  const catById = new Map(cats.map((c) => [c.id, c]));
  const catByName = new Map(cats.map((c) => [c.name, c]));

  // 计算有效私密：分类自身或任一祖先 is_private === 1 即为有效私密
  const effectivePrivateCatIds = new Set();
  for (const c of cats) {
    let curr = c;
    while (curr) {
      if (curr.is_private === 1) {
        effectivePrivateCatIds.add(c.id);
        break;
      }
      curr = curr.parent_id ? catById.get(curr.parent_id) : null;
    }
  }
  const isCatPrivate = (cat) => cat && effectivePrivateCatIds.has(cat.id);
  const visibleCat = (c) => authed || !effectivePrivateCatIds.has(c.id);

  const sites = [];
  for (const r of siteRows.results) {
    const cat = catByName.get(r.category);
    const isCatPriv = cat ? isCatPrivate(cat) : (r.cat_private === 1);
    const priv = r.is_private === 1 || isCatPriv;
    if (priv && !authed) continue;
    sites.push({
      name: r.name,
      url: r.url,
      desc: r.desc || "",
      category: r.category,
      icon: r.icon || "",
      ...(r.pinned === 1 ? { pinned: true } : {}),
      ...(priv ? { private: true } : {}),
    });
  }

  // 分类按树形顺序下发：顶级在前，各自的子分类紧随其后；无站点的分类不下发（与静态版口径一致）
  const hasSites = new Set(sites.map((s) => s.category));
  const categories = [];
  const tops = cats.filter((c) => !c.parent_id);
  const kidsOf = (pid) => cats.filter((c) => c.parent_id === pid);
  for (const top of tops) {
    if (!visibleCat(top)) continue;
    if (hasSites.has(top.name)) categories.push({ name: top.name, parent: null });
    for (const kid of kidsOf(top.id)) {
      if (!visibleCat(kid)) continue;
      if (hasSites.has(kid.name)) categories.push({ name: kid.name, parent: top.name });
    }
  }
  // 兜底：有站点但分类行缺失/父级不可见时，按站点出现顺序补为顶级（未登录态绝不把有效私密的分类补成顶级）
  for (const s of sites) {
    if (!categories.some((c) => c.name === s.category)) {
      const c = catByName.get(s.category);
      if (c && !visibleCat(c)) continue;
      categories.push({ name: s.category, parent: null });
    }
  }

  const cacheHeaders = authed
    ? { "Cache-Control": "private, no-store" }
    : { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" };
  return json({ categories, sites, authed }, 200, cacheHeaders);
}
