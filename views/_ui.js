/* 默·博客 — 共享视图片段(纯模板函数,无模板引擎) */
'use strict';
const { ADMIN_PATH, adminUrl } = require('../lib/config');

/** HTML 转义 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 文档头。ctx: { s } */
function head(ctx, pageTitle) {
  const s = ctx.s;
  const title = pageTitle ? `${pageTitle} · ${s.title}` : `${s.title} — ${s.subtitle}`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(s.title)} · RSS" href="/feed.xml">
<link rel="stylesheet" href="/css/fonts.css">
<link rel="stylesheet" href="/css/site.css">
</head>
<body>
`;
}

/** 前台页头。ctx: { s, nav } */
function frontHeader(ctx) {
  const { s, nav } = ctx;
  const act = v => nav === v ? ' class="active"' : '';
  return `<div class="page">
<div class="fwrap">

  <header class="site-header">
    <a class="brand" href="/">${esc(s.title)}</a>
    <div class="header-sub">${esc(s.subtitle)}</div>
    <nav class="site-nav">
      <a href="/"${act('home')}>首页</a>
      <a href="/archive"${act('archive')}>归档</a>
      <a href="/about"${act('about')}>关于</a>
      <span class="nav-sep"></span>
      <a href="${ADMIN_PATH}" class="nav-admin">后台 →</a>
    </nav>
  </header>
`;
}

/** 前台页脚。ctx: { s, year } */
function frontFooter(ctx) {
  const { s, year } = ctx;
  return `
  <footer class="site-footer">
    <span>© ${esc(year)} ${esc(s.title)} · ${esc(s.footer)}</span>
    <span class="spacer"></span>
    <a href="/feed.xml">RSS</a>
    <a href="${ADMIN_PATH}">后台管理</a>
  </footer>

</div>
</div>
</body>
</html>
`;
}

/* 后台侧栏图标(取自设计稿) */
const ICONS = {
  dash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"></rect><rect x="14" y="3" width="7" height="5" rx="1"></rect><rect x="14" y="12" width="7" height="9" rx="1"></rect><rect x="3" y="16" width="7" height="5" rx="1"></rect></svg>',
  posts: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
  editor: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
  tax: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42Z"></path><circle cx="7" cy="7" r="1.5"></circle></svg>',
  comments: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  settings: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="14" y2="6"></line><line x1="10" y1="6" x2="3" y2="6"></line><line x1="21" y1="12" x2="12" y2="12"></line><line x1="8" y1="12" x2="3" y2="12"></line><line x1="21" y1="18" x2="16" y2="18"></line><line x1="12" y1="18" x2="3" y2="18"></line><circle cx="12" cy="6" r="2"></circle><circle cx="10" cy="12" r="2"></circle><circle cx="14" cy="18" r="2"></circle></svg>'
};

/** 后台外壳(侧栏 + main 开标签)。ctx: { s, pendingN } */
function adminTop(ctx, view, pageTitle) {
  const { s, pendingN } = ctx;
  const item = (v, href, icon, label, badge) =>
    `<a class="a-nav ${view === v ? 'active' : ''}" href="${href}">
      ${ICONS[icon]}
      ${label}${badge || ''}</a>`;
  const badge = pendingN > 0 ? ` <span class="tag tag-accent">${pendingN}</span>` : '';
  return head(ctx, pageTitle) + `<div class="admin-grid">
  <aside class="admin-side">
    <div class="admin-brand">
      <div class="admin-brand-title">${esc(s.title)} <span class="suffix">· 后台</span></div>
      <div class="admin-brand-sub">写作与管理</div>
    </div>

    ${item('dash', ADMIN_PATH, 'dash', '仪表盘')}
    ${item('posts', adminUrl('/posts'), 'posts', '文章管理')}
    ${item('editor', adminUrl('/editor'), 'editor', '写作')}
    ${item('tax', adminUrl('/taxonomy'), 'tax', '分类与标签')}
    ${item('comments', adminUrl('/comments'), 'comments', '评论管理', badge)}
    ${item('settings', adminUrl('/settings'), 'settings', '站点设置')}

    <div class="admin-side-foot">
      <a href="/">← 查看前台</a>
    </div>
  </aside>

  <main class="admin-main">
`;
}

function adminBottom() {
  return `
  </main>
</div>
<script src="/js/md.js"></script>
<script src="/js/admin.js"></script>
</body>
</html>
`;
}

module.exports = { esc, head, frontHeader, frontFooter, adminTop, adminBottom };
