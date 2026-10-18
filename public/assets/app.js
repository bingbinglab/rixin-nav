// 日新辑览 · 前台主交互脚本 (app.js)
// 纯前端交互逻辑，两阶段渲染：静态 data.js 垫底，异步 /api/sites 刷新；无感感知站长登录态。

const ACCENTS = ['ochre', 'dark', 'ochre', 'dark'];
let keyword = '';
let activeLetter = '';
let isCompact = localStorage.getItem('myNavDensity') === 'compact';
let visibleSitesList = [];
let selectedSiteIndex = 0;
let isAuthed = false;

// ---------- 1. 汉字拼音首字母计算引擎 ----------
const SPECIAL_PINYIN = {
  '茄': 'q', '重': 'c', '长': 'c', '行': 'h', '乐': 'y', '度': 'd', '藏': 'c', '微': 'w',
  '拼': 'p', '信': 'x', '博': 'b', '知': 'z', '乎': 'h', '掘': 'j', '金': 'j', '思': 's',
  '否': 'f', '简': 'j', '书': 's', '语': 'y', '雀': 'q', '墨': 'm', '刀': 'd', '哔': 'b',
  '哩': 'l', '爱': 'a', '奇': 'q', '艺': 'y', '优': 'y', '酷': 'k', '腾': 't', '讯': 'x',
  '淘': 't', '宝': 'b', '京': 'j', '东': 'd', '美': 'm', '团': 't', '网': 'w', '易': 'y',
  '云': 'y', '音': 'y', '字': 'z', '由': 'y', '飞': 'f', '文': 'w', '档': 'd', '钉': 'd',
  '少': 's', '数': 's', '派': 'p', '豆': 'd', '瓣': 'b', '读': 'd', '番': 'f', '钟': 'z'
};

function getCharInitial(char) {
  if (!char) return '';
  if (/[a-zA-Z0-9]/.test(char)) return char.toLowerCase();
  if (SPECIAL_PINYIN[char]) return SPECIAL_PINYIN[char];
  const boundaries = '啊芭擦搭蛾发噶哈击喀垃妈拿哦啪期然撒塌挖昔压匝'.split('');
  const letters = 'abcdefghjklmnopqrstwxyz'.split('');
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (char.localeCompare(boundaries[i], 'zh-CN-u-co-pinyin') >= 0) {
      return letters[i];
    }
  }
  return '';
}

function getWordInitials(str) {
  let initials = '';
  for (const ch of (str || '')) {
    const init = getCharInitial(ch);
    if (init) initials += init;
  }
  return initials;
}

function getAcronyms(str) {
  const splitStr = (str || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const words = splitStr.trim().split(/[\s\-_]+/);
  if (words.length > 1) {
    return [words.map(w => getCharInitial(w[0])).join('')];
  }
  return [];
}

function enrichSite(site) {
  if (site._enriched) return site;
  site._enriched = true;
  site._firstLetter = getCharInitial((site.name || '').trim()[0]) || '';
  site._nameInitials = getWordInitials(site.name || '');
  site._acronyms = getAcronyms(site.name || '');
  site._initials = site._nameInitials || site._firstLetter;
  return site;
}

function matchSiteScore(site, kw) {
  if (!kw) return 100;
  enrichSite(site);
  kw = kw.toLowerCase().trim();
  const name = site.name.toLowerCase();
  const desc = (site.desc || '').toLowerCase();
  const cat = (site.category || '').toLowerCase();
  const url = (site.url || '').toLowerCase();
  const firstLetter = site._firstLetter;
  const nameInitials = site._nameInitials;
  const acronyms = site._acronyms;

  // 1. 单字母极速定位：若是单个字母，首字母完全对上的给最高分！
  if (/^[a-z]$/i.test(kw)) {
    if (firstLetter === kw) return 100;
    if (acronyms.some(a => a[0] === kw)) return 95;
    return 0; // 避免单字母无序模糊匹配
  }

  // 2. 多字母拼音首字母匹配 (如 fs -> 飞书, zh -> 知乎, gh -> GitHub, ssp -> 少数派)
  if (nameInitials.startsWith(kw) || acronyms.some(a => a.startsWith(kw))) return 90;
  if (nameInitials.includes(kw) || acronyms.some(a => a.includes(kw))) return 80;

  // 3. 汉字/英文前缀包含
  if (name.startsWith(kw)) return 75;
  if (name.includes(kw)) return 70;

  // 4. 网址域名包含 (例如 feishu, zhihu, sspai, github)
  if (url.includes(kw)) return 60;

  // 5. 描述或分类匹配
  if (desc.includes(kw) || cat.includes(kw)) return 50;

  return 0;
}

// 分类副标题：全站统一「第X辑」中文编号（原英文词典已撤，2026-10-16 用户定版）
function cnNum(n) {
  const d = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  if (n < 10) return d[n];
  if (n < 20) return '拾' + (n % 10 ? d[n % 10] : '');
  return d[Math.floor(n / 10)] + '拾' + (n % 10 ? d[n % 10] : '');
}

function getCategorySub(cat, numStr) {
  const n = parseInt(numStr, 10);
  return n > 0 ? `第${cnNum(n)}辑` : '辑览分册';
}

// ---------- 2. 页面视图模式初始化 ----------
const pageRoot = document.getElementById('pageRoot');
const viewToggleBtn = document.getElementById('viewToggleBtn');
const viewToggleIcon = document.getElementById('viewToggleIcon');
const viewToggleText = document.getElementById('viewToggleText');

function updateDensityView() {
  if (!pageRoot) return;
  if (isCompact) {
    pageRoot.classList.add('compact-view');
    if (viewToggleIcon) viewToggleIcon.textContent = '▤';
    if (viewToggleText) viewToggleText.textContent = '舒适模式';
  } else {
    pageRoot.classList.remove('compact-view');
    if (viewToggleIcon) viewToggleIcon.textContent = '⊞';
    if (viewToggleText) viewToggleText.textContent = '紧凑模式';
  }
  localStorage.setItem('myNavDensity', isCompact ? 'compact' : 'comfortable');
}
updateDensityView();

if (viewToggleBtn) {
  viewToggleBtn.onclick = () => {
    isCompact = !isCompact;
    updateDensityView();
  };
}

// ---------- 2.0 主题模式管理 (日间 澄怀素笺 / 夜间 深夜墨香) ----------
let currentTheme = localStorage.getItem('myNavTheme') || 'light';
if (!localStorage.getItem('myNavTheme')) {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    currentTheme = 'dark';
  }
}

