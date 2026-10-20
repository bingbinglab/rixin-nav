import { hasSession } from "../_lib/util.js";
import { getSiteConfig } from "../_lib/config.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function getLoginHtml(siteTitle) {
  const title = esc(siteTitle || "书签导航");
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title} · 后台登录</title><link rel="icon" type="image/svg+xml" href="/favicon-2.svg"><link rel="icon" type="image/png" sizes="192x192" href="/icon-192-2.png">
<link rel="stylesheet" href="/admin-assets/admin.css?v=20261019j">
<style>
body{display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
form{background:var(--card);border:2px solid var(--ink);box-shadow:7px 7px 0 var(--card-shadow);padding:30px;width:340px;max-width:94vw}
h1{font-family:"Noto Serif SC",serif;font-size:24px;letter-spacing:2px;margin:0 0 4px}
p.sub{color:var(--muted);font-size:12px;letter-spacing:3px;margin:0}
button{width:100%}
</style>
<script>(function(){try{var t=localStorage.getItem('myNavTheme');if(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches)t='dark';if(t==='dark')document.documentElement.classList.add('dark-theme');}catch(e){}})();</script>
</head>
<body><form method="POST" action="/admin/login">
<h1>${title}</h1>
<div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 10px"><p class="sub">后台 · 请出示口令</p><button id="loginThemeBtn" type="button" class="mini ghost" style="width:auto;margin:0;padding:2px 8px" title="切换白天/夜间模式">🌙</button></div>
<div id="loginErr" style="display:none;background:rgba(158,71,42,.12);border:1.5px solid var(--ochre);color:var(--ochre);padding:8px 12px;font-size:13px;font-weight:700;margin-bottom:12px"></div>
<label>口令</label><input type="password" name="password" autocomplete="current-password" required>
<button class="primary" type="submit">进 门</button></form>
<script>
const ltb=document.getElementById('loginThemeBtn');
function syncLBtn(){if(ltb)ltb.textContent=document.documentElement.classList.contains('dark-theme')?'☀️':'🌙';}
if(ltb)ltb.onclick=()=>{const isDark=document.documentElement.classList.toggle('dark-theme');if(document.body)document.body.classList.toggle('dark-theme',isDark);localStorage.setItem('myNavTheme',isDark?'dark':'light');syncLBtn();};
syncLBtn();
try{
  var err=(new URLSearchParams(window.location.search)).get('err');
  if(err){
    var eb=document.getElementById('loginErr');
    if(eb){
      eb.textContent=err==='limit'?'尝试过于频繁，请稍后再试':'口令不对，请重试';
      eb.style.display='block';
    }
  }
}catch(e){}
</script>
</body></html>`;
}

function getAdminHtml(siteTitle) {
  const title = esc(siteTitle || "书签导航");
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title} · 后台管理</title><link rel="icon" type="image/svg+xml" href="/favicon-2.svg"><link rel="icon" type="image/png" sizes="192x192" href="/icon-192-2.png">
<link rel="stylesheet" href="/admin-assets/admin.css?v=20261019j">
<script>(function(){try{var t=localStorage.getItem('myNavTheme');if(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches)t='dark';if(t==='dark')document.documentElement.classList.add('dark-theme');}catch(e){}})();</script>
</head>
<body><div class="wrap">
<header class="top"><div><h1>${title} · 后台</h1><div class="sub">辑 录 万 站 · 井 井 有 条</div></div>
<div style="text-align:right"><div style="display:flex;align-items:center;justify-content:flex-end;gap:10px"><button class="ghost mini" id="themeBtn" type="button" title="切换白天/夜间模式" style="margin:0;padding:4px 9px;font-size:13px">🌙 夜间</button><div class="stamp">辑览</div></div><div class="muted" style="margin-top:8px"><a href="/" target="_blank">看前台</a> · <a href="/admin/logout">退出</a></div></div></header>

<!-- P15: 移动端药丸 Tab 导航 (桌面隐藏) -->
<nav class="admin-tabs" id="adminTabs">
  <button type="button" class="tab-pill active" data-tab="tab-sites">全部书签</button>
  <button type="button" class="tab-pill" data-tab="tab-edit">新增·编辑</button>
  <button type="button" class="tab-pill" data-tab="tab-cats">分类管理</button>
  <button type="button" class="tab-pill" data-tab="tab-data">数据与备份</button>
  <button type="button" class="tab-pill" data-tab="tab-settings">设置与智能</button>
</nav>

<div class="grid-layout">
<div class="col-left">

<!-- Card 1: 新增·编辑 -->
<div class="card" data-tab-pane="tab-edit"><h2><span class="chap">壹</span><span id="formTitle">新增书签</span></h2>
<input type="hidden" id="fId"><input type="hidden" id="fSort">
<label>站名</label><input id="fName" placeholder="如：豆包">
<label>网址</label><input id="fUrl" placeholder="https://…">
<div id="urlDupWarn" class="dup-warn" style="display:none"></div>
<div class="descrow"><div><div style="display:flex;justify-content:space-between;align-items:baseline"><label>简介</label><span id="descCount" class="muted" style="font-size:12px">0/40</span></div><input id="fDesc" placeholder="一句话说明" maxlength="40"></div><button class="ghost inline-btn" id="aiDescBtn" type="button">AI 生成</button></div>
<div class="row"><div><label>分类（选已有，或直接打新名自动建为一级）</label><input id="fCat" list="catList"><datalist id="catList"></datalist></div>
<div><label>图标文件名（可空）</label><input id="fIcon" placeholder="如 doubao.com.png"></div></div>
<label class="chk"><input type="checkbox" id="fPinned"> 置顶（常用常顾）</label>
<label class="chk"><input type="checkbox" id="fPrivate"> 私密（未登录不可见）</label>
<div class="form-actions-sticky"><button class="primary" id="saveBtn">保 存</button><button class="ghost" id="resetBtn" type="button">清空表单</button></div>
<p class="msg" id="msg"></p></div>

<!-- Card 2: 分类管理 -->
<div class="card" data-tab-pane="tab-cats"><h2><span class="chap">贰</span>分类管理</h2>
<div class="tblwrap tblwrap-fit"><table class="cattable"><thead><tr><th>分类</th><th>书签数</th><th>父级</th><th>私密</th><th>排序</th><th></th></tr></thead><tbody id="catBody"></tbody></table></div>
<div class="cat-add-form"><div class="caf-name"><label>新分类名</label><input id="cName" placeholder="如：播客"></div>
<div class="caf-parent"><label>父级（空＝一级）</label><select id="cParent"><option value="0">（一级分类）</option></select></div>
<label class="chk"><input type="checkbox" id="cPrivate"> 私密分类</label>
<button class="primary" id="catAddBtn" type="button">新建分类</button></div>
<p class="msg" id="catMsg"></p></div>

<!-- Card 3: WebDAV 备份与同步 (属于数据与备份) -->
<div class="card" data-tab-pane="tab-data"><h2><span class="chap">叁</span>WebDAV 备份与同步 <span id="wdBadge" class="badge none">未配置</span></h2>
<div class="dav-action-btns" style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 10px">
  <button class="ghost" id="davBackupBtn" type="button">备份到 WebDAV</button>
  <button class="ghost" id="davRestoreBtn" type="button">从 WebDAV 恢复</button>
  <button class="ghost" id="floccusSyncBtn" type="button">同步 Floccus 书签</button>
</div>
<p class="msg" id="toolMsg"></p>
<div class="preset-btns"><span class="muted" style="font-size:12px">快捷预设：</span>
<button class="ghost mini" type="button" id="wdPresetJianGuo">坚果云</button>
<button class="ghost mini" type="button" id="wdPresetNextcloud">Nextcloud</button>
<button class="ghost mini" type="button" id="wdPresetCustom">自定义</button></div>
<label>WebDAV 地址</label><input id="wdUrl" placeholder="https://dav.jianguoyun.com/dav/">
<label>账号</label><input id="wdUser" placeholder="WebDAV 登录账号">
<label>应用密码（密码框留空表示保持原值不修改）</label><input id="wdPass" type="password" placeholder="未设置">
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
  <button class="primary" id="wdSaveBtn" type="button">保存 WebDAV 设置</button>
  <button class="ghost" id="wdTestBtn" type="button">测试连接</button>
  <button class="ghost danger" id="wdClearBtn" type="button">清除配置</button>
</div>
<p class="msg" id="wdMsg"></p>
<p class="muted" id="wdTip">提示：坚果云密码请填「账户信息 - 安全设置」中生成的应用密码，非登录密码；备份文件将写入对应目录下的 rixin-jilan-backup.json。</p>
<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line, #ddd)">
<label>Floccus 同步文件相对路径（相对于 WebDAV 文件所在目录，如 bookmarks.xbel）</label>
<input id="floccusPath" placeholder="bookmarks.xbel">
<button class="ghost mini" id="floccusSaveBtn" type="button" style="margin-top:4px">保存 Floccus 路径</button>
<p class="msg" id="floccusMsg"></p>
</div></div>

<!-- Card 4: 导入 / 导出 (属于数据与备份) -->
<div class="card" data-tab-pane="tab-data"><h2><span class="chap">肆</span>导入 / 导出</h2>
<input type="file" id="importFile" accept=".html,.htm,.json">
<button class="ghost" id="importBtn" type="button">导入书签 (HTML / JSON)</button>
<a href="/api/admin/export?format=json" class="btn ghost">导出 JSON</a>
<a href="/api/admin/export?format=html" class="btn ghost">导出书签 HTML</a>
<p class="muted">导入按网址去重；支持浏览器书签 HTML 与本站备份 JSON（文件夹/父级自动还原分类）。</p></div>

<!-- Card 5: 站点与品牌设置 (属于设置与智能) -->
<div class="card" data-tab-pane="tab-settings"><h2><span class="chap">伍</span>站点与品牌设置</h2>
<label>站名（留空则默认「书签导航」）</label><input id="siteTitleInput" placeholder="书签导航">
<label>页脚文案（留空则不显示该行）</label><input id="siteFooterInput" placeholder="如：本辑已毕 · 下辑随缘">
<label>外搜引擎（站内搜不到结果时用，至少留一个；只留一个则前台只显示那一个）</label>
<div style="display:flex;gap:18px;flex-wrap:wrap;margin:2px 0 10px">
<label style="display:inline-flex;align-items:center;gap:6px;margin:0"><input type="checkbox" id="extEngBing" style="width:auto;margin:0"> Bing</label>
<label style="display:inline-flex;align-items:center;gap:6px;margin:0"><input type="checkbox" id="extEngGoogle" style="width:auto;margin:0"> Google</label>
<label style="display:inline-flex;align-items:center;gap:6px;margin:0"><input type="checkbox" id="extEngGithub" style="width:auto;margin:0"> GitHub</label>
</div>
<button class="primary" id="siteSaveBtn" type="button">保存站点设置</button>
<p class="msg" id="siteMsg"></p>
<p class="muted">说明：站名与页脚文案保存后前台与后台将实时同步生效；若未设置站名则显示默认「书签导航」，页脚文案留空则不展示刊底文案行。</p></div>

<!-- Card 6: AI 补简介设置 (属于设置与智能) -->
<div class="card" data-tab-pane="tab-settings"><h2><span class="chap">陆</span>AI 补简介设置 <span id="aiBadge" class="badge none">未配置</span></h2>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 10px">
  <button class="ghost" id="bulkAiBtn" type="button">给缺简介的书签批量补简介</button>
  <button class="ghost danger" id="bulkAiStopBtn" type="button" style="display:none">中止</button>
</div>
<p class="msg" id="aiToolMsg"></p>
<label>AI 服务商</label>
<select id="aiProvider">
  <option value="cloudflare">Cloudflare Workers AI（原生）</option>
  <option value="openai">OpenAI</option>
  <option value="google">Google Gemini（OpenAI 兼容协议）</option>
  <option value="deepseek">DeepSeek</option>
  <option value="custom">自定义（OpenAI 兼容协议）</option>
</select>
<div id="aiCfWrap">
  <label>Cloudflare 账户 ID (Account ID)</label><input id="aiAccount" placeholder="在 Cloudflare 控制台右侧获取">
</div>
<div id="aiOpenAiWrap" style="display:none">
  <label>接口地址 (base_url)</label><input id="aiBaseUrl" placeholder="https://api.openai.com/v1">
</div>
<label id="aiKeyLabel">Workers AI 令牌 (API Token，留空保持原值)</label><input id="aiKey" type="password" placeholder="未设置">
<label>模型名称 (model)</label><input id="aiModel" placeholder="@cf/meta/llama-3.3-70b-instruct-fp8-fast">
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
  <button class="primary" id="aiSaveBtn" type="button">保存 AI 设置</button>
  <button class="ghost" id="aiTestBtn" type="button">测试生成</button>
  <button class="ghost danger" id="aiClearBtn" type="button">清除配置</button>
</div>
<p class="msg" id="aiMsg"></p>
<div id="aiTestResult" class="test-res-box" style="display:none"></div>
<p class="muted" id="aiTip">提示：Google Gemini 亦原生支持 OpenAI 兼容端点；测生成将使用斗鱼直播作为样本网站跑一次实际生成。</p></div>

<!-- Card 7: 死链巡检 (属于设置与智能) -->
<div class="card" data-tab-pane="tab-settings"><h2><span class="chap">柒</span>死链巡检</h2>
<button class="ghost" id="linkCheckBtn" type="button">巡检死链</button>
<p class="msg" id="lcToolMsg"></p>
<div id="linkCheckResult" style="display:none"></div>
<p class="muted">说明：分批并发探测各书签连通性并二次复核；异常站点可一键打开验证或直接删除。</p></div>

</div>

<!-- Card 8: 全部书签 (右栏) -->
<div class="col-right" data-tab-pane="tab-sites">
<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px"><h2><span class="chap">捌</span>全部书签</h2><div class="fold-controls" style="display:flex;gap:6px"><button class="ghost mini" type="button" id="foldAllBtn" title="全部折叠分类">全部折叠</button><button class="ghost mini" type="button" id="unfoldAllBtn" title="全部展开分类">全部展开</button></div></div><div class="searchbar"><input id="siteSearch" placeholder="过滤：打站名、网址或分类…"><button type="button" class="search-clear-btn" id="searchClearBtn" title="清空搜索" aria-label="清空搜索" style="display:none">×</button></div><div id="list">加载中…</div></div>
</div>
</div>
</div>
</div>

</div>

<!-- P17: 统一样式站内确认弹窗模态框 -->
<div id="confirmModal" class="confirm-modal-mask" style="display:none">
  <div class="confirm-card card">
    <h3 id="confirmTitle" class="confirm-title serif">请确认</h3>
    <p id="confirmMsg" class="confirm-msg"></p>
    <div class="confirm-actions">
      <button id="confirmCancelBtn" type="button" class="ghost mini">取 消</button>
      <button id="confirmOkBtn" type="button" class="primary mini">确 定</button>
    </div>
  </div>
</div>

<!-- 外置客户端逻辑 -->
<script src="/assets/icon.js?v=20261021h" defer></script>
<script src="/admin-assets/admin.js?v=20261019j" defer></script>
</body></html>`;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.NAV_KV) {
    return new Response("第二阶段还没绑定 KV（NAV_KV）：先在 Cloudflare 里建 KV、绑到 Pages，再回来登录。", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const authed = await hasSession(request, env);
  const { site_title } = await getSiteConfig(env);
  const siteTitle = site_title || "书签导航";
  return new Response(authed ? getAdminHtml(siteTitle) : getLoginHtml(siteTitle), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
