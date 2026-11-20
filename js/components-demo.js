// 组件库页面：动效曲线演示
(function () {
  var demo = document.getElementById('easeDemo');
  var play = document.getElementById('easePlay');
  if (!demo || !play) return;
  function measure() {
    var track = demo.querySelector('.ease-demo__track');
    demo.style.setProperty('--track-w', track.clientWidth + 'px');
  }
  measure(); addEventListener('resize', measure);
  play.addEventListener('click', function () { measure(); demo.classList.toggle('is-play'); });
})();
