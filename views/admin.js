/* 默·博客 — 后台视图(登录/仪表盘/文章/写作/分类标签/评论/设置) */
'use strict';
const {
  esc,
  head,
  adminTop,
  adminBottom,
  languageOptions,
  languageSwitcher
} = require('./_ui');
const { ADMIN_PATH } = require('../lib/config');

const text = (ctx, key, values) => esc(ctx.t(key, values));

/** 登录页 */
function login(ctx, d) {
  return head(ctx, ctx.t('admin.login.pageTitle')) + `
<div class="login-wrap">
  <div class="login-card">
    <div class="login-kicker">${text(ctx, 'admin.login.kicker')}</div>
    <div class="login-title">${esc(ctx.s.title)}</div>
    <p class="login-sub">${esc(ctx.s.subtitle)}</p>

    <form method="post" action="${ADMIN_PATH}/login">
      <div class="field">
        <label>${text(ctx, 'admin.login.password')}</label>
        <input class="input" type="password" name="password" autocomplete="current-password" autofocus required>
      </div>
      <button class="btn btn-primary btn-block" type="submit">${text(ctx, 'admin.login.submit')}</button>
      ${d.failed ? `<p class="login-failed">${text(ctx, 'admin.login.failed')}</p>` : ''}
      ${d.blocked ? `<p class="login-failed">${text(ctx, 'admin.login.blocked')}</p>` : ''}
    </form>

    <div class="login-back"><a href="/">← ${text(ctx, 'admin.login.back')}</a></div>
    ${languageSwitcher(ctx, 'login-locale')}
    <div class="login-fleuron">❦</div>
  </div>
</div>

</body>
</html>
`;
}

/** 仪表盘 */
function dash(ctx, d) {
  const recent = d.recentPosts.map(p => `
              <tr>
                <td><a class="row-link" href="${ADMIN_PATH}/editor/${p.id}">${esc(p.title)}</a></td>
                <td><span class="${p.statusCls}">${p.statusText}</span></td>
                <td class="cell-dim">${esc(p.date)}</td>
              </tr>`).join('');

  const pending = d.pendingList.length ? `
        <div class="pending-col">
          ${d.pendingList.map(c => `
          <div class="card gap-sm">
            <div class="pc-head">
              <span class="pc-author">${esc(c.author)}</span>
              <span class="text-muted">${text(ctx, 'admin.dashboard.onPost', { title: c.postTitle })}</span>
            </div>
            <p class="pc-text">${esc(c.text)}</p>
            <div class="pc-actions">
              <form method="post" action="${ADMIN_PATH}/comments/${c.id}/status"><input type="hidden" name="status" value="approved"><button class="btn btn-ghost" type="submit">${text(ctx, 'admin.dashboard.approve')}</button></form>
              <form method="post" action="${ADMIN_PATH}/comments/${c.id}/status"><input type="hidden" name="status" value="spam"><button class="btn btn-ghost muted" type="submit">${text(ctx, 'admin.dashboard.markSpam')}</button></form>
            </div>
          </div>`).join('')}
        </div>`
    : `\n        <p class="empty-dash">${text(ctx, 'admin.dashboard.noPending')}</p>`;

  return adminTop(ctx, 'dash', ctx.t('admin.dashboard.title')) + `
    <div class="page-head">
      <h2 class="page-title">${text(ctx, 'admin.dashboard.title')}</h2>
      <span class="head-note">${esc(d.todayLine)}</span>
      <span class="spacer"></span>
      <a class="btn btn-primary" href="${ADMIN_PATH}/editor">${text(ctx, 'admin.dashboard.newPost')}</a>
    </div>

    <div class="stat-grid">
      <div class="card"><div class="card-kicker">${text(ctx, 'common.published')}</div><div class="stat-num">${d.statPub}</div><div class="card-meta">${text(ctx, 'admin.dashboard.postsUnit')}</div></div>
      <div class="card"><div class="card-kicker">${text(ctx, 'common.draft')}</div><div class="stat-num">${d.statDraft}</div><div class="card-meta">${text(ctx, 'admin.dashboard.unpublished')}</div></div>
      <div class="card"><div class="card-kicker">${text(ctx, 'admin.dashboard.pendingComments')}</div><div class="stat-num ${d.statPending > 0 ? 'warn' : ''}">${d.statPending}</div><div class="card-meta">${text(ctx, 'admin.dashboard.waiting')}</div></div>
      <div class="card"><div class="card-kicker">${text(ctx, 'admin.dashboard.totalViews')}</div><div class="stat-num">${d.statViews}</div><div class="card-meta">${text(ctx, 'admin.dashboard.times')}</div></div>
      <div class="card"><div class="card-kicker">${text(ctx, 'admin.dashboard.uniqueVisitors')}</div><div class="stat-num">${d.statVisitors}</div><div class="card-meta">${text(ctx, 'admin.dashboard.lastDays', { days: d.retentionDays })}</div></div>
    </div>

    <div class="dash-grid">
      <section>
        <div class="sec-head">
          <h4 class="sec-title">${text(ctx, 'admin.dashboard.recentPosts')}</h4>
          <a class="sec-link" href="${ADMIN_PATH}/posts">${text(ctx, 'admin.dashboard.all')}</a>
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>${text(ctx, 'common.title')}</th><th style="width:76px">${text(ctx, 'common.status')}</th><th style="width:96px">${text(ctx, 'common.date')}</th></tr></thead>
            <tbody>${recent}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div class="sec-head">
          <h4 class="sec-title">${text(ctx, 'admin.dashboard.pendingComments')}</h4>
          <a class="sec-link" href="${ADMIN_PATH}/comments">${text(ctx, 'admin.dashboard.commentsManagement')}</a>
        </div>${pending}
      </section>
    </div>
` + adminBottom();
}

