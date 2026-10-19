/**
 * 日新辑览 · 站内小玩意儿三件套 (widgets.js - 返工重做版)
 * 1. 今日签 (Daily Oracle Slip)：竹木签身、功能在脸上、一日一签、晃动回怼
 * 2. 随便逛逛 (Random Wander)：素钮直达、钮旁浮出站名与简介小签、一键新标签打开
 * 3. 朱砂闲章 (Leisure Seal)：石钮印身本体、随手落印、渗墨淡化、防误触穿透
 * 
 * 架构规范：
 * - 纯前端驱动：零 /api/* 请求，零 D1/KV 读写，不碰付费线；
 * - 惰性音效：Web Audio 纯振荡器/噪声算法合成，零外部音频资源下载；
 * - 解耦安全：关掉或移除本脚本，完全不影响主站书签检索与核心功能。
 */

(function () {
  'use strict';

  // ==========================================
  // 0. Web Audio 纯合成音效引擎 (零外部网络请求)
  // ==========================================
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // 0.1 朱砂闲章音效：真实石章着印泥按入宣纸的软胶质撞击与纤维阻尼声
  function playSealSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;

    // 低频撞击体 (130Hz 衰减至 38Hz)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.08);
    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);

    // 软印泥微摩擦白噪声
    try {
      const bufSize = Math.floor(ctx.sampleRate * 0.025);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.3));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 750;
      filter.Q.value = 1.4;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.12, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(t);
    } catch (_) {}
  }

  // 0.2 今日签抽签音效：竹木签滑出轻快声
  function playSlipSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(580, t + 0.065);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.075);
  }

  // 0.3 随便逛逛小签弹出音效：纸墨小签翻开清音
  function playCardFlipSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.05);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // ==========================================
  // 1. 今日签 (Daily Oracle Slip)
  // ==========================================
  // 24 条生活向、带人情味、适度自嘲的松弛日课签文 (文案一字不动)
  const DAILY_ORACLE_SLIPS = [
    { yi: '慢喝热茶', ji: '连轴硬撑', quote: '水泡开了，事总能一件件办。' },
    { yi: '晒晒太阳', ji: '室内发霉', quote: '阳光免费，多照五分钟也是赚。' },
    { yi: '信步闲逛', ji: '原地焦虑', quote: '走一千步，烦恼自然甩掉八百。' },
    { yi: '早点收工', ji: '自我感动', quote: '下班不积极，思想有问题。' },
    { yi: '吃顿好的', ji: '敷衍肠胃', quote: '胃里充实，心里才不发慌。' },
    { yi: '闭目养神', ji: '死盯屏幕', quote: '眼珠子转两圈，世界依旧在转。' },
    { yi: '放过自己', ji: '凡事死磕', quote: '行就行，不行咱换个路子走。' },
    { yi: '买束鲜花', ji: '两手空空', quote: '几块钱的小确幸，桌上立竿见影。' },
    { yi: '断舍离旧物', ji: '舍不得删', quote: '桌面上堆不下的，心里也别攒着。' },
    { yi: '听首老歌', ji: '瞎操闲心', quote: '旋律一响，随别人怎么闹去。' },
    { yi: '说句好话', ji: '满腹牢骚', quote: '好言一句三冬暖，先夸夸自己。' },
    { yi: '倒杯温水', ji: '久坐不动', quote: '关节咔咔响，起来走动两步。' },
    { yi: '发呆片刻', ji: '思维超载', quote: '脑子也得有三两分钟空白留白。' },
    { yi: '发个表情包', ji: '默默潜水', quote: '问候老友一声，何须长篇大论。' },
    { yi: '早睡半点钟', ji: '熬夜报复', quote: '被窝是人类最伟大的避风港。' },
    { yi: '顺其自然', ji: '杞人忧天', quote: '船到桥头自然直，哪怕歪了也是码头。' },
    { yi: '深呼吸三次', ji: '一点就着', quote: '气出病来没人替，心平气和看万物。' },
    { yi: '删掉无用草稿', ji: '纠结沉没', quote: '旧篇翻过去，新页才铺得开。' },
    { yi: '抬头看云', ji: '低头赶路', quote: '今天的云很软，像刚出锅的面包。' },
    { yi: '推掉敷衍局', ji: '硬着头皮', quote: '留出晚上时间，给自己下碗面。' },
    { yi: '信手翻书', ji: '浮躁刷屏', quote: '墨香能压心火，翻两页也是进益。' },
    { yi: '睡个好午觉', ji: '强打精神', quote: '二十分钟小憩，能救半日精气神。' },
    { yi: '先做完小事', ji: '大目标压垮', quote: '叠好衣服也是胜利，一件件来。' },
    { yi: '宽怀一笑', ji: '小事挂怀', quote: '今天天气不错，别让鸡毛蒜皮扫了兴。' }
  ];

  // 日期哈希种子算法
  function getDailySignIndex(dateStr) {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
      hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % DAILY_ORACLE_SLIPS.length;
  }

  function getTodayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function initDailyOracle() {
    const slipBtn = document.getElementById('dailySignSlipBtn');
    const modal = document.getElementById('dailySignModalOverlay');
    const closeBtn = document.getElementById('dailySignCloseBtn');
    const yiEl = document.getElementById('dailySignYi');
    const jiEl = document.getElementById('dailySignJi');
    const quoteEl = document.getElementById('dailySignQuote');
    const dateEl = document.getElementById('dailySignDate');
    const toast = document.getElementById('dailySignToast');

    if (!slipBtn || !modal) return;

    function openSlipModal(slip, todayStr) {
      if (yiEl) yiEl.textContent = slip.yi;
      if (jiEl) jiEl.textContent = slip.ji;
      if (quoteEl) quoteEl.textContent = `“${slip.quote}”`;
      if (dateEl) dateEl.textContent = `${todayStr} · 今日签`;
      modal.hidden = false;
      modal.classList.add('visible');
    }

    function closeModal() {
      modal.classList.remove('visible');
      setTimeout(() => {
        modal.hidden = true;
      }, 200);
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Escape' || e.key === 'Esc') && !modal.hidden) {
        closeModal();
      }
    });

    let toastTimer = null;
    function showRefusalToast() {
      if (!toast) return;
      slipBtn.classList.remove('shake');
      void slipBtn.offsetWidth; // 触发重绘
      slipBtn.classList.add('shake');

      toast.hidden = false;
      toast.classList.add('visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => { toast.hidden = true; }, 300);
      }, 2800);
    }

    // 抽签核心调度
    function triggerDraw() {
      const todayStr = getTodayString();
      const lastDate = localStorage.getItem('dailySign_lastDate');
      const slipIdx = getDailySignIndex(todayStr);
      const slip = DAILY_ORACLE_SLIPS[slipIdx];

      if (lastDate === todayStr) {
        // 当天已抽过：晃动回怼
        showRefusalToast();
      } else {
        // 当天初次抽取
        playSlipSound();
        localStorage.setItem('dailySign_lastDate', todayStr);
        localStorage.setItem('dailySign_lastIndex', String(slipIdx));
        openSlipModal(slip, todayStr);
      }
    }

    // 点击回怼木牌可重温当日签文
    if (toast) {
      toast.addEventListener('click', () => {
        const todayStr = getTodayString();
        const slipIdx = getDailySignIndex(todayStr);
        const slip = DAILY_ORACLE_SLIPS[slipIdx];
        toast.classList.remove('visible');
        toast.hidden = true;
        openSlipModal(slip, todayStr);
      });
    }

    slipBtn.addEventListener('click', triggerDraw);
  }

  // ==========================================
  // 2. 随便逛逛 (Random Wander)
  // ==========================================
  function initRandomWander() {
    const wanderBtn = document.getElementById('randomWanderBtn');
    const popover = document.getElementById('randomSitePopover');
    const closeBtn = document.getElementById('popoverCloseBtn');
    const siteLink = document.getElementById('popoverSiteLink');
    const siteName = document.getElementById('popoverSiteName');
    const siteDesc = document.getElementById('popoverSiteDesc');
    const siteHost = document.getElementById('popoverSiteHost');

    if (!wanderBtn || !popover) return;

    function getRandomPublicSite() {
      const sites = (Array.isArray(window.NAV_DATA) ? window.NAV_DATA : []);
      // 铁律：只抽未登录可见的公开站点，私密站点绝不入池
      const publicSites = sites.filter(s => !s.private && s.name && s.url);
      if (publicSites.length === 0) return null;
      return publicSites[Math.floor(Math.random() * publicSites.length)];
    }

    function getHostFromUrl(url) {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch (_) {
        return url;
      }
    }

    function showRandomSite() {
      const site = getRandomPublicSite();
      if (!site) return;

      playCardFlipSound();

      if (siteName) siteName.textContent = site.name || '未知站点';
      if (siteDesc) siteDesc.textContent = site.desc || '随采随辑，常开常顾。';
      if (siteHost) siteHost.textContent = getHostFromUrl(site.url);
      if (siteLink) siteLink.href = site.url;

      popover.hidden = false;
      popover.classList.add('visible');
    }

    function closePopover() {
      popover.classList.remove('visible');
      setTimeout(() => {
        popover.hidden = true;
      }, 150);
    }

    wanderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showRandomSite();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closePopover();
      });
    }

    // 点击小签在新标签直达并自动收起小签
    if (siteLink) {
      siteLink.addEventListener('click', () => {
        setTimeout(closePopover, 200);
      });
    }

    // 点击外部区域或按 Esc 关闭
    document.addEventListener('click', (e) => {
      if (!popover.hidden && !popover.contains(e.target) && e.target !== wanderBtn) {
        closePopover();
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Escape' || e.key === 'Esc') && !popover.hidden) {
        closePopover();
      }
    });
  }

  // ==========================================
  // 3. 朱砂闲章 (Leisure Seal)
  // ==========================================
  const SEAL_WORDS = [
    '好品', '过眼', '无事忙', '且慢', '知足', '寸锦',
    '随喜', '长乐', '得闲', '清欢', '不染', '未央',
    '常安', '有味'
  ];

  let isSealActive = false;
  let activeStamps = [];
  const MAX_STAMPS = 3;

  function initLeisureSeal() {
    const stampToy = document.getElementById('leisureStampToy');
    if (!stampToy) return;

    // 光标跟随预览框 (仅在支持细精度指针的桌面设备显示)
    const follower = document.createElement('div');
    follower.className = 'leisure-seal-follower';
    follower.setAttribute('aria-hidden', 'true');
    follower.innerHTML = '<span class="follower-text">印</span>';
    document.body.appendChild(follower);

    // 落印模式提示条
    const hintBar = document.createElement('div');
    hintBar.className = 'leisure-seal-hint-bar';
    hintBar.setAttribute('aria-hidden', 'true');
    hintBar.innerHTML = '已执朱砂闲章：轻点空白处落印，或按 <kbd>Esc</kbd> 退出';
    document.body.appendChild(hintBar);

    function setSealMode(active) {
      isSealActive = active;
      stampToy.classList.toggle('seal-active', isSealActive);
      stampToy.setAttribute('aria-pressed', isSealActive ? 'true' : 'false');
      document.body.classList.toggle('seal-stamping-mode', isSealActive);
      if (isSealActive) {
        hintBar.classList.add('visible');
      } else {
        hintBar.classList.remove('visible');
        follower.classList.remove('visible');
      }
    }

    stampToy.addEventListener('click', (e) => {
      e.stopPropagation();
      setSealMode(!isSealActive);
      // 触屏手机端：如果开启落印模式，在视口留白直接落印一枚
      if (isSealActive && window.matchMedia('(hover: none)').matches) {
        stampAt(window.innerWidth / 2, window.innerHeight * 0.42);
      }
    });

    // 鼠标移动跟随
    document.addEventListener('mousemove', (e) => {
      if (!isSealActive) return;
      follower.classList.add('visible');
      follower.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    });

    // 点击页面任意留白处落印
    document.addEventListener('click', (e) => {
      if (!isSealActive) return;

      // 严禁落在链接、按钮、输入框、卡片等交互元素上
      if (isInteractiveTarget(e.target)) {
        return;
      }

      stampAt(e.clientX, e.clientY);
    });

    // 按 Esc 键清屏全部印迹并退出落印模式
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (isSealActive) {
          setSealMode(false);
        }
        clearAllStamps();
      }
    });

    function isInteractiveTarget(target) {
      if (!target || target === document.body || target === document.documentElement) return false;
      if (target.closest('a, button, input, textarea, select, kbd, label, .modal, .shortcut-modal-card, .daily-sign-card, .random-site-popover')) {
        return true;
      }
      if (target.closest('.card, .sidebar-index, .toolbar, .masthead, .quick-loc-bar, .dock-section')) {
        return true;
      }
      return false;
    }

    function stampAt(clientX, clientY) {
      const scrollX = window.scrollX || document.documentElement.scrollLeft;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const pageX = clientX + scrollX;
      const pageY = clientY + scrollY;

      playSealSound();

      const word = SEAL_WORDS[Math.floor(Math.random() * SEAL_WORDS.length)];
      const rotate = (Math.random() * 8 - 4).toFixed(1); // -4deg ~ +4deg 真实手盖微倾角

      const stampEl = document.createElement('div');
      stampEl.className = 'leisure-seal-stamp';
      stampEl.style.left = `${pageX}px`;
      stampEl.style.top = `${pageY}px`;
      stampEl.style.setProperty('--stamp-rotate', `${rotate}deg`);

      stampEl.innerHTML = `
        <div class="stamp-border">
          <span class="stamp-inner-text">${word}</span>
        </div>
      `;

      document.body.appendChild(stampEl);
      activeStamps.push(stampEl);

      // 上限管控：同屏印记 ≤ 3 枚，超出者立即平滑淡出销毁
      while (activeStamps.length > MAX_STAMPS) {
        const oldest = activeStamps.shift();
        if (oldest && oldest.parentNode) {
          oldest.classList.add('fading');
          setTimeout(() => oldest.remove(), 400);
        }
      }

      // 8 秒后自然淡化消失
      setTimeout(() => {
        if (stampEl && stampEl.parentNode) {
          stampEl.classList.add('fading');
          setTimeout(() => {
            const idx = activeStamps.indexOf(stampEl);
            if (idx !== -1) activeStamps.splice(idx, 1);
            stampEl.remove();
          }, 800);
        }
      }, 8000);
    }

    function clearAllStamps() {
      activeStamps.forEach(el => {
        if (el && el.parentNode) {
          el.classList.add('fading');
          setTimeout(() => el.remove(), 300);
        }
      });
      activeStamps = [];
    }
  }

  // ==========================================
  // 4. 初始化挂载
  // ==========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initDailyOracle();
      initRandomWander();
      initLeisureSeal();
    });
  } else {
    initDailyOracle();
    initRandomWander();
    initLeisureSeal();
  }
})();
