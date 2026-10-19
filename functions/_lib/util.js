// 日新辑览 · Pages Functions 共用工具（第二阶段）
// 纪律：口令与密钥只走 CF 环境变量，永不进仓库；私密数据「不下发」，不是前端藏起来。

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

export function toBase64(str) {
  const bytes = new TextEncoder().encode(String(str ?? ""));
  let bin = "";
  const len = bytes.length;
  for (let i = 0; i < len; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

export function parseCookies(request) {
  const out = {};
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SESSION_COOKIE = "nav_session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 天

export async function createSession(env) {
  const token = randomToken();
  await env.NAV_KV.put(`session:${token}`, "1", { expirationTtl: SESSION_TTL });
  return token;
}

export function sessionCookieHeader(token, maxAge = SESSION_TTL) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function hasSession(request, env) {
  if (!env.NAV_KV) return false;
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return false;
  const v = await env.NAV_KV.get(`session:${token}`);
  return v === "1";
}

export async function destroySession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token && env.NAV_KV) await env.NAV_KV.delete(`session:${token}`);
  return sessionCookieHeader("", 0);
}

// 未登录统一 401；绑定缺失统一 503，前台据此回退静态 data.js。
// 除了网页登录的会话 Cookie，也认机器令牌：Authorization: Bearer <ADMIN_API_TOKEN>（助理自动化/验收用，可在 CF 环境变量里随时删除作废）。
export async function requireAuth(context) {
  const { request, env } = context;
  if (!env.NAV_DB || !env.NAV_KV) return json({ error: "backend_not_configured" }, 503);
  if (await hasSession(request, env)) return null;
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token && env.ADMIN_API_TOKEN && passwordMatches(token, env.ADMIN_API_TOKEN)) return null;
  return json({ error: "unauthorized" }, 401);
}

export function dbMissing(env) {
  return !env.NAV_DB ? json({ error: "backend_not_configured" }, 503) : null;
}

// 口令比较：统一走固定长度的逐字节 XOR 比较（短的一侧补齐到固定长度再比，最后同时校验长度相等），消除长度时序信道。
export function passwordMatches(input, expected) {
  if (typeof input !== "string" || typeof expected !== "string") return false;
  const enc = new TextEncoder();
  const a = enc.encode(input);
  const b = enc.encode(expected);
  const maxLen = 256;
  const loopLen = Math.max(maxLen, Math.max(a.length, b.length));
  let diff = a.length ^ b.length;
  for (let i = 0; i < loopLen; i++) {
    const byteA = i < a.length ? a[i] : 0;
    const byteB = i < b.length ? b[i] : 0;
    diff |= byteA ^ byteB;
  }
  return diff === 0;
}

export function normalizeUrl(raw) {
  let u = String(raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
    u = "https://" + u.replace(/^\/+/, "");
  }
  try {
    const parsed = new URL(u);
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    let out = parsed.origin + (path === "/" ? "" : path) + parsed.search + parsed.hash;
    if (out.endsWith("/")) {
      out = out.slice(0, -1);
    }
    return out;
  } catch (_) {
    return u.replace(/\/+$/, "");
  }
}

