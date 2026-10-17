// 日新辑览 · 后台交互脚本 (admin.js)
// 纯前端交互逻辑，数据走 /api/admin/* 接口。绝不包含密钥等敏感信息。

const $ = (id) => document.getElementById(id);
let data = { categories: [], sites: [] };
let editingSiteId = null;
const selectedSiteIds = new Set();
const collapsedCats = new Set();

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const catById = (id) => data.categories.find((c) => c.id === id);
const catName = (id) => (catById(id) || {}).name || "";

function treeCats() {
  const bySort = (a, b) => a.sort_order - b.sort_order || a.id - b.id;
  const tops = data.categories.filter((c) => !c.parent_id).sort(bySort);
  const out = [];
  tops.forEach((t) => {
    out.push(t);
    data.categories
      .filter((c) => c.parent_id === t.id)
      .sort(bySort)
      .forEach((k) => out.push(k));
  });
  data.categories.forEach((c) => {
    if (!out.includes(c)) out.push(c);
  });
  return out;
}

// --- 底层网络封装 (P20: 401 自动跳转) ---
async function api(url, opts) {
  const r = await fetch(url, opts);
  if (r.status === 401) {
    toast("登录已过期，正在前往登录页", true);
    setTimeout(() => {
      window.location.href = "/admin";
    }, 1000);
    throw new Error("unauthorized");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
  return j;
}

// --- Toast 提示 ---
let toastTimer = null;
function toast(msg, isError = false) {
  let el = $("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.className = "toast" + (isError ? " err" : "");
  el.textContent = msg;
  el.style.display = "block";
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => {
      if (el) el.style.display = "none";
    }, 200);
  }, 2000);
}

// --- P17: 统一站内弹窗 (增强防呆：支持危险操作默认聚焦取消、禁用回车) ---
function showConfirm(msg, title = "请确认", { isDanger = false, defaultCancel = false, disableEnter = false } = {}) {
  return new Promise((resolve) => {
    let mask = $("confirmModal");
    if (!mask) {
      mask = document.createElement("div");
      mask.id = "confirmModal";
      mask.className = "confirm-modal-mask";
      mask.innerHTML = `
        <div class="confirm-card card">
          <h3 id="confirmTitle" class="confirm-title serif">请确认</h3>
          <p id="confirmMsg" class="confirm-msg"></p>
          <div class="confirm-actions">
            <button id="confirmCancelBtn" type="button" class="ghost mini">取 消</button>
            <button id="confirmOkBtn" type="button" class="primary mini">确 定</button>
          </div>
        </div>`;
      document.body.appendChild(mask);
    }
    const msgEl = $("confirmMsg");
    const titleEl = $("confirmTitle");
    const okBtn = $("confirmOkBtn");
    const cancelBtn = $("confirmCancelBtn");

    titleEl.textContent = title;
    msgEl.innerHTML = esc(msg).replace(/\n/g, "<br>");
    okBtn.className = isDanger ? "danger mini" : "primary mini";
    mask.style.display = "flex";

    const cleanup = (result) => {
      mask.style.display = "none";
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      window.removeEventListener("keydown", onKeyDown);
      resolve(result);
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") cleanup(false);
      else if (e.key === "Enter" && !disableEnter) cleanup(true);
    };

    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    window.addEventListener("keydown", onKeyDown);

    if (defaultCancel) {
      cancelBtn.focus();
    } else {
      okBtn.focus();
    }
  });
}

// --- 书签导入预览口径比对与弹窗 ---
function previewBookmarkImport(rawSites, rawCats = []) {
  const existingUrls = new Set((data.sites || []).map((s) => String(s.url || "").trim()));
  const existingCatNames = new Set((data.categories || []).map((c) => String(c.name || "").trim()));

  let skipped = 0;
  let added = 0;
  const newCatNames = new Set();
  const byCatCount = {};
  const seenBatchUrls = new Set();

  for (const raw of rawSites) {
    const name = String(raw.name || "").trim();
    const url = String(raw.url || "").trim();
    if (!name || !/^https?:\/\//i.test(url)) {
      skipped++;
      continue;
    }
    if (existingUrls.has(url)) {
      skipped++;
      continue;
    }
    if (seenBatchUrls.has(url)) {
      skipped++;
      continue;
    }
    seenBatchUrls.add(url);
    added++;

    const cat = String(raw.category || "未分类").trim() || "未分类";
    byCatCount[cat] = (byCatCount[cat] || 0) + 1;
    if (!existingCatNames.has(cat)) {
      newCatNames.add(cat);
    }

    const parent = String(raw.parent_category || raw.parent || "").trim();
    if (parent && !existingCatNames.has(parent)) {
      newCatNames.add(parent);
    }
  }

  if (Array.isArray(rawCats)) {
    for (const c of rawCats) {
      const cName = String((c && c.name) || "").trim();
      if (cName && !existingCatNames.has(cName)) newCatNames.add(cName);
      const pName = String((c && c.parent) || "").trim();
      if (pName && !existingCatNames.has(pName)) newCatNames.add(pName);
    }
  }

  return {
    totalParsed: rawSites.length,
    added,
    skipped,
    newCategories: Array.from(newCatNames),
    byCatCount,
  };
}

function showImportPreviewModal(summary) {
  return new Promise((resolve) => {
    let mask = $("previewModal");
    if (!mask) {
      mask = document.createElement("div");
      mask.id = "previewModal";
      mask.className = "confirm-modal-mask";
      mask.innerHTML = `
        <div class="preview-card card">
          <h3 class="confirm-title serif">书签导入预览</h3>
          <div class="preview-body" id="previewBody"></div>
          <div class="confirm-actions">
            <button id="previewCancelBtn" type="button" class="ghost mini">取 消</button>
            <button id="previewOkBtn" type="button" class="primary mini">确认导入</button>
          </div>
        </div>`;
      document.body.appendChild(mask);
    }
    const bodyEl = $("previewBody");
    const okBtn = $("previewOkBtn");
    const cancelBtn = $("previewCancelBtn");

    let catCountHtml = Object.entries(summary.byCatCount || {})
      .map(([cat, count]) => `<span class="preview-cat-tag">${esc(cat)} <b>(${count})</b></span>`)
      .join("") || '<span class="muted">无条目</span>';

    let newCatsHtml = (summary.newCategories || []).length
      ? (summary.newCategories || []).map((c) => `<span class="preview-cat-tag new-cat">＋ ${esc(c)}</span>`).join("")
      : '<span class="muted">无（均已存在）</span>';

    bodyEl.innerHTML = `
      <div class="preview-stats-grid">
        <div class="preview-stat-box">
          <div class="preview-stat-num add">+${summary.added}</div>
          <div class="preview-stat-label">预计新增</div>
        </div>
        <div class="preview-stat-box">
          <div class="preview-stat-num skip">${summary.skipped}</div>
          <div class="preview-stat-label">重复或跳过</div>
        </div>
        <div class="preview-stat-box">
          <div class="preview-stat-num">${summary.newCategories.length}</div>
          <div class="preview-stat-label">将新建分类</div>
        </div>
      </div>
      <div class="preview-section-title">将新建分类 (${summary.newCategories.length} 个)：</div>
      <div class="preview-cat-tags">${newCatsHtml}</div>
      <div class="preview-section-title">新增条目分类分布：</div>
      <div class="preview-cat-tags">${catCountHtml}</div>
    `;

    mask.style.display = "flex";

    const cleanup = (result) => {
      mask.style.display = "none";
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      window.removeEventListener("keydown", onKeyDown);
      resolve(result);
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") cleanup(false);
    };

    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    window.addEventListener("keydown", onKeyDown);
    okBtn.focus();
  });
}

