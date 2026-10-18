// 演示站定时重置 Worker（部署在演示站所在的 Cloudflare 账号里，与任何个人电脑无关）
// 每天两次（UTC 20:00 与 08:00，即北京时间 04:00 与 16:00）由 Cron 触发器自动运行：
// 1）清空 sites / category 两表并重灌种子数据，恢复 50 站 / 10 分类的出厂状态；
// 2）再把 KV 里的设置恢复到出厂快照（见下方 SETTINGS_KEYS / SNAPSHOT_KEY）。
// 需要给这个 Worker 绑定：D1 数据库 rixin-nav-db（绑定名 DB）、
// KV 命名空间 rixin-nav-kv（绑定名 KV）。
// 出厂快照存在 KV 的保留键 factory_settings_v1 里（设置键 -> 原始值的 JSON），
// 由运维脚本一次性写入；快照不存在时跳过设置恢复。快照本身和不属于设置中心的
// 键（如 session:*）一律不碰。
const SEED = [
    "INSERT INTO category (id, name, sort_order) VALUES (1, '人工智能', 10);",
    "INSERT INTO category (id, name, sort_order) VALUES (2, '办公协作', 20);",
    "INSERT INTO category (id, name, sort_order) VALUES (3, '资讯阅读', 30);",
    "INSERT INTO category (id, name, sort_order) VALUES (4, '社区论坛', 40);",
    "INSERT INTO category (id, name, sort_order) VALUES (5, '影音娱乐', 50);",
    "INSERT INTO category (id, name, sort_order) VALUES (6, '开发编程', 60);",
    "INSERT INTO category (id, name, sort_order) VALUES (7, '设计素材', 70);",
    "INSERT INTO category (id, name, sort_order) VALUES (8, '学习教育', 80);",
    "INSERT INTO category (id, name, sort_order) VALUES (9, '常用工具', 90);",
    "INSERT INTO category (id, name, sort_order) VALUES (10, '购物生活', 100);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('ChatGPT', 'https://chatgpt.com', 'AI 对话助手', 1, 'chatgpt.com.png', 0, 0, 10);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('Claude', 'https://claude.ai', 'AI 对话与写作', 1, 'claude.ai.png', 0, 0, 20);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('DeepSeek', 'https://www.deepseek.com', '国产大模型对话', 1, 'deepseek.com.png', 0, 0, 30);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('Kimi', 'https://www.kimi.com', '长文本 AI 助手', 1, 'kimi.com.png', 0, 0, 40);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('豆包', 'https://www.doubao.com', '字节跳动 AI 助手', 1, 'doubao.com.png', 0, 0, 50);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('飞书文档', 'https://www.feishu.cn', '在线文档与协作平台', 2, 'feishu.cn.png', 0, 0, 60);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('Notion', 'https://www.notion.so', '笔记与知识库管理', 2, 'notion.so.png', 0, 0, 70);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('腾讯文档', 'https://docs.qq.com', '在线文档协作', 2, 'docs.qq.com.png', 0, 0, 80);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('钉钉', 'https://www.dingtalk.com', '团队沟通与会议协作', 2, 'dingtalk.com.png', 0, 0, 90);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('番茄钟', 'https://pomofocus.io', '专注计时与待办管理', 2, 'pomofocus.io.png', 0, 0, 100);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('36氪', 'https://36kr.com', '科技与创投资讯', 3, '36kr.com.png', 0, 0, 110);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('IT之家', 'https://www.ithome.com', '数码科技新闻', 3, 'ithome.com.png', 0, 0, 120);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('虎嗅', 'https://www.huxiu.com', '商业深度报道', 3, 'huxiu.com.png', 0, 0, 130);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('澎湃新闻', 'https://www.thepaper.cn', '时政与社会新闻', 3, 'thepaper.cn.png', 0, 0, 140);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('少数派', 'https://sspai.com', '效率与数字生活指南', 3, 'sspai.com.png', 0, 0, 150);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('知乎', 'https://www.zhihu.com', '问答社区与深度内容', 4, 'zhihu.com.png', 0, 0, 160);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('小红书', 'https://www.xiaohongshu.com', '生活方式社区', 4, 'xiaohongshu.com.png', 0, 0, 170);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('微博', 'https://weibo.com', '社交媒体与热搜', 4, 'weibo.com.png', 0, 0, 180);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('V2EX', 'https://www.v2ex.com', '程序员创意社区', 4, 'v2ex.com.png', 0, 0, 190);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('Linux.do', 'https://linux.do', '技术与 AI 社区', 4, 'linux.do.png', 1, 0, 200);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('哔哩哔哩', 'https://www.bilibili.com', '视频弹幕网站', 5, 'bilibili.com.png', 0, 0, 210);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('YouTube', 'https://www.youtube.com', '全球视频平台', 5, 'youtube.com.png', 0, 0, 220);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('网易云音乐', 'https://music.163.com', '在线音乐与歌单', 5, 'music.163.com.png', 0, 0, 230);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('豆瓣电影', 'https://movie.douban.com', '电影评分与影评', 5, 'douban.com.png', 0, 0, 240);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('腾讯视频', 'https://v.qq.com', '影视剧集与综艺', 5, 'v.qq.com.png', 0, 0, 250);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('GitHub', 'https://github.com', '代码托管与开源社区', 6, 'github.com.png', 0, 0, 260);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('日新辑览仓库', 'https://github.com/bingbinglab/rixin-nav', '本站开源源码', 6, 'github.com.png', 1, 0, 210);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('MDN Web Docs', 'https://developer.mozilla.org', '前端开发技术文档', 6, 'developer.mozilla.org.png', 0, 0, 270);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('Stack Overflow', 'https://stackoverflow.com', '编程问答与解决方案', 6, 'stackoverflow.com.png', 0, 0, 280);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('Vercel', 'https://vercel.com', '前端部署与托管平台', 6, 'vercel.com.png', 0, 0, 290);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('菜鸟教程', 'https://www.runoob.com', '编程入门教程', 6, 'runoob.com.png', 0, 0, 300);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('Dribbble', 'https://dribbble.com', '设计灵感与作品集', 7, 'dribbble.com.png', 0, 0, 310);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('Figma', 'https://www.figma.com', '在线设计与原型协作', 7, 'figma.com.png', 0, 0, 320);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('Unsplash', 'https://unsplash.com', '免费高清照片素材', 7, 'unsplash.com.png', 0, 0, 330);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('字由', 'https://www.hellofont.cn', '中文字体与设计资源', 7, 'hellofont.cn.png', 0, 0, 340);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('站酷', 'https://www.zcool.com.cn', '设计师社区与作品', 7, 'zcool.com.cn.png', 0, 0, 350);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('MOOC中国', 'https://www.icourse163.org', '在线课程与公开课', 8, 'icourse163.org.png', 0, 0, 360);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('豆瓣读书', 'https://book.douban.com', '书评影评与阅读书单', 8, 'douban.com.png', 0, 0, 370);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('网易云课堂', 'https://study.163.com', '在线职业课程', 8, 'study.163.com.png', 0, 0, 380);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('学堂在线', 'https://www.xuetangx.com', '名校公开课平台', 8, 'xuetangx.com.png', 0, 0, 390);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('DeepL', 'https://www.deepl.com', 'AI 翻译工具', 9, 'deepl.com.png', 0, 0, 400);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('TinyPNG', 'https://tinypng.com', '在线图片压缩', 9, 'tinypng.com.png', 0, 0, 410);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('Smallpdf', 'https://smallpdf.com', 'PDF 工具箱', 9, 'smallpdf.com.png', 0, 0, 420);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('UU在线工具', 'https://uutool.cn', '在线工具合集', 9, 'uutool.cn.png', 0, 0, 430);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('Convertio', 'https://convertio.co', '文件格式转换', 9, 'convertio.co.png', 0, 0, 440);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('淘宝', 'https://www.taobao.com', '综合购物平台', 10, 'taobao.com.png', 0, 0, 450);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('京东', 'https://www.jd.com', '数码家电购物', 10, 'jd.com.png', 0, 0, 460);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('什么值得买', 'https://www.smzdm.com', '消费推荐与优惠', 10, 'smzdm.com.png', 0, 0, 470);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('大众点评', 'https://www.dianping.com', '本地生活点评', 10, 'dianping.com.png', 0, 0, 480);",
    "INSERT INTO sites (name, url, desc, category_id, icon, pinned, is_private, sort_order) VALUES ('12306', 'https://www.12306.cn', '火车票预订', 10, '12306.cn.png', 0, 0, 490);"
];

