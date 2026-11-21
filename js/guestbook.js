// =========================================================
// 留言箱 —— 读取已公开的留言、提交新留言
// 所有留言内容都用 textContent 插入，绝不当作 HTML 解析
// =========================================================
(function () {
  var form = document.getElementById('gbForm');
  if (!form) return;

  var api = (form.getAttribute('data-api') || '').replace(/\/+$/, '');
  var sitekey = form.getAttribute('data-sitekey') || '';
  var configured = /^https?:\/\//.test(api) && sitekey && sitekey.indexOf('__') !== 0;

  var list = document.getElementById('gbList');
  var empty = document.getElementById('gbEmpty');
  var more = document.getElementById('gbMore');
  var status = document.getElementById('gbStatus');
  var submit = document.getElementById('gbSubmit');
  var count = document.getElementById('gbCount');
  var captchaEl = document.getElementById('gbCaptcha');
  var textarea = form.elements.content;
  var MAX = 500;

  var token = '';
  var widgetId = null;
  var oldest = 0;

  function setStatus(msg, tone) {
    status.textContent = msg || '';
    if (tone) status.setAttribute('data-tone', tone); else status.removeAttribute('data-tone');
  }

  if (!configured) {
    setStatus('留言箱还在搭建中，很快就能用啦。');
    submit.disabled = true;
    empty.hidden = false;
    return;
  }

  // ---------- 字数统计（按字符数，和后端一致） ----------
  function charLen(s) { return Array.from(s).length; }
  function updateCount() {
    var n = charLen(textarea.value);
    count.textContent = n + ' / ' + MAX;
    count.classList.toggle('is-over', n > MAX);
  }
  textarea.addEventListener('input', updateCount);

  // ---------- 时间格式 ----------
  function fmtTime(ms) {
    var d = new Date(ms);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderItem(m) {
    var li = el('li', 'gb-item glass');
    var meta = el('div', 'gb-item__meta');
    meta.appendChild(el('span', 'gb-item__name', m.name || '匿名'));
    var time = el('time', 'gb-item__time', fmtTime(m.created_at));
    time.dateTime = new Date(m.created_at).toISOString();
    meta.appendChild(time);
    li.appendChild(meta);
    li.appendChild(el('p', 'gb-item__text', m.content));
    if (m.reply) {
      var r = el('div', 'gb-item__reply');
      r.appendChild(el('b', null, '涵翌回复'));
      r.appendChild(document.createTextNode(m.reply));
      li.appendChild(r);
    }
    return li;
  }

  // ---------- 读取留言 ----------
  function load() {
    more.disabled = true;
    var url = api + '/api/messages' + (oldest ? '?before=' + oldest : '');
    fetch(url, { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        var msgs = Array.isArray(data.messages) ? data.messages : [];
        msgs.forEach(function (m) { list.appendChild(renderItem(m)); oldest = m.id; });
        empty.hidden = list.children.length > 0;
        more.hidden = !data.more;
      })
      .catch(function () {
        if (!list.children.length) { empty.hidden = false; empty.textContent = '留言暂时加载不出来，稍后再试试。'; }
      })
      .then(function () { more.disabled = false; });
  }
  more.addEventListener('click', load);

  // ---------- Turnstile 人机验证 ----------
  window.__gbTurnstileReady = function () {
    widgetId = window.turnstile.render(captchaEl, {
      sitekey: sitekey,
      theme: 'auto',
      language: 'zh-cn',
      callback: function (t) { token = t; },
      'expired-callback': function () { token = ''; },
      'error-callback': function () { token = ''; setStatus('人机验证加载失败，刷新页面试试。', 'error'); },
    });
  };
  var s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__gbTurnstileReady';
  s.async = true;
  s.onerror = function () { setStatus('人机验证加载失败，可能是网络问题。', 'error'); };
  document.head.appendChild(s);

  function resetCaptcha() {
    token = '';
    if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
  }

  // ---------- 提交 ----------
  var ERRORS = {
    empty: '留言不能是空的哦。',
    too_long: '太长啦，昵称最多 20 字，留言最多 500 字。',
    captcha: '人机验证没通过，请重新验证一下。',
    rate_limited: '发得太快了，休息几分钟再来吧。',
    busy: '待审核的留言太多了，过段时间再来吧。',
    forbidden: '这个页面不能提交留言。',
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.elements.name.value.trim();
    var content = textarea.value.trim();
    if (!content) { setStatus(ERRORS.empty, 'error'); textarea.focus(); return; }
    if (charLen(content) > MAX || charLen(name) > 20) { setStatus(ERRORS.too_long, 'error'); return; }
    if (!token) { setStatus('请先完成上面的人机验证。', 'error'); return; }

    submit.disabled = true;
    setStatus('发送中……');
    fetch(api + '/api/messages', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, content: content, token: token }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok) {
          form.reset(); updateCount();
          setStatus('收到啦！我看过之后就会显示在下面。', 'ok');
        } else {
          setStatus(ERRORS[res.d.error] || '发送失败了，稍后再试试。', 'error');
        }
      })
      .catch(function () { setStatus('网络好像有点问题，稍后再试试。', 'error'); })
      .then(function () { submit.disabled = false; resetCaptcha(); });
  });

  updateCount();
  load();
})();
