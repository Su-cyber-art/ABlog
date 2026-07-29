/* 默·博客 — 后台路由(登录/仪表盘/文章/写作/分类标签/评论/设置) */
'use strict';
const crypto = require('crypto');
const { db, q, tx, getSetting, setSetting, siteSettings, seedAll, parseTags } = require('../lib/db');
const {
  hashPassword, verifyPassword, makeToken, cookieOptions, SESSION_DAYS,
  clientIp, loginBlocked, recordLoginFail, clearLoginFails
} = require('../lib/auth');
const { mdToHtml } = require('../lib/md');
const { ADMIN_PATH, IS_SYSTEMD_MANAGED, adminUrl, normalizeAdminPath, saveAdminPathOverride } = require('../lib/config');
const { savePortrait, removePortrait } = require('../lib/media');
const { countryFlag, VISITOR_RETENTION_DAYS } = require('../lib/visitors');
const view = require('../views/admin');

function today() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
const statusText = p => p.status === 'published' ? '已发布' : '草稿';
const statusCls = p => 'tag ' + (p.status === 'published' ? 'tag-accent' : 'tag-neutral');

function ctx(req) {
  return {
    s: siteSettings(),
    year: String(new Date().getFullYear()),
    pendingN: Number(q.pendingCommentCount.get().count || 0)
  };
}

/** 登录保护:未登录 → 跳登录页;已登录 → 执行处理器 */
function guard(handler) {
  return (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.isAdmin) { res.redirect(adminUrl('/login')); return; }
    return handler(req, res);
  };
}

function intId(s) {
  if (!/^\d+$/.test(String(s || ''))) return null;
  const value = Number(s);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
function visitorKey(s) { return /^[a-f0-9]{64}$/.test(String(s || '')) ? String(s) : ''; }
function formatVisitTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}

