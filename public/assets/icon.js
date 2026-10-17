// 日新辑览 · 共享图标解析与加载降级 (icon.js)
// 统一前后台图标解析、绝对路径处理、远程反代与首字兜底

(function (global) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function iconErr(img) {
    if (!img.dataset.r && img.dataset.remote) {
      img.dataset.r = "1";
      img.src = img.dataset.remote;
    } else {
      const p = img.parentNode;
      if (p) {
        p.classList.add("is-fallback");
        p.innerHTML = `<span class="icon-fallback">${img.dataset.fb || "站"}</span>`;
      }
    }
  }

  function iconHTML(site) {
    const host = hostOf(site.url);
    const first = (site.name || "站").trim().charAt(0) || "站";
    const safeFirst = esc(first.replace(/['"\\]/g, ""));
    const local = site.icon ? "/icons/" + encodeURI(site.icon) : host ? "/icons/" + host + ".png" : "";
    const remote = host ? "/api/icon?domain=" + encodeURIComponent(host) : "";
    if (!local && !remote) {
      return `<span class="icon-box is-fallback"><span class="icon-fallback">${safeFirst}</span></span>`;
    }
    return `<span class="icon-box"><img src="${esc(local)}" alt="" loading="lazy" data-remote="${esc(remote)}" data-fb="${safeFirst}" onerror="iconErr(this)"></span>`;
  }

  global.hostOf = hostOf;
  global.iconErr = iconErr;
  global.iconHTML = iconHTML;
})(typeof window !== "undefined" ? window : globalThis);
