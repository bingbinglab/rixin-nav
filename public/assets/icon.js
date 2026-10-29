// 日新辑览 · 共享图标解析与加载降级 (icon.js)
// 统一前后台图标解析、绝对路径处理、远程反代与首字兜底

(function (global) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const LOCAL_ICON_DOMAINS = new Set([
    "12306.cn", "36kr.com", "bilibili.com", "chatgpt.com", "claude.ai",
    "convertio.co", "deepl.com", "deepseek.com", "developer.mozilla.org", "dianping.com",
    "dingtalk.com", "docs.qq.com", "douban.com", "doubao.com", "dribbble.com",
    "feishu.cn", "figma.com", "github.com", "hellofont.cn", "huxiu.com",
    "icourse163.org", "ithome.com", "jd.com", "kimi.com", "linux.do",
    "music.163.com", "notion.so", "pomofocus.io", "runoob.com", "smallpdf.com",
    "smzdm.com", "sspai.com", "stackoverflow.com", "study.163.com", "taobao.com",
    "thepaper.cn", "tinypng.com", "unsplash.com", "uutool.cn", "v.qq.com",
    "v2ex.com", "vercel.com", "weibo.com", "xiaohongshu.com", "xuetangx.com",
    "youtube.com", "zcool.com.cn", "zhihu.com"
  ]);

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
    const remote = host ? "/api/icon?domain=" + encodeURIComponent(host) : "";

    let src = "";
    let dataRemote = "";

    if (site.icon) {
      src = "/icons/" + encodeURI(site.icon) + "?v=20261030";
      dataRemote = remote;
    } else if (host && LOCAL_ICON_DOMAINS.has(host)) {
      src = "/icons/" + host + ".png?v=20261030";
      dataRemote = remote;
    } else if (remote) {
      src = remote;
      dataRemote = "";
    }

    if (!src) {
      return `<span class="icon-box is-fallback"><span class="icon-fallback">${safeFirst}</span></span>`;
    }

    const dataRemoteAttr = dataRemote ? ` data-remote="${esc(dataRemote)}"` : ` data-r="1"`;
    return `<span class="icon-box"><img src="${esc(src)}" alt="" loading="lazy"${dataRemoteAttr} data-fb="${safeFirst}" onerror="iconErr(this)"></span>`;
  }

  global.hostOf = hostOf;
  global.iconErr = iconErr;
  global.iconHTML = iconHTML;
  global.LOCAL_ICON_DOMAINS = LOCAL_ICON_DOMAINS;
})(typeof window !== "undefined" ? window : globalThis);
