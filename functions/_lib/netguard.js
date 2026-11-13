// functions/_lib/netguard.js
// SSRF 字面量防护：判断主机名/IP 字面量是否属于内网、环回或保留地址。
// 只做字面判断，不发起任何网络请求——批量场景（如死链巡检）可安全复用，不增加子请求。
// ai-desc 的抓取校验在此基础上另加 DoH 解析复检（见 ai-desc.js 的 assertPublicUrl）。

export function ipv4Blocked(ip) {
  const parts = String(ip).split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

// 把 IPv6 地址解析为 8 组 16 位整数（支持 :: 压缩与末尾点分 IPv4 写法）；形状非法返回 null
export function parseIpv6Groups(ip) {
  let host = String(ip).toLowerCase().split("%")[0];
  // 末尾点分 IPv4（如 ::ffff:1.2.3.4）先换成两组十六进制
  if (host.includes(".")) {
    const idx = host.lastIndexOf(":");
    if (idx < 0) return null;
    const v4 = host.slice(idx + 1).split(".").map((x) => Number(x));
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    host = host.slice(0, idx + 1) + hi + ":" + lo;
  }
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const parsePart = (part) => {
    if (!part) return [];
    const groups = part.split(":");
    if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
    return groups.map((g) => parseInt(g, 16));
  };
  const head = parsePart(halves[0]);
  if (head === null) return null;
  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }
  const tail = parsePart(halves[1]);
  if (tail === null) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...Array(missing).fill(0), ...tail];
}

export function ipv6Blocked(ip) {
  const host = String(ip).toLowerCase();
  if (/^fe[89ab]/.test(host) || /^f[cd]/.test(host)) return true;
  const g = parseIpv6Groups(host);
  if (!g) return true; // 形状不合法的 IPv6 字面量一律拒绝
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 链路本地
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 唯一本地
  const low32 = [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join(".");
  // ::/96 兼容段（::、::1 与 ::点分形式都落在这里）：低 32 位即 IPv4 本身
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return ipv4Blocked(low32);
  }
  // ::ffff:x:x（IPv4 映射段，含 ::ffff:7f00:1 这类十六进制写法）与 ::ffff:0:x（IPv4 翻译段）：按内嵌 IPv4 判定
  if (
    g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 &&
    ((g[4] === 0 && g[5] === 0xffff) || (g[4] === 0xffff && g[5] === 0))
  ) {
    return ipv4Blocked(low32);
  }
  return false;
}

export function ipBlocked(ip) {
  return String(ip).includes(":") ? ipv6Blocked(ip) : ipv4Blocked(ip);
}

export function hostnameBlocked(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return ipBlocked(host);
  return false;
}
