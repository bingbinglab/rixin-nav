// POST /api/admin/restore — 从 WebDAV 拉备份 JSON，按网址去重合并进库（只补缺失，不删现有数据）。需会话或机器令牌。
// 优先读环境变量，兜底读后台 KV 配置（functions/_lib/config.js）。
import { json, requireAuth, restoreBookmarkData, resolveBackupUrls, toBase64 } from "../../_lib/util.js";
import { getWebdavConfig } from "../../_lib/config.js";

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { request, env } = context;

  const cfg = await getWebdavConfig(env);
  if (!cfg) {
    return json({ error: "未配置 WebDAV（请先在后台设置或环境变量中配置 WebDAV 地址、账号与应用密码）" }, 503);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "请求体不是有效的 JSON 数据" }, 400);
  }
  const requestedSlot = body.slot || (body.source && /^slot([1-4])$/i.test(body.source) ? RegExp.$1 : null);
  const { mainUrl, allSlotUrls } = resolveBackupUrls(cfg.url, requestedSlot);
  const auth = "Basic " + toBase64(`${cfg.user}:${cfg.pass}`);

  // 辅助拉取与解析函数
  const fetchBackup = async (url) => {
    try {
      const r = await fetch(url, { headers: { "Authorization": auth } });
      if (!r.ok) return null;
      const data = await r.json().catch(() => null);
      if (data && Array.isArray(data.sites)) return data;
      return null;
    } catch {
      return null;
    }
  };

  let targetData = null;
  let restoreSource = "main";
  let fallbackUsed = false;

  if (requestedSlot) {
    // 站长显式指定了恢复某个槽位
    const slotObj = allSlotUrls.find((s) => s.slot === Number(requestedSlot));
    if (slotObj) {
      targetData = await fetchBackup(slotObj.url);
      restoreSource = `slot${requestedSlot}`;
    }
  } else {
    // 默认恢复：首选读取主文件
    targetData = await fetchBackup(mainUrl);
    if (!targetData) {
      // 主文件缺失或损坏：探查 4 个槽位快照并按 exported_at 取最新
      const probeList = await Promise.all(
        allSlotUrls.map(async (item) => {
          const d = await fetchBackup(item.url);
          return d ? { slot: item.slot, data: d, at: d.exported_at || "" } : null;
        })
      );
      const validSlots = probeList.filter(Boolean);
      if (validSlots.length > 0) {
        // 按时间从新到旧排序
        validSlots.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
        targetData = validSlots[0].data;
        restoreSource = `slot${validSlots[0].slot}`;
        fallbackUsed = true;
      }
    }
  }

  if (!targetData) {
    return json({
      error: "WebDAV 上未找到可用的备份文件（主文件与 4 个历史槽位均不存在或内容损坏）",
    }, 404);
  }

  try {
    const res = await restoreBookmarkData(env.NAV_DB, targetData);
    return json({
      ok: true,
      added: res.added,
      skipped: res.skipped,
      source: restoreSource,
      fallback: fallbackUsed,
      warning: fallbackUsed ? `主备份缺失或已损坏，已自动从最新历史快照 (${restoreSource}) 恢复` : null,
    });
  } catch (err) {
    return json({ error: "恢复失败：" + (err.message || "数据写入异常") }, 500);
  }
}

