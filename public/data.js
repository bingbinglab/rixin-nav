/**
 * 日新辑览 - 站点数据清单（合流版 v7：10 个分类 · 49 个书签，结构可扩展到 200+）
 * 每条：name 站名 / url 网址 / desc 一行简介 / category 分类 / icon 图标文件名（icons 文件夹内） / pinned 是否常驻置顶（常用常顾） / private 是否私密（默认隐藏，工具栏可切换显示）
 * 新增书签：复制一条改好即可；新增分类：把 category 写成新名字，并同步加进 NAV_CATEGORIES，侧边栏与分区会自动生成。
 */
var NAV_DATA = [
  // 人工智能
  { name: "ChatGPT", url: "https://chatgpt.com", desc: "AI 对话助手", category: "人工智能", icon: "chatgpt.com.png" },
  { name: "Claude", url: "https://claude.ai", desc: "AI 对话与写作", category: "人工智能", icon: "claude.ai.png" },
  { name: "DeepSeek", url: "https://www.deepseek.com", desc: "国产大模型对话", category: "人工智能", icon: "deepseek.com.png" },
  { name: "Kimi", url: "https://www.kimi.com", desc: "长文本 AI 助手", category: "人工智能", icon: "kimi.com.png" },
  { name: "豆包", url: "https://www.doubao.com", desc: "字节跳动 AI 助手", category: "人工智能", icon: "doubao.com.png" },

  // 办公协作
  { name: "飞书文档", url: "https://www.feishu.cn", desc: "在线文档与协作平台", category: "办公协作", icon: "feishu.cn.png", pinned: true },
  { name: "Notion", url: "https://www.notion.so", desc: "笔记与知识库管理", category: "办公协作", icon: "notion.so.png" },
  { name: "腾讯文档", url: "https://docs.qq.com", desc: "在线文档协作", category: "办公协作", icon: "docs.qq.com.png" },
  { name: "钉钉", url: "https://www.dingtalk.com", desc: "团队沟通与会议协作", category: "办公协作", icon: "dingtalk.com.png" },
  { name: "番茄钟", url: "https://pomofocus.io", desc: "专注计时与待办管理", category: "办公协作", icon: "pomofocus.io.png" },

  // 资讯阅读
  { name: "36氪", url: "https://36kr.com", desc: "科技与创投资讯", category: "资讯阅读", icon: "36kr.com.png" },
  { name: "IT之家", url: "https://www.ithome.com", desc: "数码科技新闻", category: "资讯阅读", icon: "ithome.com.png" },
  { name: "虎嗅", url: "https://www.huxiu.com", desc: "商业深度报道", category: "资讯阅读", icon: "huxiu.com.png" },
  { name: "澎湃新闻", url: "https://www.thepaper.cn", desc: "时政与社会新闻", category: "资讯阅读", icon: "thepaper.cn.png" },
  { name: "少数派", url: "https://sspai.com", desc: "效率与数字生活指南", category: "资讯阅读", icon: "sspai.com.png", pinned: true },

  // 社区论坛
  { name: "知乎", url: "https://www.zhihu.com", desc: "问答社区与深度内容", category: "社区论坛", icon: "zhihu.com.png" },
  { name: "小红书", url: "https://www.xiaohongshu.com", desc: "生活方式社区", category: "社区论坛", icon: "xiaohongshu.com.png" },
  { name: "微博", url: "https://weibo.com", desc: "社交媒体与热搜", category: "社区论坛", icon: "weibo.com.png" },
  { name: "V2EX", url: "https://www.v2ex.com", desc: "程序员创意社区", category: "社区论坛", icon: "v2ex.com.png" },
  { name: "Linux.do", url: "https://linux.do", desc: "技术与 AI 社区", category: "社区论坛", icon: "linux.do.png" },

  // 影音娱乐
  { name: "哔哩哔哩", url: "https://www.bilibili.com", desc: "视频弹幕网站", category: "影音娱乐", icon: "bilibili.com.png" },
  { name: "YouTube", url: "https://www.youtube.com", desc: "全球视频平台", category: "影音娱乐", icon: "youtube.com.png" },
  { name: "网易云音乐", url: "https://music.163.com", desc: "在线音乐与歌单", category: "影音娱乐", icon: "music.163.com.png" },
  { name: "豆瓣电影", url: "https://movie.douban.com", desc: "电影评分与影评", category: "影音娱乐", icon: "douban.com.png" },
  { name: "腾讯视频", url: "https://v.qq.com", desc: "影视剧集与综艺", category: "影音娱乐", icon: "v.qq.com.png" },

  // 开发编程
  { name: "GitHub", url: "https://github.com", desc: "代码托管与开源社区", category: "开发编程", icon: "github.com.png", pinned: true },
  { name: "MDN Web Docs", url: "https://developer.mozilla.org", desc: "前端开发技术文档", category: "开发编程", icon: "developer.mozilla.org.png" },
  { name: "Stack Overflow", url: "https://stackoverflow.com", desc: "编程问答与解决方案", category: "开发编程", icon: "stackoverflow.com.png" },
  { name: "Vercel", url: "https://vercel.com", desc: "前端部署与托管平台", category: "开发编程", icon: "vercel.com.png" },
  { name: "菜鸟教程", url: "https://www.runoob.com", desc: "编程入门教程", category: "开发编程", icon: "runoob.com.png" },

  // 设计素材
  { name: "Dribbble", url: "https://dribbble.com", desc: "设计灵感与作品集", category: "设计素材", icon: "dribbble.com.png" },
  { name: "Figma", url: "https://www.figma.com", desc: "在线设计与原型协作", category: "设计素材", icon: "figma.com.png", pinned: true },
  { name: "Unsplash", url: "https://unsplash.com", desc: "免费高清照片素材", category: "设计素材", icon: "unsplash.com.png" },
  { name: "字由", url: "https://www.hellofont.cn", desc: "中文字体与设计资源", category: "设计素材", icon: "hellofont.cn.png" },
  { name: "站酷", url: "https://www.zcool.com.cn", desc: "设计师社区与作品", category: "设计素材", icon: "zcool.com.cn.png" },

  // 学习教育
  { name: "MOOC中国", url: "https://www.icourse163.org", desc: "在线课程与公开课", category: "学习教育", icon: "icourse163.org.png" },
  { name: "豆瓣读书", url: "https://book.douban.com", desc: "书评影评与阅读书单", category: "学习教育", icon: "douban.com.png" },
  { name: "网易云课堂", url: "https://study.163.com", desc: "在线职业课程", category: "学习教育", icon: "study.163.com.png" },
  { name: "学堂在线", url: "https://www.xuetangx.com", desc: "名校公开课平台", category: "学习教育", icon: "xuetangx.com.png" },

  // 常用工具
  { name: "DeepL", url: "https://www.deepl.com", desc: "AI 翻译工具", category: "常用工具", icon: "deepl.com.png" },
  { name: "TinyPNG", url: "https://tinypng.com", desc: "在线图片压缩", category: "常用工具", icon: "tinypng.com.png" },
  { name: "Smallpdf", url: "https://smallpdf.com", desc: "PDF 工具箱", category: "常用工具", icon: "smallpdf.com.png" },
  { name: "UU在线工具", url: "https://uutool.cn", desc: "在线工具合集", category: "常用工具", icon: "uutool.cn.png" },
  { name: "Convertio", url: "https://convertio.co", desc: "文件格式转换", category: "常用工具", icon: "convertio.co.png" },

  // 购物生活
  { name: "淘宝", url: "https://www.taobao.com", desc: "综合购物平台", category: "购物生活", icon: "taobao.com.png" },
  { name: "京东", url: "https://www.jd.com", desc: "数码家电购物", category: "购物生活", icon: "jd.com.png" },
  { name: "什么值得买", url: "https://www.smzdm.com", desc: "消费推荐与优惠", category: "购物生活", icon: "smzdm.com.png" },
  { name: "大众点评", url: "https://www.dianping.com", desc: "本地生活点评", category: "购物生活", icon: "dianping.com.png" },
  { name: "12306", url: "https://www.12306.cn", desc: "火车票预订", category: "购物生活", icon: "12306.cn.png" }
];

var NAV_CATEGORIES = ["人工智能", "办公协作", "资讯阅读", "社区论坛", "影音娱乐", "开发编程", "设计素材", "学习教育", "常用工具", "购物生活"];
