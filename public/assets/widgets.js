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
    fetch('/assets/muyu.mp3?v=20261020b')
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
        const a = new Audio('/assets/muyu.mp3?v=20261020b');
        a.playbackRate = pitch;
        a.play().catch(() => {});
      } catch (_) {}
    }
  }

  // 0.5 伏案镇纸兽落压音效：极轻的「笃」（低频正弦 95Hz->36Hz ＋ 短微噪声）
  function playBeastSnapSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 0.08);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);

    try {
      const bufSize = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.35));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 450;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.14, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(t);
    } catch (_) {}
  }

  // 0.6 案头卧黑狸呼噜音效：约 55Hz 振荡＋增益呼吸包络（~2.5秒，低音量平缓呼吸）
  let activePurrStop = null;
  function playCatPurrSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (activePurrStop) {
      try { activePurrStop(); } catch (_) {}
    }
    const t = ctx.currentTime;
    const duration = 2.5;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, t);

    // 微弱低频调频产生呼噜颗粒
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(24, t);
    lfoGain.gain.setValueAtTime(6, t);
    lfo.connect(osc.frequency);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, t);
    // 第一轮呼噜起伏
    masterGain.gain.linearRampToValueAtTime(0.12, t + 0.3);
    masterGain.gain.linearRampToValueAtTime(0.04, t + 1.1);
    // 第二轮呼噜起伏
    masterGain.gain.linearRampToValueAtTime(0.14, t + 1.6);
    masterGain.gain.linearRampToValueAtTime(0.001, t + duration);

    osc.connect(masterGain);
    masterGain.connect(ctx.destination);

    lfo.start(t);
    osc.start(t);
    lfo.stop(t + duration);
    osc.stop(t + duration);

    activePurrStop = () => {
      try {
        masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
        osc.stop();
        lfo.stop();
      } catch (_) {}
    };
  }

  // 0.7 今日特许盘齿轮哒哒声：短冲脉冲高频木齿撞击
  function playWheelTickSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(650 + Math.random() * 80, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.02);
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.022);
  }

  // 0.8 金丝眼镜轻拨歪斜音效：极短的高音金丝金属微鸣 (2200Hz -> 1800Hz)
  function playGlassesClickSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.exponentialRampToValueAtTime(1800, t + 0.05);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // 0.9 镇纸兽金币转运音效：金石铜铃清脆共鸣 (520Hz + 1040Hz)
  function playCoinSpinSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [520, 1040].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(i === 0 ? 0.12 : 0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  // 0.10 睡猫轻揉短呼噜：柔和短促微气流
  function playCatSoftPurrSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(52, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.12);
    gain.gain.linearRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
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
  let summonFloatingBeast = null;
  let summonDeskCat = null;
  let toggleFortuneWheel = null;
  let toggleSealMode = null;

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

    // 绑定扇面各子项 (五件同席)
    const fanWheel = document.getElementById('fanItemWheel');
    const fanMuyu = document.getElementById('fanItemMuyu');
    const fanCat = document.getElementById('fanItemCat');
    const fanBeast = document.getElementById('fanItemBeast');
    const fanSeal = document.getElementById('fanItemSeal');

    if (fanWheel) {
      fanWheel.addEventListener('click', (e) => {
        e.stopPropagation();
        setHubOpen(false);
        if (typeof toggleFortuneWheel === 'function') {
          toggleFortuneWheel();
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

    if (fanCat) {
      fanCat.addEventListener('click', (e) => {
        e.stopPropagation();
        setHubOpen(false);
        if (typeof summonDeskCat === 'function') {
          summonDeskCat();
        }
      });
    }

    if (fanBeast) {
      fanBeast.addEventListener('click', (e) => {
        e.stopPropagation();
        setHubOpen(false);
        if (typeof summonFloatingBeast === 'function') {
          summonFloatingBeast();
        }
      });
    }

    if (fanSeal) {
      fanSeal.addEventListener('click', (e) => {
        e.stopPropagation();
        setHubOpen(false);
        if (typeof toggleSealMode === 'function') {
          toggleSealMode();
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
    // 5.1 伏案镇纸兽 (Paperweight Beast Toy) 控制器
  // ==========================================
  function initPaperweightBeast() {
    const beastToy = document.getElementById('floatingBeastToy');
    const stageEl = document.getElementById('beastStage');
    const closeBtn = document.getElementById('beastCloseBtn');
    const bubbleHint = document.getElementById('beastBubbleHint');
    const fortuneSign = document.getElementById('beastFortuneSign');
    const fortuneText = document.getElementById('beastFortuneText');
    const searchBox = document.querySelector('.search-box');
    const searchInput = document.getElementById('searchInput');

    if (!beastToy || !stageEl) return;

    const BEAST_REPLIES = [
      '放肆！',
      '成何体统！',
      '尔等休得无礼',
      '休得动手动脚',
      '本座正坐镇中'
    ];
    const FORTUNE_CHARS = ['稳', '吉', '镇', '发', '安', '顺', '定', '亨'];

    let origPlaceholder = '';
    let isSnappedToSearch = false;

    function getDefaultPos() {
      const w = beastToy.offsetWidth || 92;
      const h = beastToy.offsetHeight || 92;
      return {
        left: Math.max(16, window.innerWidth - w - 24),
        top: Math.max(60, window.innerHeight - h - 180)
      };
    }

    function restorePosition() {
      try {
        const saved = JSON.parse(localStorage.getItem('beastPos') || 'null');
        if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
          const w = beastToy.offsetWidth || 92;
          const h = beastToy.offsetHeight || 92;
          const left = Math.min(Math.max(10, saved.left), window.innerWidth - w - 10);
          const top = Math.min(Math.max(40, saved.top), window.innerHeight - h - 10);
          beastToy.style.left = `${left}px`;
          beastToy.style.top = `${top}px`;
          beastToy.style.right = 'auto';
          beastToy.style.bottom = 'auto';
          return;
        }
      } catch (_) {}
      const def = getDefaultPos();
      beastToy.style.left = `${def.left}px`;
      beastToy.style.top = `${def.top}px`;
      beastToy.style.right = 'auto';
      beastToy.style.bottom = 'auto';
    }

    function savePos(x, y) {
      try {
        localStorage.setItem('beastPos', JSON.stringify({ left: Math.round(x), top: Math.round(y) }));
      } catch (_) {}
    }

    restorePosition();

    function showBubble(text) {
      if (!bubbleHint) return;
      bubbleHint.textContent = text;
      bubbleHint.hidden = false;
      bubbleHint.style.animation = 'none';
      void bubbleHint.offsetWidth;
      bubbleHint.style.animation = 'beastBubbleFade 2s ease-out forwards';
      setTimeout(() => { bubbleHint.hidden = true; }, 2000);
    }

    function showFortuneSign() {
      if (!fortuneSign || !fortuneText) return;
      playCoinSpinSound();
      stageEl.classList.remove('coin-spin');
      void stageEl.offsetWidth;
      stageEl.classList.add('coin-spin');
      setTimeout(() => stageEl.classList.remove('coin-spin'), 400);

      const ch = FORTUNE_CHARS[Math.floor(Math.random() * FORTUNE_CHARS.length)];
      fortuneText.textContent = ch;
      fortuneSign.hidden = false;
      fortuneSign.style.animation = 'none';
      void fortuneSign.offsetWidth;
      fortuneSign.style.animation = 'beastFortuneSignPop 2s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards';
      setTimeout(() => { fortuneSign.hidden = true; }, 2000);
    }

    function triggerGlassesTilt() {
      playGlassesClickSound();
      stageEl.classList.remove('tilt');
      void stageEl.offsetWidth;
      stageEl.classList.add('tilt');
      setTimeout(() => stageEl.classList.remove('tilt'), 450);

      const reply = BEAST_REPLIES[Math.floor(Math.random() * BEAST_REPLIES.length)];
      setTimeout(() => {
        showBubble(reply);
      }, 200);
    }

    function clearSearchSnap() {
      if (isSnappedToSearch) {
        isSnappedToSearch = false;
        if (searchBox) searchBox.classList.remove('beast-glow');
        if (searchInput && origPlaceholder) {
          searchInput.placeholder = origPlaceholder;
        }
      }
    }

    // 拖动与摸头判定
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let movedDistance = 0;
    let clickTimestamps = [];

    function onPointerDown(e) {
      if (e.target.closest('#beastCloseBtn')) return;
      isDragging = true;
      movedDistance = 0;
      startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      const rect = beastToy.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      beastToy.classList.add('is-dragging');
      if (e.pointerId && typeof beastToy.setPointerCapture === 'function') {
        try { beastToy.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      const dx = clientX - startX;
      const dy = clientY - startY;
      movedDistance = Math.hypot(dx, dy);

      if (movedDistance > 5) {
        const w = beastToy.offsetWidth || 92;
        const h = beastToy.offsetHeight || 92;
        const maxX = Math.max(10, window.innerWidth - w - 10);
        const maxY = Math.max(10, window.innerHeight - h - 10);
        const newX = Math.min(Math.max(10, initialLeft + dx), maxX);
        const newY = Math.min(Math.max(10, initialTop + dy), maxY);

        beastToy.style.left = `${newX}px`;
        beastToy.style.top = `${newY}px`;
        beastToy.style.right = 'auto';
        beastToy.style.bottom = 'auto';
      }
    }

    function onPointerUp(e) {
      if (!isDragging) return;
      isDragging = false;
      beastToy.classList.remove('is-dragging');
      if (e.pointerId && typeof beastToy.releasePointerCapture === 'function') {
        try { beastToy.releasePointerCapture(e.pointerId); } catch (_) {}
      }

      if (movedDistance <= 5) {
        const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        const rect = stageEl.getBoundingClientRect();
        const relX = (clientX - rect.left) / rect.width;
        const relY = (clientY - rect.top) / rect.height;

        // 判定 1: 背上金币区域 (右侧中段，对准图上金币: relX >= 0.70 && relY 0.38~0.72)
        if (relX >= 0.70 && relY >= 0.38 && relY <= 0.72) {
          showFortuneSign();
          return;
        }

        // 判定 2: 鼻尖金丝圆镜区域 (面部正中偏上: relX 0.32~0.68, relY 0.38~0.68)
        if (relX >= 0.32 && relX <= 0.68 && relY >= 0.38 && relY <= 0.68) {
          triggerGlassesTilt();
          return;
        }

        // 判定 3: 摸头压扁回弹与 1 秒 3 击小喷嚏「静气」
        stageEl.classList.remove('squash');
        void stageEl.offsetWidth;
        stageEl.classList.add('squash');
        setTimeout(() => stageEl.classList.remove('squash'), 160);

        const now = Date.now();
        clickTimestamps.push(now);
        clickTimestamps = clickTimestamps.filter(t => now - t <= 1000);
        if (clickTimestamps.length >= 3) {
          clickTimestamps = [];
          stageEl.classList.remove('sneeze');
          void stageEl.offsetWidth;
          stageEl.classList.add('sneeze');
          setTimeout(() => stageEl.classList.remove('sneeze'), 380);
          showBubble('静气');
        }
      } else {
        // 拖动判定区
        const beastRect = beastToy.getBoundingClientRect();
        const beastCenterX = beastRect.left + beastRect.width / 2;
        const beastCenterY = beastRect.top + beastRect.height / 2;

        // A. 判定搜索框吸附
        if (searchBox) {
          const sRect = searchBox.getBoundingClientRect();
          if (beastCenterX >= sRect.left - 20 && beastCenterX <= sRect.right + 40 &&
              beastCenterY >= sRect.top - 50 && beastCenterY <= sRect.bottom + 30) {
            clearSearchSnap();
            isSnappedToSearch = true;
            searchBox.classList.add('beast-glow');
            if (searchInput) {
              if (!origPlaceholder) origPlaceholder = searchInput.placeholder;
              searchInput.placeholder = '神兽坐镇 · 静心思阅';
            }
            const targetLeft = Math.min(Math.max(10, sRect.right - beastRect.width - 6), window.innerWidth - beastRect.width - 10);
            const targetTop = sRect.top - beastRect.height + 14;
            beastToy.style.left = `${targetLeft}px`;
            beastToy.style.top = `${targetTop}px`;
            savePos(targetLeft, targetTop);

            stageEl.classList.remove('squash');
            void stageEl.offsetWidth;
            stageEl.classList.add('squash');
            setTimeout(() => stageEl.classList.remove('squash'), 180);
            playBeastSnapSound();
            return;
          }
        }

        // B. 判定分类标题栏吸附 (.section-head)
        let hitHead = null;
        const heads = document.querySelectorAll('.section-head');
        for (const head of heads) {
          const hr = head.getBoundingClientRect();
          if (beastCenterX >= hr.left - 30 && beastCenterX <= hr.right + 30 &&
              beastRect.bottom >= hr.top - 20 && beastRect.top <= hr.bottom + 25) {
            hitHead = head;
            break;
          }
        }

        if (hitHead) {
          clearSearchSnap();
          const hr = hitHead.getBoundingClientRect();
          const targetLeft = Math.min(Math.max(10, hr.right - beastRect.width - 20), window.innerWidth - beastRect.width - 10);
          const targetTop = hr.top - beastRect.height + 16;

          beastToy.style.left = `${targetLeft}px`;
          beastToy.style.top = `${targetTop}px`;
          savePos(targetLeft, targetTop);

          stageEl.classList.remove('squash');
          void stageEl.offsetWidth;
          stageEl.classList.add('squash');
          setTimeout(() => stageEl.classList.remove('squash'), 180);

          playBeastSnapSound();

          const sec = hitHead.closest('.section, .pinned-section') || hitHead.parentElement;
          if (sec) {
            sec.classList.remove('beast-glow');
            void sec.offsetWidth;
            sec.classList.add('beast-glow');
            setTimeout(() => sec.classList.remove('beast-glow'), 2000);
          }
        } else {
          clearSearchSnap();
          const r = beastToy.getBoundingClientRect();
          savePos(r.left, r.top);
        }
      }
    }

    stageEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    // 双击溜回案角默认位（挂浮件根：指针捕获会把 dblclick 靶心移到根元素）
    beastToy.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      clearSearchSnap();
      const def = getDefaultPos();
      beastToy.style.left = `${def.left}px`;
      beastToy.style.top = `${def.top}px`;
      savePos(def.left, def.top);

      stageEl.classList.remove('squash');
      void stageEl.offsetWidth;
      stageEl.classList.add('squash');
      setTimeout(() => stageEl.classList.remove('squash'), 160);
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSearchSnap();
        beastToy.hidden = true;
        beastToy.style.display = 'none';
      });
    }

    summonFloatingBeast = function () {
      beastToy.hidden = false;
      beastToy.style.display = 'block';
      restorePosition();

      stageEl.classList.remove('squash');
      void stageEl.offsetWidth;
      stageEl.classList.add('squash');
      setTimeout(() => stageEl.classList.remove('squash'), 120);
    };
  }

  // ==========================================
    // 5.2 案头卧黑狸 (Desk Cat Toy) 控制器
  // ==========================================
  function initDeskCat() {
    const catToy = document.getElementById('floatingCatToy');
    const stageEl = document.getElementById('catStage');
    const bodyImg = document.getElementById('catBodyImg');
    const closeBtn = document.getElementById('catCloseBtn');
    const heartIcon = document.getElementById('catHeartIcon');
    const snoozeBubble = document.getElementById('catSnoozeBubble');

    if (!catToy || !stageEl || !bodyImg) return;

    let isAwake = false;
    let awakeTimer = null;
    let activePawPrints = [];
    const MAX_PAWS = 8;
    let isWalking = false;

    function getDefaultPos() {
      const w = catToy.offsetWidth || 96;
      const h = catToy.offsetHeight || 96;
      return {
        left: Math.max(16, window.innerWidth - w - 90),
        top: Math.max(60, window.innerHeight - h - 140)
      };
    }

    function restorePosition() {
      try {
        const saved = JSON.parse(localStorage.getItem('catPos') || 'null');
        if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
          const w = catToy.offsetWidth || 96;
          const h = catToy.offsetHeight || 96;
          const left = Math.min(Math.max(10, saved.left), window.innerWidth - w - 10);
          const top = Math.min(Math.max(40, saved.top), window.innerHeight - h - 10);
          catToy.style.left = `${left}px`;
          catToy.style.top = `${top}px`;
          catToy.style.right = 'auto';
          catToy.style.bottom = 'auto';
          return;
        }
      } catch (_) {}
      const def = getDefaultPos();
      catToy.style.left = `${def.left}px`;
      catToy.style.top = `${def.top}px`;
      catToy.style.right = 'auto';
      catToy.style.bottom = 'auto';
    }

    function savePos(x, y) {
      try {
        localStorage.setItem('catPos', JSON.stringify({ left: Math.round(x), top: Math.round(y) }));
      } catch (_) {}
    }

    restorePosition();

    function setSleepState() {
      isAwake = false;
      isWalking = false;
      catToy.classList.remove('is-walking');
      bodyImg.src = '/assets/cat-sleep.png?v=20261020b';
      if (heartIcon) heartIcon.hidden = true;
      stageEl.style.transform = 'scaleX(1)';
    }

    function setAwakeState() {
      if (isAwake) {
        clearTimeout(awakeTimer);
        awakeTimer = setTimeout(setSleepState, 12000);
        return;
      }
      isAwake = true;
      isWalking = false;
      bodyImg.src = '/assets/cat-awake.png?v=20261020b';

      playCatPurrSound();

      if (heartIcon) {
        heartIcon.hidden = false;
        heartIcon.style.animation = 'none';
        void heartIcon.offsetWidth;
        heartIcon.style.animation = 'catHeartFloat 1.8s ease-out forwards';
        setTimeout(() => { heartIcon.hidden = true; }, 1800);
      }

      clearTimeout(awakeTimer);
      awakeTimer = setTimeout(setSleepState, 12000);
    }

    function dropPawPrint(pageX, pageY) {
      const paw = document.createElement('span');
      paw.className = 'cat-paw-print';
      paw.style.left = `${pageX}px`;
      paw.style.top = `${pageY}px`;
      paw.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><ellipse cx="12" cy="15" rx="5" ry="4" fill="#f4c2a7"/><circle cx="6" cy="8" r="2.2" fill="#f4c2a7"/><circle cx="10" cy="5.5" r="2.2" fill="#f4c2a7"/><circle cx="14" cy="5.5" r="2.2" fill="#f4c2a7"/><circle cx="18" cy="8" r="2.2" fill="#f4c2a7"/></svg>';
      document.body.appendChild(paw);
      activePawPrints.push(paw);

      while (activePawPrints.length > MAX_PAWS) {
        const old = activePawPrints.shift();
        if (old && old.parentNode) old.remove();
      }

      setTimeout(() => {
        if (paw && paw.parentNode) {
          const idx = activePawPrints.indexOf(paw);
          if (idx !== -1) activePawPrints.splice(idx, 1);
          paw.remove();
        }
      }, 2000);
    }

    // 盘睡发呆动作定时器（每隔 24 秒耳动或打鼾气泡）
    setInterval(() => {
      if (isAwake || catToy.hidden || catToy.style.display === 'none') return;
      if (Math.random() < 0.5) {
        stageEl.classList.remove('ear-twitch');
        void stageEl.offsetWidth;
        stageEl.classList.add('ear-twitch');
        setTimeout(() => stageEl.classList.remove('ear-twitch'), 450);
      } else if (snoozeBubble) {
        snoozeBubble.hidden = false;
        snoozeBubble.style.animation = 'none';
        void snoozeBubble.offsetWidth;
        snoozeBubble.style.animation = 'catSnoozeFloat 2.2s ease-out forwards';
        setTimeout(() => { snoozeBubble.hidden = true; }, 2200);
      }
    }, 24000);

    // 拖动与抚摸抓痒判定
    let isTouching = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let strokeDistance = 0;
    let reversals = 0;
    let lastDirX = 0;
    let touchStartTime = 0;

    function onPointerDown(e) {
      if (e.target.closest('#catCloseBtn')) return;
      isTouching = true;
      strokeDistance = 0;
      reversals = 0;
      lastDirX = 0;
      touchStartTime = Date.now();

      startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      lastX = startX;
      lastY = startY;

      const rect = catToy.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      if (e.pointerId && typeof catToy.setPointerCapture === 'function') {
        try { catToy.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }

    function onPointerMove(e) {
      if (!isTouching) return;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      const dx = clientX - lastX;
      const dy = clientY - lastY;
      const stepDist = Math.hypot(dx, dy);
      strokeDistance += stepDist;

      const dirX = Math.sign(dx);
      if (dirX !== 0 && lastDirX !== 0 && dirX !== lastDirX) {
        reversals++;
      }
      if (dirX !== 0) lastDirX = dirX;

      lastX = clientX;
      lastY = clientY;

      const elapsed = Date.now() - touchStartTime;
      // 轻抚下巴或抚摸 0.35s 且横向位移 > 20px 即可快速唤醒
      if (!isAwake && ((reversals >= 2 && strokeDistance > 30) || (elapsed >= 350 && strokeDistance > 25))) {
        setAwakeState();
      }

      const totalDx = clientX - startX;
      const totalDy = clientY - startY;
      if (Math.hypot(totalDx, totalDy) > 15 && reversals <= 1) {
        catToy.classList.add('is-dragging');
        const w = catToy.offsetWidth || 96;
        const h = catToy.offsetHeight || 96;
        const maxX = Math.max(10, window.innerWidth - w - 10);
        const maxY = Math.max(10, window.innerHeight - h - 10);
        const newX = Math.min(Math.max(10, initialLeft + totalDx), maxX);
        const newY = Math.min(Math.max(10, initialTop + totalDy), maxY);
        catToy.style.left = `${newX}px`;
        catToy.style.top = `${newY}px`;
      }
    }

    function onPointerUp(e) {
      if (!isTouching) return;
      isTouching = false;
      catToy.classList.remove('is-dragging');
      if (e.pointerId && typeof catToy.releasePointerCapture === 'function') {
        try { catToy.releasePointerCapture(e.pointerId); } catch (_) {}
      }

      const totalMoved = Math.hypot(lastX - startX, lastY - startY);
      if (totalMoved > 15 && reversals <= 1) {
        const r = catToy.getBoundingClientRect();
        savePos(r.left, r.top);
      } else if (totalMoved <= 5) {
        if (!isAwake) {
          // 睡态轻点：柔和揉肚皮回弹并伴随轻柔呼噜
          stageEl.classList.remove('tummy-squish');
          void stageEl.offsetWidth;
          stageEl.classList.add('tummy-squish');
          setTimeout(() => stageEl.classList.remove('tummy-squish'), 350);
          playCatSoftPurrSound();
        } else {
          // 醒态轻点：微小弹动刷新活跃计时
          stageEl.classList.remove('bounce');
          void stageEl.offsetWidth;
          stageEl.classList.add('bounce');
          setTimeout(() => stageEl.classList.remove('bounce'), 160);
          clearTimeout(awakeTimer);
          awakeTimer = setTimeout(setSleepState, 12000);
        }
      }
    }

    // 双击快速唤醒（挂浮件根：指针捕获会把 dblclick 靶心移到根元素）
    catToy.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      setAwakeState();
    });

    stageEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    // 醒来后光标视线追踪 (左右翻转大金眼)
    document.addEventListener('pointermove', (e) => {
      if (!isAwake || catToy.hidden || isWalking || isTouching) return;
      const rect = catToy.getBoundingClientRect();
      const catCenterX = rect.left + rect.width / 2;
      if (e.clientX < catCenterX - 24) {
        stageEl.style.transform = 'scaleX(-1)';
      } else if (e.clientX > catCenterX + 24) {
        stageEl.style.transform = 'scaleX(1)';
      }
    });

    // 逗猫模式：在页面空白处点击任意位置，黑狸小碎步快跑到达，沿途踩下梅花爪印
    document.addEventListener('click', (e) => {
      if (!isAwake || catToy.hidden || isWalking || isTouching) return;
      const target = e.target;
      if (target && typeof target.closest === 'function') {
        if (target.closest('a, button, input, textarea, select, .card, .modal, .toy-hub-wrap, .floating-beast-toy, .floating-muyu-toy, .floating-cat-toy, .fortune-wheel-modal')) {
          return;
        }
      }

      const rect = catToy.getBoundingClientRect();
      const catW = rect.width;
      const catH = rect.height;
      const startCenterX = rect.left + catW / 2;
      const startCenterY = rect.top + catH / 2;

      const targetX = Math.min(Math.max(16, e.clientX - catW / 2), window.innerWidth - catW - 16);
      const targetY = Math.min(Math.max(40, e.clientY - catH / 2), window.innerHeight - catH - 16);

      const dist = Math.hypot(targetX - rect.left, targetY - rect.top);
      if (dist < 20) return;

      isWalking = true;
      catToy.classList.add('is-walking');
      bodyImg.src = '/assets/cat-stretch.png?v=20261020b';

      // 跑动朝向
      if (targetX < rect.left) {
        stageEl.style.transform = 'scaleX(-1)';
      } else {
        stageEl.style.transform = 'scaleX(1)';
      }

      // 起步爪印
      dropPawPrint(window.scrollX + startCenterX, window.scrollY + startCenterY);

      // 中途与终点爪印
      setTimeout(() => {
        dropPawPrint(window.scrollX + (startCenterX + targetX + catW / 2) / 2, window.scrollY + (startCenterY + targetY + catH / 2) / 2);
      }, 220);

      catToy.style.left = `${targetX}px`;
      catToy.style.top = `${targetY}px`;
      savePos(targetX, targetY);

      setTimeout(() => {
        dropPawPrint(window.scrollX + targetX + catW / 2, window.scrollY + targetY + catH / 2);
        catToy.classList.remove('is-walking');
        isWalking = false;
        if (isAwake) {
          bodyImg.src = '/assets/cat-awake.png?v=20261020b';
        }
      }, 460);

      clearTimeout(awakeTimer);
      awakeTimer = setTimeout(setSleepState, 12000);
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setSleepState();
        catToy.hidden = true;
        catToy.style.display = 'none';
      });
    }

    summonDeskCat = function () {
      catToy.hidden = false;
      catToy.style.display = 'block';
      restorePosition();
      setSleepState();
      stageEl.classList.remove('bounce');
      void stageEl.offsetWidth;
      stageEl.classList.add('bounce');
      setTimeout(() => stageEl.classList.remove('bounce'), 160);
    };
  }

  // ==========================================
  // 5.3 今日特许盘 (Fortune Wheel Toy) 控制器
  // ==========================================
  function initFortuneWheel() {
    const wheelModal = document.getElementById('fortuneWheelModal');
    const rotator = document.getElementById('wheelRotator');
    const labelsContainer = document.getElementById('wheelSectorLabels');
    const spinBtn = document.getElementById('wheelSpinBtn');
    const closeBtn = document.getElementById('wheelCloseBtn');
    const resultSlip = document.getElementById('wheelResultSlip');
    const prizeText = document.getElementById('wheelPrizeText');
    const acceptBtn = document.getElementById('wheelSlipAcceptBtn');

    if (!wheelModal || !rotator || !labelsContainer) return;

    // 八格定稿文案
    const SECTORS = [
      '摸鱼十分钟',
      '喝杯热茶',
      '躺平一会儿',
      '给猫加餐',
      '提早收工',
      '吃点甜的',
      '免谈工作',
      '再转一次'
    ];

    // 由代码排版 8 格扇面文案（字色暖墨、弧线辐射分布）
    labelsContainer.innerHTML = '';
    for (let i = 0; i < SECTORS.length; i++) {
      const deg = i * 45;
      const label = document.createElement('div');
      label.className = 'wheel-sector-label';
      label.style.transform = `rotate(${deg}deg)`;
      label.innerHTML = `<span class="wheel-label-text">${SECTORS[i]}</span>`;
      labelsContainer.appendChild(label);
    }

    let isSpinning = false;
    let currentRotation = 0;

    function spinWheel() {
      if (isSpinning) return;
      isSpinning = true;
      if (spinBtn) spinBtn.disabled = true;
      if (resultSlip) resultSlip.hidden = true;

      // 随机旋转 3.2 ~ 4.2 秒
      const duration = 3200 + Math.random() * 1000;
      const startRot = currentRotation;
      const extraRot = (5 + Math.floor(Math.random() * 4)) * 360 + Math.floor(Math.random() * 8) * 45 + (Math.random() * 16 - 8);
      const targetRot = startRot + extraRot;
      const startTime = performance.now();
      let lastTickAngle = startRot;

      function frame(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        // 三次减速缓动
        const ease = 1 - Math.pow(1 - progress, 3);
        const rot = startRot + extraRot * ease;
        rotator.style.transform = `rotate(${rot}deg)`;

        // 每隔约 32 度木齿撞击一声哒哒
        if (Math.abs(rot - lastTickAngle) >= 32) {
          playWheelTickSound();
          lastTickAngle = rot;
        }

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          currentRotation = targetRot % 360;
          isSpinning = false;

          // 计算指针 (12点钟 0°) 所指扇格
          const normAngle = ((360 - (currentRotation % 360)) % 360 + 360) % 360;
          const winningIdx = Math.floor(((normAngle + 22.5) % 360) / 45) % 8;
          const wonText = SECTORS[winningIdx];

          // 弹出特许签
          if (prizeText) prizeText.textContent = wonText;
          if (resultSlip) resultSlip.hidden = false;

          // 若转到「再转一次」直接可再摇
          if (winningIdx === 7 && spinBtn) {
            spinBtn.disabled = false;
          }
        }
      }

      requestAnimationFrame(frame);
    }

    if (spinBtn) {
      spinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        spinWheel();
      });
    }

    rotator.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isSpinning && (!resultSlip || resultSlip.hidden)) {
        spinWheel();
      }
    });

    if (acceptBtn) {
      acceptBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (resultSlip) resultSlip.hidden = true;
        if (spinBtn) spinBtn.disabled = false;
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        wheelModal.hidden = true;
        wheelModal.style.display = 'none';
        if (resultSlip) resultSlip.hidden = true;
        if (spinBtn) spinBtn.disabled = false;
      });
    }

    // 点击盘外收起签条
    document.addEventListener('click', (e) => {
      if (!wheelModal.hidden && !wheelModal.contains(e.target)) {
        if (resultSlip && !resultSlip.hidden) {
          resultSlip.hidden = true;
          if (spinBtn) spinBtn.disabled = false;
        }
      }
    });

    toggleFortuneWheel = function () {
      if (wheelModal.hidden || wheelModal.style.display === 'none') {
        wheelModal.hidden = false;
        wheelModal.style.display = 'block';
        if (resultSlip) resultSlip.hidden = true;
        if (spinBtn) spinBtn.disabled = false;
      } else {
        wheelModal.hidden = true;
        wheelModal.style.display = 'none';
      }
    };
  }

  // 8. 朱砂闲章 (Leisure Seal) 控制器
  // ==========================================
  let isSealActive = false;
  let activeStamps = [];
  const MAX_STAMPS = 8;

  function initLeisureSeal() {
    const fanSeal = document.getElementById('fanItemSeal');

    // 光标跟随预览框 (仅在支持细精度指针的桌面设备显示)
    const follower = document.createElement('div');
    follower.className = 'leisure-seal-follower';
    follower.setAttribute('aria-hidden', 'true');
    follower.innerHTML = '<span class="follower-text">印</span>';
    document.body.appendChild(follower);

    // 落印模式提示小签（紧凑版，带退出钮，手机端也能关）
    const hintBar = document.createElement('div');
    hintBar.className = 'leisure-seal-hint-bar';
    hintBar.innerHTML = '<span>已执闲章 · 点空白落印</span><button type="button" class="seal-hint-close" aria-label="退出落印">✕</button>';
    document.body.appendChild(hintBar);
    hintBar.querySelector('.seal-hint-close').addEventListener('click', (e) => {
      e.stopPropagation();
      setSealMode(false);
    });

    function setSealMode(active) {
      isSealActive = active;
      if (fanSeal) {
        fanSeal.classList.toggle('seal-active', isSealActive);
        fanSeal.setAttribute('aria-pressed', isSealActive ? 'true' : 'false');
      }
      document.body.classList.toggle('seal-stamping-mode', isSealActive);
      if (isSealActive) {
        hintBar.classList.add('visible');
      } else {
        hintBar.classList.remove('visible');
        follower.classList.remove('visible');
      }
    }

    toggleSealMode = function () {
      setSealMode(!isSealActive);
    };

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
      if (typeof target.closest !== 'function') return false;
      if (target.closest('a, button, input, textarea, select, kbd, label, .modal, .shortcut-modal-card, .floating-muyu-toy, .toy-hub-wrap, .floating-beast-toy, .floating-cat-toy, .fortune-wheel-modal')) {
        return true;
      }
      if (target.closest('.card, .sidebar-index, .toolbar, .masthead, .quick-loc-bar')) {
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
      stampEl.className = 'leisure-seal-stamp len-' + word.length;
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
          setTimeout(() => oldest.remove(), 620);
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
      }, 6000);
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
  // 9. 初始化挂载
  // ==========================================
  function bootstrap() {
    initToyHub();
    initFloatingMuyu();
    initPaperweightBeast();
    initDeskCat();
    initFortuneWheel();
    initLeisureSeal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
