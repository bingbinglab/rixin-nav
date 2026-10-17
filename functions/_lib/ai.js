// 日新辑览 · 多协议 AI 简介生成适配器
// 支持 Cloudflare Workers AI 原生协议与 OpenAI Chat Completions 兼容协议（含 Google Gemini、DeepSeek、Custom）

const DEFAULT_CF_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// 对生成的简介进行清洗与收尾（严格遵循现网 ≤14 字短语、超 20 字标点收尾规范）
export function cleanAiDesc(rawText) {
  let text = String(rawText || "")
    .trim()
    .replace(/^["'「『“]|["'」』”]$/g, "")
    .replace(/[。！？；]+$/, "")
    .trim();
  text = text.replace(/^这是一个/, "");

  // 模型不总听字数：超 20 字时优先在标点处收尾；20 字内完整短语宁可放行，不硬截出半个词
  if (text.length > 20) {
    const head = text.slice(0, 20);
    const cut = Math.max(...["，", "、", "·", "："].map((p) => head.lastIndexOf(p)));
    text = cut >= 8 ? head.slice(0, cut) : head;
  }
  return text;
}

// 统一入口：根据配置调用对应的协议生成简介文本
export async function generateDesc(aiConfig, { title = "", meta = "", url = "" } = {}) {
  if (!aiConfig || !aiConfig.provider) {
    throw new Error("AI 配置缺失");
  }

  // 严格采用现网统一短语提示词
  const prompt = `网站标题：${title}\n网站描述：${meta || "（无）"}\n网址：${url}\n请用一个简体中文短语概括这个网站是做什么的，不超过14个字。要求：短语式表达，不要写成完整句子，不要句号，不要书名号和引号，不要以网站名开头，只输出短语本身。`;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);

  try {
    if (aiConfig.provider === "cloudflare") {
      const model = aiConfig.model || DEFAULT_CF_MODEL;
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${aiConfig.account_id}/ai/run/${model}`;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${aiConfig.api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          max_tokens: 80,
        }),
        signal: ctl.signal,
      });

      if (!r.ok) {
        const errJson = await r.json().catch(() => null);
        const errMsg = (errJson && errJson.errors && errJson.errors[0] && errJson.errors[0].message) || `HTTP ${r.status}`;
        throw new Error(`Cloudflare AI 报错: ${errMsg}`);
      }

      const j = await r.json();
      const raw = (j && j.result && j.result.response) || "";
      const cleaned = cleanAiDesc(raw);
      if (!cleaned) throw new Error("Cloudflare AI 未返回有效文本");
      return cleaned;
    }

    // OpenAI 兼容协议（包含 openai, google, deepseek, custom）
    const baseUrl = String(aiConfig.base_url || "").replace(/\/+$/, "");
    if (!baseUrl) throw new Error("缺少接口基础地址 (base_url)");
    if (!aiConfig.api_key) throw new Error("缺少 API 密钥 (api_key)");
    if (!aiConfig.model) throw new Error("缺少模型名称 (model)");

    const endpoint = `${baseUrl}/chat/completions`;
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${aiConfig.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 80,
      }),
      signal: ctl.signal,
    });

    if (!r.ok) {
      const errJson = await r.json().catch(() => null);
      const errMsg = (errJson && errJson.error && (errJson.error.message || errJson.error)) || `HTTP ${r.status}`;
      throw new Error(`AI 接口报错: ${errMsg}`);
    }

    const j = await r.json();
    const raw = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
    const cleaned = cleanAiDesc(raw);
    if (!cleaned) throw new Error("AI 接口未返回有效文本");
    return cleaned;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("AI 接口请求超时（15 秒）");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
