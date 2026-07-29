/* 默·博客 — 后台交互:确认对话框 + 写作页实时预览 + 防丢稿自动暂存 */
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

  var savedDraft = new URLSearchParams(window.location.search).get('savedDraft');
  if (window.sessionStorage) {
    try {
      if (savedDraft && window.localStorage && sessionStorage.getItem('mo-saved-draft') === savedDraft) {
        localStorage.removeItem('mo-draft-' + savedDraft);
      }
      sessionStorage.removeItem('mo-saved-draft');
    } catch (e) { /* 忽略 */ }
  }

  // 写作页:Markdown 实时预览 + 字数统计
  var ta = document.getElementById('ed-content');
  var pv = document.getElementById('ed-preview');
  var wc = document.getElementById('ed-wordcount');
  var render = null;
  if (ta && pv && window.MoMD) {
    render = function () {
      var src = ta.value;
      pv.innerHTML = src.trim()
        ? window.MoMD.mdToHtml(src)
        : '<p class="ed-preview-empty">预览会随左侧输入实时更新。</p>';
      if (wc) wc.textContent = String(src.replace(/\s/g, '').length);
    };
    ta.addEventListener('input', render);
  }

  // 写作页:自动暂存到 localStorage(崩溃/误关页面不丢稿;提交成功即清除)
  var form = ta && ta.closest('form');
  if (form && window.localStorage) {
    var idInput = form.querySelector('input[name="id"]');
    var fields = {
      title: form.querySelector('input[name="title"]'),
      cat: form.querySelector('select[name="cat"]'),
      tags: form.querySelector('input[name="tags"]'),
      content: ta
    };
    var key = 'mo-draft-' + (idInput ? idInput.value : 'new');
    var timer = null;

    var snapshot = function () {
      return {
        title: fields.title ? fields.title.value : '',
        cat: fields.cat ? fields.cat.value : '',
        tags: fields.tags ? fields.tags.value : '',
        content: ta.value,
        ts: Date.now()
      };
    };
    var save = function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        try { localStorage.setItem(key, JSON.stringify(snapshot())); } catch (e) { /* 空间满则放弃 */ }
      }, 400);
    };
    ['title', 'tags'].forEach(function (k) { if (fields[k]) fields[k].addEventListener('input', save); });
    if (fields.cat) fields.cat.addEventListener('change', save);
    ta.addEventListener('input', save);
    form.addEventListener('submit', function () {
      clearTimeout(timer);
      try {
        localStorage.setItem(key, JSON.stringify(snapshot()));
        sessionStorage.setItem('mo-saved-draft', idInput ? idInput.value : 'new');
      } catch (e) { /* 忽略 */ }
    });

    // 进入页面:若存在与当前内容不同的暂存稿,给一条恢复提示
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { stored = null; }
    var differs = stored && (
      stored.content !== ta.value ||
      (fields.title && stored.title !== fields.title.value) ||
      (fields.tags && stored.tags !== fields.tags.value)
    );
    if (differs) {
      var mins = Math.max(1, Math.round((Date.now() - (stored.ts || 0)) / 60000));
      var bar = document.createElement('div');
      bar.className = 'draft-restore';
      var text = document.createElement('span');
      text.textContent = '发现约 ' + (mins >= 60 ? Math.round(mins / 60) + ' 小时' : mins + ' 分钟') + '前的未提交暂存稿。';
      var ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'btn btn-ghost'; ok.textContent = '恢复暂存稿';
      var no = document.createElement('button');
      no.type = 'button'; no.className = 'btn btn-ghost muted'; no.textContent = '丢弃';
      bar.appendChild(text); bar.appendChild(ok); bar.appendChild(no);
      form.insertBefore(bar, form.querySelector('.editor-grid'));
      ok.addEventListener('click', function () {
        if (fields.title) fields.title.value = stored.title || '';
        if (fields.tags) fields.tags.value = stored.tags || '';
        if (fields.cat && stored.cat) {
          var has = Array.prototype.some.call(fields.cat.options, function (o) { return o.value === stored.cat; });
          if (has) fields.cat.value = stored.cat;
        }
        ta.value = stored.content || '';
        if (render) render();
        bar.remove();
      });
      no.addEventListener('click', function () {
        try { localStorage.removeItem(key); } catch (e) { /* 忽略 */ }
        bar.remove();
      });
    }
  }
})();
