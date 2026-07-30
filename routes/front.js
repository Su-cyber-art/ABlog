/* 默·博客 — 前台路由(首页/文章/归档/关于/RSS/订阅) */
'use strict';
const fs = require('fs');
const path = require('path');
const { q, siteSettings, parseTags } = require('../lib/db');
const { trackVisitor, trackArticleVisitor, shouldTrack, VISITOR_RETENTION_DAYS } = require('../lib/visitors');
const { SITE_URL } = require('../lib/config');
const { mdToHtml, esc } = require('../lib/md');
const { cookieOptions } = require('../lib/auth');
const {
  LOCALE_COOKIE,
  attachRequestI18n,
  isSupportedLocale,
  safeLocalPath
} = require('../lib/i18n');
const view = require('../views/front');

const SHOW_VIEWS = true; // 设计稿 props.showViews 默认值

function today() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

/** 站点对外基地址(优先 SITE_URL 环境变量) */
function baseUrl(req) {
  if (SITE_URL) return SITE_URL;
  try {
    const url = new URL('http://' + String(req.headers.host || 'localhost'));
    if (!url.hostname || url.username || url.password || url.pathname !== '/') throw new Error('invalid host');
    return url.origin;
  } catch (e) {
    return 'http://localhost';
  }
}

/** 各页共用的模板上下文 */
function ctx(req, nav) {
  const s = siteSettings();
  const { locale, t } = attachRequestI18n(req, s.locale);
  return {
    s,
    locale,
    t,
    year: String(new Date().getFullYear()),
    nav: nav || '',
    isAdmin: req.isAdmin,
    currentPath: safeLocalPath(req.url)
  };
}

/** 摘录:第一段非标题、非引用的正文(与设计稿一致) */
function excerptOf(p) {
  return p.content.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('>')) || '';
}

function enrichFront(p, t) {
  return {
    id: p.id,
    title: p.title,
    kicker: p.cat + ' · ' + p.date,
    excerpt: excerptOf(p),
    metaLine: t('front.homeMeta', {
      views: SHOW_VIEWS ? p.views || 0 : '—',
      days: VISITOR_RETENTION_DAYS,
      visitors: p.unique_views || 0,
      comments: q.commentsFor.all(p.id).length
    })
  };
}

function renderHome(req, res) {
  const c = ctx(req, 'home');
  trackVisitor(req, res, req.pathname);
  const pub = q.publishedPosts.all();
  const perPage = c.s.perPage;
  const totalPages = Math.max(1, Math.ceil(pub.length / perPage));
  const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), totalPages);
  const pageHref = n => '/?page=' + n;
  const cats = q.cats.all().map(r => r.name);

  res.html(view.home(c, {
    pagePosts: pub.slice((page - 1) * perPage, page * perPage).map(post => enrichFront(post, c.t)),
    railCats: cats.map(name => ({ name, count: pub.filter(p => p.cat === name).length })),
    railTags: q.tags.all().map(r => r.name).slice(0, 12),
    showPager: totalPages > 1,
    pagerText: page + ' / ' + totalPages,
    hasPrev: page > 1, hasNext: page < totalPages,
    prevHref: pageHref(page - 1), nextHref: pageHref(page + 1),
    subscribed: req.query.subscribed === '1'
  }));
}

function renderArchive(req, res) {
  const c = ctx(req, 'archive');
  trackVisitor(req, res, req.pathname);
  const pub = q.publishedPosts.all();
  const cats = q.cats.all().map(r => r.name);
  const tagFilter = String(req.query.tag || '').trim().slice(0, 40) || null;
  const archiveCat = !tagFilter && cats.includes(req.query.cat) ? req.query.cat : null;
  const filtered = tagFilter
    ? pub.filter(p => parseTags(p).includes(tagFilter))
    : pub.filter(p => !archiveCat || p.cat === archiveCat);
  const years = [...new Set(filtered.map(p => p.date.slice(0, 4)))].sort().reverse();
  const archivePath = '/archive';

  const chips = [{
    name: c.t('front.archive.all'),
    href: archivePath,
    active: !tagFilter && !archiveCat
  }].concat(cats.map(name => ({
    name,
    href: archivePath + '?cat=' + encodeURIComponent(name),
    active: !tagFilter && archiveCat === name
  })));
  if (tagFilter) chips.unshift({
    name: c.t('front.archive.tagChip', { tag: tagFilter }),
    href: archivePath,
    active: true
  });

  res.html(view.archive(c, {
    archiveSummary: tagFilter
      ? c.t('front.archive.summaryTag', { count: filtered.length, tag: tagFilter })
      : c.t('front.archive.summaryCategory', {
        count: filtered.length,
        category: archiveCat || c.t('front.archive.all')
      }),
    archiveChips: chips,
    archiveGroups: years.map(y => {
      const items = filtered.filter(p => p.date.startsWith(y));
      return {
        year: y,
        count: items.length,
        items: items.map(p => ({ id: p.id, date: p.date.slice(5).replace('-', ' / '), title: p.title, cat: p.cat }))
      };
    })
  }));
}

function portraitFor(c) {
  if (c.s.portraitUrl) return c.s.portraitUrl;
  for (const file of ['portrait.jpg', 'portrait.jpeg', 'portrait.png', 'portrait.webp']) {
    if (fs.existsSync(path.join(__dirname, '..', 'public', file))) return '/' + file;
  }
  return null;
}

function renderAbout(req, res) {
  const c = ctx(req, 'about');
  trackVisitor(req, res, req.pathname);
  res.html(view.about(c, { portrait: portraitFor(c) }));
}