/** 文章管理 */
function posts(ctx, d) {
  const chip = (label, count, href, active) =>
    `<a class="tag ${active ? 'tag-accent' : 'tag-outline'}" href="${href}"><span>${label}</span><span class="n">${count}</span></a>`;

  const rows = d.rows.map(p => `
          <tr>
            <td><a class="row-title" href="${ADMIN_PATH}/editor/${p.id}">${esc(p.title)}</a></td>
            <td class="cell-cat">${esc(p.cat)}</td>
            <td class="cell-tags">${esc(p.tagsText)}</td>
            <td><span class="${p.statusCls}">${p.statusText}</span></td>
            <td class="cell-dim">${esc(p.date)}</td>
            <td class="cell-num">${p.views}</td>
            <td class="cell-ops">
              <a class="op" href="/post/${p.id}">${text(ctx, 'common.view')}</a>
              <a class="op" href="${ADMIN_PATH}/editor/${p.id}">${text(ctx, 'common.edit')}</a>
              <form class="inline" method="post" action="${ADMIN_PATH}/posts/${p.id}/delete" data-confirm="${text(ctx, 'admin.posts.deleteConfirm', { title: p.title })}"><button class="op muted" type="submit">${text(ctx, 'common.delete')}</button></form>
            </td>
          </tr>`).join('');

  return adminTop(ctx, 'posts', ctx.t('admin.posts.title')) + `
    <div class="page-head page-head--posts">
      <h2 class="page-title">${text(ctx, 'admin.posts.title')}</h2>
      <span class="spacer"></span>
      <a class="btn btn-primary" href="${ADMIN_PATH}/editor">${text(ctx, 'admin.posts.newPost')}</a>
    </div>

    <div class="filter-row">
      ${chip(text(ctx, 'common.all'), d.nAll, ADMIN_PATH + '/posts', d.filter === 'all')}
      ${chip(text(ctx, 'common.published'), d.nPub, ADMIN_PATH + '/posts?filter=published', d.filter === 'published')}
      ${chip(text(ctx, 'common.draft'), d.nDraft, ADMIN_PATH + '/posts?filter=draft', d.filter === 'draft')}
    </div>

    <div class="table-scroll">
      <table class="table">
        <thead><tr>
          <th>${text(ctx, 'common.title')}</th><th style="width:9%">${text(ctx, 'common.category')}</th><th style="width:15%">${text(ctx, 'common.tags')}</th>
          <th style="width:9%">${text(ctx, 'common.status')}</th><th style="width:11%">${text(ctx, 'common.date')}</th>
          <th style="width:7%;text-align:right">${text(ctx, 'common.views')}</th><th style="width:15%;text-align:right">${text(ctx, 'common.actions')}</th>
        </tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
    ${d.rows.length ? '' : `<p class="empty-note">${text(ctx, 'admin.posts.empty')}</p>`}
` + adminBottom();
}

