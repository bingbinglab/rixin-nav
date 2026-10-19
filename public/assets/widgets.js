/**
 * 日新辑览 · 站内小玩意儿三件套 (widgets.js)
 * 1. 朱砂闲章 (Leisure Seal)：随手落印、渗墨淡化、防误触穿透、上限控制
 * 2. 退堂日课签 (Daily Oracle)：一日一签、日期哈希种子、贪多晃盒回怼
 * 3. 百衲活字盒 (Movable Type Roller)：滚轮/点击翻滚、公开站点漫游、金色聚焦脉冲
 * 
 * 架构规范：
 * - 纯前端驱动：零 /api/* 请求，零 D1/KV 读写，完全不碰付费线；
 * - 惰性音效：Web Audio 纯振荡器/噪声合成，无需外部音频资源；
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

    // 低频撞击体 (130Hz 衰减至 40Hz)
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

  // 0.2 活字盒音效：铜活字块机械翻滚卡嗒声
  function playRollerTick(freq = 520) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.022);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.022);
  }

  // 0.3 日课签音效：竹木滑开抽动声与回弹轻响
  function playSlipSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(560, t + 0.06);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  // ==========================================
  // 1. 朱砂闲章 (Leisure Seal) 逻辑实现
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
    const sealBtn = document.getElementById('leisureSealBtn');
    if (!sealBtn) return;

    // 创建光标跟随预览框 (仅在支持细精度指针的桌面设备显示)
    const follower = document.createElement('div');
    follower.className = 'leisure-seal-follower';
    follower.setAttribute('aria-hidden', 'true');
    follower.innerHTML = '<span class="follower-text">印</span>';
    document.body.appendChild(follower);

    // 创建落印模式提示条
    const hintBar = document.createElement('div');
    hintBar.className = 'leisure-seal-hint-bar';
    hintBar.setAttribute('aria-hidden', 'true');
    hintBar.innerHTML = '已执朱砂闲章：轻点空白处落印，或按 <kbd>Esc</kbd> 退出';
    document.body.appendChild(hintBar);

    function setSealMode(active) {
      isSealActive = active;
      sealBtn.classList.toggle('seal-active', isSealActive);
      sealBtn.setAttribute('aria-pressed', isSealActive ? 'true' : 'false');
      document.body.classList.toggle('seal-stamping-mode', isSealActive);
      if (isSealActive) {
        hintBar.classList.add('visible');
      } else {
        hintBar.classList.remove('visible');
        follower.classList.remove('visible');
      }
    }

    sealBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setSealMode(!isSealActive);
      // 触屏手机端：如果开启落印模式，给一次触感轻微反馈，并可在屏幕留白直接生成一枚
      if (isSealActive && window.matchMedia('(hover: none)').matches) {
        // 手机端直接盖印在视野黄金分割空白处
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
      if (target.closest('a, button, input, textarea, select, kbd, label, .modal, .shortcut-modal-card, .daily-sign-card')) {
        return true;
      }
      if (target.closest('.card, .sidebar-index, .toolbar, .masthead-side-top, .quick-loc-bar')) {
        // 如果点击的是卡片内部或工具栏内部，禁止盖印
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
      const rotate = (Math.random() * 8 - 4).toFixed(1); // -4deg ~ +4deg 真实手盖倾角

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
  // 2. 退堂日课签 (Daily Oracle) 逻辑实现
  // ==========================================
  // 24 条生活向、带人情味、适度自嘲的松弛日课签文
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

  // 日期哈希种子算法：确保自然日内同一浏览器算出的签文唯一确定
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
    const desktopBox = document.getElementById('dailySignBox');
    const mobileBtn = document.getElementById('mobileDailySignBtn');
    const modal = document.getElementById('dailySignModalOverlay');
    const closeBtn = document.getElementById('dailySignCloseBtn');
    const yiEl = document.getElementById('dailySignYi');
    const jiEl = document.getElementById('dailySignJi');
    const quoteEl = document.getElementById('dailySignQuote');
    const dateEl = document.getElementById('dailySignDate');
    const toast = document.getElementById('dailySignToast');

    if (!modal) return;

    function openSlipModal(slip, todayStr) {
      if (yiEl) yiEl.textContent = slip.yi;
      if (jiEl) jiEl.textContent = slip.ji;
      if (quoteEl) quoteEl.textContent = `“${slip.quote}”`;
      if (dateEl) dateEl.textContent = `${todayStr} · 退堂日课`;
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

    // 晃盒回怼提示
    let toastTimer = null;
    function showRefusalToast(targetEl) {
      if (!toast) return;
      if (targetEl) {
        targetEl.classList.remove('shake');
        void targetEl.offsetWidth; // 触发重绘
        targetEl.classList.add('shake');
      }
      toast.hidden = false;
      toast.classList.add('visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => { toast.hidden = true; }, 300);
      }, 2600);
    }

    // 抽签核心调度
    function triggerDraw(triggerEl) {
      const todayStr = getTodayString();
      const lastDate = localStorage.getItem('dailySign_lastDate');
      const slipIdx = getDailySignIndex(todayStr);
      const slip = DAILY_ORACLE_SLIPS[slipIdx];

      if (lastDate === todayStr) {
        // 当天已抽过：执行晃盒回怼
        showRefusalToast(triggerEl || desktopBox);
      } else {
        // 当天初次抽取：抽签声 + 展现
        playSlipSound();
        localStorage.setItem('dailySign_lastDate', todayStr);
        localStorage.setItem('dailySign_lastIndex', String(slipIdx));
        openSlipModal(slip, todayStr);
      }
    }

    // 重温今日签快捷入口（Toast 内提供）
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

    if (desktopBox) {
      desktopBox.addEventListener('click', () => triggerDraw(desktopBox));
    }
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => triggerDraw(mobileBtn));
    }
  }

  // ==========================================
  // 3. 百衲活字盒 (Movable Type Roller) 逻辑实现
  // ==========================================
  const ROLLER_PHRASES = [
    ['随', '心', '偶', '遇'],
    ['别', '有', '洞', '天'],
    ['信', '手', '翻', '阅'],
    ['偶', '然', '所', '得'],
    ['浮', '生', '偷', '闲'],
    ['字', '里', '行', '间'],
    ['如', '期', '而', '至'],
    ['温', '故', '知', '新']
  ];

  let isRolling = false;

  function initTypeRoller() {
    const shuffleBtn = document.getElementById('typeShuffleBtn');
    if (!shuffleBtn) return;

    const charEls = shuffleBtn.querySelectorAll('.type-char');

    function getRandomPublicSite() {
      const sites = (Array.isArray(window.NAV_DATA) ? window.NAV_DATA : []);
      // 铁律：只抽未登录可见的公开站点，私密站点绝不入池
      const publicSites = sites.filter(s => !s.private && s.name && s.url);
      if (publicSites.length === 0) return null;
      return publicSites[Math.floor(Math.random() * publicSites.length)];
    }

    function locateAndHighlightSite(site) {
      if (!site) return;
      // 若当前处于搜索过滤态，先清空搜索框以还原全量卡片
      const searchInput = document.getElementById('searchInput');
      if (searchInput && searchInput.value) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // 稍候待 DOM 恢复全量可见
      setTimeout(() => {
        const nameEsc = CSS.escape(site.name);
        const card = document.querySelector(`#sections .card[data-name="${nameEsc}"]`) ||
                     document.querySelector(`.card[data-name="${nameEsc}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('card-gold-pulse');
          setTimeout(() => {
            card.classList.remove('card-gold-pulse');
          }, 2800);
        }
      }, 80);
    }

    function startRoll() {
      if (isRolling) return;
      const targetSite = getRandomPublicSite();
      if (!targetSite) return;

      isRolling = true;
      shuffleBtn.classList.add('rolling');

      // 机械齿轮音效与字符 3D 快速轮转
      let tickCount = 0;
      const totalTicks = 12;
      const tickInterval = 85;

      const timer = setInterval(() => {
        tickCount++;
        playRollerTick(480 + (tickCount % 4) * 40);

        // 随机换字符
        const randomPhrase = ROLLER_PHRASES[Math.floor(Math.random() * ROLLER_PHRASES.length)];
        charEls.forEach((el, i) => {
          if (randomPhrase[i]) el.textContent = randomPhrase[i];
        });

        if (tickCount >= totalTicks) {
          clearInterval(timer);
          // 最终停在终选成语
          const finalPhrase = ROLLER_PHRASES[Math.floor(Math.random() * ROLLER_PHRASES.length)];
          charEls.forEach((el, i) => {
            if (finalPhrase[i]) el.textContent = finalPhrase[i];
          });
          playRollerTick(680); // 结束定格重音
          shuffleBtn.classList.remove('rolling');
          isRolling = false;
          locateAndHighlightSite(targetSite);
        }
      }, tickInterval);
    }

    // 桌面端支持鼠标滚轮在按钮上滚动触发，手机/点击支持直接轻触触发
    shuffleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      startRoll();
    });

    shuffleBtn.addEventListener('wheel', (e) => {
      e.preventDefault();
      startRoll();
    }, { passive: false });
  }

  // ==========================================
  // 4. 初始化挂载
  // ==========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initLeisureSeal();
      initDailyOracle();
      initTypeRoller();
    });
  } else {
    initLeisureSeal();
    initDailyOracle();
    initTypeRoller();
  }
})();
