/**
 * 日新辑览 · 站内小玩意儿 (widgets.js - 统一浮动入口「偷闲」)
 * 1. 偷闲浮球枢纽 (Toy Hub): 常驻右下角，点开同弧散开两件插画小玩意儿
 * 2. 墨镜木鱼 (Floating Muyu): 可拖动独立浮件、功德累进、整百与随机飘签语
 * 3. 朱砂闲章 (Leisure Seal): 石章插画本体、随手落印、渗墨淡化、防误触穿透
 *
 * 架构规范：
 * - 纯前端驱动：零 /api/* 请求，零 D1/KV 读写，不碰付费线；
 * - 声音资产：木鱼 MP3 为站长本人合成 (MD5: 800bdb45cbd4e299d264ccd41c4a35c9) ＋ 闲章 Web Audio 合成；
 * - 解耦安全：关掉或移除本脚本，完全不影响主站书签检索与核心功能。
 */

(function () {
  'use strict';

  // ==========================================
  // 0. 音效引擎 (Web Audio API 纯合成 + 木鱼真实采样)
  // ==========================================
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

  // 0.4 木鱼真实音频采样加载与定音变调播放 (MD5 严格对齐)
  let muyuAudioBuffer = null;
  let muyuAudioLoading = false;

  function preloadMuyuAudio() {
    if (muyuAudioBuffer || muyuAudioLoading) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    muyuAudioLoading = true;
    fetch('/assets/muyu.mp3?v=20261019c')
      .then(res => res.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => {
        muyuAudioBuffer = decoded;
        muyuAudioLoading = false;
      })
      .catch(() => {
        muyuAudioLoading = false;
      });
  }

  function playMuyuSound(isMuted) {
    if (isMuted) return;
    const ctx = getAudioCtx();
    if (!ctx) return;

    // 每下音高随机 0.97 - 1.03
    const pitch = 0.97 + Math.random() * 0.06;

    if (muyuAudioBuffer) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = muyuAudioBuffer;
        src.playbackRate.setValueAtTime(pitch, ctx.currentTime);
        src.connect(ctx.destination);
        src.start(0);
      } catch (_) {}
    } else {
      // 首次加载未完成或降级时的 HTML5 Audio 回退
      try {
        const a = new Audio('/assets/muyu.mp3?v=20261019c');
        a.playbackRate = pitch;
        a.play().catch(() => {});
      } catch (_) {}
    }
  }

  // ==========================================
  // 1. 墨镜木鱼词库与专属句 (定稿词库照抄不改字)
  // ==========================================
  const MUYU_FORTUNES = [
    '宜躺平，忌瞎忙',
    '功德无量，宜喝口茶',
    '宜摸鱼，忌加班',
    '宜断舍离，忌冲动消费',
    '宜发呆三分钟，忌跟人抬杠',
    '万事顺意，宜给猫加餐',
    '今日宜早睡，说的就是你',
    '好运在攒，别停',
    '宜清空购物车，忌清空钱包',
    '心平气和，宜深呼吸',
    '宜出门走走，忌久坐生根',
    '宜给老友发条消息',
    '烦恼清零，宜吃点甜的',
    '宜把手机放下三分钟'
  ];

  function getMuyuHundredFortune(count) {
    if (count === 500) return '五百功德已满，宜许个愿';
    if (count === 1000) return '一千功德，佛祖看了都点头';
    const idx = Math.floor(Math.random() * MUYU_FORTUNES.length);
    return MUYU_FORTUNES[idx];
  }

  // ==========================================
  // 3. 朱砂闲章印文库
  // ==========================================
  const SEAL_WORDS = [
    '好品', '过眼', '且慢', '知足', '寸锦',
    '随喜', '长乐', '得闲', '清欢', '不染', '未央',
    '常安', '有味',
    '无事忙', '且徐行', '偷得闲', '不着急', '慢些走', '且听风',
    '得闲饮茶', '且慢且行', '偷闲半日', '清风徐来', '万事胜意', '慢工细活'
  ];

  // 全局小玩意儿控制器闭包
  let summonFloatingMuyu = null;
  let summonSealToy = null;

  // ==========================================
  // 4. 偷闲浮球枢纽 (Toy Hub) 控制器
  // ==========================================
  function initToyHub() {
    const hubWrap = document.getElementById('toyHubWrap');
    const hubBtn = document.getElementById('toyHubBtn');
    const fanMenu = document.getElementById('toyFanMenu');

    if (!hubWrap || !hubBtn) return;

    let isHubOpen = false;

    function setHubOpen(open) {
      isHubOpen = open;
      hubWrap.classList.toggle('is-open', isHubOpen);
      hubBtn.setAttribute('aria-expanded', isHubOpen ? 'true' : 'false');
      if (fanMenu) {
        fanMenu.setAttribute('aria-hidden', isHubOpen ? 'false' : 'true');
      }
      if (isHubOpen) {
        preloadMuyuAudio();
      }
    }

    hubBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setHubOpen(!isHubOpen);
    });

    // 绑定扇面各子项
    const fanSeal = document.getElementById('fanItemSeal');
    const fanMuyu = document.getElementById('fanItemMuyu');

    if (fanSeal) {
      fanSeal.addEventListener('click', (e) => {
        e.stopPropagation();
        setHubOpen(false);
        if (typeof summonSealToy === 'function') {
          summonSealToy();
        }
      });
    }

    if (fanMuyu) {
      fanMuyu.addEventListener('click', (e) => {
        e.stopPropagation();
        setHubOpen(false);
        if (typeof summonFloatingMuyu === 'function') {
          summonFloatingMuyu();
        }
      });
    }

    // 点击外部区域或按 Esc 收拢扇面
    document.addEventListener('click', (e) => {
      if (isHubOpen && !hubWrap.contains(e.target)) {
        setHubOpen(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Escape' || e.key === 'Esc') && isHubOpen) {
        setHubOpen(false);
      }
    });

    // 暴露收拢方法供子模块使用
    window.__closeToyHub = () => setHubOpen(false);
  }

  // ==========================================
  // 5. 墨镜木鱼 (Floating Muyu Toy) 控制器
  // ==========================================
  function initFloatingMuyu() {
    const muyuToy = document.getElementById('floatingMuyuToy');
    const stageEl = document.getElementById('muyuStage');
    const countNumEl = document.getElementById('muyuCountNum');
    const muteBtn = document.getElementById('muyuMuteBtn');
    const closeBtn = document.getElementById('muyuCloseBtn');
    const particlesEl = document.getElementById('muyuParticles');
    const bubbleHint = document.getElementById('muyuBubbleHint');

    if (!muyuToy || !stageEl) return;

    // 功德计数初始化
    let muyuCount = parseInt(localStorage.getItem('muyuCount') || '0', 10);
    if (isNaN(muyuCount) || muyuCount < 0) muyuCount = 0;
    if (countNumEl) countNumEl.textContent = String(muyuCount);

    // 静音状态初始化
    let isMuted = localStorage.getItem('muyuMuted') === '1';
    function updateMuteBtnUI() {
      if (!muteBtn) return;
      muteBtn.textContent = isMuted ? '🔕' : '🔔';
      muteBtn.title = isMuted ? '已静音 (点击开启)' : '声音开启 (点击静音)';
    }
    updateMuteBtnUI();

    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMuted = !isMuted;
        localStorage.setItem('muyuMuted', isMuted ? '1' : '0');
        updateMuteBtnUI();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        muyuToy.hidden = true;
        muyuToy.style.display = 'none';
      });
    }

    // 敲击核心调度
    let hitTimer = null;
    let lastSlipAt = -100;
    function knockMuyu() {
      preloadMuyuAudio();
      muyuCount++;
      localStorage.setItem('muyuCount', String(muyuCount));
      if (countNumEl) countNumEl.textContent = String(muyuCount);

      // 槌子敲击与鱼身弹性回弹动效
      stageEl.classList.remove('hit');
      void stageEl.offsetWidth; // 触发重绘
      stageEl.classList.add('hit');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        stageEl.classList.remove('hit');
      }, 100);

      // 音效播放
      playMuyuSound(isMuted);

      // 飘字动效：点一下飘「功德+1」，落点与角度带随机不规则感，渐变上漂
      if (particlesEl) {
        const popup = document.createElement('div');
        popup.className = 'muyu-merit-popup';
        popup.textContent = '功德+1';
        popup.style.left = `${56 + Math.round((Math.random() - 0.5) * 30)}px`;
        popup.style.setProperty('--pop-rot', `${Math.round((Math.random() - 0.5) * 16)}deg`);
        popup.style.animationDuration = `${(0.78 + Math.random() * 0.22).toFixed(2)}s`;
        particlesEl.appendChild(popup);
        setTimeout(() => popup.remove(), 1050);
      }

      // 签语：整百必出（500/1000 专属句），平时随机敲数也偶出（间隔至少 12 下、防刷屏）
      if (particlesEl) {
        let fortuneText = null;
        if (muyuCount % 100 === 0) {
          fortuneText = getMuyuHundredFortune(muyuCount);
          lastSlipAt = muyuCount;
        } else if (muyuCount - lastSlipAt >= 12 && Math.random() < 0.05) {
          fortuneText = MUYU_FORTUNES[Math.floor(Math.random() * MUYU_FORTUNES.length)];
          lastSlipAt = muyuCount;
        }
        if (fortuneText) {
          const slip = document.createElement('div');
          slip.className = 'muyu-fortune-slip';
          slip.textContent = fortuneText;
          particlesEl.appendChild(slip);
          setTimeout(() => slip.remove(), 2400);
        }
      }

      // 首访气泡敲击后淡出并记录
      if (bubbleHint && !bubbleHint.hidden) {
        bubbleHint.style.opacity = '0';
        setTimeout(() => { bubbleHint.hidden = true; }, 300);
        localStorage.setItem('muyuBubbleHintShown', '1');
      }
    }

    // 位置恢复与拖动处理 (轻点是敲、拖动超 5px 算拖不误敲)
    function restorePosition() {
      const saved = localStorage.getItem('muyuPos');
      if (saved) {
        try {
          const pos = JSON.parse(saved);
          if (typeof pos.x === 'number' && typeof pos.y === 'number') {
            const maxX = Math.max(10, window.innerWidth - 165);
            const maxY = Math.max(10, window.innerHeight - 140);
            const clampedX = Math.min(Math.max(10, pos.x), maxX);
            const clampedY = Math.min(Math.max(10, pos.y), maxY);
            muyuToy.style.left = `${clampedX}px`;
            muyuToy.style.top = `${clampedY}px`;
            muyuToy.style.right = 'auto';
            muyuToy.style.bottom = 'auto';
            return;
          }
        } catch (_) {}
      }
      // 默认位置：停在右下角
      muyuToy.style.right = '88px';
      muyuToy.style.bottom = '88px';
      muyuToy.style.left = 'auto';
      muyuToy.style.top = 'auto';
    }

    restorePosition();

    // 拖动与轻点敲击逻辑
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let movedDistance = 0;

    function onPointerDown(e) {
      if (e.target.closest('#muyuMuteBtn, #muyuCloseBtn')) return;
      isDragging = true;
      movedDistance = 0;
      startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      const rect = muyuToy.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      muyuToy.classList.add('is-dragging');
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      const dx = clientX - startX;
      const dy = clientY - startY;
      movedDistance = Math.hypot(dx, dy);

      if (movedDistance > 5) {
        const maxX = Math.max(10, window.innerWidth - 165);
        const maxY = Math.max(10, window.innerHeight - 140);
        const newX = Math.min(Math.max(10, initialLeft + dx), maxX);
        const newY = Math.min(Math.max(10, initialTop + dy), maxY);

        muyuToy.style.left = `${newX}px`;
        muyuToy.style.top = `${newY}px`;
        muyuToy.style.right = 'auto';
        muyuToy.style.bottom = 'auto';
      }
    }

    function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;
      muyuToy.classList.remove('is-dragging');

      if (movedDistance <= 5) {
        // 轻点是敲
        knockMuyu();
      } else {
        // 拖动超 5px 算拖不误敲：存 localStorage
        const rect = muyuToy.getBoundingClientRect();
        localStorage.setItem('muyuPos', JSON.stringify({
          x: Math.round(rect.left),
          y: Math.round(rect.top)
        }));
      }
    }

    // 统一指针事件：鼠标与触摸共用一套，避免触摸端合成鼠标事件导致敲击计数双跳
    stageEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // 唤出木鱼公开调度
    summonFloatingMuyu = function () {
      muyuToy.hidden = false;
      muyuToy.style.display = 'block';
      restorePosition();
      preloadMuyuAudio();

      // 首访出一次气泡提示
      const bubbleShown = localStorage.getItem('muyuBubbleHintShown');
      if (!bubbleShown && bubbleHint) {
        bubbleHint.hidden = false;
        bubbleHint.style.opacity = '1';
        setTimeout(() => {
          if (bubbleHint && !bubbleHint.hidden) {
            bubbleHint.style.opacity = '0';
            setTimeout(() => { bubbleHint.hidden = true; }, 300);
            localStorage.setItem('muyuBubbleHintShown', '1');
          }
        }, 4000);
      }

      // 轻微抖动提示存在
      stageEl.classList.remove('hit');
      void stageEl.offsetWidth;
      stageEl.classList.add('hit');
      setTimeout(() => stageEl.classList.remove('hit'), 120);
    };
  }

  // ==========================================
  // 8. 朱砂闲章 (Leisure Seal) 控制器：拖出实物章、按压落印
  // ==========================================
  let activeStamps = [];
  const MAX_STAMPS = 3;

  function initLeisureSeal() {
    const sealToy = document.getElementById('floatingSealToy');
    const closeBtn = document.getElementById('sealToyCloseBtn');
    if (!sealToy) return;

    // ---------- 落印 ----------
    function stampAt(clientX, clientY) {
      const pageX = clientX + (window.scrollX || 0);
      const pageY = clientY + (window.scrollY || 0);
      playSealSound();
      const word = SEAL_WORDS[Math.floor(Math.random() * SEAL_WORDS.length)];
      const rotate = (Math.random() * 8 - 4).toFixed(1);
      const stampEl = document.createElement('div');
      stampEl.className = 'leisure-seal-stamp len-' + word.length;
      stampEl.style.left = `${pageX}px`;
      stampEl.style.top = `${pageY}px`;
      stampEl.style.setProperty('--stamp-rotate', `${rotate}deg`);
      stampEl.innerHTML = `<div class="stamp-border"><span class="stamp-inner-text">${word}</span></div>`;
      document.body.appendChild(stampEl);
      activeStamps.push(stampEl);
      while (activeStamps.length > MAX_STAMPS) {
        const oldest = activeStamps.shift();
        if (oldest && oldest.parentNode) {
          oldest.classList.add('fading');
          setTimeout(() => oldest.remove(), 620);
        }
      }
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

    // ---------- 位置 ----------
    function restoreSealPosition() {
      try {
        const saved = JSON.parse(localStorage.getItem('sealPos') || 'null');
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
          const maxX = Math.max(10, window.innerWidth - 110);
          const maxY = Math.max(10, window.innerHeight - 120);
          sealToy.style.left = `${Math.min(Math.max(10, saved.x), maxX)}px`;
          sealToy.style.top = `${Math.min(Math.max(10, saved.y), maxY)}px`;
          sealToy.style.right = 'auto';
          sealToy.style.bottom = 'auto';
          return;
        }
      } catch (_) {}
      sealToy.style.right = '104px';
      sealToy.style.bottom = '92px';
      sealToy.style.left = 'auto';
      sealToy.style.top = 'auto';
    }

    function hideSeal() {
      sealToy.hidden = true;
      sealToy.style.display = 'none';
    }

    summonSealToy = function () {
      sealToy.hidden = false;
      sealToy.style.display = 'block';
      restoreSealPosition();
    };

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => { e.stopPropagation(); hideSeal(); });
      closeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    // ---------- 拖动与按压（统一指针事件，轻点=盖印、拖动不误盖） ----------
    let dragging = false, moved = 0, startX = 0, startY = 0, initL = 0, initT = 0;
    sealToy.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#sealToyCloseBtn')) return;
      dragging = true; moved = 0;
      startX = e.clientX; startY = e.clientY;
      const r = sealToy.getBoundingClientRect();
      initL = r.left; initT = r.top;
      sealToy.classList.add('is-dragging');
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      moved = Math.hypot(dx, dy);
      if (moved > 5) {
        const maxX = Math.max(10, window.innerWidth - 110);
        const maxY = Math.max(10, window.innerHeight - 120);
        sealToy.style.left = `${Math.min(Math.max(10, initL + dx), maxX)}px`;
        sealToy.style.top = `${Math.min(Math.max(10, initT + dy), maxY)}px`;
        sealToy.style.right = 'auto';
        sealToy.style.bottom = 'auto';
      }
    });
    window.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      sealToy.classList.remove('is-dragging');
      if (moved <= 5) {
        // 按压落印：章身下压一瞬，印落在章体正下方中心
        sealToy.classList.add('pressing');
        setTimeout(() => sealToy.classList.remove('pressing'), 150);
        const r = sealToy.getBoundingClientRect();
        stampAt(r.left + r.width / 2, r.top + r.height - 4);
      } else {
        const r = sealToy.getBoundingClientRect();
        try { localStorage.setItem('sealPos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (_) {}
      }
    });

    // Esc：收章并清屏印记
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (!sealToy.hidden) hideSeal();
        clearAllStamps();
      }
    });
  }

  // ==========================================
  // 9. 初始化挂载
  // ==========================================
  function bootstrap() {
    initToyHub();
    initFloatingMuyu();
    initLeisureSeal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
