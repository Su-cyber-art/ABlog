/* 默·博客 — 前台视图(首页/文章/归档/关于/404) */
'use strict';
const { esc, head, frontHeader, frontFooter } = require('./_ui');

const text = (ctx, key, values) => esc(ctx.t(key, values));

/** 首页 */
function home(ctx, d) {
  const posts = d.pagePosts.map(p => `
      <article class="post-item">
        <div class="post-kicker">${esc(p.kicker)}</div>
        <h2 class="post-title"><a href="/post/${p.id}">${esc(p.title)}</a></h2>
        <p class="post-excerpt">${esc(p.excerpt)}</p>
        <div class="post-links">
          <a class="read-link" href="/post/${p.id}">${text(ctx, 'front.readMore')}</a>
          <span class="post-meta">${esc(p.metaLine)}</span>
        </div>
      </article>`).join('');

  const pager = d.showPager ? `
      <div class="pager">
        ${d.hasPrev ? `<a href="${d.prevHref}">← ${text(ctx, 'front.newer')}</a>` : ''}
        <span class="pager-text">${esc(d.pagerText)}</span>
        ${d.hasNext ? `<a href="${d.nextHref}">${text(ctx, 'front.older')} →</a>` : ''}
      </div>` : '';

  const cats = d.railCats.map(c => `
          <a class="rail-cat" href="/archive?cat=${encodeURIComponent(c.name)}">
            <span>${esc(c.name)}</span>
            <span class="rail-cat-count">${c.count}</span>
          </a>`).join('');

  const tags = d.railTags.map(tag => `<a class="tag tag-outline" href="/archive?tag=${encodeURIComponent(tag)}">${esc(tag)}</a>`).join('');

  const subNote = d.subscribed
    ? `<p class="rail-note form-ok">${text(ctx, 'front.subscribe.success')}</p>`
    : `<p class="rail-note">${text(ctx, 'front.subscribe.note')}</p>`;

  return head(ctx, '') + frontHeader(ctx) + `
  <div class="masthead">
    <div class="masthead-kicker">${text(ctx, 'front.essays')}</div>
    <h1 class="masthead-title">${esc(ctx.s.title)}</h1>
    <p class="masthead-sub">${esc(ctx.s.subtitle)}</p>
  </div>

  <div class="home-grid">
    <main class="home-main">${posts}${pager}
    </main>

    <aside class="rail">
      <section>
        <h6 class="rail-h">${text(ctx, 'common.search')}</h6>
        <form class="sub-row" method="get" action="/search">
          <input class="input" type="search" name="q" placeholder="${text(ctx, 'front.searchPlaceholder')}" maxlength="80">
          <button class="btn btn-primary" type="submit">${text(ctx, 'common.search')}</button>
        </form>
      </section>
      <section>
        <h6 class="rail-h">${text(ctx, 'common.categories')}</h6>
        <div class="rail-cats">${cats}
        </div>
      </section>
      <section>
        <h6 class="rail-h">${text(ctx, 'common.tags')}</h6>
        <div class="rail-tags">${tags}</div>
      </section>
      <section id="subscribe">
        <h6 class="rail-h">${text(ctx, 'common.subscribe')}</h6>
        ${subNote}
        <form class="sub-row" method="post" action="/subscribe">
          <input class="input" type="email" name="email" placeholder="${text(ctx, 'front.emailPlaceholder')}" required>
          <button class="btn btn-primary" type="submit">${text(ctx, 'common.subscribe')}</button>
        </form>
      </section>
    </aside>
  </div>
` + frontFooter(ctx);
}

/** 文章详情 */
function article(ctx, d) {
  const { art, comments, commented } = d;
  const tags = art.tags.length
    ? `
    <div class="art-tags">
      ${art.tags.map(tag => `<a class="tag tag-outline" href="/archive?tag=${encodeURIComponent(tag)}">${esc(tag)}</a>`).join('')}
    </div>` : '';

  const postNav = (d.prevPost || d.nextPost) ? `
    <nav class="post-nav">
      <div class="pn-item">${d.prevPost ? `<span class="pn-label">← ${text(ctx, 'front.newer')}</span><a href="/post/${d.prevPost.id}">${esc(d.prevPost.title)}</a>` : ''}</div>
      <div class="pn-item pn-next">${d.nextPost ? `<span class="pn-label">${text(ctx, 'front.older')} →</span><a href="/post/${d.nextPost.id}">${esc(d.nextPost.title)}</a>` : ''}</div>
    </nav>` : '';

  const list = comments.length ? `
      <div class="comment-list">
        ${comments.map(c => `
        <div class="comment">
          <div class="c-head">
            <span class="c-author">${esc(c.author)}</span>
            <span class="c-date">${esc(c.date)}</span>
          </div>
          <p class="c-text">${esc(c.text)}</p>
        </div>`).join('')}
      </div>`
    : `\n      <p class="no-comments">${text(ctx, 'front.noComments')}</p>`;

  return head(ctx, art.title) + frontHeader(ctx) + `
  <div class="article">
    <div class="art-head">
      <div class="art-kicker">${esc(art.kicker)}</div>
      <h1 class="art-title">${esc(art.title)}</h1>
      <div class="art-meta">${esc(art.metaLine)}${art.isDraft ? `<span class="tag tag-neutral">${text(ctx, 'front.draftPreview')}</span>` : ''}</div>
    </div>

    <div>${art.bodyHtml}</div>
${tags}
    <div class="fleuron"><span>❦</span></div>
${postNav}
    <section class="comments" id="comments">
      <h3 class="comments-h">${text(ctx, 'front.comments')} <span class="count">(${art.commentCount})</span></h3>${list}

      ${d.canComment ? `<div class="comment-form">
        <div class="cf-kicker">${text(ctx, 'front.leaveMessage')}</div>
        <form method="post" action="/post/${art.id}/comment">
          <div class="field cf-field">
            <label>${text(ctx, 'front.signature')}</label>
            <input class="input" name="name" maxlength="40" placeholder="${text(ctx, 'front.namePlaceholder')}">
          </div>
          <div class="field cf-field--last">
            <label>${text(ctx, 'common.content')}</label>
            <textarea class="input" name="text" maxlength="2000" required placeholder="${text(ctx, 'front.commentPlaceholder')}"></textarea>
          </div>
          <div class="cf-actions">
            <button class="btn btn-primary" type="submit">${text(ctx, 'front.submitComment')}</button>
            ${commented ? `<span class="form-ok">${text(ctx, 'front.commentSubmitted')}</span>` : ''}
          </div>
        </form>
      </div>` : `<p class="no-comments">${text(ctx, 'front.draftCommentsClosed')}</p>`}
    </section>

    <div class="back-row"><a href="/">← ${text(ctx, 'front.backHome')}</a></div>
  </div>
` + frontFooter(ctx);
}

