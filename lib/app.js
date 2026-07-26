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
