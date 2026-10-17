// /admin/logout — 注销会话（GET/POST 都可）。
import { destroySession } from "../_lib/util.js";

async function handle(context) {
  const cookie = await destroySession(context.request, context.env);
  const isJson = (context.request.headers.get("Accept") || "").includes("application/json") ||
                 (context.request.headers.get("Content-Type") || "").includes("application/json");
  if (isJson) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": cookie },
    });
  }
  return new Response(null, { status: 302, headers: { Location: "/admin", "Set-Cookie": cookie } });
}
export const onRequestGet = handle;
export const onRequestPost = handle;
