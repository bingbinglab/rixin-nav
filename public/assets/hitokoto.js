/**
 * 日新辑览 · 一言 (hitokoto.js)
 * 搜索框下方一行随机句子，点击换一句。
 * 数据来自第三方公开接口 api.furry.ist（免 Key、全分类随机）；
 * 接口响应慢（实测 1.4–2.9 秒），故用 localStorage 缓存上一句：
 * 打开页面先秒显缓存句，后台拉到新句再替换并更新缓存。
 * 纯前端装饰：拉不到/超时/接口异常时整行保持隐藏，移除本脚本不影响主站。
 */
(function () {
  'use strict';

  var bar = document.getElementById('hitokotoBar');
  if (!bar) return;
  var textEl = document.getElementById('hitokotoText');
  var fromEl = document.getElementById('hitokotoFrom');
  if (!textEl || !fromEl) return;

  var API = 'https://api.furry.ist/hitokoto?max_length=30';
  var CACHE_KEY = 'rixin-hitokoto';
  var loading = false;

  function render(d) {
    textEl.textContent = d.hitokoto;
    var attr = '';
    if (d.from) attr = '《' + d.from + '》';
    if (d.from_who) attr += (attr ? ' · ' : '') + d.from_who;
    fromEl.textContent = attr ? '—— ' + attr : '';
    bar.hidden = false;
  }

  function readCache() {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      return (d && d.hitokoto) ? d : null;
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
    bar.classList.add('hitokoto-loading');

    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 6000) : null;

    fetch(API, ctl ? { signal: ctl.signal } : undefined)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (timer) clearTimeout(timer);
        loading = false;
        bar.classList.remove('hitokoto-loading');
        if (!d || d.code || !d.hitokoto) {
          if (!textEl.textContent) bar.hidden = true;
          return;
        }
        render(d);
        writeCache(d);
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        loading = false;
        bar.classList.remove('hitokoto-loading');
        if (!textEl.textContent) bar.hidden = true;
      });
  }

  bar.title = '一言 · 点击换一句';
  bar.addEventListener('click', load);

  var cached = readCache();
  if (cached) render(cached);
  load();
})();
