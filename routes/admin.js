/* 默·博客 — 后台路由(登录/仪表盘/文章/写作/分类标签/评论/设置) */
'use strict';
const crypto = require('crypto');
const { q, tx, getSetting, setSetting, siteSettings, seedAll, parseTags } = require('../lib/db');
const {
  hashPassword, verifyPassword, makeToken, SESSION_DAYS,
  clientIp, loginBlocked, recordLoginFail, clearLoginFails
} = require('../lib/auth');
const { mdToHtml } = require('../lib/md');
const { ADMIN_PATH, adminUrl } = require('../lib/config');
const view = require('../views/admin');

function today() { return new Date().toISOString().slice(0, 10); }
const statusText = p => p.status === 'published' ? '已发布' : '草稿';
const statusCls = p => 'tag ' + (p.status === 'published' ? 'tag-accent' : 'tag-neutral');

function ctx(req) {
  return {
    s: siteSettings(),
    year: String(new Date().getFullYear()),
    pendingN: q.pendingComments.all().length
  };
}

/** 登录保护:未登录 → 跳登录页;已登录 → 执行处理器 */
function guard(handler) {
  return (req, res) => {
    if (!req.isAdmin) { res.redirect(adminUrl('/login')); return; }
    return handler(req, res);
  };
}

function intId(s) { return /^\d+$/.test(s) ? Number(s) : null; }

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
    res.setHeader('Set-Cookie',
      `mo_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 3600}`);
    res.redirect(ADMIN_PATH);
  });

  app.post(adminUrl('/logout'), (req, res) => {
    res.setHeader('Set-Cookie', 'mo_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.redirect('/');
  });

  /* ── 仪表盘 ── */
  app.get(ADMIN_PATH, guard((req, res) => {
    const all = q.allPosts.all();
    const pub = all.filter(p => p.status === 'published');
    const c = ctx(req);
    res.html(view.dash(c, {
      todayLine: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
      statPub: pub.length,
      statDraft: all.length - pub.length,
      statPending: c.pendingN,
      statViews: all.reduce((a, p) => a + (p.views || 0), 0).toLocaleString('en-US'),
      recentPosts: all.slice(0, 5).map(p => ({ id: p.id, title: p.title, statusCls: statusCls(p), statusText: statusText(p), date: p.date })),
      pendingList: q.pendingComments.all().map(cm => {
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
    if (id) tx(() => { q.deletePost.run(id); q.deletePostComments.run(id); });
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
    const id = intId(String(req.body.id || ''));
    const status = req.body.action === 'publish' ? 'published' : 'draft';
    const title = String(req.body.title || '').trim().slice(0, 200) || '未命名随笔';
    const cat = String(req.body.cat || '未分类').slice(0, 40);
    const content = String(req.body.content || '').replace(/\r\n/g, '\n');
    const tags = String(req.body.tags || '').split(/[,，]/).map(t => t.trim()).filter(Boolean).slice(0, 20);

    tx(() => {
      tags.forEach(t => q.addTag.run(t));
      if (id) {
        const p = q.postById.get(id);
        if (p) {
          const date = (status === 'published' && p.status !== 'published') ? today() : p.date;
          q.updatePost.run(title, cat, JSON.stringify(tags), date, status, content, id);
        }
      } else {
        q.insertPost.run(title, cat, JSON.stringify(tags), today(), status, content);
      }
    });
    res.redirect(adminUrl('/posts') + (status === 'draft' ? '?filter=草稿' : ''));
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
    res.redirect(req.headers.referer || adminUrl('/comments'));
  }));

  app.post(adminUrl('/comments/:id/delete'), guard((req, res) => {
    const id = intId(req.params.id);
    if (id) q.deleteComment.run(id);
    res.redirect(req.headers.referer || adminUrl('/comments'));
  }));

  /* ── 站点设置 ── */
  app.get(adminUrl('/settings'), guard((req, res) => {
    res.html(view.settings(ctx(req), {
      saved: req.query.saved === '1',
      reset: req.query.reset === '1',
      pwChanged: req.query.pw === '1'
    }));
  }));

  app.post(adminUrl('/settings'), guard((req, res) => {
    setSetting('title', String(req.body.title || '默').slice(0, 60) || '默');
    setSetting('subtitle', String(req.body.subtitle || '').slice(0, 120));
    setSetting('author', String(req.body.author || '').slice(0, 40));
    setSetting('footer', String(req.body.footer || '').slice(0, 120));
    setSetting('perPage', Math.min(20, Math.max(1, parseInt(req.body.perPage, 10) || 5)));
    const pw = String(req.body.newPassword || '');
    let suffix = '';
    if (pw.trim()) {
      setSetting('admin_pass', hashPassword(pw.trim()));
      // 轮换会话密钥:所有已发放的登录态立即失效(防旧 cookie 残留)
      setSetting('session_secret', crypto.randomBytes(32).toString('hex'));
      // 给当前这台设备重新签发会话,改密后无需重新登录
      const token = makeToken(getSetting('session_secret', ''));
      res.setHeader('Set-Cookie',
        `mo_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 3600}`);
      suffix = '&pw=1';
    }
    res.redirect(adminUrl('/settings?saved=1' + suffix));
  }));

  app.post(adminUrl('/reset'), guard((req, res) => {
    seedAll();
    res.redirect(adminUrl('/settings?reset=1'));
  }));
}

module.exports = { register };
