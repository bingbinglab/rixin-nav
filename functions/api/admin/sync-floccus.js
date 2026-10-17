// POST /api/admin/sync-floccus — 坚果云 WebDAV floccus 书签双向自动同步
// 需管理员会话 Cookie 或 Bearer ADMIN_API_TOKEN。
import {
  json,
  requireAuth,
  toBase64,
  ensureCategory,
  getTombstones,
  removeTombstones,
  ensureOriginColumn,
} from "../../_lib/util.js";
import {
  getWebdavConfig,
  getFloccusConfig,
  resolveFloccusUrl,
} from "../../_lib/config.js";
import { parseXbel, editXbel } from "../../_lib/xbel.js";

const INIT_FLAG_KEY = "floccus_initialized";

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;

  const { request, env } = context;
  try {
    await ensureOriginColumn(env.NAV_DB);
  const body = await request.json().catch(() => ({}));
  const isDry = Boolean(body && body.dry);
  const forceDelete = Boolean(body && body.forceDelete);

  // 1. 获取 WebDAV 与 floccus 配置
  const wdCfg = await getWebdavConfig(env);
  if (!wdCfg) {
    return json({ error: "未配置 WebDAV（请先在后台设置 WebDAV 地址、账号与应用密码）" }, 503);
  }
  const flCfg = await getFloccusConfig(env);

  let targetUrl = "";
  try {
    targetUrl = resolveFloccusUrl(wdCfg.url, flCfg.xbel_path);
  } catch (err) {
    return json({ error: "Floccus 配置路径无效：" + err.message }, 400);
  }

  const authHeader = "Basic " + toBase64(`${wdCfg.user}:${wdCfg.pass}`);

  // 2. 拉取 XBEL 文件（超时控制 15 秒）
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  let r;
  let rawXml = "";
  let initialEtag = "";
  try {
    r = await fetch(targetUrl, {
      method: "GET",
      headers: { Authorization: authHeader },
      signal: ctl.signal,
    });
    if (!r.ok) {
      const code = r.status === 404 ? 404 : (r.status === 401 || r.status === 403 ? 403 : (r.status >= 400 && r.status < 500 ? r.status : 502));
      return json({ error: `拉取 Floccus 书签文件失败（HTTP ${r.status}），请核对路径与权限` }, code);
    }
    rawXml = await r.text();
    initialEtag = r.headers.get("ETag") || (await sha256Hex(rawXml));
  } catch (err) {
    if (err.name === "AbortError") {
      return json({ error: "拉取 Floccus 书签文件超时（15 秒），请检查网络连接" }, 504);
    }
    return json({ error: "请求 WebDAV 失败：" + (err.message || "网络异常") }, 502);
  } finally {
    clearTimeout(timer);
  }

  // 3. 完整性校验（尾闭合校验）
  const trimmed = rawXml.trim();
  if (!trimmed.endsWith("</xbel>")) {
    return json(
      { error: "Floccus XBEL 文件未正常闭合（可能正在同步写入中），已放弃本次同步" },
      409
    );
  }

  // 4. 解析 XBEL 文本
  let parsed;
  try {
    parsed = parseXbel(rawXml);
  } catch (err) {
    return json({ error: "解析 XBEL 失败：" + err.message }, 400);
  }

  const xbelBookmarks = parsed.bookmarks;
  const xbelUrlMap = new Map();
  for (const b of xbelBookmarks) {
    if (b.url) xbelUrlMap.set(b.url, b);
  }

  // 5. 读取站内全量数据（分类与站点）
  const [catRows, siteRows] = await env.NAV_DB.batch([
    env.NAV_DB.prepare("SELECT id, name FROM category"),
    env.NAV_DB.prepare(
      "SELECT id, name, url, desc, category_id, icon, pinned, is_private, sort_order, origin FROM sites"
    ),
  ]);

  const existingCats = catRows.results;
  const existingSites = siteRows.results;

  const catMapByName = new Map(existingCats.map((c) => [c.name, c.id]));
  const catMapById = new Map(existingCats.map((c) => [c.id, c.name]));
  const existingSiteByUrl = new Map(existingSites.map((s) => [s.url, s]));

  // 6. 判定首跑状态（首跑只对账，不执行删除）
  const initializedVal = await env.NAV_KV.get(INIT_FLAG_KEY);
  const isFirstRun = initializedVal !== "1";

  // 读取墓碑集（提前读取：以站内删除为准，防止同轮新增复活）
  const tombstones = await getTombstones(env);
  const tombstoneSet = new Set(tombstones.map((u) => String(u || "").trim()).filter(Boolean));

  // 7. 浏览器 → 站（新增）计算
  // 落点：folderPath[0] 与站内分类同名 → 该分类；对不上名（含散条）→「杂七杂八」
  // 同步永不自动新建常规分类
  const sitesToAdd = [];
  let fallbackCatId = null;

  for (const [url, bm] of xbelUrlMap.entries()) {
    if (tombstoneSet.has(url)) continue; // 站内明确删过，以站内为准，禁止本轮复活
    if (!existingSiteByUrl.has(url)) {
      const topFolder = bm.folderPath.length > 0 ? bm.folderPath[0] : "";
      let targetCatId = catMapByName.get(topFolder);
      let targetCatName = topFolder;

      if (!targetCatId) {
        targetCatName = "杂七杂八";
        if (!fallbackCatId) {
          fallbackCatId = catMapByName.get("杂七杂八");
          if (!fallbackCatId && !isDry) {
            fallbackCatId = await ensureCategory(env.NAV_DB, "杂七杂八");
            catMapByName.set("杂七杂八", fallbackCatId);
            catMapById.set(fallbackCatId, "杂七杂八");
          }
        }
        targetCatId = fallbackCatId || 0;
      }

      sitesToAdd.push({
        name: bm.name || bm.url,
        url: bm.url,
        desc: String(bm.desc || "").trim().slice(0, 40),
        category_id: targetCatId,
        category: targetCatName,
        origin: "floccus",
        pinned: 0,
        is_private: 0,
        icon: "",
      });
    }
  }

  // 8. 站 → 浏览器（写回）计算
  // 规则：站内 origin='manual' 的行放进 Book-Marks 下与其站内分类同名的文件夹
  const sitesToPushToBrowser = [];
  if (!isFirstRun) {
    for (const s of existingSites) {
      if (s.origin === "manual") {
        sitesToPushToBrowser.push({
          id: s.id,
          name: s.name,
          url: s.url,
          desc: s.desc || "",
          category: catMapById.get(s.category_id) || "杂七杂八",
        });
      }
    }
  }

  // 9. 删除跟随（双向）计算
  const sitesToDeleteFromSite = [];
  const pinnedRetained = [];
  const urlsToRemoveFromBrowser = [];

  if (!isFirstRun) {
    // 站侧待删：站内 origin='floccus' 且网址不在 XBEL 中
    for (const s of existingSites) {
      if (s.origin === "floccus" && !xbelUrlMap.has(s.url)) {
        if (s.pinned === 1) {
          pinnedRetained.push({
            name: s.name,
            url: s.url,
            category: catMapById.get(s.category_id) || "未分类",
            reason: "浏览器已删、因置顶保留",
          });
        } else {
          sitesToDeleteFromSite.push({
            id: s.id,
            name: s.name,
            url: s.url,
            category: catMapById.get(s.category_id) || "未分类",
          });
        }
      }
    }

    // 浏览器侧待删：墓碑集里仍在 XBEL 中的条目
    for (const u of tombstones) {
      if (xbelUrlMap.has(u)) {
        urlsToRemoveFromBrowser.push(u);
      }
    }
  }

  // 10. 批量熔断检测
  const totalToDelete = sitesToDeleteFromSite.length + urlsToRemoveFromBrowser.length;
  const floccusTotal = xbelBookmarks.length;
  const siteFloccusTotal = existingSites.filter((s) => s.origin === "floccus").length;
  const deleteThreshold = Math.max(10, Math.floor(siteFloccusTotal * 0.15));
  let deleteSuspended = false;

  let activeDeletesFromSite = sitesToDeleteFromSite;
  let activeRemovesFromBrowser = urlsToRemoveFromBrowser;

  if (!isFirstRun && totalToDelete > deleteThreshold && !forceDelete) {
    deleteSuspended = true;
    activeDeletesFromSite = [];
    activeRemovesFromBrowser = [];
  }

  // 若为预演模式（dry: true），到此直接汇总返回
  if (isDry) {
    return json({
      ok: true,
      dry: true,
      isFirstRun,
      totalInFile: floccusTotal,
      addedToSite: sitesToAdd.length,
      newSites: sitesToAdd.map((s) => ({ name: s.name, url: s.url, category: s.category })),
      pushedToBrowser: sitesToPushToBrowser.length,
      pushedSites: sitesToPushToBrowser.map((s) => ({ name: s.name, url: s.url, category: s.category })),
      deletedFromSite: sitesToDeleteFromSite.length,
      deletedSites: sitesToDeleteFromSite.map((s) => ({ name: s.name, url: s.url, category: s.category })),
      removedFromBrowser: urlsToRemoveFromBrowser.length,
      removedSites: urlsToRemoveFromBrowser,
      deleteSuspended,
      writebackDeferred: false,
      writebackNote: "",
      pinnedRetained,
    });
  }

  // 11. 真实入库流程：先落库 D1，再写回 XBEL
  let writebackDeferred = false;
  let writebackNote = "";

  // A. 首跑对账回填
  if (isFirstRun) {
    const updateStmts = [];
    for (const s of existingSites) {
      const newOrigin = xbelUrlMap.has(s.url) ? "floccus" : "manual";
      updateStmts.push(
        env.NAV_DB.prepare("UPDATE sites SET origin = ? WHERE id = ?").bind(newOrigin, s.id)
      );
    }
    const CHUNK = 50;
    for (let i = 0; i < updateStmts.length; i += CHUNK) {
      await env.NAV_DB.batch(updateStmts.slice(i, i + CHUNK));
    }
    await env.NAV_KV.put(INIT_FLAG_KEY, "1");
  }

  // B. 插入站内新增（按目标分类现行 MAX(sort_order)+10 逐条递增追加）
  if (sitesToAdd.length > 0) {
    // 确保 fallback 分类存在
    if (!fallbackCatId) {
      fallbackCatId = await ensureCategory(env.NAV_DB, "杂七杂八");
    }

    const catMaxSort = new Map();
    for (const s of existingSites) {
      const cId = s.category_id;
      const currentMax = catMaxSort.get(cId) ?? 0;
      if ((s.sort_order ?? 0) > currentMax) {
        catMaxSort.set(cId, s.sort_order);
      }
    }

    const insertStmts = sitesToAdd.map((s) => {
      const cId = s.category_id || fallbackCatId;
      const prevMax = catMaxSort.get(cId) ?? 0;
      const newSort = prevMax + 10;
      catMaxSort.set(cId, newSort);
      return env.NAV_DB.prepare(
        "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'floccus')"
      ).bind(s.name, s.url, s.desc, cId, s.icon, s.pinned, s.is_private, newSort);
    });
    const CHUNK = 50;
    for (let i = 0; i < insertStmts.length; i += CHUNK) {
      await env.NAV_DB.batch(insertStmts.slice(i, i + CHUNK));
    }
  }

  // C. 执行站内删除
  if (activeDeletesFromSite.length > 0) {
    const deleteStmts = activeDeletesFromSite.map((s) =>
      env.NAV_DB.prepare("DELETE FROM sites WHERE id = ?").bind(s.id)
    );
    const CHUNK = 50;
    for (let i = 0; i < deleteStmts.length; i += CHUNK) {
      await env.NAV_DB.batch(deleteStmts.slice(i, i + CHUNK));
    }
  }

  // D. 写回 XBEL（仅在有需要写回或需要移除墓碑时触发）
  const needsWriteback = sitesToPushToBrowser.length > 0 || activeRemovesFromBrowser.length > 0;
  if (needsWriteback) {
    try {
      // 重新 GET 验证 ETag 防撞车
      const checkRes = await fetch(targetUrl, {
        method: "GET",
        headers: { Authorization: authHeader },
      });
      if (!checkRes.ok) {
        writebackDeferred = true;
        writebackNote = `重新拉取 XBEL 校验失败（HTTP ${checkRes.status}）`;
      } else {
        const latestText = await checkRes.text();
        const latestEtag = checkRes.headers.get("ETag") || (await sha256Hex(latestText));
        if (latestEtag !== initialEtag) {
          // 期间文件被改，放弃本次写回
          writebackDeferred = true;
          writebackNote = "检测到 WebDAV 文件并发修改（ETag/哈希变动），写回已暂缓";
        } else {
          // 执行最小编辑
          const editedXml = editXbel(latestText, {
            toDeleteUrls: activeRemovesFromBrowser,
            toAddSites: sitesToPushToBrowser,
          });

          // PUT 回写 WebDAV
          const putRes = await fetch(targetUrl, {
            method: "PUT",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/xbel+xml; charset=utf-8",
            },
            body: editedXml,
          });

          if (putRes.ok) {
            // 写回成功：站内 manual 状态转正为 floccus
            if (sitesToPushToBrowser.length > 0) {
              const promotedStmts = sitesToPushToBrowser.map((s) =>
                env.NAV_DB.prepare("UPDATE sites SET origin = 'floccus' WHERE id = ?").bind(s.id)
              );
              const CHUNK = 50;
              for (let i = 0; i < promotedStmts.length; i += CHUNK) {
                await env.NAV_DB.batch(promotedStmts.slice(i, i + CHUNK));
              }
            }
            // 移出已从浏览器中移除的墓碑
            if (activeRemovesFromBrowser.length > 0) {
              await removeTombstones(env, activeRemovesFromBrowser);
            }
          } else {
            writebackDeferred = true;
            writebackNote = `WebDAV 写回 PUT 失败（HTTP ${putRes.status}）`;
          }
        }
      }
    } catch (err) {
      writebackDeferred = true;
      writebackNote = "写回异常：" + (err.message || "网络或解析错误");
    }
  }

  // E. 附带小修：修剪墓碑集里「已不在 XBEL 中」的陈旧网址（避免长期累积）
  try {
    const currentTombstones = await getTombstones(env);
    const staleTombstones = currentTombstones.filter((u) => !xbelUrlMap.has(u));
    if (staleTombstones.length > 0) {
      await removeTombstones(env, staleTombstones);
    }
  } catch (err) {
    console.warn("修剪陈旧墓碑异常：", err);
  }

  return json({
    ok: true,
    dry: false,
    isFirstRun,
    totalInFile: floccusTotal,
    addedToSite: sitesToAdd.length,
    newSites: sitesToAdd.map((s) => ({ name: s.name, url: s.url, category: s.category })),
    pushedToBrowser: writebackDeferred ? 0 : sitesToPushToBrowser.length,
    pushedSites: writebackDeferred ? [] : sitesToPushToBrowser.map((s) => ({ name: s.name, url: s.url, category: s.category })),
    deletedFromSite: activeDeletesFromSite.length,
    deletedSites: activeDeletesFromSite.map((s) => ({ name: s.name, url: s.url, category: s.category })),
    removedFromBrowser: writebackDeferred ? 0 : activeRemovesFromBrowser.length,
    removedSites: writebackDeferred ? [] : activeRemovesFromBrowser,
    deleteSuspended,
    writebackDeferred,
    writebackNote,
    pinnedRetained,
  });
  } catch (err) {
    console.error("Floccus 同步异常：", err);
    return json({ error: "同步处理异常：" + (err.message || "未知错误") }, 500);
  }
}