/** 归档 */
function archive(ctx, d) {
  const chips = d.archiveChips.map(c =>
    `<a class="tag ${c.active ? 'tag-accent' : 'tag-outline'}" href="${c.href}">${esc(c.name)}</a>`).join('\n      ');

  const groups = d.archiveGroups.map(g => `
    <section class="archive-group">
      <div>
        <div class="ag-year">${g.year}</div>
        <div class="ag-count">${text(ctx, 'front.postsCount', { count: g.count })}</div>
      </div>
      <div>
        ${g.items.map(it => `
        <a class="ag-item" href="/post/${it.id}">
          <span class="ag-date">${esc(it.date)}</span>
          <span class="ag-title">${esc(it.title)}</span>
          <span class="ag-cat">${esc(it.cat)}</span>
        </a>`).join('')}
      </div>
    </section>`).join('');

  return head(ctx, ctx.t('front.archive.title')) + frontHeader(ctx) + `
  <div class="archive">
    <h1 class="archive-title">${text(ctx, 'front.archive.title')}</h1>
    <p class="archive-summary">${esc(d.archiveSummary)}</p>

    <div class="archive-chips">
      ${chips}
    </div>
${groups}
  </div>
` + frontFooter(ctx);
}

/** 关于 */
function about(ctx, d) {
  const slot = d.portrait
    ? `<img src="${esc(d.portrait)}" alt="${text(ctx, 'front.about.authorPhoto')}">`
    : `<div class="portrait-empty">${text(ctx, 'front.about.photoEmpty')}</div>`;
  return head(ctx, ctx.t('front.about.title')) + frontHeader(ctx) + `
  <div class="about">
    <h1 class="about-title">${text(ctx, 'front.about.title')}</h1>

    <div class="portrait-row">
      <div class="plate portrait">
        ${slot}
      </div>
    </div>

    <p class="about-p">${text(ctx, 'front.about.intro1', { author: ctx.s.author })}</p>
    <p class="about-p">${text(ctx, 'front.about.intro2')}</p>

    <div class="about-div"></div>
    <p class="about-contact">${text(ctx, 'front.about.contact')} <a href="mailto:hi@mo.example">hi@mo.example</a> · <a href="/feed.xml">${text(ctx, 'front.about.rss')}</a></p>
  </div>
` + frontFooter(ctx);
}

/** 搜索结果 */
function search(ctx, d) {
  const summary = d.kw
    ? text(ctx, 'front.search.withCount', { keyword: d.kw, count: d.results.length })
    : text(ctx, 'front.search.help');

  const rows = d.results.map(it => `
        <a class="ag-item" href="/post/${it.id}">
          <span class="ag-date">${esc(it.date)}</span>
          <span class="ag-title">${esc(it.title)}</span>
          <span class="ag-cat">${esc(it.cat)}</span>
        </a>`).join('');

  const body = d.kw
    ? (d.results.length
      ? `\n    <section class="search-results">${rows}\n    </section>`
      : `\n    <p class="no-comments" style="text-align:center;margin-top:26px">${text(ctx, 'front.search.noResults', { keyword: d.kw })}</p>`)
    : '';

  return head(ctx, ctx.t('front.search.title')) + frontHeader(ctx) + `
  <div class="archive">
    <h1 class="archive-title">${text(ctx, 'front.search.title')}</h1>
    <p class="archive-summary">${summary}</p>

    <form class="search-row" method="get" action="/search">
      <input class="input" type="search" name="q" value="${esc(d.kw)}" placeholder="${text(ctx, 'front.searchPlaceholder')}" maxlength="80" autofocus>
      <button class="btn btn-primary" type="submit">${text(ctx, 'common.search')}</button>
    </form>${body}
  </div>
` + frontFooter(ctx);
}

/** 404 */
function notFound(ctx) {
  return head(ctx, ctx.t('front.notFound.pageTitle')) + frontHeader(ctx) + `
  <div class="article" style="text-align:center;padding-top:80px">
    <div class="art-kicker">404 · Not Found</div>
    <h1 class="art-title">${text(ctx, 'front.notFound.headline')}</h1>
    <p class="no-comments" style="margin-top:10px">${text(ctx, 'front.notFound.body')}</p>
    <div class="fleuron"><span>❦</span></div>
    <div class="back-row" style="margin-top:26px"><a href="/">← ${text(ctx, 'front.backHome')}</a></div>
  </div>
` + frontFooter(ctx);
}

module.exports = { home, article, archive, about, search, notFound };
