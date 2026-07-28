/* 默·博客 — 后台视图(登录/仪表盘/文章/写作/分类标签/评论/设置) */
'use strict';
const { esc, head, adminTop, adminBottom } = require('./_ui');
const { ADMIN_PATH } = require('../lib/config');

/** 登录页 */
function login(ctx, d) {
  return head(ctx, '后台登录') + `
<div class="login-wrap">
  <div class="login-card">
    <div class="login-kicker">后台 · Admin</div>
    <div class="login-title">${esc(ctx.s.title)}</div>
    <p class="login-sub">${esc(ctx.s.subtitle)}</p>

    <form method="post" action="${ADMIN_PATH}/login">
      <div class="field">
        <label>密码</label>
        <input class="input" type="password" name="password" autocomplete="current-password" autofocus required>
      </div>
      <button class="btn btn-primary btn-block" type="submit">进入后台</button>
      ${d.failed ? '<p class="login-failed">密码不对，再试一次。</p>' : ''}
      ${d.blocked ? '<p class="login-failed">尝试次数过多，请 15 分钟后再试。</p>' : ''}
    </form>

    <div class="login-back"><a href="/">← 返回前台</a></div>
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
              <span class="text-muted">于《${esc(c.postTitle)}》</span>
            </div>
            <p class="pc-text">${esc(c.text)}</p>
            <div class="pc-actions">
              <form method="post" action="${ADMIN_PATH}/comments/${c.id}/status"><input type="hidden" name="status" value="approved"><button class="btn btn-ghost" type="submit">通过</button></form>
              <form method="post" action="${ADMIN_PATH}/comments/${c.id}/status"><input type="hidden" name="status" value="spam"><button class="btn btn-ghost muted" type="submit">标为垃圾</button></form>
            </div>
          </div>`).join('')}
        </div>`
    : '\n        <p class="empty-dash">没有等待审核的评论。</p>';

  return adminTop(ctx, 'dash', '仪表盘') + `
    <div class="page-head">
      <h2 class="page-title">仪表盘</h2>
      <span class="head-note">${esc(d.todayLine)}</span>
      <span class="spacer"></span>
      <a class="btn btn-primary" href="${ADMIN_PATH}/editor">写新随笔</a>
    </div>

    <div class="stat-grid">
      <div class="card"><div class="card-kicker">已发布</div><div class="stat-num">${d.statPub}</div><div class="card-meta">篇随笔</div></div>
      <div class="card"><div class="card-kicker">草稿</div><div class="stat-num">${d.statDraft}</div><div class="card-meta">篇未发布</div></div>
      <div class="card"><div class="card-kicker">待审评论</div><div class="stat-num ${d.statPending > 0 ? 'warn' : ''}">${d.statPending}</div><div class="card-meta">条等待处理</div></div>
      <div class="card"><div class="card-kicker">总阅读</div><div class="stat-num">${d.statViews}</div><div class="card-meta">次</div></div>
      <div class="card"><div class="card-kicker">独立访客</div><div class="stat-num">${d.statVisitors}</div><div class="card-meta">近 90 天</div></div>
    </div>

    <div class="dash-grid">
      <section>
        <div class="sec-head">
          <h4 class="sec-title">最近文章</h4>
          <a class="sec-link" href="${ADMIN_PATH}/posts">全部 →</a>
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>标题</th><th style="width:76px">状态</th><th style="width:96px">日期</th></tr></thead>
            <tbody>${recent}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div class="sec-head">
          <h4 class="sec-title">待审评论</h4>
          <a class="sec-link" href="${ADMIN_PATH}/comments">评论管理 →</a>
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
              <a class="op" href="/post/${p.id}">查看</a>
              <a class="op" href="${ADMIN_PATH}/editor/${p.id}">编辑</a>
              <form class="inline" method="post" action="${ADMIN_PATH}/posts/${p.id}/delete" data-confirm="删除《${esc(p.title)}》？评论会一并删除。"><button class="op muted" type="submit">删除</button></form>
            </td>
          </tr>`).join('');

  return adminTop(ctx, 'posts', '文章管理') + `
    <div class="page-head page-head--posts">
      <h2 class="page-title">文章管理</h2>
      <span class="spacer"></span>
      <a class="btn btn-primary" href="${ADMIN_PATH}/editor">新建随笔</a>
    </div>

    <div class="filter-row">
      ${chip('全部', d.nAll, ADMIN_PATH + '/posts', d.filter === '全部')}
      ${chip('已发布', d.nPub, ADMIN_PATH + '/posts?filter=已发布', d.filter === '已发布')}
      ${chip('草稿', d.nDraft, ADMIN_PATH + '/posts?filter=草稿', d.filter === '草稿')}
    </div>

    <div class="table-scroll">
      <table class="table">
        <thead><tr>
          <th>标题</th><th style="width:9%">分类</th><th style="width:15%">标签</th>
          <th style="width:9%">状态</th><th style="width:11%">日期</th>
          <th style="width:7%;text-align:right">阅读</th><th style="width:15%;text-align:right">操作</th>
        </tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
    ${d.rows.length ? '' : '<p class="empty-note">这里还没有文章。</p>'}