const themeToggleBtn = document.getElementById('themeToggleBtn');

function applyTheme(theme) {
  currentTheme = theme;
  if (theme === 'dark') {
    document.documentElement.classList.add('dark-theme');
    document.body.classList.add('dark-theme');
    if (themeToggleBtn) themeToggleBtn.setAttribute('title', '当前：夜间模式（点击阴阳切换为白天）');
  } else {
    document.documentElement.classList.remove('dark-theme');
    document.body.classList.remove('dark-theme');
    if (themeToggleBtn) themeToggleBtn.setAttribute('title', '当前：白天模式（点击阴阳切换为夜间）');
  }
  localStorage.setItem('myNavTheme', theme);
}

if (themeToggleBtn) {
  themeToggleBtn.onclick = () => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };
}

applyTheme(currentTheme);

const allSites = () => (window.NAV_DATA || []);

// 私密站点：默认隐藏，工具栏「显示私密」切换（状态存本机）
let showPrivate = localStorage.getItem('myNavShowPrivate') === '1';
const displaySites = () => allSites().filter(s => showPrivate || !s.private);

// 分类树：NAV_CATEGORIES 元素可以是字符串（静态 data.js）或 {name, parent}（接口下发，支持二级分类）
function catTree() {
  const names = [];
  const parent = new Map();
  (window.NAV_CATEGORIES || []).forEach(c => {
    const n = typeof c === 'string' ? c : (c && c.name);
    if (!n || names.includes(n)) return;
    names.push(n);
    parent.set(n, typeof c === 'string' ? null : (c.parent || null));
  });
  allSites().forEach(s => {
    if (s.category && !names.includes(s.category)) {
      names.push(s.category);
      parent.set(s.category, null);
    }
  });
  return { names, parent };
}

const categories = () => catTree().names;
const catParentOf = name => catTree().parent.get(name) || null;

// 树形展开顺序：顶级分类在前、其子分类紧随其后（分区与侧栏共用）
const orderedCats = () => {
  const { names, parent } = catTree();
  const out = [];
  names.filter(n => !parent.get(n)).forEach(top => {
    out.push(top);
    names.filter(n => parent.get(n) === top).forEach(kid => out.push(kid));
  });
  names.forEach(n => { if (!out.includes(n)) out.push(n); });
  return out;
};

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function renderCard(s) {
  enrichSite(s);
  const isSelected = (keyword.trim().length > 0 && visibleSitesList[selectedSiteIndex] === s);
  return `<a class="card ${isSelected ? 'keyboard-selected' : ''}" href="${esc(s.url)}" target="_blank" rel="noopener" data-url="${esc(s.url)}" data-name="${esc(s.name)}">
    ${iconHTML(s)}
    <span class="card-main">
      <span class="card-name">
        <span>${esc(s.name)}</span>
        <span class="card-icons">
          <button type="button" class="card-copy-btn" title="复制网址" data-copy="${esc(s.url)}" aria-label="复制网址"><svg class="copy-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
          <span class="card-arrow">↗</span>
        </span>
      </span>
      <span class="card-desc">${esc(s.desc || '')}</span>
      <span class="card-host">${esc(hostOf(s.url))}</span>
    </span>
  </a>`;
}

function updateSelectedCardVisual(scroll = false, instant = false) {
  document.querySelectorAll('.card').forEach(el => el.classList.remove('keyboard-selected'));
  if (!keyword.trim()) return;
  const target = visibleSitesList[selectedSiteIndex];
  if (!target) return;
  const matchEl = document.querySelector(`.main-sections-content .card[data-name="${CSS.escape(target.name)}"]`) ||
                  document.querySelector(`.card[data-name="${CSS.escape(target.name)}"]`);
  if (matchEl) {
    matchEl.classList.add('keyboard-selected');
    if (scroll) {
      matchEl.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'nearest' });
    }
  }
}

// 按站点找到它渲染出的卡片元素（先按名+址精确匹配，退回只按名）
function cardElFor(site) {
  if (!site) return null;
  return document.querySelector(`.card[data-name="${CSS.escape(site.name)}"][data-url="${CSS.escape(site.url)}"]`) ||
         document.querySelector(`.card[data-name="${CSS.escape(site.name)}"]`);
}

// 键盘二维导航的列锚点：记住期望的水平位置，跨过残行后仍能对回原来的列
let kbPrefX = null;