// --- floccus 双向同步预演弹窗 ---
function showFloccusSyncModal(d) {
  return new Promise((resolve) => {
    let mask = $("floccusSyncModal");
    if (!mask) {
      mask = document.createElement("div");
      mask.id = "floccusSyncModal";
      mask.className = "confirm-modal-mask";
      mask.innerHTML = `
        <div class="preview-card card" style="max-width:540px;max-height:85vh;display:flex;flex-direction:column">
          <h3 class="confirm-title serif">Floccus 书签双向同步预演</h3>
          <div class="preview-body" id="floccusPreviewBody" style="overflow-y:auto;flex:1;padding-right:4px"></div>
          <div class="confirm-actions" style="margin-top:14px">
            <button id="floccusCancelBtn" type="button" class="ghost mini">取 消</button>
            <button id="floccusOkBtn" type="button" class="primary mini">确认同步</button>
          </div>
        </div>`;
      document.body.appendChild(mask);
    }
    const bodyEl = $("floccusPreviewBody");
    const okBtn = $("floccusOkBtn");
    const cancelBtn = $("floccusCancelBtn");

    const totalDeletes = (d.deletedFromSite || 0) + (d.removedFromBrowser || 0);

    let html = `
      <div class="preview-stats-grid">
        <div class="preview-stat-box">
          <div class="preview-stat-num add">+${d.addedToSite || 0}</div>
          <div class="preview-stat-label">将新增到站内</div>
        </div>
        <div class="preview-stat-box">
          <div class="preview-stat-num" style="color:var(--accent)">↑${d.pushedToBrowser || 0}</div>
          <div class="preview-stat-label">将写进浏览器</div>
        </div>
        <div class="preview-stat-box">
          <div class="preview-stat-num skip">-${totalDeletes}</div>
          <div class="preview-stat-label">将从两端删除</div>
        </div>
      </div>`;

    if (d.deleteSuspended) {
      html += `
        <div style="background:rgba(184,51,42,0.12);border:1.5px solid var(--ochre);padding:10px 12px;margin:12px 0;font-size:13px;line-height:1.6">
          <b style="color:var(--ochre)">⚠️ 触发批量熔断保护：</b><br>
          单次待删除总数达 <b>${totalDeletes}</b> 条（超过安全阈值）。默认执行将<b>只做双向新增，跳过所有删除</b>。<br>
          <label style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer;font-weight:bold;color:var(--ochre)">
            <input type="checkbox" id="forceDeleteChk"> 站长确认无误，本次强制执行整批删除
          </label>
        </div>`;
    }

    if (d.isFirstRun) {
      html += `
        <div style="background:rgba(46,117,182,0.1);border:1px dashed var(--accent);padding:8px 12px;margin:10px 0;font-size:12px;color:var(--muted)">
          ℹ️ <b>首跑对账模式</b>：首次同步将仅标记存量书签来源（在 XBEL 中标 Floccus，其余标 manual），本轮不执行任何删除。
        </div>`;
    }

    // 1. 将新增到站内
    if (d.newSites && d.newSites.length > 0) {
      html += `<div style="margin-top:12px"><b style="font-size:13px">📥 将新增到站内 (${d.newSites.length} 条)：</b><div style="max-height:120px;overflow-y:auto;background:var(--bg);border:1px solid var(--line);padding:6px 10px;margin-top:4px;font-size:12px">`;
      for (const s of d.newSites) {
        html += `<div style="padding:2px 0;display:flex;justify-content:space-between;gap:8px"><span>${esc(s.name)}</span><span class="muted">[${esc(s.category)}]</span></div>`;
      }
      html += `</div></div>`;
    }

    // 2. 将写进浏览器
    if (d.pushedSites && d.pushedSites.length > 0) {
      html += `<div style="margin-top:12px"><b style="font-size:13px">📤 将写进浏览器 (${d.pushedSites.length} 条)：</b><div style="max-height:120px;overflow-y:auto;background:var(--bg);border:1px solid var(--line);padding:6px 10px;margin-top:4px;font-size:12px">`;
      for (const s of d.pushedSites) {
        html += `<div style="padding:2px 0;display:flex;justify-content:space-between;gap:8px"><span>${esc(s.name)}</span><span class="muted">[${esc(s.category)}]</span></div>`;
      }
      html += `</div></div>`;
    }

    // 3. 将删除清单
    if (totalDeletes > 0) {
      html += `<div style="margin-top:12px"><b style="font-size:13px;color:var(--ochre)">🗑️ 将删除清单 (${totalDeletes} 条)：</b><div style="max-height:120px;overflow-y:auto;background:var(--bg);border:1px solid var(--line);padding:6px 10px;margin-top:4px;font-size:12px">`;
      if (d.deletedSites) {
        for (const s of d.deletedSites) {
          html += `<div style="padding:2px 0;display:flex;justify-content:space-between;gap:8px"><span style="color:var(--ochre)">[站内删] ${esc(s.name)}</span><span class="muted">${esc(s.category)}</span></div>`;
        }
      }
      if (d.removedSites) {
        for (const u of d.removedSites) {
          html += `<div style="padding:2px 0;color:var(--ochre)">[浏览器删] ${esc(u)}</div>`;
        }
      }
      html += `</div></div>`;
    }

    // 4. 置顶保留清单
    if (d.pinnedRetained && d.pinnedRetained.length > 0) {
      html += `<div style="margin-top:10px;font-size:12px;color:var(--muted)">📌 因置顶保留：${d.pinnedRetained.map((p) => esc(p.name)).join("、")}（浏览器虽删，站内保留）</div>`;
    }

    if (!d.addedToSite && !d.pushedToBrowser && !totalDeletes) {
      html += `<div style="padding:16px 0;text-align:center;color:var(--muted);font-size:14px">两端完全一致，无须增删。</div>`;
    }

    bodyEl.innerHTML = html;
    mask.style.display = "flex";

    const cleanup = (confirmed) => {
      mask.style.display = "none";
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      window.removeEventListener("keydown", onKeyDown);
      const forceChk = $("forceDeleteChk");
      const isForce = forceChk ? forceChk.checked : false;
      resolve(confirmed ? { confirmed: true, forceDelete: isForce } : { confirmed: false });
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") cleanup(false);
    };

    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    window.addEventListener("keydown", onKeyDown);
    okBtn.focus();
  });
}


// --- P15: 移动端 Tab 化逻辑 ---
function switchTab(tabId) {
  document.body.classList.remove("tab-sites", "tab-edit", "tab-cats", "tab-tools");
  document.body.classList.add(tabId);
  document.querySelectorAll(".tab-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
}

// --- P14: 简介字数计数 ---
function updateDescCount() {
  const len = ($("fDesc").value || "").length;
  const countEl = $("descCount");
  if (!countEl) return;
  countEl.textContent = len + "/40";
  if (len >= 40) {
    countEl.style.color = "var(--ochre)";
    countEl.style.fontWeight = "700";
    countEl.style.opacity = "1";
  } else if (len > 20) {
    countEl.style.color = "var(--muted)";
    countEl.style.fontWeight = "normal";
    countEl.style.opacity = "0.65";
  } else {
    countEl.style.color = "var(--muted)";
    countEl.style.fontWeight = "normal";
    countEl.style.opacity = "1";
  }
}

// --- 数据加载 ---
async function load() {
  try {
    data = await api("/api/admin/sites");
  } catch (e) {
    if (e.message !== "unauthorized") $("list").textContent = "加载失败：" + e.message;
    return;
  }
  renderCats();
  renderSites();
  $("catList").innerHTML = data.categories.map((c) => `<option value="${esc(c.name)}">`).join("");
  $("cParent").innerHTML =
    '<option value="0">（一级分类）</option>' +
    data.categories
      .filter((c) => !c.parent_id)
      .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
      .join("");
}

// --- 分类渲染与管理 (含 P17 行内改名、站内确认) ---
function renderCats() {
  const counts = {};
  data.sites.forEach((s) => {
    const c = data.categories.find((x) => x.name === s.category);
    if (c) counts[c.id] = (counts[c.id] || 0) + 1;
  });
  const ordered = treeCats();
  const siblings = (c) => ordered.filter((x) => (x.parent_id || 0) === (c.parent_id || 0));

  $("catBody").innerHTML =
    ordered
      .map((c) => {
        const sibs = siblings(c);
        const idx = sibs.indexOf(c);
        const parentOpts =
          '<option value="0">（一级）</option>' +
          data.categories
            .filter((t) => !t.parent_id && t.id !== c.id)
            .map((t) => `<option value="${t.id}"${t.id === c.parent_id ? " selected" : ""}>${esc(t.name)}</option>`)
            .join("");
        const hasKids = data.categories.some((x) => x.parent_id === c.id);
        const kidCls = c.parent_id ? "kid" : "";

        return `<tr draggable="true" data-cat-id="${c.id}" data-pid="${c.parent_id || 0}" class="${kidCls}">
          <td class="cname cat-col-name">
            <span class="drag-handle" title="按住拖拽排序">⠿</span>
            <b class="cname-text">${esc(c.name)}</b>
          </td>
          <td class="cat-col-count"><span class="cat-count-badge">${counts[c.id] || 0}</span></td>
          <td class="cat-col-parent">
            <select class="inline" data-cparent="${c.id}"${hasKids ? ' disabled title="有子分类，不能降级"' : ""}>
              ${parentOpts}
            </select>
          </td>
          <td class="cat-col-priv"><label class="cat-priv-label"><input type="checkbox" data-cpriv="${c.id}"${c.is_private ? " checked" : ""}><span class="cat-priv-text">私密</span></label></td>
          <td class="cat-col-sort nowrap">
            <button class="mini ghost" data-cup="${c.id}"${idx === 0 ? " disabled" : ""}>↑</button>
            <button class="mini ghost" data-cdown="${c.id}"${idx === sibs.length - 1 ? " disabled" : ""}>↓</button>
          </td>
          <td class="cat-col-act nowrap">
            <button class="mini ghost" data-crename="${c.id}">改名</button>
            <button class="mini ghost danger" data-cdel="${c.id}">删除</button>
          </td>
        </tr>`;
      })
      .join("") || '<tr><td colspan="6" class="muted">还没有分类。</td></tr>';

  const moveCat = async (c, target) => {
    if (!c || !target) return;
    const sibs = siblings(c);
    const i1 = sibs.indexOf(c);
    const i2 = sibs.indexOf(target);
    if (i1 === -1 || i2 === -1) return;
    sibs.splice(i1, 1);
    sibs.splice(i2, 0, c);
    const newIds = sibs.map((x) => x.id);
    newIds.forEach((id, idx) => {
      const item = catById(id);
      if (item) item.sort_order = (idx + 1) * 10;
    });
    renderCats();
    try {
      await api("/api/admin/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "category", ids: newIds }),
      });
      toast("分类排序已保存");
    } catch (e) {
      toast("分类排序保存失败：" + e.message, true);
      load();
    }
  };

  document.querySelectorAll("[data-cup]").forEach((b) => (b.onclick = () => {
    const c = catById(+b.dataset.cup);
    const s = siblings(c);
    moveCat(c, s[s.indexOf(c) - 1]);
  }));
  document.querySelectorAll("[data-cdown]").forEach((b) => (b.onclick = () => {
    const c = catById(+b.dataset.cdown);
    const s = siblings(c);
    moveCat(c, s[s.indexOf(c) + 1]);
  }));

  document.querySelectorAll("[data-cparent]").forEach((sel) => (sel.onchange = async () => {
    try {
      await api("/api/admin/categories/" + sel.dataset.cparent, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: +sel.value }),
      });
      toast("分类层级已更新");
      load();
    } catch (e) {
      toast("层级更新失败：" + e.message, true);
      load();
    }
  }));

  document.querySelectorAll("[data-cpriv]").forEach((chk) => (chk.onchange = async () => {
    try {
      await api("/api/admin/categories/" + chk.dataset.cpriv, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ private: chk.checked }),
      });
      toast(chk.checked ? "分类已设为私密" : "分类已设为公开");
    } catch (e) {
      toast("私密设置失败：" + e.message, true);
      load();
    }
  }));

  // P17: 分类改名改行内编辑
  document.querySelectorAll("[data-crename]").forEach((b) => (b.onclick = () => {
    const cid = +b.dataset.crename;
    const c = catById(cid);
    if (!c) return;
    const tr = b.closest("tr");
    const td = tr ? tr.querySelector(".cname") : null;
    if (!td || td.querySelector(".cname-inline-wrap")) return;

    const oldText = c.name;
    td.innerHTML = `
      <div class="cname-inline-wrap">
        <input type="text" class="cname-inline-input" value="${esc(oldText)}">
        <button type="button" class="mini primary cname-inline-save">保存</button>
        <button type="button" class="mini ghost cname-inline-cancel">取消</button>
      </div>`;

    const input = td.querySelector(".cname-inline-input");
    const saveBtn = td.querySelector(".cname-inline-save");
    const cancelBtn = td.querySelector(".cname-inline-cancel");

    input.focus();
    input.select();

    const doSave = async () => {
      const newName = input.value.trim();
      if (!newName) {
        toast("分类名不能为空", true);
        return;
      }
      if (newName === oldText) {
        renderCats();
        return;
      }
      try {
        await api("/api/admin/categories/" + c.id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName }),
        });
        toast("分类已改名为「" + newName + "」");
        load();
      } catch (e) {
        toast("改名失败：" + e.message, true);
      }
    };

    saveBtn.onclick = doSave;
    cancelBtn.onclick = () => renderCats();
    input.onkeydown = (e) => {
      if (e.key === "Enter") doSave();
      else if (e.key === "Escape") renderCats();
    };
  }));

  // P17: 分类删除改用站内弹窗
  document.querySelectorAll("[data-cdel]").forEach((b) => (b.onclick = async () => {
    const c = catById(+b.dataset.cdel);
    const ok = await showConfirm("确定删除分类「" + (c ? c.name : "") + "」？", "删除分类", {
      isDanger: true,
      defaultCancel: true,
    });
    if (!ok) return;
    try {
      await api("/api/admin/categories/" + b.dataset.cdel, { method: "DELETE" });
      toast("分类已删除");
      load();
    } catch (e) {
      toast("删除失败：" + e.message, true);
    }
  }));

  attachCatDrag();
}