` + adminBottom();
}

/** 写作 */
function editor(ctx, d) {
  const options = d.catOptions.map(c =>
    `<option value="${esc(c)}"${d.dCat === c ? ' selected' : ''}>${esc(c)}</option>`).join('\n            ');
  const preview = d.dContent.trim()
    ? d.previewHtml
    : '<p class="ed-preview-empty">预览会随左侧输入实时更新。</p>';

  return adminTop(ctx, 'editor', d.heading) + `
    <form method="post" action="${ADMIN_PATH}/editor/save">
      ${d.editingId ? `<input type="hidden" name="id" value="${d.editingId}">` : ''}

      <div class="page-head page-head--editor">
        <h2 class="page-title">${d.heading}</h2>
        <span class="tag ${d.dStatus === 'published' ? 'tag-accent' : 'tag-neutral'}">${d.dStatus === 'published' ? '已发布' : '草稿'}</span>
        <span class="spacer"></span>
        <a class="editor-head-back" href="${ADMIN_PATH}/posts">返回列表</a>
        <button class="btn btn-secondary" type="submit" name="action" value="draft">存为草稿</button>
        <button class="btn btn-primary" type="submit" name="action" value="publish">发布</button>
      </div>

      <div class="editor-grid">
        <div class="field">
          <label>标题</label>
          <input class="input ed-title-input" name="title" value="${esc(d.dTitle)}" placeholder="随笔标题">
        </div>
        <div class="field">
          <label>分类</label>
          <select class="input" name="cat">
            ${options}
          </select>
        </div>
        <div class="field">
          <label>标签（逗号分隔）</label>
          <input class="input" name="tags" value="${esc(d.dTags)}" placeholder="雨, 夜">
        </div>
      </div>

      <div class="editor-box">
        <div class="ed-cols">
          <div class="ed-col-label md">Markdown</div>
          <div class="ed-col-label pv">预览</div>
          <textarea class="ed-textarea" id="ed-content" name="content" placeholder="# 从这里开始写……">${esc(d.dContent)}</textarea>
          <div class="ed-preview" id="ed-preview">${preview}</div>
        </div>
        <div class="ed-foot">
          <span><span id="ed-wordcount">${d.wordCount}</span> 字</span>
          <span class="spacer"></span>
          <span>支持 # 标题 · **粗体** · *斜体* · &gt; 引用 · - 列表 · --- 分隔线</span>
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
            <span class="tax-count">${c.count} 篇</span>
            ${c.count > 0
              ? `<span class="tax-del"><button type="button" data-alert="「${esc(c.name)}」还有 ${c.count} 篇文章，先移动或删除它们。">删除</button></span>`
              : `<form class="tax-del" method="post" action="${ADMIN_PATH}/cats/delete"><input type="hidden" name="name" value="${esc(c.name)}"><button type="submit">删除</button></form>`}
          </div>`).join('');

  const chips = d.tagChips.map(t => `
          <span class="tag tag-outline gap-7">${esc(t)}
            <form class="inline" style="margin:0" method="post" action="${ADMIN_PATH}/tags/delete"><input type="hidden" name="name" value="${esc(t)}"><button class="tag-x" type="submit">×</button></form>
          </span>`).join('');

  return adminTop(ctx, 'tax', '分类与标签') + `
    <h2 class="page-title" style="margin-bottom:24px">分类与标签</h2>

    <div class="tax-grid">
      <section class="card tax-card">
        <h4 class="tax-h">分类</h4>
        <p class="tax-note">使用中的分类不可删除。</p>
        <div class="tax-rows">${catRows}
        </div>
        <form class="tax-add" method="post" action="${ADMIN_PATH}/cats/add">
          <input class="input" name="name" placeholder="新分类名称" required>
          <button class="btn btn-primary" type="submit">添加</button>
        </form>
      </section>

      <section class="card tax-card">
        <h4 class="tax-h">标签</h4>
        <p class="tax-note">点 × 移除标签；文章上的引用会一并去掉。</p>
        <div class="tag-wrap">${chips}
        </div>
        <form class="tax-add tax-add--tags" method="post" action="${ADMIN_PATH}/tags/add">
          <input class="input" name="name" placeholder="新标签" required>
          <button class="btn btn-primary" type="submit">添加</button>
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
              ${c.canApprove ? `<form class="inline" method="post" action="${ADMIN_PATH}/comments/${c.id}/status"><input type="hidden" name="status" value="approved"><button class="op" type="submit">通过</button></form>` : ''}
              ${c.canSpam ? `<form class="inline" method="post" action="${ADMIN_PATH}/comments/${c.id}/status"><input type="hidden" name="status" value="spam"><button class="op muted" type="submit">垃圾</button></form>` : ''}
              <form class="inline" method="post" action="${ADMIN_PATH}/comments/${c.id}/delete" data-confirm="删除这条评论？"><button class="op muted" type="submit">删除</button></form>
            </td>
          </tr>`).join('');

  return adminTop(ctx, 'comments', '评论管理') + `
    <h2 class="page-title" style="margin-bottom:22px">评论管理</h2>

    <div class="filter-row">
      ${chip('全部', d.cnAll, ADMIN_PATH + '/comments', d.filter === '全部')}
      ${chip('待审', d.cnPending, ADMIN_PATH + '/comments?filter=待审', d.filter === '待审')}
      ${chip('已通过', d.cnOk, ADMIN_PATH + '/comments?filter=已通过', d.filter === '已通过')}
      ${chip('垃圾', d.cnSpam, ADMIN_PATH + '/comments?filter=垃圾', d.filter === '垃圾')}
    </div>

    <div class="table-scroll">
      <table class="table" style="table-layout:fixed">
        <thead><tr>
          <th style="width:11%">作者</th><th>内容</th><th style="width:15%">文章</th>
          <th style="width:10%">日期</th><th style="width:8%">状态</th>
          <th style="width:15%;text-align:right">操作</th>
        </tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
    ${d.rows.length ? '' : '<p class="empty-note">此筛选下没有评论。</p>'}
