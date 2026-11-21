// =========================================================
// 留言管理 —— 审核 / 撤回 / 回复 / 删除
// 管理密码只存在 sessionStorage（关掉标签页即清除）
// =========================================================
(function () {
  var login = document.getElementById('admLogin');
  if (!login) return;

  var api = (login.getAttribute('data-api') || '').replace(/\/+$/, '');
  var panel = document.getElementById('admPanel');
  var list = document.getElementById('admList');
  var empty = document.getElementById('admEmpty');
  var status = document.getElementById('admStatus');
  var logout = document.getElementById('admLogout');
  var tabs = document.querySelectorAll('.gb-tabs [data-status]');
  var KEY = 'gb-admin-token';
  var current = 'pending';

  function setStatus(msg, tone) {
    status.textContent = msg || '';
    if (tone) status.setAttribute('data-tone', tone); else status.removeAttribute('data-tone');
  }
  if (!/^https?:\/\//.test(api)) { setStatus('还没有配置后端地址。', 'error'); return; }

  function getToken() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch (e) {} }
  var memToken = getToken();

  function call(method, path, body) {
    var opts = {
      method: method,
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + memToken },
    };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(api + path, opts).then(function (r) {
      if (r.status === 401) { signOut(); throw new Error('密码不对，或已失效。'); }
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error('操作失败（' + (d.error || r.status) + '）');
        return d;
      });
    });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, cls, fn) {
    var b = el('button', 'btn btn--sm ' + cls, label);
    b.type = 'button';
    b.addEventListener('click', function () {
      b.disabled = true;
      Promise.resolve(fn()).catch(function (err) { setStatus(err.message, 'error'); }).then(function () { b.disabled = false; });
    });
    return b;
  }
  function fmtTime(ms) { return new Date(ms).toLocaleString('zh-CN', { hour12: false }); }

  function renderItem(m) {
    var li = el('li', 'gb-item glass');
    var meta = el('div', 'gb-item__meta');
    meta.appendChild(el('span', 'gb-item__name', m.name || '匿名'));
    meta.appendChild(el('span', 'gb-item__time', '#' + m.id + ' · ' + fmtTime(m.created_at)));
    li.appendChild(meta);
    li.appendChild(el('p', 'gb-item__text', m.content));
    if (m.reply) {
      var r = el('div', 'gb-item__reply');
      r.appendChild(el('b', null, '我的回复'));
      r.appendChild(document.createTextNode(m.reply));
      li.appendChild(r);
    }

    var actions = el('div', 'cluster gb-item__actions');
    if (m.approved) {
      actions.appendChild(btn('撤回（不公开）', 'btn--glass', function () {
        return call('POST', '/api/admin/messages/' + m.id, { approved: 0 }).then(refresh);
      }));
    } else {
      actions.appendChild(btn('通过并公开', 'btn--primary', function () {
        return call('POST', '/api/admin/messages/' + m.id, { approved: 1 }).then(refresh);
      }));
    }
    actions.appendChild(btn(m.reply ? '改回复' : '回复', 'btn--glass', function () {
      var text = window.prompt('回复内容（留空则删除回复，最多 500 字）：', m.reply || '');
      if (text === null) return;
      return call('POST', '/api/admin/messages/' + m.id, { reply: text.trim() || null }).then(refresh);
    }));
    actions.appendChild(btn('删除', 'btn--ghost', function () {
      if (!window.confirm('确定永久删除这条留言吗？删除后无法恢复。')) return;
      return call('DELETE', '/api/admin/messages/' + m.id).then(refresh);
    }));
    li.appendChild(actions);
    return li;
  }

  function refresh() {
    return call('GET', '/api/admin/messages?status=' + current).then(function (d) {
      list.textContent = '';
      (d.messages || []).forEach(function (m) { list.appendChild(renderItem(m)); });
      empty.hidden = list.children.length > 0;
      setStatus('共 ' + list.children.length + ' 条' + (current === 'pending' ? '待审核' : '已公开') + '留言。');
    });
  }

  function signIn() {
    panel.hidden = false; logout.hidden = false;
    login.elements.token.value = '';
    return refresh().catch(function (err) { setStatus(err.message, 'error'); });
  }
  function signOut() {
    memToken = ''; setToken('');
    panel.hidden = true; logout.hidden = true; list.textContent = '';
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      current = t.getAttribute('data-status');
      tabs.forEach(function (o) { o.setAttribute('aria-pressed', String(o === t)); });
      refresh().catch(function (err) { setStatus(err.message, 'error'); });
    });
  });

  login.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = login.elements.token.value.trim();
    if (!t) return;
    memToken = t; setToken(t);
    setStatus('登录中……');
    signIn();
  });
  logout.addEventListener('click', function () { signOut(); setStatus('已退出。'); });

  if (memToken) signIn();
})();
