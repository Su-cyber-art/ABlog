/* 默·博客 — 前台视图(首页/文章/归档/关于/404) */
'use strict';
const { esc, head, frontHeader, frontFooter } = require('./_ui');

/** 首页 */
function home(ctx, d) {
  const posts = d.pagePosts.map(p => `
      <article class="post-item">
        <div class="post-kicker">${esc(p.kicker)}</div>
        <h2 class="post-title"><a href="/post/${p.id}">${esc(p.title)}</a></h2>
        <p class="post-excerpt">${esc(p.excerpt)}</p>
        <div class="post-links">
          <a class="read-link" href="/post/${p.id}">阅读全文</a>
          <span class="post-meta">${esc(p.metaLine)}</span>
        </div>
      </article>`).join('');

  const pager = d.showPager ? `
      <div class="pager">
        ${d.hasPrev ? `<a href="${d.prevHref}">← 较新</a>` : ''}
        <span class="pager-text">${esc(d.pagerText)}</span>
        ${d.hasNext ? `<a href="${d.nextHref}">较旧 →</a>` : ''}
      </div>` : '';

  const cats = d.railCats.map(c => `
          <a class="rail-cat" href="/archive?cat=${encodeURIComponent(c.name)}">
            <span>${esc(c.name)}</span>
            <span class="rail-cat-count">${c.count}</span>
          </a>`).join('');

  const tags = d.railTags.map(t => `<a class="tag tag-outline" href="/archive?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('');

  const subNote = d.subscribed
    ? '<p class="rail-note form-ok">已登记。新的随笔写好后，会寄一封信到你的邮箱。</p>'
    : '<p class="rail-note">新的随笔写好后，寄一封信到你的邮箱。</p>';

  return head(ctx, '') + frontHeader(ctx) + `
  <div class="masthead">
    <div class="masthead-kicker">随笔 · Essays</div>
    <h1 class="masthead-title">${esc(ctx.s.title)}</h1>
    <p class="masthead-sub">${esc(ctx.s.subtitle)}</p>
  </div>

  <div class="home-grid">
    <main class="home-main">${posts}${pager}
    </main>

    <aside class="rail">
      <section>
        <h6 class="rail-h">搜索</h6>
        <form class="sub-row" method="get" action="/search">
          <input class="input" type="search" name="q" placeholder="搜索随笔……" maxlength="80">
          <button class="btn btn-primary" type="submit">搜索</button>
        </form>
      </section>
      <section>
        <h6 class="rail-h">分类</h6>
        <div class="rail-cats">${cats}
        </div>
      </section>
      <section>
        <h6 class="rail-h">标签</h6>
        <div class="rail-tags">${tags}</div>
      </section>
      <section id="subscribe">
        <h6 class="rail-h">订阅</h6>
        ${subNote}
        <form class="sub-row" method="post" action="/subscribe">
          <input class="input" type="email" name="email" placeholder="邮箱地址" required>
          <button class="btn btn-primary" type="submit">订阅</button>
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
      ${art.tags.map(t => `<a class="tag tag-outline" href="/archive?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}
    </div>` : '';

  const postNav = (d.prevPost || d.nextPost) ? `
    <nav class="post-nav">
      <div class="pn-item">${d.prevPost ? `<span class="pn-label">← 较新</span><a href="/post/${d.prevPost.id}">${esc(d.prevPost.title)}</a>` : ''}</div>
      <div class="pn-item pn-next">${d.nextPost ? `<span class="pn-label">较旧 →</span><a href="/post/${d.nextPost.id}">${esc(d.nextPost.title)}</a>` : ''}</div>
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
    : '\n      <p class="no-comments">还没有评论，留下第一句话。</p>';

  return head(ctx, art.title) + frontHeader(ctx) + `
  <div class="article">
    <div class="art-head">
      <div class="art-kicker">${esc(art.kicker)}</div>
      <h1 class="art-title">${esc(art.title)}</h1>
      <div class="art-meta">${esc(art.metaLine)}${art.isDraft ? '<span class="tag tag-neutral">草稿预览</span>' : ''}</div>
    </div>

    <div>${art.bodyHtml}</div>
${tags}
    <div class="fleuron"><span>❦</span></div>
${postNav}
    <section class="comments" id="comments">
      <h3 class="comments-h">评论 <span class="count">（${art.commentCount}）</span></h3>${list}

      <div class="comment-form">
        <div class="cf-kicker">留言</div>
        <form method="post" action="/post/${art.id}/comment">
          <div class="field cf-field">
            <label>署名</label>
            <input class="input" name="name" maxlength="40" placeholder="如何称呼你">
          </div>
          <div class="field cf-field--last">
            <label>内容</label>
            <textarea class="input" name="text" maxlength="2000" required placeholder="写点什么……"></textarea>
          </div>
          <div class="cf-actions">
            <button class="btn btn-primary" type="submit">提交评论</button>
            ${commented ? '<span class="form-ok">已提交，审核通过后会显示在这里。</span>' : ''}
          </div>
        </form>
      </div>
    </section>

    <div class="back-row"><a href="/">← 返回首页</a></div>
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
        <div class="ag-count">${g.count} 篇</div>
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

  return head(ctx, '归档') + frontHeader(ctx) + `
  <div class="archive">
    <h1 class="archive-title">归档</h1>
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
    ? `<img src="${esc(d.portrait)}" alt="作者照片">`
    : '<div class="portrait-empty">作者照片 · 把 portrait.jpg 放进 public 文件夹</div>';
  return head(ctx, '关于') + frontHeader(ctx) + `
  <div class="about">
    <h1 class="about-title">关于</h1>

    <div class="portrait-row">
      <div class="plate portrait">
        ${slot}
      </div>
    </div>

    <p class="about-p">这是一段占位的自述。写字的人叫「${esc(ctx.s.author)}」，这里记一些不成体系的想法：读过的书、走过的路、雨天与茶。文字多半写于夜里，改于清晨。</p>
    <p class="about-p">此处仍是占位文字，用来示意「关于」页的篇幅与语气。真正的介绍可以稍后再写，版式先把位置留好。</p>

    <div class="about-div"></div>
    <p class="about-contact">来信请寄 <a href="mailto:hi@mo.example">hi@mo.example</a> · <a href="/feed.xml">RSS 订阅</a></p>
  </div>
` + frontFooter(ctx);
}

/** 搜索结果 */
function search(ctx, d) {
  const summary = d.kw
    ? `「${esc(d.kw)}」· 共 ${d.results.length} 篇`
    : '输入关键词,在全部已发布的随笔中查找';

  const rows = d.results.map(it => `
        <a class="ag-item" href="/post/${it.id}">
          <span class="ag-date">${esc(it.date)}</span>
          <span class="ag-title">${esc(it.title)}</span>
          <span class="ag-cat">${esc(it.cat)}</span>
        </a>`).join('');

  const body = d.kw
    ? (d.results.length
      ? `\n    <section class="search-results">${rows}\n    </section>`
      : `\n    <p class="no-comments" style="text-align:center;margin-top:26px">没有找到与「${esc(d.kw)}」相关的文章。</p>`)
    : '';

  return head(ctx, '搜索') + frontHeader(ctx) + `
  <div class="archive">
    <h1 class="archive-title">搜索</h1>
    <p class="archive-summary">${summary}</p>

    <form class="search-row" method="get" action="/search">
      <input class="input" type="search" name="q" value="${esc(d.kw)}" placeholder="搜索随笔……" maxlength="80" autofocus>
      <button class="btn btn-primary" type="submit">搜索</button>
    </form>${body}
  </div>
` + frontFooter(ctx);
}

/** 404 */
function notFound(ctx) {
  return head(ctx, '页面不存在') + frontHeader(ctx) + `
  <div class="article" style="text-align:center;padding-top:80px">
    <div class="art-kicker">404 · Not Found</div>
    <h1 class="art-title">这一页是空白的</h1>
    <p class="no-comments" style="margin-top:10px">你要找的文字不在这里，可能被移走了，也可能从未写下。</p>
    <div class="fleuron"><span>❦</span></div>
    <div class="back-row" style="margin-top:26px"><a href="/">← 返回首页</a></div>
  </div>
` + frontFooter(ctx);
}

module.exports = { home, article, archive, about, search, notFound };
