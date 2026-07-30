/* 默·博客 — 后台交互:确认对话框 + 写作页实时预览 + 防丢稿自动暂存 */
(function () {
  'use strict';

  var messages = {};
  try { messages = JSON.parse(document.body.getAttribute('data-i18n') || '{}'); } catch (e) { messages = {}; }
  var tr = function (key, fallback, values) {
    var message = messages[key] || fallback || key;
    if (!values) return message;
    return message.replace(/\{([A-Za-z0-9_]+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match;
    });
  };

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

  // 站点图标:本地解码、方形裁切与预览，确认后只上传 256 × 256 PNG
  var faviconForm = document.getElementById('favicon-form');
  var faviconInput = document.getElementById('favicon-file');
  var faviconCanvas = document.getElementById('favicon-crop');
  if (faviconForm && faviconInput && faviconCanvas && window.FileReader && window.FormData && window.fetch) {
    var faviconEditor = document.getElementById('favicon-editor');
    var faviconZoom = document.getElementById('favicon-zoom');
    var faviconCenter = document.getElementById('favicon-center');
    var faviconCancel = document.getElementById('favicon-cancel');
    var faviconUpload = document.getElementById('favicon-upload');
    var faviconStatus = document.getElementById('favicon-status');
    var faviconCurrent = document.getElementById('favicon-current');
    var faviconPreviews = [
      document.getElementById('favicon-preview-tab'),
      document.getElementById('favicon-preview-32'),
      document.getElementById('favicon-preview-16')
    ];
    var faviconContext = faviconCanvas.getContext('2d');
    var faviconImage = null;
    var faviconScale = 1;
    var faviconOffsetX = 0;
    var faviconOffsetY = 0;
    var faviconDragging = false;
    var faviconDragX = 0;
    var faviconDragY = 0;
    var faviconDragOffsetX = 0;
    var faviconDragOffsetY = 0;
    var faviconSize = 256;

    var faviconMessage = function (text, error) {
      faviconStatus.textContent = text || '';
      faviconStatus.className = 'favicon-status' + (error ? ' is-error' : '');
    };

    var faviconClamp = function () {
      if (!faviconImage) return;
      var base = Math.max(faviconSize / faviconImage.naturalWidth, faviconSize / faviconImage.naturalHeight);
      var width = faviconImage.naturalWidth * base * faviconScale;
      var height = faviconImage.naturalHeight * base * faviconScale;
      var maxX = Math.max(0, (width - faviconSize) / 2);
      var maxY = Math.max(0, (height - faviconSize) / 2);
      faviconOffsetX = Math.max(-maxX, Math.min(maxX, faviconOffsetX));
      faviconOffsetY = Math.max(-maxY, Math.min(maxY, faviconOffsetY));
    };

    var faviconRender = function () {
      if (!faviconImage || !faviconContext) return;
      faviconClamp();
      var base = Math.max(faviconSize / faviconImage.naturalWidth, faviconSize / faviconImage.naturalHeight);
      var width = faviconImage.naturalWidth * base * faviconScale;
      var height = faviconImage.naturalHeight * base * faviconScale;
      var x = (faviconSize - width) / 2 + faviconOffsetX;
      var y = (faviconSize - height) / 2 + faviconOffsetY;
      faviconContext.clearRect(0, 0, faviconSize, faviconSize);
      faviconContext.imageSmoothingEnabled = true;
      faviconContext.imageSmoothingQuality = 'high';
      faviconContext.drawImage(faviconImage, x, y, width, height);
      var preview = faviconCanvas.toDataURL('image/png');
      faviconPreviews.forEach(function (image) { if (image) image.src = preview; });
    };

    var faviconReset = function () {
      faviconScale = 1;
      faviconOffsetX = 0;
      faviconOffsetY = 0;
      faviconZoom.value = '1';
      faviconRender();
    };

    var faviconClear = function () {
      faviconImage = null;
      faviconInput.value = '';
      faviconEditor.hidden = true;
      faviconUpload.disabled = true;
      faviconContext.clearRect(0, 0, faviconSize, faviconSize);
      faviconMessage('');
    };

    faviconInput.addEventListener('change', function () {
      var file = faviconInput.files && faviconInput.files[0];
      if (!file) return faviconClear();
      var extensionOk = /\.(?:svg|jpe?g|png|webp)$/i.test(file.name || '');
      var typeOk = /^(?:image\/svg\+xml|image\/jpeg|image\/png|image\/webp)$/.test(file.type || '');
      if (!extensionOk && !typeOk) {
        faviconClear();
        return faviconMessage(tr('admin.favicon.invalidType', '请选择 SVG、JPEG、PNG 或 WebP 图片。'), true);
      }
      if (file.size > 5 * 1024 * 1024) {
        faviconClear();
        return faviconMessage(tr('admin.favicon.tooLarge', '图片不能超过 5 MiB。'), true);
      }

      faviconMessage(tr('admin.favicon.reading', '正在读取图片…'));
      var reader = new FileReader();
      reader.onerror = function () { faviconClear(); faviconMessage(tr('admin.favicon.readFailed', '无法读取这张图片。'), true); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { faviconClear(); faviconMessage(tr('admin.favicon.decodeFailed', '图片无法解码，请换一张重试。'), true); };
        image.onload = function () {
          if (!image.naturalWidth || !image.naturalHeight
            || image.naturalWidth > 8192 || image.naturalHeight > 8192
            || image.naturalWidth * image.naturalHeight > 40 * 1000 * 1000) {
            faviconClear();
            return faviconMessage(tr('admin.favicon.dimensions', '图片尺寸过大，请使用不超过 8192 像素的图片。'), true);
          }
          faviconImage = image;
          faviconEditor.hidden = false;
          faviconUpload.disabled = false;
          faviconMessage(tr('admin.favicon.cropReady', '调整裁切后，点击“确认并上传”。'));
          try {
            faviconReset();
          } catch (e) {
            faviconClear();
            faviconMessage(tr('admin.favicon.unsafe', '这张图片无法安全转换，请换一张重试。'), true);
          }
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });

    faviconZoom.addEventListener('input', function () {
      faviconScale = Number(faviconZoom.value) || 1;
      faviconRender();
    });
    faviconCenter.addEventListener('click', faviconReset);
    faviconCancel.addEventListener('click', faviconClear);

    faviconCanvas.addEventListener('pointerdown', function (e) {
      if (!faviconImage) return;
      faviconDragging = true;
      faviconDragX = e.clientX;
      faviconDragY = e.clientY;
      faviconDragOffsetX = faviconOffsetX;
      faviconDragOffsetY = faviconOffsetY;
      faviconCanvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    faviconCanvas.addEventListener('pointermove', function (e) {
      if (!faviconDragging) return;
      var ratio = faviconSize / faviconCanvas.getBoundingClientRect().width;
      faviconOffsetX = faviconDragOffsetX + (e.clientX - faviconDragX) * ratio;
      faviconOffsetY = faviconDragOffsetY + (e.clientY - faviconDragY) * ratio;
      faviconRender();
    });
    faviconCanvas.addEventListener('pointerup', function (e) {
      faviconDragging = false;
      if (faviconCanvas.hasPointerCapture(e.pointerId)) faviconCanvas.releasePointerCapture(e.pointerId);
    });
    faviconCanvas.addEventListener('pointercancel', function () { faviconDragging = false; });
    faviconCanvas.addEventListener('keydown', function (e) {
      if (!faviconImage || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      var step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft') faviconOffsetX -= step;
      if (e.key === 'ArrowRight') faviconOffsetX += step;
      if (e.key === 'ArrowUp') faviconOffsetY -= step;
      if (e.key === 'ArrowDown') faviconOffsetY += step;
      faviconRender();
      e.preventDefault();
    });

    faviconForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!faviconImage || faviconUpload.disabled) return;
      faviconUpload.disabled = true;
      faviconMessage(tr('admin.favicon.uploading', '正在上传图标…'));
      faviconCanvas.toBlob(function (blob) {
        if (!blob) {
          faviconUpload.disabled = false;
          return faviconMessage(tr('admin.favicon.generateFailed', '无法生成图标，请换一张图片重试。'), true);
        }
        var body = new FormData();
        body.append('favicon', blob, 'favicon.png');
        fetch(faviconForm.action, {
          method: 'POST',
          body: body,
          credentials: 'same-origin',
          headers: { Accept: 'application/json' }
        }).then(function (response) {
          return response.json().then(function (data) {
            if (!response.ok || !data.ok) throw new Error(data.error || tr('admin.favicon.uploadFailed', '上传失败'));
            return data;
          });
        }).then(function (data) {
          document.querySelectorAll('link[rel~="icon"]').forEach(function (link) { link.remove(); });
          var link = document.createElement('link');
          link.rel = 'icon';
          link.type = data.type || 'image/png';
          link.href = data.url;
          document.head.appendChild(link);
          if (faviconCurrent) faviconCurrent.src = data.url;
          faviconMessage(tr('admin.favicon.cacheRefreshing', '图标已更新，正在刷新缓存版本。'));
          window.setTimeout(function () {
            window.location.replace(faviconForm.dataset.returnUrl + '?favicon=saved');
          }, 250);
        }).catch(function (error) {
          faviconUpload.disabled = false;
          faviconMessage(error.message || tr('admin.favicon.retry', '上传失败，请重试。'), true);
        });
      }, 'image/png');
    });
  }

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
        : '<p class="ed-preview-empty">' + tr('admin.editor.previewEmpty', '预览会随左侧输入实时更新。') + '</p>';
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
      var elapsed = mins >= 60
        ? tr('admin.draft.hours', '{count} 小时', { count: Math.round(mins / 60) })
        : tr('admin.draft.minutes', '{count} 分钟', { count: mins });
      text.textContent = tr('admin.draft.found', '发现约 {time}前的未提交暂存稿。', { time: elapsed });
      var ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'btn btn-ghost'; ok.textContent = tr('admin.draft.restore', '恢复暂存稿');
      var no = document.createElement('button');
      no.type = 'button'; no.className = 'btn btn-ghost muted'; no.textContent = tr('admin.draft.discard', '丢弃');
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