` + adminBottom();
}

/** 订阅者 */
function subscribers(ctx, d) {
  const rows = d.rows.map(r => `
          <tr>
            <td class="cell-author" style="font-family:var(--font-body);font-weight:400">${esc(r.email)}</td>
            <td class="cell-dim">${esc(r.date)}</td>
            <td class="cell-ops">
              <form class="inline" method="post" action="${ADMIN_PATH}/subscribers/delete" data-confirm="移除订阅者 ${esc(r.email)}？"><input type="hidden" name="email" value="${esc(r.email)}"><button class="op muted" type="submit">移除</button></form>
            </td>
          </tr>`).join('');

  return adminTop(ctx, 'subs', '订阅者') + `
    <div class="page-head page-head--posts">
      <h2 class="page-title">订阅者</h2>
      <span class="head-note">共 ${d.rows.length} 位 · 新随笔发布后可导出名单寄信</span>
      <span class="spacer"></span>
      <a class="btn btn-secondary" href="${ADMIN_PATH}/subscribers.csv">导出 CSV</a>
    </div>

    <div class="table-scroll">
      <table class="table">
        <thead><tr>
          <th>邮箱</th><th style="width:18%">登记日期</th><th style="width:12%;text-align:right">操作</th>
        </tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
    ${d.rows.length ? '' : '<p class="empty-note">还没有人订阅。前台首页侧栏的订阅框会把邮箱记到这里。</p>'}
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
            <td class="cell-dim visitor-time"><div>${esc(r.lastSeen)}</div><div>首次 ${esc(r.firstSeen)}</div></td>
            <td class="cell-ops">
              <form class="inline" method="post" action="${ADMIN_PATH}/visitors/${r.key}/delete" data-confirm="删除这位访客的记录？"><button class="op muted" type="submit">删除</button></form>
            </td>
          </tr>`).join('');

  return adminTop(ctx, 'visitors', '访客管理') + `
    <div class="page-head page-head--posts">
      <h2 class="page-title">访客管理</h2>
      <span class="head-note">近 ${d.retentionDays} 天 ${d.visitorCount} 位独立访客 · ${d.pageViews} 次页面访问</span>
      <span class="spacer"></span>
      <form method="post" action="${ADMIN_PATH}/visitors/clear" data-confirm="清空全部访客记录和文章去重记录？此操作不可恢复。"><button class="btn btn-secondary" type="submit">清空记录</button></form>
    </div>

    ${d.cleared ? '<p class="form-ok" style="margin-bottom:16px">访客记录已清空。</p>' : ''}
    <p class="visitor-note">仅保存匿名浏览器的最后 IP、最后页面和最近归属地；不记录完整浏览历史。没有可信代理国家头时，归属地会显示为“未知”。</p>
    <div class="table-scroll">
      <table class="table visitor-table">
        <thead><tr>
          <th>最后 IP</th><th>归属地</th><th style="text-align:right">页面 / 访问</th>
          <th>最后页面</th><th>最近访问 / 首次访问</th><th style="text-align:right">操作</th>
        </tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
    ${d.rows.length ? '' : '<p class="empty-note">还没有可显示的访客。公开页面被访问后会自动出现在这里。</p>'}