// --- 分类拖拽排序 (桌面 + P16 原生触控) ---
function attachCatDrag() {
  let dragSource = null;
  const rows = $("catBody").querySelectorAll("tr[data-cat-id]");

  rows.forEach((tr) => {
    // 桌面 HTML5 Drag
    tr.ondragstart = (e) => {
      if (e.target.closest("button, select, input, a")) {
        e.preventDefault();
        return;
      }
      dragSource = tr;
      tr.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tr.dataset.catId);
    };

    tr.ondragover = (e) => {
      if (!dragSource || dragSource === tr) return;
      if (tr.dataset.pid !== dragSource.dataset.pid) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = tr.getBoundingClientRect();
      const next = e.clientY - rect.top > rect.height / 2;
      tr.classList.toggle("drag-over-above", !next);
      tr.classList.toggle("drag-over-below", next);
    };

    tr.ondragleave = () => {
      tr.classList.remove("drag-over-above", "drag-over-below");
    };

    tr.ondrop = async (e) => {
      e.preventDefault();
      tr.classList.remove("drag-over-above", "drag-over-below");
      if (!dragSource || dragSource === tr) return;
      if (tr.dataset.pid !== dragSource.dataset.pid) return;
      const rect = tr.getBoundingClientRect();
      const next = e.clientY - rect.top > rect.height / 2;
      tr.parentNode.insertBefore(dragSource, next ? tr.nextSibling : tr);
      const pid = dragSource.dataset.pid;
      const sibRows = [...$("catBody").querySelectorAll('tr[data-pid="' + pid + '"]')];
      const newIds = sibRows.map((r) => +r.dataset.catId);
      try {
        await api("/api/admin/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "category", ids: newIds }),
        });
        newIds.forEach((id, i) => {
          const c = data.categories.find((x) => x.id === id);
          if (c) c.sort_order = (i + 1) * 10;
        });
        toast("分类排序已保存");
        renderCats();
      } catch (err) {
        toast("分类排序保存失败：" + err.message, true);
        load();
      }
    };

    tr.ondragend = () => {
      if (dragSource) dragSource.classList.remove("dragging");
      document
        .querySelectorAll(".drag-over-above, .drag-over-below")
        .forEach((el) => el.classList.remove("drag-over-above", "drag-over-below"));
      dragSource = null;
    };

    // P16: 触控拖拽支持
    const handle = tr.querySelector(".drag-handle");
    if (handle) {
      let touchActive = false;
      let lastOverTr = null;
      let lastNext = false;

      handle.addEventListener(
        "touchstart",
        (e) => {
          touchActive = true;
          dragSource = tr;
          tr.classList.add("dragging");
        },
        { passive: true }
      );

      handle.addEventListener(
        "touchmove",
        (e) => {
          if (!touchActive || !dragSource) return;
          const touch = e.touches[0];
          const elem = document.elementFromPoint(touch.clientX, touch.clientY);
          const targetTr = elem ? elem.closest("tr[data-cat-id]") : null;

          document
            .querySelectorAll(".drag-over-above, .drag-over-below")
            .forEach((el) => el.classList.remove("drag-over-above", "drag-over-below"));

          if (targetTr && targetTr !== dragSource && targetTr.dataset.pid === dragSource.dataset.pid) {
            e.preventDefault();
            const rect = targetTr.getBoundingClientRect();
            lastNext = touch.clientY - rect.top > rect.height / 2;
            lastOverTr = targetTr;
            targetTr.classList.toggle("drag-over-above", !lastNext);
            targetTr.classList.toggle("drag-over-below", lastNext);
          } else {
            lastOverTr = null;
          }
        },
        { passive: false }
      );

      handle.addEventListener(
        "touchend",
        async (e) => {
          if (!touchActive) return;
          touchActive = false;
          tr.classList.remove("dragging");
          document
            .querySelectorAll(".drag-over-above, .drag-over-below")
            .forEach((el) => el.classList.remove("drag-over-above", "drag-over-below"));

          if (lastOverTr && dragSource && lastOverTr !== dragSource && lastOverTr.dataset.pid === dragSource.dataset.pid) {
            lastOverTr.parentNode.insertBefore(dragSource, lastNext ? lastOverTr.nextSibling : lastOverTr);
            const pid = dragSource.dataset.pid;
            const sibRows = [...$("catBody").querySelectorAll('tr[data-pid="' + pid + '"]')];
            const newIds = sibRows.map((r) => +r.dataset.catId);
            try {
              await api("/api/admin/reorder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "category", ids: newIds }),
              });
              newIds.forEach((id, i) => {
                const c = data.categories.find((x) => x.id === id);
                if (c) c.sort_order = (i + 1) * 10;
              });
              toast("分类排序已保存");
              renderCats();
            } catch (err) {
              toast("分类排序保存失败：" + err.message, true);
              load();
            }
          }
          dragSource = null;
          lastOverTr = null;
        },
        { passive: true }
      );
    }
  });
}

// --- P10: 书签行徽标点击切换 ---
async function toggleSiteBadge(s, field, el) {
  const prevVal = s[field];
  const nextVal = !prevVal;
  s[field] = nextVal;
  el.classList.toggle("badge-off", !nextVal);
  if (field === "pinned") {
    el.title = nextVal ? "点击取消置顶" : "点击设为置顶";
  } else {
    el.title = nextVal ? "点击设为公开" : "点击设为私密";
  }
  try {
    await api("/api/admin/sites/" + s.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: s.name,
        url: s.url,
        desc: s.desc || "",
        category: s.category,
        icon: s.icon || "",
        pinned: !!s.pinned,
        private: !!s.is_private,
        sort_order: s.sort_order,
      }),
    });
    toast(field === "pinned" ? (nextVal ? "已置顶" : "已取消置顶") : nextVal ? "已设为私密" : "已设为公开");
  } catch (e) {
    s[field] = prevVal;
    el.classList.toggle("badge-off", !prevVal);
    if (field === "pinned") {
      el.title = prevVal ? "点击取消置顶" : "点击设为置顶";
    } else {
      el.title = prevVal ? "点击设为公开" : "点击设为私密";
    }
    toast("切换失败：" + e.message, true);
  }
}

