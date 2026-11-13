/**
 * 日新辑览 · 一言题记 (hitokoto.js)
 * 报头底部题记一行。数据来自第三方公开接口 api.furry.ist（免 Key、全分类随机）。
 * 展示口径（2026-11-13 题记化）：一次访问内稳定展示一句，阅读期间不自动替换——
 * 先读 localStorage 缓存秒显，有缓存就不再后台拉取；无缓存才拉一次。
 * 换句只走行末「换一句」小入口，加载反馈只作用于入口本身，原句保持清晰。
 * 接口拉不到/超时/异常时保留当前显示（无缓存时即 HTML 里的站铭兜底），
 * 纯前端装饰：移除本脚本不影响主站。
 */
(function () {
  'use strict';

  var bar = document.getElementById('hitokotoBar');
  if (!bar) return;
  var textEl = document.getElementById('hitokotoText');
  var fromEl = document.getElementById('hitokotoFrom');
  var refreshBtn = document.getElementById('hitokotoRefresh');
  if (!textEl || !fromEl || !refreshBtn) return;

  var API = 'https://api.furry.ist/hitokoto?max_length=30';
  var CACHE_KEY = 'rixin-hitokoto';
  var loading = false;

  function render(d) {
    textEl.textContent = d.hitokoto;
    var attr = '';
    if (d.from) attr = '《' + d.from + '》';
    if (d.from_who) attr += (attr ? ' · ' : '') + d.from_who;
    fromEl.textContent = attr ? '—— ' + attr : '';
  }

  function readCache() {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      // hitokoto 必须是真字符串才认缓存：{hitokoto:{}} 这类真值非串会被 textContent 渲染成 [object Object]
      return (d && typeof d.hitokoto === 'string' && d.hitokoto) ? d : null;
    } catch (e) {
      return null;
    }
  }

  function writeCache(d) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({
        hitokoto: d.hitokoto,
        from: d.from || '',
        from_who: d.from_who || ''
      }));
    } catch (e) {
      /* 缓存写不进不影响显示 */
    }
  }

  function load() {
    if (loading) return;
    loading = true;
    refreshBtn.classList.add('is-loading');

    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 6000) : null;

    function done() {
      if (timer) clearTimeout(timer);
      loading = false;
      refreshBtn.classList.remove('is-loading');
    }

    fetch(API, ctl ? { signal: ctl.signal } : undefined)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        done();
        if (!d || d.code || !d.hitokoto) return; // 拉不到保留当前显示
        render(d);
        writeCache(d);
      })
      .catch(function () {
        done(); // 失败保留当前显示（站铭或上一句）
      });
  }

  refreshBtn.addEventListener('click', load);

  var cached = readCache();
  if (cached) render(cached);
  else load();
})();
