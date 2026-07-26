/* 默·博客 — 前台路由(首页/文章/归档/关于/RSS/订阅) */
'use strict';
const fs = require('fs');
const path = require('path');
const { q, siteSettings, parseTags } = require('../lib/db');
const { mdToHtml, esc } = require('../lib/md');
const view = require('../views/front');

const SHOW_VIEWS = true; // 设计稿 props.showViews 默认值

function today() { return new Date().toISOString().slice(0, 10); }

/** 各页共用的模板上下文 */
function ctx(req, nav) {
  return { s: siteSettings(), year: String(new Date().getFullYear()), nav: nav || '', isAdmin: req.isAdmin };
}

/** 摘录:第一段非标题、非引用的正文(与设计稿一致) */
function excerptOf(p) {
  return p.content.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('>')) || '';
}

function enrichFront(p) {
  return {
    id: p.id,
    title: p.title,
    kicker: p.cat + ' · ' + p.date,
    excerpt: excerptOf(p),
    metaLine: (SHOW_VIEWS ? '阅读 ' + (p.views || 0) + ' · ' : '') + '评论 ' + q.commentsFor.all(p.id).length
  };
}

function register(app) {

  /* ── 首页 ── */
  app.get('/', (req, res) => {
    const c = ctx(req, 'home');
    const pub = q.publishedPosts.all();
    const perPage = c.s.perPage;
    const totalPages = Math.max(1, Math.ceil(pub.length / perPage));
    const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), totalPages);

    const cats = q.cats.all().map(r => r.name);
    res.html(view.home(c, {
      pagePosts: pub.slice((page - 1) * perPage, page * perPage).map(enrichFront),
      railCats: cats.map(name => ({ name, count: pub.filter(p => p.cat === name).length })),
      railTags: q.tags.all().map(r => r.name).slice(0, 12),
      showPager: totalPages > 1,
      pagerText: page + ' / ' + totalPages,
      hasPrev: page > 1, hasNext: page < totalPages,
      prevHref: '/?page=' + (page - 1), nextHref: '/?page=' + (page + 1),
      subscribed: req.query.subscribed === '1'
    }));
  });

  /* ── 文章详情 ── */
  app.get('/post/:id', (req, res) => {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    const post = id && q.postById.get(id);
    if (!post) return false;
    if (post.status !== 'published' && !req.isAdmin) return false; // 草稿仅登录后可预览
    if (req.method !== 'HEAD') { // HEAD(爬虫探测)不计阅读
      q.bumpViews.run(post.id);
      post.views += 1;
    }

    const c = ctx(req, '');
    const comments = q.commentsFor.all(post.id);
    res.html(view.article(c, {
      art: {
        id: post.id,
        isDraft: post.status !== 'published',
        kicker: post.cat + ' · ' + post.date,
        title: post.title,
        metaLine: '约 ' + post.content.replace(/\s/g, '').length + ' 字'
          + (SHOW_VIEWS ? ' · ' + (post.views || 0) + ' 次阅读' : '')
          + ' · 署名 ' + c.s.author,
        bodyHtml: mdToHtml(post.content),
        tags: parseTags(post),
        commentCount: comments.length
      },
      comments,
      commented: req.query.commented === '1'
    }));
  });

  /* 提交评论(落库为待审) */
  app.post('/post/:id/comment', (req, res) => {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    const post = id && q.postById.get(id);
    if (!post || post.status !== 'published') return false;
    const text = String(req.body.text || '').trim().slice(0, 2000);
    const name = String(req.body.name || '').trim().slice(0, 40) || '匿名';
    if (text) q.insertComment.run(post.id, name, today(), text);
    res.redirect('/post/' + post.id + '?commented=1#comments');
  });

  /* ── 归档 ── */
  app.get('/archive', (req, res) => {
    const c = ctx(req, 'archive');
    const pub = q.publishedPosts.all();
    const cats = q.cats.all().map(r => r.name);
    const archiveCat = cats.includes(req.query.cat) ? req.query.cat : '全部';
    const filtered = pub.filter(p => archiveCat === '全部' || p.cat === archiveCat);
    const years = [...new Set(filtered.map(p => p.date.slice(0, 4)))].sort().reverse();

    res.html(view.archive(c, {
      archiveSummary: '共 ' + filtered.length + ' 篇 · ' + archiveCat,
      archiveChips: ['全部'].concat(cats).map(name => ({
        name,
        href: name === '全部' ? '/archive' : '/archive?cat=' + encodeURIComponent(name),
        active: archiveCat === name
      })),
      archiveGroups: years.map(y => {
        const items = filtered.filter(p => p.date.startsWith(y));
        return {
          year: y,
          count: items.length,
          items: items.map(p => ({ id: p.id, date: p.date.slice(5).replace('-', ' / '), title: p.title, cat: p.cat }))
        };
      })
    }));
  });

  /* ── 搜索 ── */
  app.get('/search', (req, res) => {
    const c = ctx(req, '');
    const kw = String(req.query.q || '').trim().slice(0, 80);
    let results = [];
    if (kw) {
      const like = '%' + kw.replace(/[\\%_]/g, ch => '\\' + ch) + '%';
      results = q.searchPosts.all(like).map(p => ({
        id: p.id,
        date: p.date.slice(5).replace('-', ' / '),
        title: p.title,
        cat: p.cat
      }));
    }
    res.html(view.search(c, { kw, results }));
  });

  /* ── 关于 ── */
  app.get('/about', (req, res) => {
    let portrait = null;
    for (const f of ['portrait.jpg', 'portrait.jpeg', 'portrait.png', 'portrait.webp']) {
      if (fs.existsSync(path.join(__dirname, '..', 'public', f))) { portrait = '/' + f; break; }
    }
    res.html(view.about(ctx(req, 'about'), { portrait }));
  });

  /* ── 订阅 ── */
  app.post('/subscribe', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) q.addSubscriber.run(email, today());
    res.redirect('/?subscribed=1#subscribe');
  });

  /* ── RSS ── */
  app.get('/feed.xml', (req, res) => {
    const s = siteSettings();
    const base = (process.env.SITE_URL || ('http://' + (req.headers.host || 'localhost'))).replace(/\/$/, '');
    const items = q.publishedPosts.all().slice(0, 20).map(p => `
  <item>
    <title>${esc(p.title)}</title>
    <link>${base}/post/${p.id}</link>
    <guid isPermaLink="true">${base}/post/${p.id}</guid>
    <pubDate>${new Date(p.date + 'T00:00:00+08:00').toUTCString()}</pubDate>
    <category>${esc(p.cat)}</category>
    <description>${esc(excerptOf(p))}</description>
  </item>`).join('');
    res.text(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${esc(s.title)}</title>
  <link>${base}</link>
  <description>${esc(s.subtitle)}</description>
  <language>zh-cn</language>${items}
</channel>
</rss>`, 200, 'application/rss+xml; charset=utf-8');
  });
}

module.exports = { register };