// --- 书签渲染与列表 (含多选批量、P12 空态、P10 徽标、P17 站内确认) ---
function renderSites() {
  const validSiteIds = new Set((data.sites || []).map((s) => s.id));
  for (const id of selectedSiteIds) {
    if (!validSiteIds.has(id)) selectedSiteIds.delete(id);
  }

  const rawKw = (($("siteSearch") || {}).value || "").trim();
  const kw = rawKw.toLowerCase();
  const isSearching = !!kw;
  const byCat = {};
  const visibleSites = [];

  data.sites.forEach((s) => {
    if (kw && !(s.name + " " + s.url + " " + (s.desc || "") + " " + s.category).toLowerCase().includes(kw)) return;
    visibleSites.push(s);
    (byCat[s.category] = byCat[s.category] || []).push(s);
  });
  Object.values(byCat).forEach((rows) => rows.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id));
  const orderedNames = treeCats()
    .map((c) => c.name)
    .filter((n) => byCat[n]);
  Object.keys(byCat).forEach((n) => {
    if (!orderedNames.includes(n)) orderedNames.push(n);
  });

  // P12: 精细化空态
  const emptyHtml =
    data.sites.length === 0
      ? '<p class="muted">库里还没有书签。</p>'
      : `<p class="muted">未找到包含『${esc(rawKw)}』的书签。</p>`;

  $("list").innerHTML =
    orderedNames
      .map((cat) => {
        const rows = byCat[cat];
        const allCatChecked = rows.length > 0 && rows.every((s) => selectedSiteIds.has(s.id));
        const trs = rows
          .map((s, i) => {
            const dragTip = isSearching
              ? ' style="opacity:.35;cursor:not-allowed" title="搜索状态下不能调序，请先清空搜索"'
              : ' title="按住拖拽排序"';
            const upDis = isSearching
              ? ' disabled style="opacity:.35;cursor:not-allowed" title="搜索状态下不能调序，请先清空搜索"'
              : i === 0
              ? " disabled"
              : "";
            const downDis = isSearching
              ? ' disabled style="opacity:.35;cursor:not-allowed" title="搜索状态下不能调序，请先清空搜索"'
              : i === rows.length - 1
              ? " disabled"
              : "";
            const pinCls = s.pinned ? "" : " badge-off";
            const pinTitle = s.pinned ? "点击取消置顶" : "点击设为置顶";
            const privCls = s.is_private ? "" : " badge-off";
            const privTitle = s.is_private ? "点击设为公开" : "点击设为私密";
            const descHtml = s.desc ? `<div class="site-desc">${esc(s.desc)}</div>` : "";
            const isChecked = selectedSiteIds.has(s.id);

            return `<tr draggable="${isSearching ? "false" : "true"}" data-site-id="${s.id}" data-cat="${esc(s.category)}">
              <td class="site-check-col">
                <input type="checkbox" data-scheck="${s.id}"${isChecked ? " checked" : ""}>
              </td>
              <td class="site-icon-col">${iconHTML(s)}</td>
              <td class="site-main-col">
                <div class="site-head">
                  <span class="drag-handle"${dragTip}>⠿</span>
                  <b class="site-title">${esc(s.name)}</b>
                  <span class="badge clickable${pinCls}" data-tpin="${s.id}" title="${pinTitle}">置顶</span>
                  <span class="badge clickable priv${privCls}" data-tpriv="${s.id}" title="${privTitle}">私密</span>
                </div>
                ${descHtml}
                <div class="site-url"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></div>
              </td>
              <td class="nowrap col-sort">
                <button class="mini ghost" data-sup="${s.id}"${upDis}>↑</button>
                <button class="mini ghost" data-sdown="${s.id}"${downDis}>↓</button>
              </td>
              <td class="nowrap col-act">
                <button class="mini ghost" data-edit="${s.id}">编辑</button>
                <button class="mini ghost danger" data-del="${s.id}">删除</button>
              </td>
            </tr>`;
          })
          .join("");

        const isCollapsed = !isSearching && collapsedCats.has(cat);
        const catSelCount = rows.filter((s) => selectedSiteIds.has(s.id)).length;
        const selBadgeHtml = isCollapsed && catSelCount > 0 ? `<span class="cat-folded-sel-tag">已选 ${catSelCount} 条</span>` : "";

        return `
          <div class="cat-head-wrap" data-cat-fold="${esc(cat)}">
            <div class="cat-title-toggle">
              <span class="cat-fold-arrow ${isCollapsed ? "" : "expanded"}">▶</span>
              <h3 class="serif" style="margin:0">${esc(cat)}（${rows.length}）</h3>
              ${selBadgeHtml}
            </div>
            <label class="cat-select-all-wrap">
              <input type="checkbox" data-cat-check="${esc(cat)}"${allCatChecked ? " checked" : ""}> 全选本类
            </label>
          </div>
          <div class="tblwrap" style="display:${isCollapsed ? "none" : "block"}"><table class="sites-tbl"><tbody data-cat="${esc(cat)}">${trs}</tbody></table></div>`;
      })
      .join("") || emptyHtml;

  const moveSite = async (s, target) => {
    if ((($("siteSearch") || {}).value || "").trim()) {
      toast("搜索状态下不能调序，请先清空搜索", true);
      return;
    }
    if (!s || !target) return;
    const rows = byCat[s.category];
    const i1 = rows.indexOf(s);
    const i2 = rows.indexOf(target);
    if (i1 === -1 || i2 === -1) return;
    rows.splice(i1, 1);
    rows.splice(i2, 0, s);
    const newIds = rows.map((x) => x.id);
    newIds.forEach((id, idx) => {
      const site = data.sites.find((x) => x.id === id);
      if (site) site.sort_order = (idx + 1) * 10;
    });
    renderSites();
    try {
      await api("/api/admin/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "site", ids: newIds }),
      });
      toast("书签排序已保存");
    } catch (e) {
      toast("书签排序保存失败：" + e.message, true);
      load();
    }
  };

  // 分类折叠：点击分类标题栏切换折叠/展开
  document.querySelectorAll(".cat-title-toggle").forEach((toggleEl) => {
    toggleEl.onclick = () => {
      const wrap = toggleEl.closest(".cat-head-wrap");
      if (!wrap) return;
      const cat = wrap.dataset.catFold;
      if (!cat) return;
      if (collapsedCats.has(cat)) {
        collapsedCats.delete(cat);
      } else {
        collapsedCats.add(cat);
      }
      renderSites();
    };
  });

  const updateCatFoldBadge = (catName) => {
    const wrap = document.querySelector(`.cat-head-wrap[data-cat-fold="${CSS.escape ? CSS.escape(catName) : catName}"]`);
    if (!wrap) return;
    const toggle = wrap.querySelector(".cat-title-toggle");
    if (!toggle) return;
    let badge = toggle.querySelector(".cat-folded-sel-tag");
    const isCol = !isSearching && collapsedCats.has(catName);
    const catRows = byCat[catName] || [];
    const count = catRows.filter((s) => selectedSiteIds.has(s.id)).length;
    if (isCol && count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "cat-folded-sel-tag";
        toggle.appendChild(badge);
      }
      badge.textContent = `已选 ${count} 条`;
    } else if (badge) {
      badge.remove();
    }
  };

  // 多选：站点行复选框变化
  document.querySelectorAll("[data-scheck]").forEach((chk) => {
    chk.onchange = () => {
      const id = +chk.dataset.scheck;
      if (chk.checked) selectedSiteIds.add(id);
      else selectedSiteIds.delete(id);

      const tr = chk.closest("tr");
      const catName = tr ? tr.dataset.cat : "";
      if (catName) {
        const catChk = document.querySelector(`input[data-cat-check="${CSS.escape ? CSS.escape(catName) : catName}"]`);
        const catRows = byCat[catName] || [];
        if (catChk) {
          catChk.checked = catRows.length > 0 && catRows.every((s) => selectedSiteIds.has(s.id));
          catChk.indeterminate = !catChk.checked && catRows.some((s) => selectedSiteIds.has(s.id));
        }
        updateCatFoldBadge(catName);
      }
      updateBulkBar(visibleSites);
    };
  });

  // 多选：分类全选复选框变化
  document.querySelectorAll("[data-cat-check]").forEach((chk) => {
    chk.onchange = () => {
      const catName = chk.dataset.catCheck;
      const catRows = byCat[catName] || [];
      if (chk.checked) {
        catRows.forEach((s) => selectedSiteIds.add(s.id));
      } else {
        catRows.forEach((s) => selectedSiteIds.delete(s.id));
      }
      const tbody = document.querySelector(`tbody[data-cat="${CSS.escape ? CSS.escape(catName) : catName}"]`);
      if (tbody) {
        tbody.querySelectorAll("[data-scheck]").forEach((sc) => {
          sc.checked = chk.checked;
        });
      }
      updateCatFoldBadge(catName);
      updateBulkBar(visibleSites);
    };
  });

  document.querySelectorAll("[data-tpin]").forEach((el) => (el.onclick = () => {
    const s = data.sites.find((x) => x.id === +el.dataset.tpin);
    if (s) toggleSiteBadge(s, "pinned", el);
  }));
  document.querySelectorAll("[data-tpriv]").forEach((el) => (el.onclick = () => {
    const s = data.sites.find((x) => x.id === +el.dataset.tpriv);
    if (s) toggleSiteBadge(s, "is_private", el);
  }));

  document.querySelectorAll("[data-sup]").forEach((b) => (b.onclick = () => {
    const s = data.sites.find((x) => x.id === +b.dataset.sup);
    const rows = byCat[s.category];
    moveSite(s, rows[rows.indexOf(s) - 1]);
  }));
  document.querySelectorAll("[data-sdown]").forEach((b) => (b.onclick = () => {
    const s = data.sites.find((x) => x.id === +b.dataset.sdown);
    const rows = byCat[s.category];
    moveSite(s, rows[rows.indexOf(s) + 1]);
  }));

  document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = (e) => {
    e.preventDefault();
    edit(+b.dataset.edit);
  }));

  // P17: 书签删除改用站内弹窗
  document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async (e) => {
    e.preventDefault();
    const s = data.sites.find((x) => x.id === +b.dataset.del);
    const ok = await showConfirm("确定删除书签「" + (s ? s.name : "") + "」？", "删除书签", {
      isDanger: true,
      defaultCancel: true,
    });
    if (!ok) return;
    try {
      await api("/api/admin/sites/" + b.dataset.del, { method: "DELETE" });
      selectedSiteIds.delete(+b.dataset.del);
      toast("书签已删除");
      load();
    } catch (err) {
      toast("删除书签失败：" + err.message, true);
    }
  }));

  attachSiteDrag();
  updateBulkBar(visibleSites);
}

