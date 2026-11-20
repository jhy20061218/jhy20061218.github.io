// =========================================================
// 交互脚本 —— 无依赖
// 主题 · 页内路由 · 导航指示块 · 滚动渐入 · 微交互
// =========================================================
(function () {
  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ---------- 深浅色切换 ----------
  var themeBtn = document.getElementById('themeBtn');
  function currentTheme() {
    var t = root.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  // ---------- 年份 ----------
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // ---------- 滚动渐入 ----------
  var revealObs = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); revealObs.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;

  function reveal(scope) {
    var items = scope.querySelectorAll('[data-reveal]');
    items.forEach(function (el, i) {
      el.style.setProperty('--i', Math.min(i, 8));
      if (!revealObs || reduceMotion) { el.classList.add('is-in'); return; }
      el.classList.remove('is-in');
      revealObs.unobserve(el);
    });
    if (!revealObs || reduceMotion) return;
    // 等一帧让“隐藏”状态先生效，再开始观察
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { items.forEach(function (el) { revealObs.observe(el); }); });
    });
  }

  // ---------- 页内路由：点导航只换内容，不开新标签页 ----------
  var views = document.querySelectorAll('.view');
  var links = document.querySelectorAll('.nav__link');
  var indicator = document.querySelector('.nav__indicator');

  function moveIndicator() {
    if (!indicator) return;
    var active = document.querySelector('.nav__link.is-active');
    if (!active) { indicator.style.setProperty('--o', 0); return; }
    indicator.style.setProperty('--x', active.offsetLeft + 'px');
    indicator.style.setProperty('--w', active.offsetWidth + 'px');
    indicator.style.setProperty('--o', 1);
  }

  function show() {
    var id = location.hash.slice(1) || 'home';
    var target = document.getElementById(id);
    if (!target || !target.classList.contains('view')) { id = 'home'; target = document.getElementById('home'); }
    views.forEach(function (v) { v.hidden = v.id !== id; });
    var navId = target.getAttribute('data-parent') || id;
    links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + navId); });
    moveIndicator();
    root.setAttribute('data-view', id);
    window.dispatchEvent(new CustomEvent('viewchange', { detail: { id: id } }));
    window.scrollTo(0, 0);
    reveal(target);
  }

  if (!views.length) {
    // 没有多视图的普通页面（如组件库）：只做滚动渐入
    reveal(document);
  } else {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', show);
  window.addEventListener('popstate', show);
  window.addEventListener('resize', moveIndicator);
  // 拦截页内链接：自己切换内容，避免浏览器跳到锚点位置
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var id = a.getAttribute('href').slice(1);
    var el = document.getElementById(id);
    if (!el || !el.classList.contains('view')) return;
    e.preventDefault();
    if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
    show();
  });
  show();
  // 字体加载后宽度可能变化，重新对齐指示块
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveIndicator);
  }

  // ---------- 微交互：点击涟漪 ----------
  document.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest && e.target.closest('.btn');
    if (!btn || reduceMotion) return;
    var r = btn.getBoundingClientRect();
    var s = document.createElement('span');
    s.className = 'ripple';
    s.style.left = (e.clientX - r.left) + 'px';
    s.style.top = (e.clientY - r.top) + 'px';
    btn.appendChild(s);
    s.addEventListener('animationend', function () { s.remove(); });
  });

  if (canHover && !reduceMotion) {
    // ---------- 微交互：磁吸按钮 ----------
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        el.style.setProperty('--mx', (dx * 0.22).toFixed(1) + 'px');
        el.style.setProperty('--my', (dy * 0.32).toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--mx', '0px');
        el.style.setProperty('--my', '0px');
      });
    });

    // ---------- 微交互：卡片 3D 倾斜 + 追光 ----------
    document.querySelectorAll('[data-tilt]').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        card.classList.add('is-tilting');
        card.style.setProperty('--ry', ((px - 0.5) * 10).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - py) * 10).toFixed(2) + 'deg');
        card.style.setProperty('--sx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--sy', (py * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', function () {
        card.classList.remove('is-tilting');   // 交给弹簧曲线回正
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  // ---------- 邮箱：HTML 里倒序存放，这里还原（防爬虫） ----------
  var emailEl = document.getElementById('email');
  var email = emailEl ? (emailEl.getAttribute('data-email') || '').split('').reverse().join('') : '';
  if (email) {
    emailEl.textContent = email;
    var mailBtn = document.getElementById('mailBtn');
    if (mailBtn) mailBtn.href = 'mailto:' + email;
  }

  // ---------- 复制邮箱 ----------
  var copyBtn = document.getElementById('copyBtn');
  if (copyBtn && email) {
    copyBtn.addEventListener('click', function () {
      var text = email;
      var label = copyBtn.querySelector('span');
      var use = copyBtn.querySelector('use');
      function done() {
        label.textContent = '已复制';
        if (use) use.setAttribute('href', '#i-check');
        setTimeout(function () {
          label.textContent = '复制邮箱';
          if (use) use.setAttribute('href', '#i-copy');
        }, 1600);
      }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { if (document.execCommand('copy')) done(); } catch (e) {}
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else { fallback(); }
    });
  }
})();
