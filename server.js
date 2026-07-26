/* 默·博客 — 服务入口(零依赖:Node 内置 http + node:sqlite) */
'use strict';
const path = require('path');
const { ADMIN_PATH } = require('./lib/config');
const { App } = require('./lib/http');
const { getSetting, siteSettings } = require('./lib/db');
const { checkToken } = require('./lib/auth');
const frontRoutes = require('./routes/front');
const adminRoutes = require('./routes/admin');
const frontView = require('./views/front');

const app = new App();

/* 静态资源 */
app.useStatic('/fonts', path.join(__dirname, 'public', 'fonts'), 30 * 86400);
app.useStatic('/', path.join(__dirname, 'public'), 86400);
app.useFile('/js/md.js', path.join(__dirname, 'lib', 'md.js'), 3600);

/* 会话检查(后台登录态;前台用于草稿预览) */
app.usePre((req, res) => {
  req.isAdmin = checkToken(req.cookies.mo_session, getSetting('session_secret', ''));
});

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

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`[默·博客] 前台  http://localhost:${PORT}`);
  console.log(`[默·博客] 后台  http://localhost:${PORT}${ADMIN_PATH}`);
});
