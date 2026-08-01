/* 默·博客 — 共享视图片段(纯模板函数,无模板引擎) */
'use strict';
const { ADMIN_PATH, adminUrl } = require('../lib/config');
const { version: APP_VERSION } = require('../package.json');
const { LOCALES, createTranslator, normalizeLocale } = require('../lib/i18n');

const assetUrl = pathname => `${pathname}?v=${encodeURIComponent(APP_VERSION)}`;

/** HTML 转义 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function viewI18n(ctx) {
  const locale = normalizeLocale(ctx.locale || (ctx.s && ctx.s.locale));
  return { locale, t: ctx.t || createTranslator(locale) };
}

function languageOptions(selected) {
  return LOCALES.map(locale =>
    `<option value="${locale.code}"${locale.code === selected ? ' selected' : ''}>${esc(locale.name)}</option>`).join('');
}

function languageSwitcher(ctx, className) {
  const { locale, t } = viewI18n(ctx);
  const currentPath = ctx.currentPath || '/';
  return `<form class="locale-form ${esc(className || '')}" method="post" action="/language">
    <input type="hidden" name="returnTo" value="${esc(currentPath)}">
    <label class="sr-only" for="locale-${esc(className || 'switcher')}">${esc(t('common.language'))}</label>
    <select class="locale-select" id="locale-${esc(className || 'switcher')}" name="locale" aria-label="${esc(t('common.language'))}">
      ${languageOptions(locale)}
    </select>
    <button class="locale-submit" type="submit" title="${esc(t('common.apply'))}" aria-label="${esc(t('common.apply'))}"><span aria-hidden="true">&#10003;</span></button>
  </form>`;
}

/** 文档头。ctx: { s } */
function head(ctx, pageTitle) {
  const s = ctx.s;
  const { locale } = viewI18n(ctx);
  const title = pageTitle ? `${pageTitle} · ${s.title}` : `${s.title} — ${s.subtitle}`;
  const clientData = ctx.clientMessages
    ? ` data-i18n="${esc(JSON.stringify(ctx.clientMessages))}"`
    : '';
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="${esc(s.faviconUrl || '/favicon.svg')}" type="${esc(s.faviconType || 'image/svg+xml')}">
<link rel="alternate" type="application/rss+xml" title="${esc(s.title)} · RSS" href="/feed.xml">
<link rel="stylesheet" href="${assetUrl('/css/fonts.css')}">
<link rel="stylesheet" href="${assetUrl('/css/site.css')}">
</head>
<body${clientData}>
`;
}

/** 前台页头。ctx: { s, nav } */
function frontHeader(ctx) {
  const { s, nav } = ctx;
  const { t } = viewI18n(ctx);
  const act = v => nav === v ? ' class="active"' : '';
  return `<div class="page">
<div class="fwrap">

  <header class="site-header">
    <a class="brand" href="/">${esc(s.title)}</a>
    <div class="header-sub">${esc(s.subtitle)}</div>
    <nav class="site-nav">
      <a href="/"${act('home')}>${esc(t('front.nav.home'))}</a>
      <a href="/archive"${act('archive')}>${esc(t('front.nav.archive'))}</a>
      <a href="/about"${act('about')}>${esc(t('front.nav.about'))}</a>
      <span class="nav-sep"></span>
      <a href="${ADMIN_PATH}" class="nav-admin">${esc(t('front.nav.admin'))}</a>
      ${languageSwitcher(ctx, 'front-locale')}
    </nav>
  </header>
`;
}

/** 前台页脚。ctx: { s, year } */
function frontFooter(ctx) {
  const { s, year } = ctx;
  const { t } = viewI18n(ctx);
  return `
  <footer class="site-footer">
    <span>© ${esc(year)} ${esc(s.title)} · ${esc(s.footer)}</span>
    <span class="spacer"></span>
    <a href="/feed.xml">RSS</a>
    <a href="${ADMIN_PATH}">${esc(t('front.footer.admin'))}</a>
  </footer>

</div>
</div>
<script src="${assetUrl('/js/dot-grid.js')}"></script>
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
  subs: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
  visitors: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle><path d="M22 11a3 3 0 0 0-2-2.83"></path><path d="M18 21v-2a4 4 0 0 0-3-3.87"></path></svg>',
  settings: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="14" y2="6"></line><line x1="10" y1="6" x2="3" y2="6"></line><line x1="21" y1="12" x2="12" y2="12"></line><line x1="8" y1="12" x2="3" y2="12"></line><line x1="21" y1="18" x2="16" y2="18"></line><line x1="12" y1="18" x2="3" y2="18"></line><circle cx="12" cy="6" r="2"></circle><circle cx="10" cy="12" r="2"></circle><circle cx="14" cy="18" r="2"></circle></svg>'
};

/** 后台外壳(侧栏 + main 开标签)。ctx: { s, pendingN } */
function adminTop(ctx, view, pageTitle) {
  const { s, pendingN } = ctx;
  const { t } = viewI18n(ctx);
  const item = (v, href, icon, label, badge) =>
    `<a class="a-nav ${view === v ? 'active' : ''}" href="${href}">
      ${ICONS[icon]}
      ${label}${badge || ''}</a>`;
  const badge = pendingN > 0 ? ` <span class="tag tag-accent">${pendingN}</span>` : '';
  return head(ctx, pageTitle) + `<div class="admin-grid">
  <aside class="admin-side">
    <div class="admin-brand">
      <div class="admin-brand-title">${esc(s.title)} <span class="suffix">${esc(t('admin.brand.suffix'))}</span></div>
      <div class="admin-brand-sub">${esc(t('admin.brand.subtitle'))}</div>
    </div>

    ${item('dash', ADMIN_PATH, 'dash', esc(t('admin.nav.dashboard')))}
    ${item('posts', adminUrl('/posts'), 'posts', esc(t('admin.nav.posts')))}
    ${item('editor', adminUrl('/editor'), 'editor', esc(t('admin.nav.write')))}
    ${item('tax', adminUrl('/taxonomy'), 'tax', esc(t('admin.nav.taxonomy')))}
    ${item('comments', adminUrl('/comments'), 'comments', esc(t('admin.nav.comments')), badge)}
    ${item('subs', adminUrl('/subscribers'), 'subs', esc(t('admin.nav.subscribers')))}
    ${item('visitors', adminUrl('/visitors'), 'visitors', esc(t('admin.nav.visitors')))}
    ${item('settings', adminUrl('/settings'), 'settings', esc(t('admin.nav.settings')))}

    <div class="admin-side-foot">
      <a href="/">← ${esc(t('admin.nav.viewSite'))}</a>
      ${languageSwitcher(ctx, 'admin-locale')}
    </div>
  </aside>

  <main class="admin-main">
`;
}

function adminBottom(withEditor = false) {
  const script = withEditor ? '/js/admin.bundle.js' : '/js/admin.js';
  return `
  </main>
</div>
<script src="${assetUrl(script)}"></script>
</body>
</html>
`;
}

module.exports = {
  esc,
  head,
  frontHeader,
  frontFooter,
  adminTop,
  adminBottom,
  languageOptions,
  languageSwitcher
};