// 设置中心在 KV 里使用的键（与站点 functions/_lib/config.js 的 KV_CONFIG_KEY 对齐）
const SETTINGS_KEYS = ["app_config"];
// 出厂设置快照的保留键（值是 {设置键: 原始字符串值} 的 JSON）
const SNAPSHOT_KEY = "factory_settings_v1";

async function restoreSettings(env) {
  if (!env.KV) return;
  let snap = null;
  try {
    snap = await env.KV.get(SNAPSHOT_KEY, "json");
  } catch {
    snap = null;
  }
  if (!snap || typeof snap !== "object") return; // 无快照则跳过，只做 D1 重置
  for (const key of SETTINGS_KEYS) {
    if (typeof snap[key] === "string") {
      await env.KV.put(key, snap[key]);
    } else if (snap[key] && typeof snap[key] === "object") {
      // 快照若以对象形式存入，序列化后写回，避免误删现有设置
      await env.KV.put(key, JSON.stringify(snap[key]));
    } else {
      await env.KV.delete(key);
    }
  }
}

export default {
  async scheduled(event, env, ctx) {
    const batch = [
      env.DB.prepare("DELETE FROM sites"),
      env.DB.prepare("DELETE FROM category"),
      ...SEED.map((s) => env.DB.prepare(s)),
    ];
    await env.DB.batch(batch);
    await restoreSettings(env);
  },
  async fetch() {
    return new Response("not found", { status: 404 });
  },
};
