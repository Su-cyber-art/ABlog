/*
 * 默·博客 — Markdown 渲染器
 * 与设计稿原型完全一致的轻量 Markdown 子集:
 *   # ## ### 标题 · > 引用 · - 无序列表 · 1. 有序列表 · --- 分隔线
 *   `code` · **粗体** · *斜体* · [链接](url)
 * 前后端共用:Node 里 require,浏览器里挂到 window.MoMD。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoMD = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 只允许安全的链接协议,其余一律替换为 #
  function safeHref(url) {
    var u = String(url).trim();
    if (/^(https?:|mailto:|\/|#)/i.test(u) && !/["<>]/.test(u)) return u.replace(/'/g, '%27');
    return '#';
  }

  // 图片来源:http(s)、站内路径或 data:image
  function safeImgSrc(url) {
    var u = String(url).trim();
    if (/^(https?:|\/|data:image\/)/i.test(u) && !/["<>]/.test(u)) return u.replace(/'/g, '%27');
    return '';
  }

  function inline(s) {
    return s
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, src) {
        var safe = safeImgSrc(src);
        if (!safe) return alt;
        return '<img src="' + safe + '" alt="' + alt.replace(/"/g, '&quot;') + '" loading="lazy" ' +
          'style="display:block;max-width:100%;margin:24px auto;padding:6px;background:var(--color-surface);border:1px solid var(--color-divider)">';
      })
      .replace(/`([^`]+)`/g, '<code style="font-size:.9em;padding:1px 5px;border:1px solid var(--color-divider);border-radius:2px">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, text, href) {
        return '<a href="' + safeHref(href) + '" style="color:var(--color-accent-700)">' + text + '</a>';
      });
  }

  /**
   * @param {string} src Markdown 源文本
   * @param {{justify?:boolean, indent?:boolean}} [opts] 版式选项(与设计稿 props 对应)
   */
  function mdToHtml(src, opts) {
    opts = opts || {};
    var justify = (opts.justify !== undefined ? opts.justify : true) ? 'justify' : 'left';
    var indent = (opts.indent !== undefined ? opts.indent : true) ? '2em' : '0';
    var pStyle = 'margin:0 0 15px;font-size:15.5px;line-height:2;text-align:' + justify + ';text-indent:' + indent;
    var lines = (src || '').split('\n');
    var html = '', list = null, codeLines = null;
    function closeList() { if (list) { html += list === 'ul' ? '</ul>' : '</ol>'; list = null; } }
    function flushCode() {
      html += '<pre style="margin:0 0 18px;padding:14px 18px;background:var(--color-neutral-100);' +
        'border:1px solid var(--color-divider);border-radius:var(--radius-sm);overflow-x:auto;' +
        'font-size:13px;line-height:1.75"><code>' + codeLines.join('\n') + '</code></pre>';
      codeLines = null;
    }
    for (var i = 0; i < lines.length; i++) {
      // ``` 围栏代码块:原样呈现,不做行内解析
      if (codeLines !== null) {
        if (/^\s*```/.test(lines[i])) flushCode();
        else codeLines.push(esc(lines[i]));
        continue;
      }
      var l = lines[i].trim();
      if (/^```/.test(l)) { closeList(); codeLines = []; continue; }
      if (!l) { closeList(); continue; }
      if (/^(-{3,}|\*{3,})$/.test(l)) { closeList(); html += '<div style="height:1px;background:var(--color-divider);margin:26px auto;width:38%"></div>'; continue; }
      if (l.indexOf('### ') === 0) { closeList(); html += '<h3 style="font-family:var(--font-heading);font-weight:600;font-size:20px;margin:26px 0 12px">' + inline(esc(l.slice(4))) + '</h3>'; continue; }
      if (l.indexOf('## ') === 0) { closeList(); html += '<h2 style="font-family:var(--font-heading);font-weight:600;font-size:25px;margin:30px 0 14px">' + inline(esc(l.slice(3))) + '</h2>'; continue; }
      if (l.indexOf('# ') === 0) { closeList(); html += '<h1 style="font-family:var(--font-heading);font-weight:600;font-size:30px;margin:30px 0 16px">' + inline(esc(l.slice(2))) + '</h1>'; continue; }
      if (l.indexOf('> ') === 0) { closeList(); html += '<blockquote style="margin:22px 0;padding:2px 0 2px 18px;border-left:1px solid var(--color-accent);font-style:italic;color:color-mix(in srgb, var(--color-text) 66%, transparent);font-size:15px;line-height:1.95">' + inline(esc(l.slice(2))) + '</blockquote>'; continue; }
      if (/^- /.test(l)) { if (list !== 'ul') { closeList(); html += '<ul style="margin:0 0 15px;padding-left:22px;line-height:2;font-size:15px">'; list = 'ul'; } html += '<li style="margin:2px 0">' + inline(esc(l.slice(2))) + '</li>'; continue; }
      if (/^\d+\. /.test(l)) { if (list !== 'ol') { closeList(); html += '<ol style="margin:0 0 15px;padding-left:22px;line-height:2;font-size:15px;font-variant-numeric:tabular-nums">'; list = 'ol'; } html += '<li style="margin:2px 0">' + inline(esc(l.replace(/^\d+\. /, ''))) + '</li>'; continue; }
      closeList(); html += '<p style="' + pStyle + '">' + inline(esc(l)) + '</p>';
    }
    if (codeLines !== null) flushCode(); // 未闭合的围栏,按已开始的代码块处理
    closeList();
    return html;
  }

  return { mdToHtml: mdToHtml, esc: esc };
});
