/* 默·博客 — 应用装配(路由/静态/中间件),与进程启动分离以便测试 */
'use strict';
const path = require('path');
const { App } = require('./http');
const { getSetting, siteSettings } = require('./db');
const { checkToken } = require('./auth');
const frontRoutes = require('../routes/front');
const adminRoutes = require('../routes/admin');
const frontView = require('../views/front');

function buildApp() {
  const app = new App();

  /* 静态资源 */
  app.useStatic('/fonts', path.join(__dirname, '..', 'public', 'fonts'), 30 * 86400);
  app.useStatic('/', path.join(__dirname, '..', 'public'), 86400);
  app.useFile('/js/md.js', path.join(__dirname, '..', 'lib', 'md.js'), 3600);

  /* 跨站 POST 拦截:Origin 存在且与 Host 不一致即拒绝(SameSite cookie 之外的第二道防线) */
  app.usePre((req, res) => {
    if (req.method !== 'POST') return;
    const origin = req.headers.origin;
    if (!origin) return; // 无 Origin(curl/老客户端):放行,后台仍有会话校验
    let host = null;
    try { host = new URL(origin).host; } catch (e) { /* origin 为 null 或非法 */ }
    if (host !== req.headers.host) {
      res.text('跨站请求被拒绝', 403);
    }
  });

  /* 会话检查(后台登录态;前台用于草稿预览) */
  app.usePre((req, res) => {
    req.isAdmin = checkToken(req.cookies.mo_session, getSetting('session_secret', ''));
  });

  /* 健康检查(部署探活用) */
  app.get('/healthz', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));

  frontRoutes.register(app);
  adminRoutes.register(app);

  /* 404 */
  app.notFound((req, res) => {
    res.html(frontView.notFound({
      s: siteSettings(),
      year: String(new Date().getFullYear()),
      nav: ''
    }), 404);
  });

  return app;
}

module.exports = { buildApp };