/** 写作 */
function editor(ctx, d) {
  const options = d.catOptions.map(c =>
    `<option value="${esc(c)}"${d.dCat === c ? ' selected' : ''}>${esc(c)}</option>`).join('\n            ');
  const preview = d.dContent.trim()
    ? d.previewHtml
    : `<p class="ed-preview-empty">${text(ctx, 'admin.editor.previewEmpty')}</p>`;

  return adminTop(ctx, 'editor', d.heading) + `
    <form method="post" action="${ADMIN_PATH}/editor/save">
      ${d.editingId ? `<input type="hidden" name="id" value="${d.editingId}">` : ''}

      <div class="page-head page-head--editor">
        <h2 class="page-title">${d.heading}</h2>
        <span class="tag ${d.dStatus === 'published' ? 'tag-accent' : 'tag-neutral'}">${text(ctx, d.dStatus === 'published' ? 'common.published' : 'common.draft')}</span>
        <span class="spacer"></span>
        <a class="editor-head-back" href="${ADMIN_PATH}/posts">${text(ctx, 'admin.editor.backList')}</a>
        <button class="btn btn-secondary" type="submit" name="action" value="draft">${text(ctx, 'admin.editor.saveDraft')}</button>
        <button class="btn btn-primary" type="submit" name="action" value="publish">${text(ctx, 'admin.editor.publish')}</button>
      </div>

      <div class="editor-grid">
        <div class="field">
          <label>${text(ctx, 'common.title')}</label>
          <input class="input ed-title-input" name="title" value="${esc(d.dTitle)}" placeholder="${text(ctx, 'admin.editor.titlePlaceholder')}">
        </div>
        <div class="field">
          <label>${text(ctx, 'common.category')}</label>
          <select class="input" name="cat">
            ${options}
          </select>
        </div>
        <div class="field">
          <label>${text(ctx, 'admin.editor.tagsLabel')}</label>
          <input class="input" name="tags" value="${esc(d.dTags)}" placeholder="${text(ctx, 'admin.editor.tagsPlaceholder')}">
        </div>
      </div>

      <div class="editor-box">
        <div class="ed-cols">
          <div class="ed-col-label md">Markdown</div>
          <div class="ed-col-label pv">${text(ctx, 'admin.editor.preview')}</div>
          <textarea class="ed-textarea" id="ed-content" name="content" placeholder="${text(ctx, 'admin.editor.contentPlaceholder')}">${esc(d.dContent)}</textarea>
          <div class="ed-preview" id="ed-preview">${preview}</div>
        </div>
        <div class="ed-foot">
          <span><span id="ed-wordcount">${d.wordCount}</span> ${text(ctx, 'admin.editor.characters')}</span>
          <span class="spacer"></span>
          <span>${text(ctx, 'admin.editor.help')}</span>
        </div>
      </div>
    </form>
` + adminBottom();
}

