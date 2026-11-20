// =========================================================
// 页面最先执行的小脚本（放在 <head> 里同步加载）
// 1. 防止网站被别的网站用 iframe 套住（点击劫持）
// 2. 先应用主题，避免深浅色闪烁
// =========================================================
(function () {
  var root = document.documentElement;

  if (window.top !== window.self) {
    try { window.top.location.href = window.self.location.href; }
    catch (e) { root.style.display = 'none'; }
  }

  root.classList.remove('no-js');
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  } catch (e) {}
})();