// 外搜引擎（未入本辑时用）：后台可勾选启用哪几个；←/→ 在启用的引擎间切换，Enter 打开当前引擎
const ENGINE_DEFS = {
  bing: { name: "必应", btnId: "extBing", url: (q) => `https://www.bing.com/search?q=${q}` },
  google: { name: "Google", btnId: "extGoogle", url: (q) => `https://www.google.com/search?q=${q}` },
  github: { name: "GitHub", btnId: "extGithub", url: (q) => `https://github.com/search?q=${q}` },
};
const ENGINE_ORDER = ["bing", "google", "github"];
let activeEngineIds = [...ENGINE_ORDER];
let extEngineIdx = 0;
function curEngineDef() {
  if (extEngineIdx >= activeEngineIds.length) extEngineIdx = 0;
  return ENGINE_DEFS[activeEngineIds[extEngineIdx]];
}
function applyExtEngines(ids) {
  const valid = ENGINE_ORDER.filter((id) => Array.isArray(ids) && ids.includes(id));
  activeEngineIds = valid.length ? valid : [...ENGINE_ORDER];
  if (extEngineIdx >= activeEngineIds.length) extEngineIdx = 0;
  for (const id of ENGINE_ORDER) {
    const b = document.getElementById(ENGINE_DEFS[id].btnId);
    if (b) b.style.display = activeEngineIds.includes(id) ? "" : "none";
  }
  syncExtEngine();
}
function syncExtEngine() {
  const def = curEngineDef();
  for (const id of ENGINE_ORDER) {
    const b = document.getElementById(ENGINE_DEFS[id].btnId);
    if (b) b.classList.toggle('ext-active', activeEngineIds[extEngineIdx] === id);
  }
  const hint = document.getElementById('extHint');
  if (hint) {
    hint.textContent = activeEngineIds.length > 1
      ? `← → 切换引擎 · 按 Enter 用${def.name}搜索`
      : `按 Enter 用${def.name}搜索`;
  }
}

// ---------- 3. 页面核心渲染逻辑 ----------
function render() {
  const sites = displaySites();
  sites.forEach(enrichSite);
  const kw = keyword.trim().toLowerCase();

  const ordered = orderedCats();
  const visibleCatsCount = ordered.filter(cat => sites.some(s => s.category === cat)).length;

  const siteCountEl = document.getElementById('siteCount');
  const catCountEl = document.getElementById('catCount');
  if (siteCountEl) siteCountEl.textContent = sites.length;
  if (catCountEl) catCountEl.textContent = visibleCatsCount;
  const mastStatsEl = document.getElementById('mastStats');
  if (mastStatsEl) mastStatsEl.style.visibility = 'visible';

  const scoreMap = new Map();
  for (const s of sites) {
    scoreMap.set(s, matchSiteScore(s, kw));
  }
  const isMatch = s => scoreMap.get(s) > 0;

  visibleSitesList = sites.filter(isMatch);
  if (kw) {
    visibleSitesList.sort((a, b) => scoreMap.get(b) - scoreMap.get(a));
  }
  if (selectedSiteIndex >= visibleSitesList.length) {
    selectedSiteIndex = 0;
  }

  // 1. 渲染「常用常顾」Pinned 专区
  const pinnedList = sites.filter(s => s.pinned && isMatch(s));
  const pinnedSec = document.getElementById('pinnedSection');
  const pinnedGrid = document.getElementById('pinnedGrid');
  const pinnedCount = document.getElementById('pinnedCount');

  if (pinnedList.length > 0) {
    if (pinnedSec) pinnedSec.style.display = 'block';
    if (pinnedCount) pinnedCount.textContent = `${pinnedList.length} 个站点`;
    if (pinnedGrid) pinnedGrid.innerHTML = pinnedList.map(renderCard).join('');
  } else {
    if (pinnedSec) pinnedSec.style.display = 'none';
    if (pinnedGrid) pinnedGrid.innerHTML = '';
  }

  // 预聚合当前匹配的分类站点映射
  const catSitesMap = new Map();
  ordered.forEach(cat => {
    catSitesMap.set(cat, sites.filter(s => s.category === cat && isMatch(s)));
  });

  // 顶级分类编号（仅对当前自身或子类有可见站点的顶级分类顺次分配连续编号）
  const topNums = {};
  {
    let tc = 0;
    ordered.forEach(cat => {
      if (!catParentOf(cat)) {
        const hasVisible = (catSitesMap.get(cat) || []).length > 0 ||
          ordered.some(kid => catParentOf(kid) === cat && (catSitesMap.get(kid) || []).length > 0);
        if (hasVisible) {
          tc += 1;
          topNums[cat] = String(tc).padStart(2, '0');
        }
      }
    });
  }

  // 2. 渲染各分类分区
  const wrap = document.getElementById('sections');
  let anyVisible = (pinnedList.length > 0);

  if (wrap) {
    wrap.innerHTML = ordered.map((cat, i) => {
      const catSites = catSitesMap.get(cat) || [];
      if (!catSites.length) return '';
      anyVisible = true;
      const parentName = catParentOf(cat);
      const num = parentName ? (topNums[parentName] || '') + '·' : (topNums[cat] || '');
      return `<section class="section ${parentName ? 'section--sub' : ''}" id="cat-section-${i}" data-cat-index="${i}">
        <div class="section-head">
          <span class="section-num accent-${ACCENTS[i % ACCENTS.length]}">${esc(num)}</span>
          <h2 class="section-title">${esc(cat)}</h2>
          ${parentName ? `<span class="section-parent">隶属 ${esc(parentName)}</span>` : `<span class="section-sub">${esc(getCategorySub(cat, topNums[cat]))}</span>`}
          <span class="section-line"></span>
          <span class="section-count">${catSites.length} 个站点</span>
        </div>
        <div class="grid">${catSites.map(renderCard).join('')}</div>
      </section>`;
    }).join('');
  }

  const noRes = document.getElementById('noResults');
  const noResLetter = document.getElementById('noResLetter');
  if (noRes) {
    noRes.style.display = anyVisible ? 'none' : 'block';
    if (noResLetter) {
      noResLetter.textContent = (activeLetter || kw).toUpperCase();
    }
  }

  // 搜索无结果时给出外部搜索兜底（仅关键词检索时；字母索引落空不打扰）
  const extSearch = document.getElementById('extSearch');
  if (extSearch) {
    const q = keyword.trim();
    if (!anyVisible && q) {
      extSearch.style.display = 'block';
      extEngineIdx = 0;
      const enc = encodeURIComponent(q);
      for (const id of activeEngineIds) {
        const b = document.getElementById(ENGINE_DEFS[id].btnId);
        if (b) b.href = ENGINE_DEFS[id].url(enc);
      }
      const kwSpan = document.getElementById('extKw');
      if (kwSpan) kwSpan.textContent = q;
      syncExtEngine();
    } else {
      extSearch.style.display = 'none';
    }
  }

  // 3. 渲染左侧分类索引 (Sidebar Index)
  const sidebarNav = document.getElementById('sidebarNav');
  if (sidebarNav) {
    let sidebarHTML = '';
    const totalPinned = pinnedList.length;
    if (totalPinned > 0) {
      sidebarHTML += `
        <a class="sidebar-link" href="#pinnedSection" data-target="pinnedSection">
          <span class="sidebar-link-left">
            <span class="sidebar-num" style="color:var(--ochre);">❖</span>
            <span class="sidebar-name">常用常顾</span>
          </span>
          <span class="sidebar-badge">${totalPinned}</span>
        </a>`;
    }

    ordered.forEach((cat, i) => {
      const catSites = catSitesMap.get(cat) || [];
      const totalCount = catSites.length;
      if (totalCount === 0) return; // 修复：当前无可见站点的分类绝不在左侧栏出现，彻底杜绝 0 徽标与死锚点！

      const parentName = catParentOf(cat);
      const num = parentName ? (topNums[parentName] || '') + '·' : (topNums[cat] || '');
      sidebarHTML += `
        <a class="sidebar-link ${parentName ? 'sidebar-link--sub' : ''}" href="#cat-section-${i}" data-target="cat-section-${i}">
          <span class="sidebar-link-left">
            <span class="sidebar-num">${esc(num)}</span>
            <span class="sidebar-name">${esc(cat)}</span>
          </span>
          <span class="sidebar-badge">${totalCount}</span>
        </a>`;
    });
    sidebarNav.innerHTML = sidebarHTML;
  }



  // 私密切换钮：有私密站点时才出现，并同步当前显隐文案
  const privBtn = document.getElementById('privacyBtn');
  if (privBtn) {
    const privTotal = allSites().filter(s => s.private).length;
    privBtn.style.display = privTotal ? '' : 'none';
    const span = privBtn.querySelector('span');
    if (span) span.textContent = showPrivate ? '隐藏私密' : '显示私密';
  }

  updateSelectedCardVisual();
}