function register(app) {
  app.post('/language', (req, res) => {
    const c = ctx(req, '');
    const locale = String(req.body.locale || '');
    if (!isSupportedLocale(locale)) return res.text(c.t('error.invalidLanguage'), 400);
    res.setHeader('Set-Cookie', `${LOCALE_COOKIE}=${locale}; ${cookieOptions(365 * 24 * 3600)}`);
    res.redirect(safeLocalPath(req.body.returnTo));
  });

  /* ── 首页 ── */
  app.get('/', renderHome);

  /* ── 文章详情 ── */
  app.get('/post/:id', (req, res) => {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    const safeId = Number.isSafeInteger(id) && id > 0 ? id : null;
    const post = safeId && q.postById.get(safeId);
    if (!post) return false;
    if (post.status !== 'published' && !req.isAdmin) return false; // 草稿仅登录后可预览

    if (post.status === 'published' && shouldTrack(req)) {
      const visitor = trackVisitor(req, res, req.pathname);
      q.bumpViews.run(post.id);
      post.views += 1;
      if (trackArticleVisitor(post.id, visitor)) post.unique_views += 1;
    }

    const c = ctx(req, '');
    const comments = q.commentsFor.all(post.id);

    // 上一篇(较新)/ 下一篇(较旧),仅对已发布文章
    let prevPost = null, nextPost = null;
    if (post.status === 'published') {
      const pub = q.publishedPosts.all();
      const idx = pub.findIndex(p => p.id === post.id);
      if (idx > 0) prevPost = { id: pub[idx - 1].id, title: pub[idx - 1].title };
      if (idx >= 0 && idx < pub.length - 1) nextPost = { id: pub[idx + 1].id, title: pub[idx + 1].title };
    }

    res.html(view.article(c, {
      prevPost, nextPost,
      art: {
        id: post.id,
        isDraft: post.status !== 'published',
        kicker: post.cat + ' · ' + post.date,
        title: post.title,
        metaLine: c.t('front.articleMeta', {
          words: post.content.replace(/\s/g, '').length,
          views: SHOW_VIEWS ? post.views || 0 : '—',
          days: VISITOR_RETENTION_DAYS,
          visitors: post.unique_views || 0,
          author: c.s.author
        }),
        bodyHtml: mdToHtml(post.content),
        tags: parseTags(post),
        commentCount: comments.length
      },
      comments,
      canComment: post.status === 'published',
      commented: req.query.commented === '1'
    }));
  });

  /* 提交评论(落库为待审) */
  app.post('/post/:id/comment', (req, res) => {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    const safeId = Number.isSafeInteger(id) && id > 0 ? id : null;
    const post = safeId && q.postById.get(safeId);
    if (!post || post.status !== 'published') return false;
    const text = String(req.body.text || '').trim().slice(0, 2000);
    const c = ctx(req, '');
    const name = String(req.body.name || '').trim().slice(0, 40) || c.t('front.anonymous');
    if (text) q.insertComment.run(post.id, name, today(), text);
    res.redirect('/post/' + post.id + '?commented=1#comments');
  });

  /* ── 归档(支持分类与标签两种筛选) ── */
  app.get('/archive', renderArchive);

  /* ── 搜索 ── */
  app.get('/search', (req, res) => {
    const c = ctx(req, '');
    trackVisitor(req, res, req.pathname);
    const kw = String(req.query.q || '').trim().slice(0, 80);
    let results = [];
    if (kw) {
      const like = '%' + kw.replace(/[\\%_]/g, ch => '\\' + ch) + '%';
      results = q.searchPosts.all(like, like, like).map(p => ({
        id: p.id,
        date: p.date.slice(5).replace('-', ' / '),
        title: p.title,
        cat: p.cat
      }));
    }
    res.html(view.search(c, { kw, results }));
  });

  /* ── 关于 ── */
  app.get('/about', renderAbout);

  /* ── 订阅 ── */
  app.post('/subscribe', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) q.addSubscriber.run(email, today());
    res.redirect('/?subscribed=1#subscribe');
  });

  /* ── RSS(含全文) ── */
  app.get('/feed.xml', (req, res) => {
    const c = ctx(req, '');
    const s = c.s;
    const base = baseUrl(req);
    const cdata = html => '<![CDATA[' + String(html).replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]>';
    const safeBase = esc(base);
    const items = q.publishedPosts.all().slice(0, 20).map(p => `
  <item>
    <title>${esc(p.title)}</title>
    <link>${safeBase}/post/${p.id}</link>
    <guid isPermaLink="true">${safeBase}/post/${p.id}</guid>
    <pubDate>${new Date(p.date + 'T00:00:00+08:00').toUTCString()}</pubDate>
    <category>${esc(p.cat)}</category>
    <description>${esc(excerptOf(p))}</description>
    <content:encoded>${cdata(mdToHtml(p.content))}</content:encoded>
  </item>`).join('');
    res.text(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${esc(s.title)}</title>
  <link>${safeBase}</link>
  <description>${esc(s.subtitle)}</description>
  <language>${c.locale.toLowerCase()}</language>${items}
</channel>
</rss>`, 200, 'application/rss+xml; charset=utf-8');
  });

  /* ── robots.txt 与站点地图 ── */
  app.get('/robots.txt', (req, res) => {
    res.text(`User-agent: *\nAllow: /\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
  });

  app.get('/sitemap.xml', (req, res) => {
    const base = esc(baseUrl(req));
    const stat = ['', '/archive', '/about'].map(p => `
  <url><loc>${base}${p}</loc></url>`).join('');
    const posts = q.publishedPosts.all().map(p => `
  <url><loc>${base}/post/${p.id}</loc><lastmod>${esc(p.date)}</lastmod></url>`).join('');
    res.text(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${stat}${posts}
</urlset>`, 200, 'application/xml; charset=utf-8');
  });

}

module.exports = { register };