` + adminBottom();
}

/** 站点设置 */
function settings(ctx, d) {
  const s = ctx.s;
  const adminPath = d.adminPath || ADMIN_PATH;
  const portrait = s.portraitUrl
    ? `<img class="settings-portrait" src="${esc(s.portraitUrl)}" alt="当前作者照片">`
    : '<div class="settings-portrait-empty">尚未上传照片</div>';
  return adminTop(ctx, 'settings', '站点设置') + `
    <div class="settings-col settings-wide">
      <h2 class="page-title" style="margin-bottom:24px">站点设置</h2>

      <form method="post" action="${ADMIN_PATH}/settings" enctype="multipart/form-data">
        <div class="settings-fields">
          <div class="field"><label>站点名称</label><input class="input" name="title" value="${esc(s.title)}"></div>
          <div class="field"><label>副标题</label><input class="input" name="subtitle" value="${esc(s.subtitle)}"></div>
          <div class="field"><label>作者署名</label><input class="input" name="author" value="${esc(s.author)}"></div>
          <div class="field"><label>页脚文字</label><input class="input" name="footer" value="${esc(s.footer)}"></div>
          <div class="field field--narrow"><label>首页每页文章数</label><input class="input" type="number" min="1" max="20" name="perPage" value="${s.perPage}" style="font-variant-numeric:tabular-nums"></div>
          <div class="field"><label>后台路径</label><input class="input" name="adminPath" value="${esc(adminPath)}" maxlength="65" pattern="/[A-Za-z0-9][A-Za-z0-9_-]{0,63}" autocomplete="off"><p class="note">保存后在新路径继续管理；systemd 部署会自动重启，手工启动请自行重启服务。</p></div>
          <div class="field"><label>修改后台密码（留空则不变）</label><input class="input" type="password" name="newPassword" autocomplete="new-password" placeholder="新密码"></div>
        </div>
        <div class="settings-photo">
          <div>${portrait}</div>
          <div class="settings-photo-fields">
            <div class="field"><label>关于页作者照片</label><input class="input" type="file" name="portrait" accept="image/jpeg,image/png,image/webp"></div>
            <p class="note">支持 JPEG、PNG、WebP，最大 5 MiB。图片保存到数据目录，更新程序不会覆盖。</p>
            ${s.portraitUrl ? '<label class="check-row"><input type="checkbox" name="removePortrait" value="1"> 移除当前照片</label>' : ''}
          </div>
        </div>
        <div class="settings-actions">
          <button class="btn btn-primary" type="submit">保存设置</button>
          ${d.saved ? `<span class="form-ok">已保存。${d.pwChanged ? '密码已更新。' : ''}</span>` : ''}
          ${d.adminPathChanged ? `<span class="form-ok">后台路径已改为 <a href="${esc(d.adminPathChanged)}">${esc(d.adminPathChanged)}</a>。${d.restartScheduled ? '服务正在重启。' : '请重启服务后使用新路径。'}</span>` : ''}
          ${d.adminPathError ? '<span class="form-ok" style="color:var(--color-neutral-600)">后台路径无效或无法保存。</span>' : ''}
          ${d.reset ? '<span class="form-ok">示例数据已恢复。</span>' : ''}
          ${d.photoError ? '<span class="form-ok" style="color:var(--color-neutral-600)">照片未保存：请上传不超过 5 MiB 的 JPEG、PNG 或 WebP 文件。</span>' : ''}
        </div>
      </form>

      <div class="settings-reset">
        <h4>数据备份</h4>
        <p class="note">导出文章、评论、分类标签、订阅者与站点设置；不含密码、访客记录、IP 和照片文件。请单独备份数据目录内的 uploads 文件夹。</p>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
          <a class="btn btn-secondary" href="${ADMIN_PATH}/export">导出备份</a>
          ${d.importResult === 'ok' ? '<span class="form-ok">导入完成。</span>' : ''}
          ${d.importResult === 'err' ? '<span class="form-ok" style="color:var(--color-neutral-600)">导入失败：备份内容无法识别。</span>' : ''}
        </div>
        <form method="post" action="${ADMIN_PATH}/import" data-confirm="导入将覆盖现有全部文章、评论、分类标签与订阅者；文章独立访客数会重新开始统计，确定继续？">
          <div class="field" style="margin-bottom:10px">
            <label>恢复备份（粘贴备份文件的 JSON 内容）</label>
            <textarea class="input" name="payload" rows="4" placeholder='{"app":"mo-blog", …}'></textarea>
          </div>
          <button class="btn btn-secondary" type="submit">导入并覆盖</button>
        </form>
      </div>

      <div class="settings-reset">
        <h4>示例数据</h4>
        <p class="note">将文章、评论、分类与设置恢复为初始示例；文章独立访客数会重新统计。</p>
        <form method="post" action="${ADMIN_PATH}/reset" data-confirm="恢复初始示例数据？当前的文章与评论会被覆盖，文章独立访客数会重新统计。">
          <button class="btn btn-secondary" type="submit">恢复示例数据</button>
        </form>
      </div>

      <div class="settings-reset">
        <h4>退出登录</h4>
        <p class="note">退出后需要重新输入密码才能进入后台。</p>
        <form method="post" action="${ADMIN_PATH}/logout">
          <button class="btn btn-secondary" type="submit">退出登录</button>
        </form>
      </div>
    </div>
` + adminBottom();
}

module.exports = { login, dash, posts, editor, taxonomy, comments, subscribers, visitors, settings };