function register(app) {

  /* ── 登录/登出 ── */
  app.get(adminUrl('/login'), (req, res) => {
    if (req.isAdmin) return res.redirect(ADMIN_PATH);
    res.html(view.login(ctx(req), {
      failed: req.query.failed === '1',
      blocked: req.query.blocked === '1'
    }));
  });

  app.post(adminUrl('/login'), async (req, res) => {
    const ip = clientIp(req);
    if (loginBlocked(ip)) return res.redirect(adminUrl('/login?blocked=1'));
    const ok = verifyPassword(String(req.body.password || ''), getSetting('admin_pass', ''));
    if (!ok) {
      recordLoginFail(ip);
      await new Promise(r => setTimeout(r, 600)); // 失败稍作延迟
      return res.redirect(adminUrl(loginBlocked(ip) ? '/login?blocked=1' : '/login?failed=1'));
    }
    clearLoginFails(ip);
    const token = makeToken(getSetting('session_secret', ''));
    res.setHeader('Set-Cookie', `mo_session=${token}; ${cookieOptions(SESSION_DAYS * 24 * 3600)}`);
    res.redirect(ADMIN_PATH);
  });

  app.post(adminUrl('/logout'), (req, res) => {
    if (req.isAdmin) setSetting('session_secret', crypto.randomBytes(32).toString('hex'));
    res.setHeader('Set-Cookie', `mo_session=; ${cookieOptions(0)}`);
    res.redirect('/');
  });

  /* ── 仪表盘 ── */
  app.get(ADMIN_PATH, guard((req, res) => {
    const all = q.allPosts.all();
    const pub = all.filter(p => p.status === 'published');
    const c = ctx(req);
    const visitorStats = q.visitorStats.get();
    res.html(view.dash(c, {
      todayLine: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
      statPub: pub.length,
      statDraft: all.length - pub.length,
      statPending: c.pendingN,
      statViews: all.reduce((a, p) => a + (p.views || 0), 0).toLocaleString('en-US'),
      statVisitors: Number(visitorStats.visitors || 0).toLocaleString('en-US'),
      recentPosts: all.slice(0, 5).map(p => ({ id: p.id, title: p.title, statusCls: statusCls(p), statusText: statusText(p), date: p.date })),
      pendingList: q.pendingCommentsLimited.all(50).map(cm => {
        const p = q.postById.get(cm.post_id);
        return { id: cm.id, author: cm.author, text: cm.text, postTitle: p ? p.title : '（已删除）' };
      })
    }));
  }));

  /* ── 文章管理 ── */
  app.get(adminUrl('/posts'), guard((req, res) => {
    const all = q.allPosts.all();
    const filter = ['全部', '已发布', '草稿'].includes(req.query.filter) ? req.query.filter : '全部';
    res.html(view.posts(ctx(req), {
      filter,
      nAll: all.length,
      nPub: all.filter(p => p.status === 'published').length,
      nDraft: all.filter(p => p.status === 'draft').length,
      rows: all
        .filter(p => filter === '全部' || (filter === '已发布' ? p.status === 'published' : p.status === 'draft'))
        .map(p => ({
          id: p.id, title: p.title, cat: p.cat,
          tagsText: parseTags(p).join(' · ') || '—',
          statusCls: statusCls(p), statusText: statusText(p),
          date: p.date, views: p.views || 0
        }))
    }));
  }));

  app.post(adminUrl('/posts/:id/delete'), guard((req, res) => {
    const id = intId(req.params.id);
    if (id) tx(() => { q.deletePostVisitors.run(id); q.deletePost.run(id); q.deletePostComments.run(id); });
    res.redirect(adminUrl('/posts'));
  }));

  /* ── 写作 ── */
  const renderEditor = (req, res, post, draft) => {
    res.html(view.editor(ctx(req), {
      editingId: post ? post.id : null,
      heading: post ? '编辑随笔' : '写作',
      dStatus: draft.status,
      dTitle: draft.title, dCat: draft.cat, dTags: draft.tags, dContent: draft.content,
      catOptions: ['未分类'].concat(q.cats.all().map(r => r.name)),
      previewHtml: mdToHtml(draft.content),
      wordCount: draft.content.replace(/\s/g, '').length
    }));
  };

  app.get(adminUrl('/editor'), guard((req, res) => {
    renderEditor(req, res, null, { title: '', cat: '未分类', tags: '', content: '', status: 'draft' });
  }));

  app.get(adminUrl('/editor/:id'), guard((req, res) => {
    const id = intId(req.params.id);
    const post = id && q.postById.get(id);
    if (!post) return false;
    renderEditor(req, res, post, {
      title: post.title, cat: post.cat, tags: parseTags(post).join(', '),
      content: post.content, status: post.status
    });
  }));

  app.post(adminUrl('/editor/save'), guard((req, res) => {
    const rawId = String(req.body.id || '');
    const id = intId(rawId);
    const status = req.body.action === 'publish' ? 'published' : 'draft';
    const title = String(req.body.title || '').trim().slice(0, 200) || '未命名随笔';
    const cat = String(req.body.cat || '未分类').slice(0, 40);
    const content = String(req.body.content || '').replace(/\r\n/g, '\n');
    const tags = [...new Set(String(req.body.tags || '').split(/[,，]/)
      .map(t => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
    if (content.length > 512 * 1024) return res.text('文章正文不能超过 512 KiB', 413);

    const existing = rawId ? (id && q.postById.get(id)) : null;
    if (rawId && !existing) {
      return renderEditor(req, res, { id, status }, { title, cat, tags: tags.join(', '), content, status });
    }

    tx(() => {
      tags.forEach(t => q.addTag.run(t));
      if (existing) {
        const date = (status === 'published' && existing.status !== 'published') ? today() : existing.date;
        q.updatePost.run(title, cat, JSON.stringify(tags), date, status, content, id);
      } else {
        q.insertPost.run(title, cat, JSON.stringify(tags), today(), status, content);
      }
    });
    const query = new URLSearchParams();
    if (status === 'draft') query.set('filter', '草稿');
    query.set('savedDraft', rawId || 'new');
    res.redirect(adminUrl('/posts') + '?' + query.toString());
  }));

  /* ── 分类与标签 ── */
  app.get(adminUrl('/taxonomy'), guard((req, res) => {
    const all = q.allPosts.all();
    res.html(view.taxonomy(ctx(req), {
      catRows: q.cats.all().map(r => ({ name: r.name, count: all.filter(p => p.cat === r.name).length })),
      tagChips: q.tags.all().map(r => r.name)
    }));
  }));

  app.post(adminUrl('/cats/add'), guard((req, res) => {
    const n = String(req.body.name || '').trim().slice(0, 40);
    if (n) q.addCat.run(n);
    res.redirect(adminUrl('/taxonomy'));
  }));

  app.post(adminUrl('/cats/delete'), guard((req, res) => {
    const n = String(req.body.name || '');
    const used = q.allPosts.all().filter(p => p.cat === n).length;
    if (used === 0) q.delCat.run(n); // 使用中的分类不可删除(前端有 alert 提示)
    res.redirect(adminUrl('/taxonomy'));
  }));

  app.post(adminUrl('/tags/add'), guard((req, res) => {
    const n = String(req.body.name || '').trim().slice(0, 40);
    if (n) q.addTag.run(n);
    res.redirect(adminUrl('/taxonomy'));
  }));

  app.post(adminUrl('/tags/delete'), guard((req, res) => {
    const n = String(req.body.name || '');
    tx(() => {
      q.delTag.run(n);
      // 文章上的引用一并去掉(与设计稿一致)
      for (const p of q.allPosts.all()) {
        const tags = parseTags(p);
        if (tags.includes(n)) {
          q.updatePost.run(p.title, p.cat, JSON.stringify(tags.filter(t => t !== n)), p.date, p.status, p.content, p.id);
        }
      }
    });
    res.redirect(adminUrl('/taxonomy'));
  }));

  /* ── 评论管理 ── */
  app.get(adminUrl('/comments'), guard((req, res) => {
    const filter = ['全部', '待审', '已通过', '垃圾'].includes(req.query.filter) ? req.query.filter : '全部';
    const map = { '待审': 'pending', '已通过': 'approved', '垃圾': 'spam' };
    const all = q.commentsAll.all();
    const cText = { pending: '待审', approved: '已通过', spam: '垃圾' };
    const cCls = { pending: 'tag tag-accent', approved: 'tag tag-outline', spam: 'tag tag-neutral' };
    res.html(view.comments(ctx(req), {
      filter,
      cnAll: all.length,
      cnPending: all.filter(c => c.status === 'pending').length,
      cnOk: all.filter(c => c.status === 'approved').length,
      cnSpam: all.filter(c => c.status === 'spam').length,
      rows: all
        .filter(c => filter === '全部' || c.status === map[filter])
        .map(c => {
          const p = q.postById.get(c.post_id);
          return {
            id: c.id, author: c.author, text: c.text, date: c.date,
            postId: p ? p.id : null,
            postTitle: p ? p.title : '（已删除）',
            statusText: cText[c.status], statusCls: cCls[c.status],
            canApprove: c.status !== 'approved', canSpam: c.status !== 'spam'
          };
        })
    }));
  }));

  app.post(adminUrl('/comments/:id/status'), guard((req, res) => {
    const id = intId(req.params.id);
    const status = ['approved', 'spam'].includes(req.body.status) ? req.body.status : null;
    if (id && status) q.setCommentStatus.run(status, id);
    res.redirect(adminUrl('/comments'));
  }));

  app.post(adminUrl('/comments/:id/delete'), guard((req, res) => {
    const id = intId(req.params.id);
    if (id) q.deleteComment.run(id);
    res.redirect(adminUrl('/comments'));
  }));

  /* ── 订阅者 ── */
  app.get(adminUrl('/subscribers'), guard((req, res) => {
    res.html(view.subscribers(ctx(req), { rows: q.listSubscribers.all() }));
  }));

  app.post(adminUrl('/subscribers/delete'), guard((req, res) => {
    q.delSubscriber.run(String(req.body.email || ''));
    res.redirect(adminUrl('/subscribers'));
  }));

  app.get(adminUrl('/subscribers.csv'), guard((req, res) => {
    const cell = value => {
      let v = String(value);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const csv = '﻿email,date\n'
      + q.listSubscribers.all().map(r => cell(r.email) + ',' + cell(r.date)).join('\n') + '\n';
    res.download(csv, 'subscribers-' + today() + '.csv', 'text/csv; charset=utf-8');
  }));

  /* ── 访客管理 ── */
  app.get(adminUrl('/visitors'), guard((req, res) => {
    const stats = q.visitorStats.get();
    const rows = q.listVisitors.all(200).map(row => ({
      key: row.visitor_key,
      ip: row.last_ip || '未知',
      flag: countryFlag(row.country_code),
      location: row.country_name || (row.country_code === 'LOCAL' ? '本地网络' : '未知'),
      locationDetail: [row.region, row.city].filter(Boolean).join(' · '),
      firstSeen: formatVisitTime(row.first_seen),
      lastSeen: formatVisitTime(row.last_seen),
      pageViews: row.page_views || 0,
      visits: row.visit_count || 0,
      lastPath: row.last_path || '—'
    }));
    res.html(view.visitors(ctx(req), {
      rows,
      visitorCount: Number(stats.visitors || 0),
      pageViews: Number(stats.page_views || 0),
      retentionDays: VISITOR_RETENTION_DAYS,
      cleared: req.query.cleared === '1'
    }));
  }));

  app.post(adminUrl('/visitors/:key/delete'), guard((req, res) => {
    const key = visitorKey(req.params.key);
    if (key) tx(() => {
      q.deleteVisitorPostRows.run(key);
      q.deleteVisitor.run(key);
      q.recomputeUniqueViews.run();
    });
    res.redirect(adminUrl('/visitors'));
  }));

  app.post(adminUrl('/visitors/clear'), guard((req, res) => {
    tx(() => { q.clearPostVisitors.run(); q.clearVisitors.run(); q.resetUniqueViews.run(); });
    res.redirect(adminUrl('/visitors?cleared=1'));
  }));

  /* ── 站点设置 ── */
  app.get(adminUrl('/settings'), guard((req, res) => {
    let adminPathChanged = '';
    if (req.query.adminPath && req.query.adminPath !== 'err') {
      try { adminPathChanged = normalizeAdminPath(req.query.adminPath); } catch (e) { /* 忽略无效查询值 */ }
    }
    res.html(view.settings(ctx(req), {
      saved: req.query.saved === '1',
      reset: req.query.reset === '1',
      pwChanged: req.query.pw === '1',
      importResult: ['ok', 'err'].includes(req.query.import) ? req.query.import : null,
      photoError: req.query.photo === 'err',
      adminPath: ADMIN_PATH,
      adminPathChanged,
      adminPathError: req.query.adminPath === 'err',
      restartScheduled: req.query.restart === '1' && Boolean(adminPathChanged)
    }));
  }));

  app.post(adminUrl('/settings'), guard((req, res) => {
    let requestedAdminPath;
    try {
      const rawAdminPath = req.body.adminPath == null ? ADMIN_PATH : String(req.body.adminPath).trim();
      if (!rawAdminPath) throw new Error('empty admin path');
      requestedAdminPath = normalizeAdminPath(rawAdminPath);
    } catch (e) {
      return res.redirect(adminUrl('/settings?adminPath=err'));
    }

    const pw = String(req.body.newPassword || '');
    if (pw && (pw.length < 8 || pw.length > 200)) return res.text('新密码长度必须为 8 到 200 个字符', 400);
    const portraitFiles = (req.files || []).filter(file => file.name === 'portrait');
    if (portraitFiles.length > 1) return res.text('一次只能上传一张照片', 400);
    const portrait = portraitFiles[0];
    try {
      if (portrait) savePortrait(portrait);
      else if (req.body.removePortrait === '1') removePortrait();
    } catch (e) {
      console.error('[默·博客] 照片上传失败:', e.message);
      return res.redirect(adminUrl('/settings?photo=err'));
    }
    setSetting('title', String(req.body.title || '默').slice(0, 60) || '默');
    setSetting('subtitle', String(req.body.subtitle || '').slice(0, 120));
    setSetting('author', String(req.body.author || '').slice(0, 40));
    setSetting('footer', String(req.body.footer || '').slice(0, 120));
    setSetting('perPage', Math.min(20, Math.max(1, parseInt(req.body.perPage, 10) || 5)));
    let suffix = '';
    if (pw) {
      setSetting('admin_pass', hashPassword(pw));
      // 轮换会话密钥:所有已发放的登录态立即失效(防旧 cookie 残留)
      setSetting('session_secret', crypto.randomBytes(32).toString('hex'));
      // 给当前这台设备重新签发会话,改密后无需重新登录
      const token = makeToken(getSetting('session_secret', ''));
      res.setHeader('Set-Cookie', `mo_session=${token}; ${cookieOptions(SESSION_DAYS * 24 * 3600)}`);
      suffix = '&pw=1';
    }

    let adminPathChanged = '';
    if (requestedAdminPath !== ADMIN_PATH) {
      try {
        adminPathChanged = saveAdminPathOverride(requestedAdminPath);
      } catch (e) {
        console.error('[默·博客] 后台路径保存失败:', e.message);
        return res.redirect(adminUrl('/settings?adminPath=err' + suffix));
      }
    }

    const restartScheduled = Boolean(adminPathChanged && IS_SYSTEMD_MANAGED);
    if (adminPathChanged) {
      suffix += '&adminPath=' + encodeURIComponent(adminPathChanged) + '&restart=' + (restartScheduled ? '1' : '0');
    }
    res.redirect(adminUrl('/settings?saved=1' + suffix));
    if (restartScheduled) {
      setTimeout(() => process.emit('ablog:restart'), 750).unref();
    }
  }));

  app.post(adminUrl('/reset'), guard((req, res) => {
    seedAll();
    res.redirect(adminUrl('/settings?reset=1'));
  }));

  /* ── 数据备份:导出 / 导入 ── */
  app.get(adminUrl('/export'), guard((req, res) => {
    const s = siteSettings();
    const data = {
      app: 'mo-blog', schema: 2, exportedAt: new Date().toISOString(),
      posts: q.allPosts.all().map(p => ({
        id: p.id, title: p.title, cat: p.cat, tags: parseTags(p),
        date: p.date, status: p.status, views: p.views, content: p.content
      })),
      comments: q.commentsAll.all().map(c => ({
        id: c.id, postId: c.post_id, author: c.author, date: c.date, status: c.status, text: c.text
      })),
      cats: q.cats.all().map(r => r.name),
      tags: q.tags.all().map(r => r.name),
      subscribers: q.listSubscribers.all().map(r => ({ email: r.email, date: r.date })),
      // 不导出访客/IP、独立阅读去重记录、会话、密码，照片文件也需要单独备份数据目录。
      settings: {
        title: s.title, subtitle: s.subtitle, author: s.author,
        footer: s.footer, perPage: s.perPage
      }
    };
    res.download(JSON.stringify(data, null, 2), 'mo-blog-backup-' + today() + '.json', 'application/json; charset=utf-8');
  }));

  app.post(adminUrl('/import'), guard((req, res) => {
    let data;
    const uploads = (req.files || []).filter(file => file.name === 'backup');
    if (uploads.length > 1) return res.redirect(adminUrl('/settings?import=err'));
    const payload = uploads[0] ? uploads[0].data.toString('utf8') : String(req.body.payload || '');
    try { data = JSON.parse(payload); } catch (e) { data = null; }
    const bad = !data || data.app !== 'mo-blog' || data.schema !== 2
      || !Array.isArray(data.posts) || !Array.isArray(data.comments)
      || !Array.isArray(data.cats) || !Array.isArray(data.tags)
      || data.posts.length > 5000 || data.comments.length > 20000
      || data.cats.length > 500 || data.tags.length > 5000
      || !Array.isArray(data.subscribers || []) || data.subscribers.length > 20000;
    if (bad) return res.redirect(adminUrl('/settings?import=err'));

    const str = (v, n) => String(v == null ? '' : v).slice(0, n);
    const validDate = value => {
      const text = String(value);
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
      if (!match) return false;
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1
        && date.getUTCDate() === Number(match[3]);
    };
    const dateOk = v => validDate(v) ? String(v) : null;
    const postIds = new Set();
    const commentIds = new Set();
    let contentBytes = 0;
    for (const p of data.posts) {
      const id = Number(p && p.id);
      const views = Number(p && p.views);
      contentBytes += Buffer.byteLength(String(p && p.content || ''));
      if (!Number.isSafeInteger(id) || id <= 0 || postIds.has(id)
        || !Number.isSafeInteger(views) || views < 0 || !dateOk(p && p.date)
        || String(p && p.content || '').length > 512 * 1024) return res.redirect(adminUrl('/settings?import=err'));
      postIds.add(id);
    }
    if (contentBytes > 16 * 1024 * 1024) return res.redirect(adminUrl('/settings?import=err'));
    for (const c of data.comments) {
      const id = Number(c && c.id);
      const postId = Number(c && c.postId);
      if (!Number.isSafeInteger(id) || id <= 0 || commentIds.has(id)
        || !Number.isSafeInteger(postId) || !postIds.has(postId) || !dateOk(c && c.date)) {
        return res.redirect(adminUrl('/settings?import=err'));
      }
      commentIds.add(id);
    }
    for (const sub of data.subscribers || []) {
      const email = str(sub && sub.email, 120).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !dateOk(sub && sub.date)) {
        return res.redirect(adminUrl('/settings?import=err'));
      }
    }
    try {
      tx(() => {
        db.exec('DELETE FROM post_visitors; DELETE FROM posts; DELETE FROM comments; DELETE FROM cats; DELETE FROM tags; DELETE FROM subscribers;');
        db.exec("DELETE FROM sqlite_sequence WHERE name IN ('posts','comments');");
        const insP = db.prepare('INSERT INTO posts(id,title,cat,tags,date,status,views,content) VALUES(?,?,?,?,?,?,?,?)');
        for (const p of data.posts) {
          insP.run(Number(p.id), str(p.title, 200) || '未命名随笔', str(p.cat, 40) || '未分类',
            JSON.stringify(Array.isArray(p.tags) ? [...new Set(p.tags.map(t => str(t, 40)).filter(Boolean))].slice(0, 20) : []),
            dateOk(p.date), p.status === 'published' ? 'published' : 'draft',
            Number(p.views), String(p.content == null ? '' : p.content));
        }
        const insC = db.prepare('INSERT INTO comments(id,post_id,author,date,status,text) VALUES(?,?,?,?,?,?)');
        for (const c of data.comments) {
          insC.run(Number(c.id), Number(c.postId), str(c.author, 40) || '匿名',
            dateOk(c.date), ['pending', 'approved', 'spam'].includes(c.status) ? c.status : 'pending',
            str(c.text, 2000));
        }
        const insCat = db.prepare('INSERT OR IGNORE INTO cats(name,pos) VALUES(?,?)');
        data.cats.forEach((n, i) => { const v = str(n, 40); if (v) insCat.run(v, i); });
        const insTag = db.prepare('INSERT OR IGNORE INTO tags(name,pos) VALUES(?,?)');
        data.tags.forEach((n, i) => { const v = str(n, 40); if (v) insTag.run(v, i); });
        for (const sub of data.subscribers || []) {
          q.addSubscriber.run(str(sub.email, 120).toLowerCase(), dateOk(sub.date));
        }
        if (data.settings && typeof data.settings === 'object') {
          const s = data.settings;
          if (s.title != null) setSetting('title', str(s.title, 60) || '默');
          if (s.subtitle != null) setSetting('subtitle', str(s.subtitle, 120));
          if (s.author != null) setSetting('author', str(s.author, 40));
          if (s.footer != null) setSetting('footer', str(s.footer, 120));
          if (s.perPage != null) setSetting('perPage', Math.min(20, Math.max(1, parseInt(s.perPage, 10) || 5)));
        }
      });
    } catch (e) {
      console.error('[默·博客] 导入失败:', e.message);
      return res.redirect(adminUrl('/settings?import=err'));
    }
    res.redirect(adminUrl('/settings?import=ok'));
  }));
}

module.exports = { register };
