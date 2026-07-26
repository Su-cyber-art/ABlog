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

  function inline(s) {
    return s
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
    var html = '', list = null;
    function closeList() { if (list) { html += list === 'ul' ? '</ul>' : '</ol>'; list = null; } }
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
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
    closeList();
    return html;
  }

  return { mdToHtml: mdToHtml, esc: esc };
});