// ---------- 4. A-Z 快速字母筛选条与精准直达引擎 ----------
function renderAZStrip() {
  const strip = document.getElementById('azStrip');
  if (!strip) return;
  const sites = displaySites();
  sites.forEach(enrichSite);
  const lettersWithSites = new Set(sites.map(s => (s._firstLetter || '').toUpperCase()).filter(Boolean));

  let html = `<button type="button" class="az-btn ${!activeLetter ? 'active' : ''}" data-letter="">全部</button>`;
  for (let i = 65; i <= 90; i++) {
    const char = String.fromCharCode(i);
    const has = lettersWithSites.has(char);
    const isActive = activeLetter === char.toLowerCase();
    html += `<button type="button" class="az-btn ${isActive ? 'active' : ''} ${has ? 'has-sites' : 'no-sites'}" data-letter="${char.toLowerCase()}">${char}</button>`;
  }
  strip.innerHTML = html;

  strip.querySelectorAll('.az-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const clickedLetter = btn.dataset.letter;
      if (activeLetter === clickedLetter && clickedLetter !== '') {
        activeLetter = '';
      } else {
        activeLetter = clickedLetter;
      }

      if (document.activeElement === input) {
        input.blur();
      }

      if (activeLetter) {
        input.value = activeLetter;
        keyword = activeLetter;
        clearBtn.classList.add('visible');
      } else {
        input.value = '';
        keyword = '';
        clearBtn.classList.remove('visible');
      }

      selectedSiteIndex = 0;
      render();
      initScrollSpy();
      updateAZStripUI();
      scrollToActiveTarget();
    };
  });

  const resetBtn = document.getElementById('resetFilterBtn');
  if (resetBtn) {
    resetBtn.onclick = () => resetFilter();
  }
}

