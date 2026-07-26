/* 默·博客 — 后台交互:确认对话框 + 写作页实时预览 */
(function () {
  'use strict';

  // 删除/重置等操作的确认(与设计稿的 confirm 行为一致)
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.dataset && f.dataset.confirm && !window.confirm(f.dataset.confirm)) {
      e.preventDefault();
    }
  });

  // 使用中的分类不可删除(与设计稿的 alert 行为一致)
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-alert]');
    if (el) { e.preventDefault(); window.alert(el.dataset.alert); }
  });

  // 写作页:Markdown 实时预览 + 字数统计
  var ta = document.getElementById('ed-content');
  var pv = document.getElementById('ed-preview');
  var wc = document.getElementById('ed-wordcount');
  if (ta && pv && window.MoMD) {
    var render = function () {
      var src = ta.value;
      pv.innerHTML = src.trim()
        ? window.MoMD.mdToHtml(src)
        : '<p class="ed-preview-empty">预览会随左侧输入实时更新。</p>';
      if (wc) wc.textContent = String(src.replace(/\s/g, '').length);
    };
    ta.addEventListener('input', render);
  }
})();
