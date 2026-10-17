// workers/floccus-sync/index.js
// 日新辑览 · floccus 书签双向定时同步独立调度 Worker
// 由 Cloudflare Cron Triggers 每 12 小时定时触发，调用导航站主同步接口并实现 WxPusher 消息推送。

async function sendWxPusher({ appToken, uids, content, summary }) {
  if (!appToken || !Array.isArray(uids) || !uids.length || !content) return;
  try {
    await fetch("https://wxpusher.zjiecode.com/api/send/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appToken,
        content,
        summary: summary || content.slice(0, 30),
        contentType: 1, // 纯文本排版
        uids,
      }),
    });
  } catch (err) {
    console.warn("WxPusher 推送失败（已忽略，不影响主流程）：", err);
  }
}

async function runSync(env) {
  const syncUrl = env.NAV_SYNC_URL;
  const token = env.ADMIN_API_TOKEN;
  const appToken = env.WXPUSHER_APP_TOKEN;
  const rawUid = env.WXPUSHER_UID;
  const uids = rawUid ? [rawUid] : [];

  if (!syncUrl || !token) {
    const errMsg = "rixin-floccus-sync 未配置 NAV_SYNC_URL 或 ADMIN_API_TOKEN，已跳过本次同步";
    console.error(errMsg);
    if (appToken && uids.length) {
      await sendWxPusher({ appToken, uids, content: "❌ " + errMsg, summary: "Floccus 配置缺失" });
    }
    return { ok: false, error: errMsg };
  }

  try {
    const res = await fetch(syncUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dry: false }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      const errDetail = data.error || `HTTP ${res.status}`;
      const msg = `❌ Floccus 自动同步失败：${errDetail}`;
      console.error(msg);
      await sendWxPusher({ appToken, uids, content: msg, summary: "Floccus 同步异常" });
      return { ok: false, error: errDetail };
    }

    const added = Number(data.addedToSite) || 0;
    const pushed = Number(data.pushedToBrowser) || 0;
    const deletedSite = Number(data.deletedFromSite) || 0;
    const removedBrowser = Number(data.removedFromBrowser) || 0;
    const totalDeleted = deletedSite + removedBrowser;

    // A. 若触发批量熔断保护
    if (data.deleteSuspended) {
      let alertContent = `⚠️ Floccus 自动同步告警：待删总数超限，已触发批量熔断保护！\n已暂停删除操作（双向新增已完成），请前往后台确认。\n`;
      const delList = [];
      if (Array.isArray(data.deletedSites)) {
        for (const s of data.deletedSites) delList.push(`[站内删] ${s.name || s.url}`);
      }
      if (Array.isArray(data.removedSites)) {
        for (const u of data.removedSites) delList.push(`[浏览器删] ${u}`);
      }
      if (delList.length) {
        alertContent += `待删清单（前 20 条）：\n` + delList.slice(0, 20).join("\n");
      }
      await sendWxPusher({ appToken, uids, content: alertContent, summary: "Floccus 批量删除熔断告警" });
      return { ok: true, data };
    }

    // B. 若有任何有效增删变动，组织推送小结
    const hasChanges = added > 0 || pushed > 0 || totalDeleted > 0;
    if (hasChanges) {
      let content = `🌾 Floccus 同步：站内新增 ${added}、进浏览器 ${pushed}、删除 ${totalDeleted}（站内 ${deletedSite}／浏览器 ${removedBrowser}）\n`;

      if (Array.isArray(data.newSites) && data.newSites.length > 0) {
        const names = data.newSites.slice(0, 10).map((s) => s.name || s.url);
        content += `\n📥 站内新增（前 ${names.length} 条）：\n- ` + names.join("\n- ") + "\n";
      }

      if (Array.isArray(data.pushedSites) && data.pushedSites.length > 0) {
        const names = data.pushedSites.slice(0, 10).map((s) => s.name || s.url);
        content += `\n📤 进浏览器（前 ${names.length} 条）：\n- ` + names.join("\n- ") + "\n";
      }

      if (totalDeleted > 0) {
        const delNames = [];
        if (Array.isArray(data.deletedSites)) {
          for (const s of data.deletedSites.slice(0, 10)) delNames.push(`[站内] ${s.name || s.url}`);
        }
        if (Array.isArray(data.removedSites)) {
          for (const u of data.removedSites.slice(0, 10)) delNames.push(`[浏览器] ${u}`);
        }
        content += `\n🗑️ 删除清单（前 ${delNames.length} 条）：\n- ` + delNames.join("\n- ") + "\n";
      }

      if (data.writebackDeferred) {
        content += `\n（注：写回暂缓 - ${data.writebackNote || "检测到 WebDAV 文件并发冲突，下轮重试"}）`;
      }

      await sendWxPusher({
        appToken,
        uids,
        content,
        summary: `Floccus 新增${added}/写回${pushed}/删${totalDeleted}`,
      });
    }

    // 全零变动静默，控制台打印日志备查
    console.log(`Floccus 同步执行完毕：新增 ${added}，写回 ${pushed}，删除 ${totalDeleted}`);
    return { ok: true, data };
  } catch (err) {
    const msg = `❌ 请求导航站接口网络异常：${err.message}`;
    console.error(msg);
    await sendWxPusher({ appToken, uids, content: msg, summary: "Floccus 请求异常" });
    return { ok: false, error: err.message };
  }
}

export default {
  // Cron 触发入口
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSync(env));
  },

  // HTTP 手动调试/测试入口
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/run") {
      // 鉴权：要求 Authorization: Bearer <ADMIN_API_TOKEN>
      const expectedToken = env.ADMIN_API_TOKEN;
      const authHeader = request.headers.get("Authorization") || "";
      const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      if (!expectedToken || !provided || provided !== expectedToken) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      const res = await runSync(env);
      return new Response(JSON.stringify(res, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    return new Response(
      "rixin-floccus-sync Worker is running. Access /run to trigger a manual sync.",
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  },
};