function updateAZStripUI() {
  const strip = document.getElementById('azStrip');
  if (!strip) return;
  let activeBtn = null;
  strip.querySelectorAll('.az-btn').forEach(btn => {
    const isAct = btn.dataset.letter === (activeLetter || '');
    btn.classList.toggle('active', isAct);
    if (isAct) activeBtn = btn;
  });

  if (activeBtn) {
    activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

function resetFilter() {
  input.value = '';
  keyword = '';
  activeLetter = '';
  clearBtn.classList.remove('visible');
  selectedSiteIndex = 0;
  kbPrefX = null;
  render();
  initScrollSpy();
  updateAZStripUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getStickyNavHeight() {
  let h = 0;
  const locBar = document.querySelector('.quick-loc-bar');
  if (locBar) {
    const isSticky = window.getComputedStyle(locBar).position === 'sticky';
    if (isSticky) h += locBar.offsetHeight;
  }
  const sidebarIndex = document.querySelector('.sidebar-index');
  if (sidebarIndex) {
    const isSticky = window.getComputedStyle(sidebarIndex).position === 'sticky';
    if (isSticky) h += sidebarIndex.offsetHeight;
  }
  return h > 0 ? (h + 10) : 70;
}

function scrollToActiveTarget() {
  setTimeout(() => {
    const barHeight = getStickyNavHeight();
    if (activeLetter && visibleSitesList.length > 0) {
      const targetCard = document.querySelector('.card.keyboard-selected') || document.querySelector('.main-sections-content .card');
      if (targetCard) {
        const section = targetCard.closest('.section') || targetCard;
        const rect = section.getBoundingClientRect();
        const currentY = window.pageYOffset || document.documentElement.scrollTop;
        const targetY = currentY + rect.top - barHeight;
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
      }
    } else if (activeLetter && visibleSitesList.length === 0) {
      const noRes = document.getElementById('noResults');
      if (noRes) {
        const rect = noRes.getBoundingClientRect();
        const currentY = window.pageYOffset || document.documentElement.scrollTop;
        const targetY = currentY + rect.top - barHeight;
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, 35);
}

// ---------- 5. 左侧索引高亮监听 (ScrollSpy) ----------
let scrollSpyObserver = null;
// 滚动侦测高亮变化时，把当前分类片滑进索引栏可视区（手机横向片栏为主，桌面纵向同理）；已在可视区内则不动
function revealSidebarLink(link) {
  const nav = link.closest('.sidebar-nav');
  if (!nav) return;
  const navRect = nav.getBoundingClientRect();
  const rect = link.getBoundingClientRect();
  if (nav.scrollWidth > nav.clientWidth + 4) {
    const pillLeft = rect.left - navRect.left + nav.scrollLeft;
    const viewL = nav.scrollLeft, viewR = viewL + nav.clientWidth;
    if (rect.width && (pillLeft < viewL + 2 || pillLeft + rect.width > viewR - 2)) {
      nav.scrollTo({ left: pillLeft - (nav.clientWidth - rect.width) / 2, behavior: 'smooth' });
    }
  } else if (nav.scrollHeight > nav.clientHeight + 4) {
    const pillTop = rect.top - navRect.top + nav.scrollTop;
    const viewT = nav.scrollTop, viewB = viewT + nav.clientHeight;
    if (rect.height && (pillTop < viewT + 2 || pillTop + rect.height > viewB - 2)) {
      nav.scrollTo({ top: pillTop - (nav.clientHeight - rect.height) / 2, behavior: 'smooth' });
    }
  }
}

function initScrollSpy() {
  if (scrollSpyObserver) scrollSpyObserver.disconnect();
  const links = document.querySelectorAll('.sidebar-link');
  if (!links.length) return;

  const targets = Array.from(links).map(link => {
    const id = link.getAttribute('data-target');
    return document.getElementById(id);
  }).filter(Boolean);

  scrollSpyObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        links.forEach(l => {
          if (l.getAttribute('data-target') === id) {
            l.classList.add('active');
            revealSidebarLink(l);
          } else {
            l.classList.remove('active');
          }
        });
      }
    });
  }, {
    rootMargin: '-10% 0px -75% 0px',
    threshold: 0
  });

  targets.forEach(target => scrollSpyObserver.observe(target));
}

// ---------- 6. 搜索交互与全局键盘捕获 ----------
const input = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');

let searchRafId = null;
if (input) {
  input.addEventListener('input', () => {
    keyword = input.value;
    activeLetter = (keyword.length === 1 && /^[a-z]$/i.test(keyword)) ? keyword.toLowerCase() : '';
    if (clearBtn) clearBtn.classList.toggle('visible', !!keyword);
    selectedSiteIndex = 0;
    kbPrefX = null;
    if (searchRafId) cancelAnimationFrame(searchRafId);
    searchRafId = requestAnimationFrame(() => {
      searchRafId = null;
      render();
      initScrollSpy();
      updateAZStripUI();
    });
  });
}

if (clearBtn) {
  clearBtn.onclick = () => {
    resetFilter();
    input.focus();
  };
}

// 检字诀：键位速查浮层 (桌面端)
const shortcutModal = document.getElementById('shortcutModalOverlay');
const shortcutCloseBtn = document.getElementById('shortcutCloseBtn');

function toggleShortcutModal(show) {
  if (!shortcutModal) return;
  const willShow = (show === undefined) ? shortcutModal.hidden : show;
  shortcutModal.hidden = !willShow;
}

if (shortcutCloseBtn) {
  shortcutCloseBtn.addEventListener('click', () => toggleShortcutModal(false));
}
if (shortcutModal) {
  shortcutModal.addEventListener('click', (e) => {
    if (e.target === shortcutModal) toggleShortcutModal(false);
  });
}

// 卡片复制网址小图标
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.card-copy-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const url = btn.dataset.copy || '';
  if (!url) return;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(url).then(() => {
      btn.classList.add('copied');
      const originalSvg = btn.innerHTML;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = originalSvg;
      }, 1200);
    }).catch(() => {});
  }
});

