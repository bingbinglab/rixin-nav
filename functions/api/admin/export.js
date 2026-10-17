// GET /api/admin/export?format=json|html — 导出全量书签（含私密）。需会话。
// html 为浏览器书签格式，可直接导回任何浏览器 / floccus 体系外的备份用途。
import { json, requireAuth } from "../../_lib/util.js";
import { getSiteConfig } from "../../_lib/config.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function onRequestGet(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { request, env } = context;
  const format = new URL(request.url).searchParams.get("format") || "json";
  const [cats, rows] = await env.NAV_DB.batch([
    env.NAV_DB.prepare("SELECT id, name, parent_id, is_private, sort_order FROM category ORDER BY sort_order, id"),
    env.NAV_DB.prepare(
      `SELECT s.id, s.name, s.url, s.desc, s.icon, s.pinned, s.is_private, s.sort_order, s.category_id, c.name AS category
         FROM sites s JOIN category c ON c.id = s.category_id
        ORDER BY c.sort_order, s.sort_order, s.id`
    ),
  ]);
  const sites = rows.results.map((r) => ({
    name: r.name, url: r.url, desc: r.desc || "", category: r.category, icon: r.icon || "",
    pinned: r.pinned === 1, private: r.is_private === 1, sort_order: r.sort_order,
  }));

  if (format === "html") {
    const catMap = new Map();
    const topCats = [];
    for (const c of cats.results) {
      catMap.set(c.id, { id: c.id, name: c.name, parent_id: c.parent_id, children: [], sites: [] });
    }
    for (const c of cats.results) {
      const item = catMap.get(c.id);
      if (c.parent_id && catMap.has(c.parent_id)) {
        catMap.get(c.parent_id).children.push(item);
      } else {
        topCats.push(item);
      }
    }

    const orphanSites = [];
    for (const r of rows.results) {
      const s = {
        name: r.name, url: r.url, desc: r.desc || "", category: r.category, icon: r.icon || "",
        pinned: r.pinned === 1, private: r.is_private === 1, sort_order: r.sort_order,
      };
      const cat = catMap.get(r.category_id);
      if (cat) cat.sites.push(s);
      else orphanSites.push(s);
    }

    const { site_title } = await getSiteConfig(env);
    let out = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>${esc(site_title)}导出</TITLE>\n<H1>${esc(site_title)}导出</H1>\n<DL><p>\n`;

    const renderCat = (cat, depth = 1) => {
      const indent = "  ".repeat(depth);
      let s = `${indent}<DT><H3>${esc(cat.name)}</H3>\n${indent}<DL><p>\n`;
      for (const item of cat.sites) {
        s += `${indent}  <DT><A HREF="${esc(item.url)}">${esc(item.name)}</A>\n`;
        if (item.desc) {
          s += `${indent}  <DD>${esc(item.desc)}</DD>\n`;
        }
      }
      for (const sub of cat.children) {
        s += renderCat(sub, depth + 1);
      }
      s += `${indent}</DL><p>\n`;
      return s;
    };

    for (const top of topCats) {
      out += renderCat(top, 1);
    }
    if (orphanSites.length) {
      out += `  <DT><H3>未归类</H3>\n  <DL><p>\n`;
      for (const s of orphanSites) {
        out += `    <DT><A HREF="${esc(s.url)}">${esc(s.name)}</A>\n`;
        if (s.desc) {
          out += `    <DD>${esc(s.desc)}</DD>\n`;
        }
      }
      out += `  </DL><p>\n`;
    }
    out += `</DL><p>\n`;

    return new Response(out, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": 'attachment; filename="rixin-jilan-bookmarks.html"' },
    });
  }

  const nameById = new Map(cats.results.map((c) => [c.id, c.name]));
  const categories = cats.results.map((c) => ({
    name: c.name,
    parent: c.parent_id ? nameById.get(c.parent_id) || null : null,
    private: c.is_private === 1,
    sort_order: c.sort_order,
  }));

  const payload = {
    app: "rixin-jilan",
    version: 2,
    exported_at: new Date().toISOString(),
    categories,
    sites,
  };

  return json(payload, 200, { "Content-Disposition": 'attachment; filename="rixin-jilan-export.json"' });
}