/** 分类与标签 */
function taxonomy(ctx, d) {
  const catRows = d.catRows.map(c => `
          <div class="tax-row">
            <span class="tax-name">${esc(c.name)}</span>
            <span class="tax-count">${text(ctx, 'admin.taxonomy.postsCount', { count: c.count })}</span>
            ${c.count > 0
              ? `<span class="tax-del"><button type="button" data-alert="${text(ctx, 'admin.taxonomy.inUseAlert', { name: c.name, count: c.count })}">${text(ctx, 'common.delete')}</button></span>`
              : `<form class="tax-del" method="post" action="${ADMIN_PATH}/cats/delete"><input type="hidden" name="name" value="${esc(c.name)}"><button type="submit">${text(ctx, 'common.delete')}</button></form>`}
          </div>`).join('');

  const chips = d.tagChips.map(t => `
          <span class="tag tag-outline gap-7">${esc(t)}
            <form class="inline" style="margin:0" method="post" action="${ADMIN_PATH}/tags/delete"><input type="hidden" name="name" value="${esc(t)}"><button class="tag-x" type="submit">×</button></form>
          </span>`).join('');

  return adminTop(ctx, 'tax', ctx.t('admin.taxonomy.title')) + `
    <h2 class="page-title" style="margin-bottom:24px">${text(ctx, 'admin.taxonomy.title')}</h2>

    <div class="tax-grid">
      <section class="card tax-card">
        <h4 class="tax-h">${text(ctx, 'common.categories')}</h4>
        <p class="tax-note">${text(ctx, 'admin.taxonomy.inUse')}</p>
        <div class="tax-rows">${catRows}
        </div>
        <form class="tax-add" method="post" action="${ADMIN_PATH}/cats/add">
          <input class="input" name="name" placeholder="${text(ctx, 'admin.taxonomy.newCategory')}" required>
          <button class="btn btn-primary" type="submit">${text(ctx, 'common.add')}</button>
        </form>
      </section>

      <section class="card tax-card">
        <h4 class="tax-h">${text(ctx, 'common.tags')}</h4>
        <p class="tax-note">${text(ctx, 'admin.taxonomy.removeTagNote')}</p>
        <div class="tag-wrap">${chips}
        </div>
        <form class="tax-add tax-add--tags" method="post" action="${ADMIN_PATH}/tags/add">
          <input class="input" name="name" placeholder="${text(ctx, 'admin.taxonomy.newTag')}" required>
          <button class="btn btn-primary" type="submit">${text(ctx, 'common.add')}</button>
        </form>
      </section>
    </div>
` + adminBottom();
}

/** 评论管理 */
function comments(ctx, d) {
  const chip = (label, count, href, active) =>
    `<a class="tag ${active ? 'tag-accent' : 'tag-outline'}" href="${href}"><span>${label}</span><span class="n">${count}</span></a>`;

  const rows = d.rows.map(c => `
          <tr>
            <td class="cell-author">${esc(c.author)}</td>
            <td class="cell-comment-text">${esc(c.text)}</td>
            <td class="cell-post-link">${c.postId ? `<a href="/post/${c.postId}">${esc(c.postTitle)}</a>` : esc(c.postTitle)}</td>
            <td class="cell-dim">${esc(c.date)}</td>
            <td><span class="${c.statusCls}">${c.statusText}</span></td>
            <td class="cell-ops">
              ${c.canApprove ? `<form class="inline" method="post" action="${ADMIN_PATH}/comments/${c.id}/status"><input type="hidden" name="status" value="approved"><button class="op" type="submit">${text(ctx, 'admin.dashboard.approve')}</button></form>` : ''}
              ${c.canSpam ? `<form class="inline" method="post" action="${ADMIN_PATH}/comments/${c.id}/status"><input type="hidden" name="status" value="spam"><button class="op muted" type="submit">${text(ctx, 'common.spam')}</button></form>` : ''}
              <form class="inline" method="post" action="${ADMIN_PATH}/comments/${c.id}/delete" data-confirm="${text(ctx, 'admin.comments.deleteConfirm')}"><button class="op muted" type="submit">${text(ctx, 'common.delete')}</button></form>
            </td>
          </tr>`).join('');

  return adminTop(ctx, 'comments', ctx.t('admin.comments.title')) + `
    <h2 class="page-title" style="margin-bottom:22px">${text(ctx, 'admin.comments.title')}</h2>

    <div class="filter-row">
      ${chip(text(ctx, 'common.all'), d.cnAll, ADMIN_PATH + '/comments', d.filter === 'all')}
      ${chip(text(ctx, 'common.pending'), d.cnPending, ADMIN_PATH + '/comments?filter=pending', d.filter === 'pending')}
      ${chip(text(ctx, 'common.approved'), d.cnOk, ADMIN_PATH + '/comments?filter=approved', d.filter === 'approved')}
      ${chip(text(ctx, 'common.spam'), d.cnSpam, ADMIN_PATH + '/comments?filter=spam', d.filter === 'spam')}
    </div>

    <div class="table-scroll">
      <table class="table" style="table-layout:fixed">
        <thead><tr>
          <th style="width:11%">${text(ctx, 'common.author')}</th><th>${text(ctx, 'common.content')}</th><th style="width:15%">${text(ctx, 'admin.nav.posts')}</th>
          <th style="width:10%">${text(ctx, 'common.date')}</th><th style="width:8%">${text(ctx, 'common.status')}</th>
          <th style="width:15%;text-align:right">${text(ctx, 'common.actions')}</th>
        </tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
    ${d.rows.length ? '' : `<p class="empty-note">${text(ctx, 'admin.comments.empty')}</p>`}
` + adminBottom();
}