export function cleanSite(body) {
  const name = String(body.name || "").trim();
  let url = String(body.url || "").trim();
  // 没写协议时自动补 https://（如直接填 www.baidu.com），不必再因格式被拒
  if (url && !/^https?:\/\//i.test(url) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = "https://" + url.replace(/^\/+/, "");
  }
  if (!name || !/^https?:\/\//i.test(url)) return null;
  const hasSort = body.sort_order !== undefined && body.sort_order !== null && body.sort_order !== "" && Number.isFinite(+body.sort_order);
  let category_id = null;
  if (body.category_id !== undefined && body.category_id !== null && body.category_id !== "") {
    const n = Number(body.category_id);
    category_id = Number.isInteger(n) && n > 0 ? n : 0;
  }
  const category = body.category !== undefined && body.category !== null ? String(body.category).trim() : "";
  return {
    name,
    url,
    desc: String(body.desc || "").trim().slice(0, 40),
    category_id,
    category,
    icon: String(body.icon || "").trim(),
    pinned: body.pinned ? 1 : 0,
    is_private: body.private || body.is_private ? 1 : 0,
    sort_order: hasSort ? +body.sort_order : (body.sort_order === undefined ? undefined : 0),
    origin: body.origin === "floccus" ? "floccus" : "manual",
  };
}

export async function ensureCategory(db, name, { parentId = 0, isPrivate = 0 } = {}) {
  const catName = String(name || "").trim() || "未分类";
  const row = await db.prepare("SELECT id FROM category WHERE name = ?").bind(catName).first();
  if (row) return row.id;
  const res = await db
    .prepare("INSERT INTO category (name, parent_id, is_private) VALUES (?, ?, ?)")
    .bind(catName, Number(parentId) || 0, isPrivate ? 1 : 0)
    .run();
  return res.meta.last_row_id;
}

export async function restoreBookmarkData(db, data) {
  if (!data || !Array.isArray(data.sites)) {
    throw new Error("备份数据格式不对（缺少 sites 数组）");
  }

  const existingUrls = new Set((await db.prepare("SELECT url FROM sites").all()).results.map((r) => r.url));
  const catRows = (await db.prepare("SELECT id, name, parent_id FROM category").all()).results;
  const catIds = new Map(catRows.map((c) => [c.name, c.id]));

  // 先建分类：两遍，先一级后二级
  const cats = Array.isArray(data.categories) ? data.categories : [];
  for (const c of cats) {
    if (c && c.name && !c.parent && !catIds.has(c.name)) {
      catIds.set(c.name, await ensureCategory(db, String(c.name), { isPrivate: c.private ? 1 : 0 }));
    }
  }
  for (const c of cats) {
    if (c && c.name && c.parent) {
      let pid = catIds.get(c.parent);
      if (!pid) {
        pid = await ensureCategory(db, String(c.parent));
        catIds.set(c.parent, pid);
      }
      if (!catIds.has(c.name)) {
        catIds.set(c.name, await ensureCategory(db, String(c.name), { parentId: pid, isPrivate: c.private ? 1 : 0 }));
      }
    }
  }

  let skipped = 0;
  const insertStmts = [];
  for (const raw of data.sites) {
    const site = cleanSite(raw || {});
    if (!site) { skipped++; continue; }
    if (existingUrls.has(site.url)) { skipped++; continue; }
    existingUrls.add(site.url);

    const targetCat = site.category || "未分类";
    let catId = catIds.get(targetCat);
    if (!catId) {
      catId = await ensureCategory(db, targetCat);
      catIds.set(targetCat, catId);
    }
    insertStmts.push(
      db.prepare(
        "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(site.name, site.url, site.desc, catId, site.icon, site.pinned, site.is_private, site.sort_order, site.origin || "manual")
    );
  }

  const CHUNK_SIZE = 50;
  for (let i = 0; i < insertStmts.length; i += CHUNK_SIZE) {
    await db.batch(insertStmts.slice(i, i + CHUNK_SIZE));
  }

  return { added: insertStmts.length, skipped };
}

export function getIsoWeekNumber(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

export function resolveBackupUrls(rawUrl, slotOverride) {
  const u = String(rawUrl || "").trim();
  let mainUrl = u;
  if (!/\.json$/i.test(mainUrl)) {
    mainUrl = mainUrl.replace(/\/+$/, "") + "/rixin-jilan-backup.json";
  }
  const lastSlash = mainUrl.lastIndexOf("/");
  const parentUrl = mainUrl.slice(0, lastSlash + 1);

  const isoWeek = getIsoWeekNumber();
  const currentSlot = ((isoWeek - 1) % 4) + 1; // 1 ~ 4
  const targetSlot = slotOverride ? Number(slotOverride) : currentSlot;
  const slotUrl = `${parentUrl}rixin-jilan-backup-slot${targetSlot}.json`;

  const allSlotUrls = [1, 2, 3, 4].map((s) => ({
    slot: s,
    url: `${parentUrl}rixin-jilan-backup-slot${s}.json`,
  }));

  return { mainUrl, currentSlot, targetSlot, slotUrl, allSlotUrls };
}

export const TOMBSTONES_KV_KEY = "floccus_tombstones";

export async function getTombstones(env) {
  if (!env || !env.NAV_KV) return [];
  try {
    const list = await env.NAV_KV.get(TOMBSTONES_KV_KEY, "json");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function addTombstones(env, urls) {
  if (!env || !env.NAV_KV || !Array.isArray(urls) || !urls.length) return;
  const existing = await getTombstones(env);
  const set = new Set(existing);
  for (const u of urls) {
    const s = String(u || "").trim();
    if (s) set.add(s);
  }
  await env.NAV_KV.put(TOMBSTONES_KV_KEY, JSON.stringify([...set]));
}

export async function removeTombstones(env, urls) {
  if (!env || !env.NAV_KV || !Array.isArray(urls) || !urls.length) return;
  const existing = await getTombstones(env);
  const removeSet = new Set(urls.map((u) => String(u || "").trim()));
  const remaining = existing.filter((u) => !removeSet.has(u));
  await env.NAV_KV.put(TOMBSTONES_KV_KEY, JSON.stringify(remaining));
}

let originColumnChecked = false;

export async function ensureOriginColumn(db) {
  if (originColumnChecked || !db) return;
  try {
    const info = await db.prepare("PRAGMA table_info(sites)").all();
    const rows = (info && info.results) || [];
    const hasOrigin = rows.some((r) => r.name === "origin");
    if (!hasOrigin) {
      await db.prepare("ALTER TABLE sites ADD COLUMN origin TEXT DEFAULT 'manual'").run();
    }
    originColumnChecked = true;
  } catch (err) {
    console.warn("自检 sites.origin 字段异常（若字段已存在可忽略）：", err);
  }
}