// 全局快捷键逻辑 (含 IME 输入法组合态保护修复)
window.addEventListener('keydown', e => {
  const logModal = document.getElementById('loginModalOverlay');
  const isModalOpen = logModal && !logModal.hidden;

  // 弹窗状态下只响应 Esc 关闭
  if (isModalOpen) {
    if (e.key === 'Escape') {
      logModal.hidden = true;
    }
    return;
  }

  // 键位速查浮层打开时响应 Esc 或 ? 关闭
  if (shortcutModal && !shortcutModal.hidden) {
    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault();
      toggleShortcutModal(false);
    }
    return;
  }

  // 重点修复（第 6 条改性版）：拼音输入法打字或选词回车时放行，绝不误开网站
  if (e.isComposing || e.keyCode === 229) return;

  // 检字诀：按 ? 呼出键位速查浮层 (焦点在输入框/可编辑元素或 IME 合成态时不触发)
  if (e.key === '?') {
    const active = document.activeElement;
    const tag = active ? active.tagName : '';
    const isEditing = active && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable);
    if (!isEditing) {
      e.preventDefault();
      toggleShortcutModal(true);
      return;
    }
  }

  // 1. 回车直接打开当前选中的卡片
  if (e.key === 'Enter') {
    const active = document.activeElement;
    const tag = active ? active.tagName : '';
    if (active && (tag === 'BUTTON' || tag === 'A' || tag === 'SELECT' || tag === 'TEXTAREA' || active.isContentEditable)) {
      return;
    }
    if (visibleSitesList.length > 0) {
      e.preventDefault();
      const targetSite = visibleSitesList[selectedSiteIndex] || visibleSitesList[0];
      if (targetSite && targetSite.url) {
        window.open(targetSite.url, '_blank', 'noopener');
        if (active && (active === input || active.id === 'searchInput' || tag === 'INPUT')) {
          active.blur();
        }
      }
    } else if (keyword.trim()) {
      // 站内无结果：回车用当前选中的外搜引擎（默认必应，←/→ 可切换），键盘流不中断
      e.preventDefault();
      window.open(curEngineDef().url(encodeURIComponent(keyword.trim())), '_blank', 'noopener');
    }
    return;
  }

  // 2. 左右方向键：沿列表逐个流转（行尾折行、跨分类衔接）
  // 焦点在搜索框时：仅当光标停在词中间（真在改字）才放行给光标，其余一律选卡导航
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (document.activeElement === input) {
      const pos = input.selectionStart;
      if (pos > 0 && pos < input.value.length) return;
    }
    // 未入本辑空状态：←/→ 改为切换外搜引擎（此时无卡片可走，不冲突）
    const extEl = document.getElementById('extSearch');
    if (extEl && extEl.style.display !== 'none' && visibleSitesList.length === 0 && keyword.trim() && activeEngineIds.length > 1) {
      e.preventDefault();
      extEngineIdx = (extEngineIdx + (e.key === 'ArrowRight' ? 1 : -1) + activeEngineIds.length) % activeEngineIds.length;
      syncExtEngine();
      return;
    }
    if (visibleSitesList.length > 0) {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      selectedSiteIndex = (selectedSiteIndex + step + visibleSitesList.length) % visibleSitesList.length;
      updateSelectedCardVisual(true, e.repeat);
      const el = cardElFor(visibleSitesList[selectedSiteIndex]);
      if (el) { const r = el.getBoundingClientRect(); kbPrefX = r.left + r.width / 2; }
    }
    return;
  }

  // 3. 上下方向键：按卡片实际视觉行列移动（列锚点记忆，残行跳过后对回原列）
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (visibleSitesList.length > 0) {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const items = visibleSitesList.map(s => ({ s, el: cardElFor(s) })).filter(x => x.el);
      if (items.length) {
        const cur = items[selectedSiteIndex] || items[0];
        const curRect = cur.el.getBoundingClientRect();
        if (kbPrefX === null) kbPrefX = curRect.left + curRect.width / 2;
        const rows = [];
        items.forEach(x => {
          const r = x.el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          let row = rows.find(w => Math.abs(w.top - r.top) < 16);
          if (!row) { row = { top: r.top, items: [] }; rows.push(row); }
          row.items.push({ s: x.s, cx });
        });
        rows.sort((a, b) => a.top - b.top);
        rows.forEach(w => w.items.sort((a, b) => a.cx - b.cx));
        const ri = rows.findIndex(w => w.items.some(x => x.s === cur.s));
        const ni = ri + dir;
        if (ri >= 0 && ni >= 0 && ni < rows.length) {
          let best = null, bd = Infinity;
          rows[ni].items.forEach(x => { const d = Math.abs(x.cx - kbPrefX); if (d < bd) { bd = d; best = x; } });
          if (best) {
            selectedSiteIndex = visibleSitesList.indexOf(best.s);
            updateSelectedCardVisual(true, e.repeat);
          }
        }
      }
    }
    return;
  }

  // 4. 按 / 聚焦搜索框
  if (e.key === '/' && document.activeElement !== input) {
    e.preventDefault();
    input.focus();
    input.select();
    return;
  }

  // 5. 按 Escape 清空搜索框并退出
  if (e.key === 'Escape') {
    if (input.value || keyword || activeLetter) {
      resetFilter();
      input.blur();
    }
    return;
  }

  // 6. 全局随手按英文字母或数字直接触发检索
  if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key)) {
    if (document.activeElement !== input) {
      input.focus();
      input.value = e.key;
      keyword = e.key;
      activeLetter = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : '';
      if (clearBtn) clearBtn.classList.add('visible');
      selectedSiteIndex = 0;
      kbPrefX = null;
      render();
      initScrollSpy();
      updateAZStripUI();
      scrollToActiveTarget();
      e.preventDefault();
    }
  }
});

