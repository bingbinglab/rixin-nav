// POST /api/admin/import-json — 导入/恢复本地备份 JSON 文件。需会话或机器令牌。
// 语义与 WebDAV 恢复一致：已存在的网址跳过、补齐缺失分类与书签、返回 added/skipped。
import { json, requireAuth, restoreBookmarkData } from "../../_lib/util.js";

export async function onRequestPost(context) {
  const denied = await requireAuth(context);
  if (denied) return denied;
  const { request, env } = context;

  const data = await request.json().catch(() => null);
  if (!data || typeof data !== "object") {
    return json({ error: "请求体不是有效的 JSON 数据" }, 400);
  }
  if (!Array.isArray(data.sites)) {
    return json({ error: "备份文件格式不正确：缺少 sites 数组" }, 400);
  }

  try {
    const res = await restoreBookmarkData(env.NAV_DB, data);
    return json({ ok: true, added: res.added, skipped: res.skipped });
  } catch (err) {
    return json({ error: "导入恢复失败：" + (err.message || "数据库写入异常") }, 500);
  }
}