/** 订阅者 */
function subscribers(ctx, d) {
  const rows = d.rows.map(r => `
          <tr>
            <td class="cell-author" style="font-family:var(--font-body);font-weight:400">${esc(r.email)}</td>
            <td class="cell-dim">${esc(r.date)}</td>
            <td class="cell-ops">
              <form class="inline" method="post" action="${ADMIN_PATH}/subscribers/delete" data-confirm="${text(ctx, 'admin.subscribers.removeConfirm', { email: r.email })}"><input type="hidden" name="email" value="${esc(r.email)}"><button class="op muted" type="submit">${text(ctx, 'common.remove')}</button></form>
            </td>
          </tr>`).join('');

  return adminTop(ctx, 'subs', ctx.t('admin.subscribers.title')) + `
    <div class="page-head page-head--posts">
      <h2 class="page-title">${text(ctx, 'admin.subscribers.title')}</h2>
      <span class="head-note">${text(ctx, 'admin.subscribers.summary', { count: d.rows.length })}</span>
      <span class="spacer"></span>
      <a class="btn btn-secondary" href="${ADMIN_PATH}/subscribers.csv">${text(ctx, 'admin.subscribers.export')}</a>
    </div>

    <div class="table-scroll">
      <table class="table">
        <thead><tr>
          <th>${text(ctx, 'common.email')}</th><th style="width:18%">${text(ctx, 'admin.subscribers.registeredDate')}</th><th style="width:12%;text-align:right">${text(ctx, 'common.actions')}</th>
        </tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
    ${d.rows.length ? '' : `<p class="empty-note">${text(ctx, 'admin.subscribers.empty')}</p>`}
` + adminBottom();
}

/** 访客管理 */
function visitors(ctx, d) {
  const rows = d.rows.map(r => `
          <tr>
            <td class="visitor-ip">${esc(r.ip)}</td>
            <td>
              <div class="visitor-location"><span class="visitor-flag" aria-hidden="true">${esc(r.flag)}</span><span>${esc(r.location)}</span></div>
              ${r.locationDetail ? `<div class="cell-dim">${esc(r.locationDetail)}</div>` : ''}
            </td>
            <td class="cell-num">${r.pageViews} / ${r.visits}</td>
            <td class="visitor-path">${esc(r.lastPath)}</td>
            <td class="cell-dim visitor-time"><div>${esc(r.lastSeen)}</div><div>${text(ctx, 'admin.visitors.first', { time: r.firstSeen })}</div></td>
            <td class="cell-ops">
              <form class="inline" method="post" action="${ADMIN_PATH}/visitors/${r.key}/delete" data-confirm="${text(ctx, 'admin.visitors.deleteConfirm')}"><button class="op muted" type="submit">${text(ctx, 'common.delete')}</button></form>
            </td>
          </tr>`).join('');

  return adminTop(ctx, 'visitors', ctx.t('admin.visitors.title')) + `
    <div class="page-head page-head--posts">
      <h2 class="page-title">${text(ctx, 'admin.visitors.title')}</h2>
      <span class="head-note">${text(ctx, 'admin.visitors.summary', { days: d.retentionDays, visitors: d.visitorCount, views: d.pageViews })}</span>
      <span class="spacer"></span>
      <form method="post" action="${ADMIN_PATH}/visitors/clear" data-confirm="${text(ctx, 'admin.visitors.clearConfirm')}"><button class="btn btn-secondary" type="submit">${text(ctx, 'admin.visitors.clear')}</button></form>
    </div>

    ${d.cleared ? `<p class="form-ok" style="margin-bottom:16px">${text(ctx, 'admin.visitors.cleared')}</p>` : ''}
    <p class="visitor-note">${text(ctx, 'admin.visitors.note')}</p>
    <div class="table-scroll">
      <table class="table visitor-table">
        <thead><tr>
          <th>${text(ctx, 'admin.visitors.lastIp')}</th><th>${text(ctx, 'admin.visitors.location')}</th><th style="text-align:right">${text(ctx, 'admin.visitors.pagesVisits')}</th>
          <th>${text(ctx, 'admin.visitors.lastPage')}</th><th>${text(ctx, 'admin.visitors.recentFirst')}</th><th style="text-align:right">${text(ctx, 'common.actions')}</th>
        </tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
    ${d.rows.length ? '' : `<p class="empty-note">${text(ctx, 'admin.visitors.empty')}</p>`}
` + adminBottom();
}

