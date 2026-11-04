/**
 * 日新辑览 · 一言 (hitokoto.js)
 * 搜索框下方一行随机句子，点击换一句。
 * 数据来自第三方公开接口 api.furry.ist（免 Key、全分类随机）；
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
  var loading = false;

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
        textEl.textContent = d.hitokoto;
        var attr = '';
        if (d.from) attr = '《' + d.from + '》';
        if (d.from_who) attr += (attr ? ' · ' : '') + d.from_who;
        fromEl.textContent = attr ? '—— ' + attr : '';
        bar.hidden = false;
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
  load();
})();