// 回到顶部按钮
const floatTopBtn = document.getElementById('floatTopBtn');
window.addEventListener('scroll', () => {
  if (!floatTopBtn) return;
  if (window.scrollY > 280) {
    floatTopBtn.classList.add('visible');
  } else {
    floatTopBtn.classList.remove('visible');
  }
}, { passive: true });

const backToTopBtn = document.getElementById('backToTopBtn');
if (backToTopBtn) {
  backToTopBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
}
if (floatTopBtn) {
  floatTopBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 7. 日期显示 (公历 + 农历干支 + 岁时节气)
function getSolarTerm(date) {
  const month = date.getMonth();
  const day = date.getDate();
  const solarTerms = [
    { name: '小寒', m: 0, d: 5 }, { name: '大寒', m: 0, d: 20 },
    { name: '立春', m: 1, d: 3 }, { name: '雨水', m: 1, d: 18 },
    { name: '惊蛰', m: 2, d: 5 }, { name: '春分', m: 2, d: 20 },
    { name: '清明', m: 3, d: 4 }, { name: '谷雨', m: 3, d: 19 },
    { name: '立夏', m: 4, d: 5 }, { name: '小满', m: 4, d: 20 },
    { name: '芒种', m: 5, d: 5 }, { name: '夏至', m: 5, d: 21 },
    { name: '小暑', m: 6, d: 6 }, { name: '大暑', m: 6, d: 22 },
    { name: '立秋', m: 7, d: 7 }, { name: '处暑', m: 7, d: 22 },
    { name: '白露', m: 8, d: 7 }, { name: '秋分', m: 8, d: 22 },
    { name: '寒露', m: 9, d: 8 }, { name: '霜降', m: 9, d: 23 },
    { name: '立冬', m: 10, d: 7 }, { name: '小雪', m: 10, d: 22 },
    { name: '大雪', m: 11, d: 6 }, { name: '冬至', m: 11, d: 21 }
  ];
  let cur = solarTerms[solarTerms.length - 1].name;
  for (let i = 0; i < solarTerms.length; i++) {
    const t = solarTerms[i];
    if (month > t.m || (month === t.m && day >= t.d)) {
      cur = t.name;
    }
  }
  return cur;
}

function updateDateDisplay(now = new Date()) {
  const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()];
  const solarDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · ${week}`;
  let lunarBadgeStr = '岁在丙午 · 抚光阅日';
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      year: 'numeric', month: 'long', day: 'numeric'
    }).formatToParts(now);
    let yearName = '', month = '', day = '';
    parts.forEach(p => {
      if (p.type === 'yearName') yearName = p.value + '年';
      if (p.type === 'month') month = p.value;
      if (p.type === 'day') {
        const n = parseInt(p.value, 10);
        const dayNames = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
          '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
          '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
        day = dayNames[n - 1] || (n + '日');
      }
    });
    const term = getSolarTerm(now);
    if (yearName || month || term) {
      lunarBadgeStr = `${yearName} · 农历${month}${day} · ${term}`;
    }
  } catch (e) {}

  const solarEl = document.getElementById('mastSolarDate');
  const lunarEl = document.getElementById('mastLunarDate');
  if (solarEl) solarEl.textContent = solarDateStr;
  if (lunarEl) lunarEl.textContent = lunarBadgeStr;
}
updateDateDisplay();

// 8. 添加网站弹窗与新建分类交互
// 8. 私密站点显隐切换
const privacyBtn = document.getElementById('privacyBtn');
if (privacyBtn) {
  privacyBtn.onclick = () => {
    showPrivate = !showPrivate;
    localStorage.setItem('myNavShowPrivate', showPrivate ? '1' : '0');
    selectedSiteIndex = 0;
    render();
    initScrollSpy();
    renderAZStrip();
  };
}

// ---------- 11. 站长门牌印钮与原地验身交互 (方案 A) ----------
const adminSealBtn = document.getElementById('adminSealBtn');
const adminSealText = document.getElementById('adminSealText');
const loginModalOverlay = document.getElementById('loginModalOverlay');
const loginModalClose = document.getElementById('loginModalClose');
const loginForm = document.getElementById('loginForm');
const loginPassword = document.getElementById('loginPassword');
const loginErrorMsg = document.getElementById('loginErrorMsg');
const loginAuthInfo = document.getElementById('loginAuthInfo');
const loginInputWrap = document.getElementById('loginInputWrap');
const logoutBtn = document.getElementById('logoutBtn');

function updateAuthUI(authed) {
  isAuthed = !!authed;
  if (!adminSealBtn || !adminSealText) return;
  if (isAuthed) {
    adminSealBtn.classList.add('is-authed');
    adminSealText.textContent = '掌柜';
    adminSealBtn.title = '站长已验身（点击打开管理选项）';
  } else {
    adminSealBtn.classList.remove('is-authed');
    adminSealText.textContent = '门牌';
    adminSealBtn.title = '站长登录 / 管理后台';
  }
}

if (adminSealBtn && loginModalOverlay) {
  adminSealBtn.onclick = () => {
    loginModalOverlay.hidden = false;
    if (loginErrorMsg) {
      loginErrorMsg.style.display = 'none';
      loginErrorMsg.textContent = '';
    }
    if (isAuthed) {
      if (loginAuthInfo) loginAuthInfo.style.display = 'block';
      if (loginInputWrap) loginInputWrap.style.display = 'none';
    } else {
      if (loginAuthInfo) loginAuthInfo.style.display = 'none';
      if (loginInputWrap) loginInputWrap.style.display = 'block';
      if (loginPassword) {
        loginPassword.value = '';
        setTimeout(() => loginPassword.focus(), 50);
      }
    }
  };
}

if (loginModalClose && loginModalOverlay) {
  loginModalClose.onclick = () => { loginModalOverlay.hidden = true; };
}
if (loginModalOverlay) {
  loginModalOverlay.addEventListener('click', e => {
    if (e.target === loginModalOverlay) loginModalOverlay.hidden = true;
  });
}

// 站长口令原地验证
if (loginForm) {
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const pwd = (loginPassword ? loginPassword.value : '').trim();
    if (!pwd) return;
    const submitBtn = document.getElementById('loginSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '验证中…';
    }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';

    try {
      const res = await fetch('/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || '验证未通过');
      }

      // 验证成功：原地关闭弹窗，刷新数据以解锁私密书签
      if (loginModalOverlay) loginModalOverlay.hidden = true;
      await refreshSitesData();
    } catch (err) {
      if (loginErrorMsg) {
        loginErrorMsg.textContent = err.message || '口令错误';
        loginErrorMsg.style.display = 'block';
      }
      if (loginPassword) {
        loginPassword.focus();
        loginPassword.select();
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '验 身';
      }
    }
  };
}

// 原地退出登录
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    try {
      await fetch('/admin/logout', {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });
    } catch {}
    if (loginModalOverlay) loginModalOverlay.hidden = true;
    await refreshSitesData();
  };
}

// 数据快照指纹计算：用于比对接口数据是否与当前已渲染内容完全一致
let currentDataFingerprint = '';
function calcDataFingerprint(sites, cats, authed) {
  if (!Array.isArray(sites)) return '';
  const catStr = (cats || []).map(c => typeof c === 'string' ? c : (c ? c.name : '')).join(',');
  const siteStr = sites.map(s => `${s.id || ''}:${s.name}:${s.url}:${s.pinned ? 1 : 0}:${s.private ? 1 : 0}`).join('|');
  return `${authed ? 1 : 0}_${sites.length}_${(cats || []).length}_${catStr}_${siteStr}`;
}

// ---------- 11.5 站点品牌与页脚文案动态同步 ----------
function applySiteConfig(siteTitle, siteFooter) {
  const title = (siteTitle && typeof siteTitle === 'string' && siteTitle.trim()) ? siteTitle.trim() : '书签导航';
  document.title = title;
  const mastText = document.getElementById('mastTitleText');
  if (mastText) mastText.textContent = title;
  const footerTitle = document.getElementById('footerSiteTitle');
  if (footerTitle) footerTitle.textContent = title;
  const loginTitle = document.getElementById('loginModalSiteTitle');
  if (loginTitle) loginTitle.textContent = title;

  const colophon = document.getElementById('footerColophon');
  if (colophon) {
    const footer = (siteFooter && typeof siteFooter === 'string') ? siteFooter.trim() : '';
    if (footer) {
      colophon.textContent = footer;
      colophon.style.display = '';
    } else {
      colophon.textContent = '';
      colophon.style.display = 'none';
    }
  }
}

// 核心拉取函数：拉全量站点＋私密（带 Cookie 鉴权时生效）
async function refreshSitesData() {
  try {
    const r = await fetch('/api/sites', {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    });
    if (!r.ok) return;
    const data = await r.json();
    if (!data) return;

    if (Array.isArray(data.ext_engines)) applyExtEngines(data.ext_engines);

    if (data.site_title !== undefined || data.site_footer !== undefined) {
      applySiteConfig(data.site_title, data.site_footer);
      try {
        if (data.site_title) localStorage.setItem('myNavSiteTitle', data.site_title);
        else localStorage.removeItem('myNavSiteTitle');
        if (data.site_footer) localStorage.setItem('myNavSiteFooter', data.site_footer);
        else localStorage.removeItem('myNavSiteFooter');
      } catch (e) {}
    }

    if (!Array.isArray(data.sites) || data.sites.length === 0) return;

    updateAuthUI(data.authed);

    const newFp = calcDataFingerprint(data.sites, data.categories, data.authed);
    if (newFp === currentDataFingerprint) {
      // 现网数据与本地快照完全一致：直接跳过重渲，杜绝移动端 CLS 抖动与图片重复请求
      return;
    }

    currentDataFingerprint = newFp;
    window.NAV_DATA = data.sites;
    if (Array.isArray(data.categories) && data.categories.length) {
      window.NAV_CATEGORIES = data.categories;
    }
    selectedSiteIndex = 0;
    render();
    initScrollSpy();
    renderAZStrip();
  } catch (e) {
    // 静态数据已渲染，静默保命回退
  }
}

// ---------- 12. 首次渲染与双阶段数据刷新 ----------
try {
  const cachedTitle = localStorage.getItem('myNavSiteTitle');
  const cachedFooter = localStorage.getItem('myNavSiteFooter');
  if (cachedTitle !== null || cachedFooter !== null) {
    applySiteConfig(cachedTitle, cachedFooter);
  }
} catch (e) {}

// 第一阶段：同步渲染静态 data.js 垫底，网站绝对零白屏
currentDataFingerprint = calcDataFingerprint(window.NAV_DATA, window.NAV_CATEGORIES, false);
render();
initScrollSpy();
renderAZStrip();

// 第二阶段：异步吃 D1 接口数据（/api/sites）；若指纹无变化则静默跳过重渲
refreshSitesData();
