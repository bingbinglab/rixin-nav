// GET /api/icon?domain=example.com — 站点图标兜底代理（公开、无需登录）。
// 背景：前端原本直连谷歌 favicon 服务取兜底图标，国内网络不通；改为借本站域名中转：
// 服务端从谷歌取图、边缘缓存 7 天后回给浏览器。再失败前端会自动落到纸墨首字牌。
// 只接受裸域名参数，避免被当成开放代理滥用。
export async function onRequestGet(context) {
  const { request } = context;
  const domain = new URL(request.url).searchParams.get("domain") || "";
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) {
    return new Response("bad domain", { status: 400 });
  }
  let res;
  try {
    res = await fetch(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
      { cf: { cacheTtl: 604800, cacheEverything: true } }
    );
  } catch {
    return new Response("upstream unreachable", { status: 502 });
  }
  if (!res.ok) return new Response("not found", { status: 404 });
  // 内容校验：谷歌对无图标域名可能回一张通用地球占位图（HTTP 200），不能当真图标：
  // 命中已知占位图指纹时按 404 处理，让前端落到纸墨首字牌（指纹为该占位图字节的 SHA-256）。
  const buf = await res.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const KNOWN_PLACEHOLDERS = new Set([
    "5e91e47f4344fe1914cbbf8975775f14b2811fefd8f1572adc1e1c075b49c52c",
  ]);
  if (KNOWN_PLACEHOLDERS.has(hex)) return new Response("not found", { status: 404 });
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "public, max-age=604800, immutable");
  return new Response(buf, { status: 200, headers });
}