// --- 批量操作浮动栏 ---
function updateBulkBar(visibleSites = []) {
  let bar = $("bulkBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "bulkBar";
    bar.className = "bulk-bar";
    const listEl = $("list");
    if (listEl && listEl.parentNode) {
      listEl.parentNode.insertBefore(bar, listEl);
    }
  }

  const selectedCount = selectedSiteIds.size;
  if (selectedCount === 0) {
    bar.style.display = "none";
    bar.innerHTML = "";
    return;
  }

  bar.style.display = "flex";

  const isSearching = !!(($("siteSearch") || {}).value || "").trim();
  const visibleCount = visibleSites.length;
  const allVisibleSelected = visibleCount > 0 && visibleSites.every((s) => selectedSiteIds.has(s.id));

  const catOptions = (data.categories || [])
    .map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`)
    .join("");

  const matchTip = isSearching ? `（匹配到 ${visibleCount} 条）` : "";
  const selectBtnText = allVisibleSelected
    ? "取消全选"
    : (isSearching ? "全选匹配到的 " + visibleCount + " 条" : "全选全部 " + visibleCount + " 条");

  bar.innerHTML = `
    <div class="bulk-info">
      <span>已选 <b>${selectedCount}</b> 条${matchTip}</span>
      <button type="button" class="mini ghost" id="bulkSelectVisibleBtn">${selectBtnText}</button>
      <button type="button" class="mini ghost" id="bulkClearBtn">清空已选</button>
    </div>
    <div class="bulk-actions-group">
      <select id="bulkTargetCat" class="inline" style="max-width:140px">
        ${catOptions}
      </select>
      <button type="button" class="mini ghost" id="bulkMoveBtn">移动分类</button>
      <button type="button" class="mini ghost" id="bulkPinBtn">设为置顶</button>
      <button type="button" class="mini ghost" id="bulkUnpinBtn">取消置顶</button>
      <button type="button" class="mini ghost" id="bulkPrivBtn">设为私密</button>
      <button type="button" class="mini ghost" id="bulkPubBtn">设为公开</button>
      <button type="button" class="mini ghost" id="bulkAiBtnRow">补简介</button>
      <button type="button" class="mini ghost danger" id="bulkDelBtn">批量删除</button>
    </div>
  `;

  $("bulkClearBtn").onclick = () => {
    selectedSiteIds.clear();
    renderSites();
  };

  $("bulkSelectVisibleBtn").onclick = () => {
    if (allVisibleSelected) {
      visibleSites.forEach((s) => selectedSiteIds.delete(s.id));
    } else {
      visibleSites.forEach((s) => selectedSiteIds.add(s.id));
    }
    renderSites();
  };

  $("bulkMoveBtn").onclick = async () => {
    const targetCat = $("bulkTargetCat").value;
    if (!targetCat) {
      toast("请选择目标分类", true);
      return;
    }
    const ids = Array.from(selectedSiteIds);
    try {
      const res = await api("/api/admin/sites/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", ids, target_category: targetCat }),
      });
      toast(`已将 ${res.count} 条书签移至「${targetCat}」`);
      selectedSiteIds.clear();
      load();
    } catch (e) {
      toast("批量移动失败：" + e.message, true);
    }
  };

  $("bulkPinBtn").onclick = async () => {
    const ids = Array.from(selectedSiteIds);
    try {
      const res = await api("/api/admin/sites/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_pinned", ids, is_pinned: true }),
      });
      toast(`已将 ${res.count} 条书签设为置顶`);
      load();
    } catch (e) {
      toast("批量设为置顶失败：" + e.message, true);
    }
  };

  $("bulkUnpinBtn").onclick = async () => {
    const ids = Array.from(selectedSiteIds);
    try {
      const res = await api("/api/admin/sites/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_pinned", ids, is_pinned: false }),
      });
      toast(`已取消 ${res.count} 条书签的置顶`);
      load();
    } catch (e) {
      toast("批量取消置顶失败：" + e.message, true);
    }
  };

  $("bulkPrivBtn").onclick = async () => {
    const ids = Array.from(selectedSiteIds);
    try {
      const res = await api("/api/admin/sites/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_private", ids, is_private: true }),
      });
      toast(`已将 ${res.count} 条书签设为私密`);
      load();
    } catch (e) {
      toast("批量设为私密失败：" + e.message, true);
    }
  };

  $("bulkPubBtn").onclick = async () => {
    const ids = Array.from(selectedSiteIds);
    try {
      const res = await api("/api/admin/sites/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_private", ids, is_private: false }),
      });
      toast(`已将 ${res.count} 条书签设为公开`);
      load();
    } catch (e) {
      toast("批量设为公开失败：" + e.message, true);
    }
  };

  $("bulkDelBtn").onclick = async () => {
    const selectedSites = data.sites.filter((s) => selectedSiteIds.has(s.id));
    const count = selectedSites.length;
    if (count === 0) return;

    const top3 = selectedSites.slice(0, 3).map((s) => `「${s.name}」`).join("、");
    const moreTip = count > 3 ? ` 等共 ${count} 个书签` : "";
    let confirmMsg = `确定要彻底删除已选中的 ${count} 个书签吗？\n包括：${top3}${moreTip}。\n删除后不可恢复！`;
    if (count >= 10) {
      confirmMsg += "\n\n⚠️ 提示：删除条数较多（≥10条），建议操作前先在左侧「导入/导出」卡片导出备份。";
    }

    const ok = await showConfirm(confirmMsg, "批量删除确认", {
      isDanger: true,
      defaultCancel: true,
      disableEnter: true,
    });
    if (!ok) return;

    try {
      const res = await api("/api/admin/sites/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: Array.from(selectedSiteIds) }),
      });
      toast(`已批量删除 ${res.count} 条书签`);
      selectedSiteIds.clear();
      load();
    } catch (e) {
      toast("批量删除失败：" + e.message, true);
    }
  };

  $("bulkAiBtnRow").onclick = () => {
    const todo = data.sites.filter((s) => selectedSiteIds.has(s.id) && !s.desc);
    if (!todo.length) {
      toast("已勾选的书签中没有缺简介的条目");
      return;
    }
    runBulkAiDesc(todo);
  };
}

// --- 书签拖拽排序 (桌面 + P16 触控) ---
function attachSiteDrag() {
  let dragSource = null;
  const tables = document.querySelectorAll("table.sites-tbl");

  tables.forEach((tbl) => {
    const rows = tbl.querySelectorAll("tr[data-site-id]");
    rows.forEach((tr) => {
      tr.ondragstart = (e) => {
        if (
          e.target.closest("button, a, input, select") ||
          tr.getAttribute("draggable") === "false" ||
          (($("siteSearch") || {}).value || "").trim()
        ) {
          e.preventDefault();
          return;
        }
        dragSource = tr;
        tr.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", tr.dataset.siteId);
      };

      tr.ondragover = (e) => {
        if (!dragSource || dragSource === tr) return;
        if (tr.dataset.cat !== dragSource.dataset.cat) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = tr.getBoundingClientRect();
        const next = e.clientY - rect.top > rect.height / 2;
        tr.classList.toggle("drag-over-above", !next);
        tr.classList.toggle("drag-over-below", next);
      };

      tr.ondragleave = () => {
        tr.classList.remove("drag-over-above", "drag-over-below");
      };

      tr.ondrop = async (e) => {
        e.preventDefault();
        tr.classList.remove("drag-over-above", "drag-over-below");
        if (!dragSource || dragSource === tr) return;
        if (tr.dataset.cat !== dragSource.dataset.cat) return;
        const rect = tr.getBoundingClientRect();
        const next = e.clientY - rect.top > rect.height / 2;
        tr.parentNode.insertBefore(dragSource, next ? tr.nextSibling : tr);
        const tbody = tr.parentNode;
        const newIds = [...tbody.querySelectorAll("tr[data-site-id]")].map((r) => +r.dataset.siteId);
        const dropCat = dragSource ? dragSource.dataset.cat : "";
        try {
          await api("/api/admin/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "site", ids: newIds }),
          });
          newIds.forEach((id, i) => {
            const s2 = data.sites.find((x) => x.id === id);
            if (s2) s2.sort_order = (i + 1) * 10;
          });
          if ((($("siteSearch") || {}).value || "").trim()) {
            load();
          } else {
            const catName = dropCat;
            const group = data.sites.filter((x) => x.category === catName);
            const reordered = newIds.map((id) => data.sites.find((x) => x.id === id)).filter(Boolean);
            if (group.length === reordered.length && group.length) {
              data.sites.splice(data.sites.indexOf(group[0]), group.length, ...reordered);
            }
          }
          toast("书签排序已保存");
        } catch (err) {
          toast("书签排序保存失败：" + err.message, true);
          load();
        }
      };

      tr.ondragend = () => {
        if (dragSource) dragSource.classList.remove("dragging");
        document
          .querySelectorAll(".drag-over-above, .drag-over-below")
          .forEach((el) => el.classList.remove("drag-over-above", "drag-over-below"));
        dragSource = null;
      };

      // P16: 触控调序支持（搜索过滤时禁用）
      const handle = tr.querySelector(".drag-handle");
      if (handle) {
        let touchActive = false;
        let lastOverTr = null;
        let lastNext = false;

        handle.addEventListener(
          "touchstart",
          (e) => {
            if ((($("siteSearch") || {}).value || "").trim()) return;
            touchActive = true;
            dragSource = tr;
            tr.classList.add("dragging");
          },
          { passive: true }
        );

        handle.addEventListener(
          "touchmove",
          (e) => {
            if (!touchActive || !dragSource) return;
            e.preventDefault(); // 拖拽中全程拦截，防手势被页面滚动抢走（部分浏览器只认前几下）
            const touch = e.touches[0];
            const elem = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetTr = elem ? elem.closest("tr[data-site-id]") : null;

            document
              .querySelectorAll(".drag-over-above, .drag-over-below")
              .forEach((el) => el.classList.remove("drag-over-above", "drag-over-below"));

            if (targetTr && targetTr !== dragSource && targetTr.dataset.cat === dragSource.dataset.cat) {
              e.preventDefault();
              const rect = targetTr.getBoundingClientRect();
              lastNext = touch.clientY - rect.top > rect.height / 2;
              lastOverTr = targetTr;
              targetTr.classList.toggle("drag-over-above", !lastNext);
              targetTr.classList.toggle("drag-over-below", lastNext);
            } else {
              lastOverTr = null;
            }
          },
          { passive: false }
        );

        handle.addEventListener(
          "touchcancel",
          () => {
            // 手势被系统/浏览器打断时复位状态，避免拖拽态残留
            touchActive = false;
            tr.classList.remove("dragging");
            document
              .querySelectorAll(".drag-over-above, .drag-over-below")
              .forEach((el) => el.classList.remove("drag-over-above", "drag-over-below"));
            dragSource = null;
            lastOverTr = null;
          },
          { passive: true }
        );

        handle.addEventListener(
          "touchend",
          async (e) => {
            if (!touchActive) return;
            touchActive = false;
            tr.classList.remove("dragging");
            document
              .querySelectorAll(".drag-over-above, .drag-over-below")
              .forEach((el) => el.classList.remove("drag-over-above", "drag-over-below"));

            if (lastOverTr && dragSource && lastOverTr !== dragSource && lastOverTr.dataset.cat === dragSource.dataset.cat) {
              lastOverTr.parentNode.insertBefore(dragSource, lastNext ? lastOverTr.nextSibling : lastOverTr);
              const tbody = lastOverTr.parentNode;
              const newIds = [...tbody.querySelectorAll("tr[data-site-id]")].map((r) => +r.dataset.siteId);
              const dropCat = dragSource.dataset.cat;
              try {
                await api("/api/admin/reorder", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ type: "site", ids: newIds }),
                });
                newIds.forEach((id, i) => {
                  const s2 = data.sites.find((x) => x.id === id);
                  if (s2) s2.sort_order = (i + 1) * 10;
                });
                if ((($("siteSearch") || {}).value || "").trim()) {
                  load();
                } else {
                  const catName = dropCat;
                  const group = data.sites.filter((x) => x.category === catName);
                  const reordered = newIds.map((id) => data.sites.find((x) => x.id === id)).filter(Boolean);
                  if (group.length === reordered.length && group.length) {
                    data.sites.splice(data.sites.indexOf(group[0]), group.length, ...reordered);
                  }
                }
                toast("书签排序已保存");
              } catch (err) {
                toast("书签排序保存失败：" + err.message, true);
                load();
              }
            }
            dragSource = null;
            lastOverTr = null;
          },
          { passive: true }
        );
      }
    });
  });
}

// --- 网址实时查重 ---
function clearUrlDupWarn() {
  const el = $("urlDupWarn");
  if (el) {
    el.style.display = "none";
    el.innerHTML = "";
  }
}

function checkUrlDup() {
  const warnEl = $("urlDupWarn");
  if (!warnEl) return;
  // 仅「新增」模式触发
  if (editingSiteId || ($("fId") && $("fId").value)) {
    clearUrlDupWarn();
    return;
  }
  const rawUrl = ($("fUrl").value || "").trim();
  if (!rawUrl) {
    clearUrlDupWarn();
    return;
  }
  // 查重口径与服务端 sites.js POST 判定一致 (url === rawUrl)
  const dup = (data.sites || []).find((s) => s.url === rawUrl);
  if (dup) {
    warnEl.innerHTML = `⚠️ 提示：该网址已在「<b>${esc(dup.category || "未分类")}</b>」以「<b>${esc(dup.name)}</b>」收录。<a id="dupEditLink" href="javascript:void(0)">直接调出编辑</a>`;
    warnEl.style.display = "block";
    const editLink = $("dupEditLink");
    if (editLink) {
      editLink.onclick = (e) => {
        e.preventDefault();
        $("fUrl").blur();
        if (document.activeElement && typeof document.activeElement.blur === "function") {
          document.activeElement.blur();
        }
        clearUrlDupWarn();
        edit(dup.id);
      };
    }
  } else {
    clearUrlDupWarn();
  }
}

// --- 表单、编辑与取消编辑 (P11, P15, P08+P17 站内确认) ---
function edit(id) {
  const s = data.sites.find((x) => x.id === id);
  if (!s) return;
  clearUrlDupWarn();
  editingSiteId = s.id;
  $("fId").value = s.id;
  $("fSort").value = s.sort_order;
  $("fName").value = s.name;
  $("fUrl").value = s.url;
  $("fDesc").value = s.desc || "";
  $("fCat").value = s.category;
  $("fIcon").value = s.icon || "";
  $("fPinned").checked = !!s.pinned;
  $("fPrivate").checked = !!s.is_private;
  $("formTitle").textContent = "编辑书签";
  $("resetBtn").textContent = "取消编辑";
  updateDescCount();
  switchTab("tab-edit"); // P15: 编辑自动切至新增/编辑Tab
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("resetBtn").onclick = () => {
  const prevId = editingSiteId;
  editingSiteId = null;
  clearUrlDupWarn();
  ["fId", "fSort", "fName", "fUrl", "fDesc", "fCat", "fIcon"].forEach((i) => ($(i).value = ""));
  $("fPinned").checked = $("fPrivate").checked = false;
  $("formTitle").textContent = "新增书签";
  $("resetBtn").textContent = "清空表单";
  $("msg").textContent = "";
  updateDescCount();
  if (prevId) {
    switchTab("tab-sites");
    const row = document.querySelector('tr[data-site-id="' + prevId + '"]');
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};

$("saveBtn").onclick = async () => {
  const name = $("fName").value.trim();
  const url = $("fUrl").value.trim();
  if (!name || !url) {
    $("msg").textContent = "请先填写站名和网址。";
    toast("请先填写站名和网址", true);
    return;
  }
  const cat = $("fCat").value.trim();
  if (cat && !data.categories.some((c) => c.name === cat)) {
    // P08 + P17: 新分类确认改用统一站内弹窗
    const ok = await showConfirm("『" + cat + "』是新分类，将新建为一级分类，确定？", "新建分类确认");
    if (!ok) return;
  }
  const body = {
    name,
    url,
    desc: $("fDesc").value.trim(),
    category: cat,
    icon: $("fIcon").value.trim(),
    pinned: $("fPinned").checked,
    private: $("fPrivate").checked,
  };
  const id = $("fId").value;
  if (id) body.sort_order = +$("fSort").value || 0;
  try {
    const res = await api(id ? "/api/admin/sites/" + id : "/api/admin/sites", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const targetId = id ? +id : res && res.id ? +res.id : null;
    $("msg").textContent = id ? "已保存修改。" : "新书签已保存。";
    toast(id ? "书签修改已保存" : "新书签已保存");
    editingSiteId = null;
    clearUrlDupWarn();
    $("fId").value = "";
    $("fUrl").value = "";
    $("fName").value = "";
    $("fDesc").value = "";
    $("fCat").value = "";
    $("fIcon").value = "";
    $("fSort").value = "";
    $("fPinned").checked = false;
    $("fPrivate").checked = false;
    $("formTitle").textContent = "新增书签";
    $("resetBtn").textContent = "清空表单";
    $("msg").textContent = "";
    updateDescCount();
    await load();
    if (targetId) {
      switchTab("tab-sites");
      setTimeout(() => {
        const row = document.querySelector('tr[data-site-id="' + targetId + '"]');
        if (row) {
          row.classList.add("row-highlight");
          setTimeout(() => {
            row.classList.remove("row-highlight");
          }, 1500);
          row.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
    }
  } catch (e) {
    $("msg").textContent = "出错：" + e.message;
    toast("保存失败：" + e.message, true);
  }
};

$("catAddBtn").onclick = async () => {
  const name = $("cName").value.trim();
  if (!name) {
    $("catMsg").textContent = "先填分类名";
    toast("先填分类名", true);
    return;
  }
  try {
    await api("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        parent_id: +$("cParent").value,
        private: $("cPrivate").checked,
        sort_order: (data.categories.length + 1) * 10,
      }),
    });
    $("catMsg").textContent = "分类已建。";
    $("cName").value = "";
    toast("分类「" + name + "」已创建");
    load();
  } catch (e) {
    $("catMsg").textContent = "出错：" + e.message;
    toast("新建分类失败：" + e.message, true);
  }
};

// --- P09: AI 描述与站名自动清洗 ---
$("aiDescBtn").onclick = async () => {
  const url = $("fUrl").value.trim();
  if (!url) {
    $("msg").textContent = "先填网址，再让 AI 生成简介";
    toast("先填网址", true);
    return;
  }
  $("aiDescBtn").disabled = true;
  $("msg").textContent = "正在生成…";
  try {
    const j = await api("/api/admin/ai-desc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    $("fDesc").value = j.desc;
    updateDescCount();
    if (!$("fName").value.trim() && j.title) {
      const rawTitle = String(j.title).trim();
      const cleaned = rawTitle
        .replace(/\s*[-_|—–]\s*(?:官网|官方网站|官方平台|首页|官网首页|最新版).*$/i, "")
        .replace(/\s*[-_|—–]\s*[^-_|—–]{2,10}$/, "")
        .trim();
      $("fName").value = cleaned || rawTitle;
    }
    $("msg").textContent = "已生成（" + (j.source === "ai" ? "AI 润色" : "网页描述") + "），可再改。";
    toast("简介已生成");
  } catch (e) {
    $("msg").textContent = "生成失败：" + e.message;
    toast("生成失败：" + e.message, true);
  }
  $("aiDescBtn").disabled = false;
};

// --- P13: 批量补简介 (中止与连续3次失败自动停) ---
let bulkAiAborted = false;
$("bulkAiStopBtn").onclick = () => {
  bulkAiAborted = true;
  $("bulkAiStopBtn").disabled = true;
  $("toolMsg").textContent = "正在中止批量补简介…";
};

async function runBulkAiDesc(todo) {
  if (!todo.length) {
    $("toolMsg").textContent = "没有缺简介的书签。";
    toast("没有缺简介的书签");
    return;
  }
  bulkAiAborted = false;
  $("bulkAiBtn").disabled = true;
  $("bulkAiStopBtn").disabled = false;
  $("bulkAiStopBtn").style.display = "inline-block";
  let done = 0;
  let consecutiveFail = 0;
  let lastFailReason = "";

  for (let i = 0; i < todo.length; i++) {
    if (bulkAiAborted) break;
    const s = todo[i];
    $("toolMsg").textContent = "批量补简介中 (" + (i + 1) + "/" + todo.length + ")：" + s.name;
    try {
      const j = await api("/api/admin/ai-desc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: s.url }),
      });
      await api("/api/admin/sites/" + s.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: s.name,
          url: s.url,
          desc: j.desc,
          category: s.category,
          icon: s.icon || "",
          pinned: !!s.pinned,
          private: !!s.is_private,
          sort_order: s.sort_order,
        }),
      });
      s.desc = j.desc;
      consecutiveFail = 0;
      done++;
      const row = document.querySelector('tr[data-site-id="' + s.id + '"]');
      if (row) {
        let descEl = row.querySelector(".site-desc");
        if (!descEl) {
          descEl = document.createElement("div");
          descEl.className = "site-desc";
          const mainCol = row.querySelector(".site-main-col");
          const urlEl = row.querySelector(".site-url");
          if (mainCol && urlEl) mainCol.insertBefore(descEl, urlEl);
          else if (mainCol) mainCol.appendChild(descEl);
        }
        if (descEl) descEl.textContent = j.desc;
      }
    } catch (e) {
      consecutiveFail++;
      lastFailReason = e.message || "网络或接口异常";
      if (consecutiveFail >= 3) {
        $("toolMsg").textContent =
          "连续 3 次失败已自动停止（原因：" + lastFailReason + "），已完成 " + done + " 条。";
        toast("连续 3 次失败已停止：" + lastFailReason, true);
        break;
      }
    }
  }
  $("bulkAiBtn").disabled = false;
  $("bulkAiStopBtn").style.display = "none";
  if (bulkAiAborted) {
    const resMsg = "批量补简介已中止，已完成 " + done + " 条。";
    $("toolMsg").textContent = resMsg;
    toast(resMsg);
  } else if (consecutiveFail < 3) {
    const resMsg = "批量完成：成功补上 " + done + " 条。";
    $("toolMsg").textContent = resMsg;
    toast(resMsg);
  }
}

$("bulkAiBtn").onclick = () => {
  const todo = data.sites.filter((s) => !s.desc);
  runBulkAiDesc(todo);
};

// --- floccus 双向书签同步 (先预演后执行) ---
if ($("floccusSyncBtn")) {
  $("floccusSyncBtn").onclick = async () => {
    $("toolMsg").textContent = "正在拉取 Floccus 书签并预演比对…";
    toast("正在拉取 Floccus 书签预演…");
    try {
      const preview = await api("/api/admin/sync-floccus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry: true }),
      });

      const choice = await showFloccusSyncModal(preview);
      if (!choice.confirmed) {
        $("toolMsg").textContent = "已取消同步";
        toast("已取消同步");
        return;
      }

      $("toolMsg").textContent = "正在执行双向同步…";
      toast("正在执行双向同步…");
      const j = await api("/api/admin/sync-floccus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry: false, forceDelete: choice.forceDelete }),
      });

      const totalDels = (j.deletedFromSite || 0) + (j.removedFromBrowser || 0);
      let msg = `Floccus 同步完成：站内新增 ${j.addedToSite} 条，写进浏览器 ${j.pushedToBrowser} 条，删除 ${totalDels} 条。`;
      if (j.deleteSuspended) msg += "（待删总数超限已触发批量熔断保护，未删除）";
      if (j.writebackDeferred) msg += `（写回暂缓：${j.writebackNote || "WebDAV 文件并发冲突"}）`;
      $("toolMsg").textContent = msg;
      toast(msg);
      await load();
    } catch (e) {
      $("toolMsg").textContent = "同步失败：" + e.message;
      toast("同步失败：" + e.message, true);
    }
  };
}

// --- WebDAV 备份与恢复 (P17 站内确认) ---
$("davBackupBtn").onclick = async () => {
  $("toolMsg").textContent = "正在备份…";
  try {
    const j = await api("/api/admin/backup", { method: "POST" });
    const slotTip = j.slot ? `（主备份及历史槽位 ${j.slot} 同步归档）` : "";
    const resMsg = "已备份到 WebDAV：" + j.sites + " 条书签、" + j.categories + " 个分类" + slotTip + "。";
    $("toolMsg").textContent = resMsg;
    toast("WebDAV 备份成功" + (j.slot ? `（槽位 ${j.slot} 已同步）` : ""));
  } catch (e) {
    $("toolMsg").textContent = "备份失败：" + e.message;
    toast("备份失败：" + e.message, true);
  }
};

$("davRestoreBtn").onclick = async () => {
  const ok = await showConfirm(
    "从 WebDAV 恢复？只会补进库里没有的书签，不会删现有数据。\n（默认读取主备份镜像；若主文件损坏将自动从最新历史快照自愈恢复）",
    "从 WebDAV 恢复"
  );
  if (!ok) return;
  $("toolMsg").textContent = "正在恢复…";
  try {
    const j = await api("/api/admin/restore", { method: "POST" });
    let resMsg = "恢复完成：新增 " + j.added + " 条，跳过已有 " + j.skipped + " 条。";
    if (j.warning) resMsg += " " + j.warning;
    $("toolMsg").textContent = resMsg;
    toast(j.fallback ? j.warning : "WebDAV 恢复完成");
    load();
  } catch (e) {
    $("toolMsg").textContent = "恢复失败：" + e.message;
    toast("恢复失败：" + e.message, true);
  }
};

// --- 导入 / 导出 (HTML / JSON) ---
$("importBtn").onclick = () => {
  const f = $("importFile").files[0];
  if (!f) {
    toast("先选一个浏览器导出的书签 HTML 或本站备份 JSON 文件", true);
    return;
  }
  if (f.size > 5 * 1024 * 1024) {
    toast("文件过大（超过 5MB），请检查是否选错了文件", true);
    return;
  }
  const isJson = f.name.toLowerCase().endsWith(".json") || f.type === "application/json";
  const reader = new FileReader();

  if (isJson) {
    reader.onload = async () => {
      let payload;
      try {
        payload = JSON.parse(reader.result);
      } catch (err) {
        toast("JSON 文件格式损坏，无法解析：" + err.message, true);
        return;
      }
      if (!payload || !Array.isArray(payload.sites)) {
        toast("JSON 备份文件格式不正确，缺少 sites 数组", true);
        return;
      }

      // 导入预览比对
      const summary = previewBookmarkImport(payload.sites, payload.categories || []);
      const confirmed = await showImportPreviewModal(summary);
      if (!confirmed) {
        toast("已取消导入");
        $("importFile").value = "";
        return;
      }

      $("msg").textContent = "正在恢复 JSON 备份…";
      toast("正在恢复 JSON 备份…");
      try {
        const j = await api("/api/admin/import-json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const resMsg = "JSON 恢复完成：新增 " + j.added + " 条，跳过已有 " + j.skipped + " 条";
        $("msg").textContent = resMsg;
        toast(resMsg);
        load();
      } catch (e) {
        $("msg").textContent = "恢复出错：" + e.message;
        toast("恢复出错：" + e.message, true);
      } finally {
        $("importFile").value = "";
      }
    };
    reader.readAsText(f);
  } else {
    reader.onload = async () => {
      const doc = new DOMParser().parseFromString(reader.result, "text/html");
      const items = [];
      const visited = new Set();
      const walk = (dl, catPath) => {
        [...dl.children].forEach((dt) => {
          if (visited.has(dt)) return;
          visited.add(dt);

          const h3 = dt.querySelector(":scope > h3");
          const a = dt.querySelector(":scope > a");
          let sub = dt.querySelector(":scope > dl");
          if (!sub && dt.nextElementSibling && dt.nextElementSibling.tagName === "DL") {
            sub = dt.nextElementSibling;
            visited.add(sub);
          }
          if (h3 && sub) {
            walk(sub, [...catPath, h3.textContent.trim()]);
          } else if (a && /^https?:/i.test(a.getAttribute("href") || "")) {
            const cat = catPath.length ? catPath[catPath.length - 1] : "导入书签";
            const parent = catPath.length > 1 ? catPath[catPath.length - 2] : "";
            let dd = dt.querySelector(":scope > dd");
            if (!dd && dt.nextElementSibling && dt.nextElementSibling.tagName === "DD") {
              dd = dt.nextElementSibling;
              visited.add(dd);
            }
            const desc = dd ? dd.textContent.trim().slice(0, 40) : "";
            items.push({
              name: a.textContent.trim(),
              url: a.getAttribute("href"),
              desc,
              category: cat,
              parent_category: parent,
            });
          }
        });
      };
      const root = doc.querySelector("dl");
      if (root) walk(root, []);

      if (!items.length) {
        toast("未解析到任何有效书签条目", true);
        $("importFile").value = "";
        return;
      }

      // 导入预览比对
      const summary = previewBookmarkImport(items);
      const confirmed = await showImportPreviewModal(summary);
      if (!confirmed) {
        toast("已取消导入");
        $("importFile").value = "";
        return;
      }

      try {
        const j = await api("/api/admin/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sites: items }),
        });
        const resMsg = "导入完成：新增 " + j.added + " 条，跳过重复 " + j.skipped + " 条";
        $("msg").textContent = resMsg;
        toast(resMsg);
        load();
      } catch (e) {
        $("msg").textContent = "导入出错：" + e.message;
        toast("导入出错：" + e.message, true);
      } finally {
        $("importFile").value = "";
      }
    };
    reader.readAsText(f);
  }
};

// --- WebDAV 与 AI 设置中心 ---
const AI_PRESETS = {
  cloudflare: { base_url: "", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
  openai: { base_url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  google: { base_url: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "gemini-2.5-flash" },
  deepseek: { base_url: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  custom: { base_url: "", model: "" },
};

function updateBadge(el, source) {
  if (!el) return;
  el.className = "badge " + source;
  if (source === "env") el.textContent = "环境变量（生效中）";
  else if (source === "kv") el.textContent = "后台已配置（生效中）";
  else el.textContent = "未配置";
}

function renderAiFields(provider, applyDefaults = false) {
  const isCf = provider === "cloudflare";
  $("aiCfWrap").style.display = isCf ? "block" : "none";
  $("aiOpenAiWrap").style.display = isCf ? "none" : "block";
  $("aiKeyLabel").textContent = isCf
    ? "Workers AI 令牌 (API Token，留空保持原值)"
    : "API 密钥 (API Key，留空保持原值)";
  if (applyDefaults && AI_PRESETS[provider]) {
    $("aiBaseUrl").value = AI_PRESETS[provider].base_url;
    $("aiModel").value = AI_PRESETS[provider].model;
  }
}

$("aiProvider").onchange = () => {
  renderAiFields($("aiProvider").value, true);
};

$("wdPresetJianGuo").onclick = () => {
  $("wdUrl").value = "https://dav.jianguoyun.com/dav/";
  $("wdTip").textContent =
    "已填坚果云地址。密码请填坚果云「账户信息 - 安全设置」中生成的应用密码，不是登录密码。备份将写入对应目录下的 rixin-jilan-backup.json。";
};
$("wdPresetNextcloud").onclick = () => {
  $("wdUrl").value = "https://你的域名/remote.php/dav/files/用户名/";
  $("wdTip").textContent =
    "已填 Nextcloud 模板，请将「你的域名」和「用户名」替换为实际值。备份将写入对应目录下的 rixin-jilan-backup.json。";
};
$("wdPresetCustom").onclick = () => {
  $("wdUrl").value = "";
  $("wdTip").textContent = "自定义 WebDAV 服务，请输入 WebDAV 目录或 backup.json 文件完整地址。";
};

async function loadConfig() {
  try {
    const cfg = await api("/api/admin/config");
    updateBadge($("wdBadge"), cfg.source.webdav);
    $("wdUrl").value = (cfg.webdav && cfg.webdav.url) || "";
    $("wdUser").value = (cfg.webdav && cfg.webdav.user) || "";
    $("wdPass").value = "";
    if (cfg.source.webdav === "env") {
      $("wdPass").placeholder = "环境变量生效中（" + cfg.webdav.pass_mask + "）；如需存入后台请重新输入";
      $("wdTip").innerHTML =
        '<b style="color:var(--ochre)">当前环境变量在管事</b>（WEBDAV_URL/USER/PASS 已配齐并优先生效）。如需存入后台，请重新输入密码后再保存。';
    } else {
      $("wdPass").placeholder =
        cfg.webdav && cfg.webdav.pass_set ? "已设置 (" + cfg.webdav.pass_mask + ")，留空保持不变" : "未设置";
      $("wdTip").textContent =
        "提示：坚果云密码请填「账户信息 - 安全设置」中生成的应用密码，非登录密码；备份文件将写入对应目录下的 rixin-jilan-backup.json。";
    }

    updateBadge($("aiBadge"), cfg.source.ai);
    const p = (cfg.ai && cfg.ai.provider) || "cloudflare";
    $("aiProvider").value = p;
    $("aiAccount").value = (cfg.ai && cfg.ai.account_id) || "";
    $("aiBaseUrl").value = (cfg.ai && cfg.ai.base_url) || "";
    $("aiModel").value = (cfg.ai && cfg.ai.model) || "";
    $("aiKey").value = "";
    renderAiFields(p, false);
    if (cfg.source.ai === "env") {
      $("aiKey").placeholder = "环境变量生效中（" + cfg.ai.api_key_mask + "）；如需存入后台请重新输入";
      $("aiTip").innerHTML =
        '<b style="color:var(--ochre)">当前环境变量在管事</b>（CF_ACCOUNT_ID 与 CF_AI_TOKEN 已配齐并优先生效）。如需存入后台，请重新输入密钥后再保存。';
    } else {
      $("aiKey").placeholder =
        cfg.ai && cfg.ai.api_key_set ? "已设置 (" + cfg.ai.api_key_mask + ")，留空保持不变" : "未设置";
      $("aiTip").textContent =
        "提示：Google Gemini 亦原生支持 OpenAI 兼容端点；测生成将使用斗鱼直播作为样本网站跑一次实际生成。";
    }

    if ($("floccusPath")) {
      $("floccusPath").value = (cfg.floccus && cfg.floccus.xbel_path) || "bookmarks.xbel";
    }
  } catch (e) {
    console.warn("加载配置失败：", e);
  }
}

$("wdSaveBtn").onclick = async () => {
  $("wdMsg").textContent = "保存中…";
  const url = $("wdUrl").value.trim();
  const user = $("wdUser").value.trim();
  const pass = $("wdPass").value.trim();
  if (url && !/^https?:\/\//i.test(url)) {
    $("wdMsg").textContent = "网址必须以 http:// 或 https:// 开头";
    toast("网址必须以 http:// 或 https:// 开头", true);
    return;
  }
  try {
    const res = await api("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webdav: { url, user, pass } }),
    });
    if (res.error) {
      $("wdMsg").textContent = res.error;
      toast(res.error, true);
    } else {
      $("wdMsg").textContent = "WebDAV 配置已保存";
      toast("WebDAV 配置已保存");
    }
    await loadConfig();
  } catch (e) {
    $("wdMsg").textContent = "保存失败：" + e.message;
    toast("保存失败：" + e.message, true);
  }
};

if ($("floccusSaveBtn")) {
  $("floccusSaveBtn").onclick = async () => {
    const p = $("floccusPath").value.trim();
    if (p && (p.includes("://") || p.startsWith("//") || p.includes(".."))) {
      $("floccusMsg").textContent = "路径必须为相对路径，禁止跨域或跨根访问（防 SSRF）";
      toast("路径必须为相对路径，禁止跨域或跨根访问", true);
      return;
    }
    $("floccusMsg").textContent = "保存中…";
    try {
      const res = await api("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floccus: { xbel_path: p } }),
      });
      if (res.error) {
        $("floccusMsg").textContent = res.error;
        toast(res.error, true);
      } else {
        $("floccusMsg").textContent = "Floccus 路径已保存";
        toast("Floccus 路径已保存");
      }
      await loadConfig();
    } catch (e) {
      $("floccusMsg").textContent = "保存失败：" + e.message;
      toast("保存失败：" + e.message, true);
    }
  };
}

// P17: 清除 WebDAV 配置改用站内弹窗
$("wdClearBtn").onclick = async () => {
  const ok = await showConfirm(
    "确定要清除后台保存的 WebDAV 配置吗？（若配置了环境变量则环境变量继续生效）",
    "清除 WebDAV 配置"
  );
  if (!ok) return;
  $("wdMsg").textContent = "清除中…";
  try {
    await api("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webdav: { clear: true } }),
    });
    $("wdMsg").textContent = "已清除 WebDAV 后台配置";
    toast("已清除 WebDAV 配置");
    await loadConfig();
  } catch (e) {
    $("wdMsg").textContent = "清除失败：" + e.message;
    toast("清除失败：" + e.message, true);
  }
};

$("wdTestBtn").onclick = async () => {
  $("wdMsg").textContent = "正在连接测试…";
  $("wdTestBtn").disabled = true;
  const url = $("wdUrl").value.trim();
  const user = $("wdUser").value.trim();
  const pass = $("wdPass").value.trim();
  try {
    const res = await api("/api/admin/config/test-webdav", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, user, pass }),
    });
    $("wdMsg").textContent = "测试通过：" + (res.message || "连接正常");
    toast("WebDAV 测试连接成功");
  } catch (e) {
    $("wdMsg").textContent = "测试未通过：" + e.message;
    toast("WebDAV 测试失败：" + e.message, true);
  } finally {
    $("wdTestBtn").disabled = false;
  }
};

$("aiSaveBtn").onclick = async () => {
  $("aiMsg").textContent = "保存中…";
  const provider = $("aiProvider").value;
  const account_id = $("aiAccount").value.trim();
  const api_key = $("aiKey").value.trim();
  const base_url = $("aiBaseUrl").value.trim();
  const model = $("aiModel").value.trim();
  try {
    const res = await api("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai: { provider, account_id, api_key, base_url, model } }),
    });
    if (res.error) {
      $("aiMsg").textContent = res.error;
      toast(res.error, true);
    } else {
      $("aiMsg").textContent = "AI 配置已保存";
      toast("AI 配置已保存");
    }
    await loadConfig();
  } catch (e) {
    $("aiMsg").textContent = "保存失败：" + e.message;
    toast("保存失败：" + e.message, true);
  }
};

// P17: 清除 AI 配置改用站内弹窗
$("aiClearBtn").onclick = async () => {
  const ok = await showConfirm(
    "确定要清除后台保存的 AI 配置吗？（若配置了环境变量则环境变量继续生效）",
    "清除 AI 配置"
  );
  if (!ok) return;
  $("aiMsg").textContent = "清除中…";
  try {
    await api("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai: { clear: true } }),
    });
    $("aiMsg").textContent = "已清除 AI 后台配置";
    toast("已清除 AI 配置");
    $("aiTestResult").style.display = "none";
    await loadConfig();
  } catch (e) {
    $("aiMsg").textContent = "清除失败：" + e.message;
    toast("清除失败：" + e.message, true);
  }
};

$("aiTestBtn").onclick = async () => {
  $("aiMsg").textContent = "正在对测试样本（斗鱼）跑一次生成…";
  $("aiTestBtn").disabled = true;
  $("aiTestResult").style.display = "none";
  const provider = $("aiProvider").value;
  const account_id = $("aiAccount").value.trim();
  const api_key = $("aiKey").value.trim();
  const base_url = $("aiBaseUrl").value.trim();
  const model = $("aiModel").value.trim();
  try {
    const res = await api("/api/admin/config/test-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, account_id, api_key, base_url, model }),
    });
    $("aiMsg").textContent = "生成测试成功！效果如下：";
    $("aiTestResult").style.display = "block";
    $("aiTestResult").innerHTML =
      "<div><b>测试样本：</b>" +
      esc(res.sample ? res.sample.title : "斗鱼") +
      "</div>" +
      '<div style="margin-top:6px"><b>生成简介：</b><span style="color:var(--ochre);font-weight:700">' +
      esc(res.desc) +
      "</span></div>";
    toast("AI 简介测试生成成功");
  } catch (e) {
    $("aiMsg").textContent = "测试失败：" + e.message;
    toast("AI 测试失败：" + e.message, true);
  } finally {
    $("aiTestBtn").disabled = false;
  }
};

// --- 主题切换 ---
function updateThemeUI() {
  const isDark = document.documentElement.classList.contains("dark-theme");
  const btn = $("themeBtn");
  if (btn) btn.textContent = isDark ? "☀️ 白天" : "🌙 夜间";
}
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle("dark-theme");
  if (document.body) document.body.classList.toggle("dark-theme", isDark);
  localStorage.setItem("myNavTheme", isDark ? "dark" : "light");
  updateThemeUI();
  toast(isDark ? "已切换至夜间模式（深夜墨香）" : "已切换至白天模式（澄怀素笺）");
}

// --- 初始化绑定 ---
function initAdmin() {
  if ($("themeBtn")) $("themeBtn").onclick = toggleTheme;
  updateThemeUI();

  // P15: 药丸 Tab 导航
  document.querySelectorAll(".tab-pill").forEach((btn) => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });
  switchTab("tab-sites"); // 默认展示「全部书签」

  $("siteSearch").addEventListener("input", () => renderSites());
  $("fDesc").addEventListener("input", updateDescCount);

  // 18 网址实时查重
  $("fUrl").addEventListener("blur", checkUrlDup);
  $("fUrl").addEventListener("input", clearUrlDupWarn);

  // 19 分类折叠：全部折叠 / 全部展开
  if ($("foldAllBtn")) {
    $("foldAllBtn").onclick = () => {
      data.categories.forEach((c) => collapsedCats.add(c.name));
      data.sites.forEach((s) => {
        if (s.category) collapsedCats.add(s.category);
      });
      renderSites();
    };
  }
  if ($("unfoldAllBtn")) {
    $("unfoldAllBtn").onclick = () => {
      collapsedCats.clear();
      renderSites();
    };
  }

  load();
  loadConfig();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdmin);
} else {
  initAdmin();
}

// ---------- 一键回顶（悬浮方钮，滚动过一屏才出现；批量栏在场时自动抬高避让） ----------
(function initBackTop() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "backtop-btn";
  btn.title = "回到顶部";
  btn.setAttribute("aria-label", "回到顶部");
  btn.textContent = "↑";
  document.body.appendChild(btn);
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  let ticking = false;
  const evaluate = () => {
    ticking = false;
    const show = window.scrollY > 600;
    btn.classList.toggle("show", show);
    if (show) {
      const bar = document.getElementById("bulkBar");
      const barH = bar && bar.offsetParent !== null ? bar.offsetHeight : 0;
      btn.style.bottom = barH ? barH + 32 + "px" : "20px";
    }
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(evaluate); }
  }, { passive: true });
  evaluate();
})();