/** 站点设置 */
function settings(ctx, d) {
  const s = ctx.s;
  const adminPath = d.adminPath || ADMIN_PATH;
  const portrait = s.portraitUrl
    ? `<img class="settings-portrait" src="${esc(s.portraitUrl)}" alt="${text(ctx, 'admin.settings.currentPhoto')}">`
    : `<div class="settings-portrait-empty">${text(ctx, 'admin.settings.noPhoto')}</div>`;
  const favicon = `<img id="favicon-current" src="${esc(s.faviconUrl)}" alt="${text(ctx, 'admin.settings.currentIconAlt')}">`;
  return adminTop(ctx, 'settings', ctx.t('admin.settings.title')) + `
    <div class="settings-col settings-wide">
      <h2 class="page-title" style="margin-bottom:24px">${text(ctx, 'admin.settings.title')}</h2>

      <form method="post" action="${ADMIN_PATH}/settings" enctype="multipart/form-data">
        <div class="settings-fields">
          <div class="field"><label>${text(ctx, 'admin.settings.siteName')}</label><input class="input" name="title" value="${esc(s.title)}"></div>
          <div class="field"><label>${text(ctx, 'admin.settings.subtitle')}</label><input class="input" name="subtitle" value="${esc(s.subtitle)}"></div>
          <div class="field"><label>${text(ctx, 'admin.settings.authorName')}</label><input class="input" name="author" value="${esc(s.author)}"></div>
          <div class="field"><label>${text(ctx, 'admin.settings.footer')}</label><input class="input" name="footer" value="${esc(s.footer)}"></div>
          <div class="field field--narrow"><label>${text(ctx, 'admin.settings.perPage')}</label><input class="input" type="number" min="1" max="20" name="perPage" value="${s.perPage}" style="font-variant-numeric:tabular-nums"></div>
          <div class="field field--locale"><label for="settings-locale">${text(ctx, 'admin.settings.defaultLanguage')}</label><select class="input" id="settings-locale" name="locale">${languageOptions(s.locale)}</select><p class="note">${text(ctx, 'admin.settings.defaultLanguageNote')}</p></div>
          <div class="field"><label>${text(ctx, 'admin.settings.adminPath')}</label><input class="input" name="adminPath" value="${esc(adminPath)}" maxlength="65" pattern="/[A-Za-z0-9][A-Za-z0-9_-]{0,63}" autocomplete="off"><p class="note">${text(ctx, 'admin.settings.adminPathNote')}</p></div>
          <div class="field"><label>${text(ctx, 'admin.settings.password')}</label><input class="input" type="password" name="newPassword" autocomplete="new-password" placeholder="${text(ctx, 'admin.settings.passwordPlaceholder')}"></div>
        </div>
        <div class="settings-photo">
          <div>${portrait}</div>
          <div class="settings-photo-fields">
            <div class="field"><label>${text(ctx, 'admin.settings.photo')}</label><input class="input" type="file" name="portrait" accept="image/jpeg,image/png,image/webp"></div>
            <p class="note">${text(ctx, 'admin.settings.photoNote')}</p>
            ${s.portraitUrl ? `<label class="check-row"><input type="checkbox" name="removePortrait" value="1"> ${text(ctx, 'admin.settings.removePhoto')}</label>` : ''}
          </div>
        </div>
        <div class="settings-actions">
          <button class="btn btn-primary" type="submit">${text(ctx, 'admin.settings.save')}</button>
          ${d.saved ? `<span class="form-ok">${text(ctx, 'admin.settings.saved')} ${d.pwChanged ? text(ctx, 'admin.settings.passwordUpdated') : ''}</span>` : ''}
          ${d.adminPathChanged ? `<span class="form-ok">${text(ctx, 'admin.settings.pathChanged')} <a href="${esc(d.adminPathChanged)}">${esc(d.adminPathChanged)}</a>. ${text(ctx, d.restartScheduled ? 'admin.settings.restarting' : 'admin.settings.restartRequired')}</span>` : ''}
          ${d.adminPathError ? `<span class="form-ok" style="color:var(--color-neutral-600)">${text(ctx, 'admin.settings.pathError')}</span>` : ''}
          ${d.reset ? `<span class="form-ok">${text(ctx, 'admin.settings.resetDone')}</span>` : ''}
          ${d.photoError ? `<span class="form-ok" style="color:var(--color-neutral-600)">${text(ctx, 'admin.settings.photoError')}</span>` : ''}
        </div>
      </form>

      <div class="settings-reset">
        <h4>${text(ctx, 'admin.settings.categoryTitle')}</h4>
        <p class="note">${text(ctx, 'admin.settings.categoryNote')} <a href="${ADMIN_PATH}/taxonomy">${text(ctx, 'admin.nav.taxonomy')}</a></p>
        <form class="tax-add settings-category-add" method="post" action="${ADMIN_PATH}/cats/add">
          <input type="hidden" name="returnTo" value="settings">
          <input class="input" name="name" maxlength="40" placeholder="${text(ctx, 'admin.taxonomy.newCategory')}" required>
          <button class="btn btn-primary" type="submit">${text(ctx, 'admin.settings.addCategory')}</button>
        </form>
        ${d.categoryResult === 'added' ? `<p class="form-ok">${text(ctx, 'admin.settings.categoryAdded')}</p>` : ''}
        ${d.categoryResult === 'exists' ? `<p class="form-ok">${text(ctx, 'admin.settings.categoryExists')}</p>` : ''}
        ${d.categoryResult === 'err' ? `<p class="form-ok" style="color:var(--color-neutral-600)">${text(ctx, 'admin.settings.categoryInvalid')}</p>` : ''}
      </div>

      <div class="settings-reset settings-favicon-section">
        <h4>${text(ctx, 'admin.settings.faviconTitle')}</h4>
        <p class="note">${text(ctx, 'admin.settings.faviconNote')}</p>
        <div class="favicon-settings-grid">
          <div class="favicon-current">
            <span>${text(ctx, 'admin.settings.currentIcon')}</span>
            ${favicon}
            <small>${text(ctx, s.faviconCustom ? 'common.custom' : 'common.default')}</small>
          </div>
          <div class="favicon-control">
            <form id="favicon-form" method="post" action="${ADMIN_PATH}/favicon" enctype="multipart/form-data" data-return-url="${ADMIN_PATH}/settings">
              <div class="field">
                <label for="favicon-file">${text(ctx, 'admin.settings.selectImage')}</label>
                <input class="input" id="favicon-file" type="file" accept=".svg,image/svg+xml,image/jpeg,image/png,image/webp">
              </div>
              <div class="favicon-editor" id="favicon-editor" hidden>
                <div class="favicon-workspace">
                  <div>
                    <span class="favicon-label">${text(ctx, 'admin.settings.cropArea')}</span>
                    <canvas class="favicon-crop" id="favicon-crop" width="256" height="256" tabindex="0" aria-label="${text(ctx, 'admin.settings.cropAria')}"></canvas>
                    <p class="note">${text(ctx, 'admin.settings.cropHelp')}</p>
                  </div>
                  <div class="favicon-preview-panel">
                    <span class="favicon-label">${text(ctx, 'admin.settings.tabPreview')}</span>
                    <div class="favicon-tab-preview">
                      <img id="favicon-preview-tab" alt="">
                      <span>${esc(s.title)}</span>
                    </div>
                    <div class="favicon-size-preview" aria-label="${text(ctx, 'admin.settings.sizesAria')}">
                      <span><img id="favicon-preview-32" alt="">32 px</span>
                      <span><img id="favicon-preview-16" alt="">16 px</span>
                    </div>
                  </div>
                </div>
                <label class="favicon-zoom" for="favicon-zoom">
                  <span>${text(ctx, 'admin.settings.zoom')}</span>
                  <input id="favicon-zoom" type="range" min="1" max="3" step="0.01" value="1">
                </label>
                <div class="favicon-actions">
                  <button class="btn btn-secondary" id="favicon-center" type="button">${text(ctx, 'admin.settings.resetCrop')}</button>
                  <button class="btn btn-ghost muted" id="favicon-cancel" type="button">${text(ctx, 'common.cancel')}</button>
                  <button class="btn btn-primary" id="favicon-upload" type="submit" disabled>${text(ctx, 'admin.settings.confirmUpload')}</button>
                </div>
              </div>
              <p class="favicon-status" id="favicon-status" role="status" aria-live="polite">
                ${d.faviconResult === 'saved' ? text(ctx, 'admin.settings.faviconUpdated') : ''}
                ${d.faviconResult === 'default' ? text(ctx, 'admin.settings.faviconRestored') : ''}
                ${d.faviconResult === 'err' ? text(ctx, 'admin.settings.faviconFailed') : ''}
              </p>
            </form>
            ${s.faviconCustom ? `<form method="post" action="${ADMIN_PATH}/favicon/remove" data-confirm="${text(ctx, 'admin.settings.restoreIconConfirm')}">
              <button class="btn btn-secondary" type="submit">${text(ctx, 'admin.settings.restoreDefaultIcon')}</button>
            </form>` : ''}
          </div>
        </div>
      </div>

      <div class="settings-reset">
        <h4>${text(ctx, 'admin.settings.backupTitle')}</h4>
        <p class="note">${text(ctx, 'admin.settings.backupNote')}</p>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
          <a class="btn btn-secondary" href="${ADMIN_PATH}/export">${text(ctx, 'admin.settings.exportBackup')}</a>
          ${d.importResult === 'ok' ? `<span class="form-ok">${text(ctx, 'admin.settings.importDone')}</span>` : ''}
          ${d.importResult === 'err' ? `<span class="form-ok" style="color:var(--color-neutral-600)">${text(ctx, 'admin.settings.importError')}</span>` : ''}
        </div>
        <form method="post" action="${ADMIN_PATH}/import" enctype="multipart/form-data" data-confirm="${text(ctx, 'admin.settings.importConfirm')}">
          <div class="field" style="margin-bottom:10px">
            <label>${text(ctx, 'admin.settings.importLabel')}</label>
            <input class="input" type="file" name="backup" accept="application/json,.json">
            <textarea class="input" name="payload" rows="4" placeholder='{"app":"mo-blog", …}' style="margin-top:8px"></textarea>
          </div>
          <button class="btn btn-secondary" type="submit">${text(ctx, 'admin.settings.importSubmit')}</button>
        </form>
      </div>

      <div class="settings-reset">
        <h4>${text(ctx, 'admin.settings.seedTitle')}</h4>
        <p class="note">${text(ctx, 'admin.settings.seedNote')}</p>
        <form method="post" action="${ADMIN_PATH}/reset" data-confirm="${text(ctx, 'admin.settings.seedConfirm')}">
          <button class="btn btn-secondary" type="submit">${text(ctx, 'admin.settings.seedAction')}</button>
        </form>
      </div>

      <div class="settings-reset">
        <h4>${text(ctx, 'admin.settings.logoutTitle')}</h4>
        <p class="note">${text(ctx, 'admin.settings.logoutNote')}</p>
        <form method="post" action="${ADMIN_PATH}/logout">
          <button class="btn btn-secondary" type="submit">${text(ctx, 'admin.settings.logoutAction')}</button>
        </form>
      </div>
    </div>
` + adminBottom();
}

module.exports = { login, dash, posts, editor, taxonomy, comments, subscribers, visitors, settings };
