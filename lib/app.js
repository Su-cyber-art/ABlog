/* 默·博客 — 应用装配(路由/静态/中间件),与进程启动分离以便测试 */
'use strict';
const path = require('path');
const { App } = require('./http');
const { DATA_DIR, getSetting, siteSettings } = require('./db');
const { checkToken } = require('./auth');
const frontRoutes = require('../routes/front');
const adminRoutes = require('../routes/admin');
const frontView = require('../views/front');
const { ADMIN_PATH, SITE_URL, adminUrl } = require('./config');
const { attachRequestI18n, safeLocalPath } = require('./i18n');

function buildApp() {
  const app = new App();

  /* 静态资源 */
  app.useStatic('/uploads', path.join(DATA_DIR, 'uploads'), 3600);
  app.useStatic('/fonts', path.join(__dirname, '..', 'public', 'fonts'), 30 * 86400);
  app.useStatic('/', path.join(__dirname, '..', 'public'), 86400);
  app.useFile('/js/md.js', path.join(__dirname, '..', 'lib', 'md.js'), 3600);

  /* 跨站 POST 拦截:优先使用配置的公网源，否则按实际 Host 校验。 */
  app.usePre((req, res) => {
    attachRequestI18n(req, getSetting('locale', 'zh-CN'));
    if (req.method !== 'POST') return;
    const origin = req.headers.origin;
    if (!origin) return; // 无 Origin(curl/老客户端):放行,后台仍有会话校验
    let actual;
    try { actual = new URL(origin); } catch (e) { /* origin 为 null 或非法 */ }
    let allowed = false;
    if (actual && SITE_URL) {
      allowed = actual.origin === SITE_URL;
    } else if (actual) {
      const host = String(req.headers.host || '');
      // 未配置公网源时只比较严格的 authority，兼容 HTTPS 终止于反向代理的部署。
      if (/^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/.test(host)) {
        allowed = actual.host === host;
      }
    }
    if (!allowed) res.text(req.t('error.crossSite'), 403);
  });

  /* 会话检查(后台登录态;前台用于草稿预览) */
  app.usePre((req, res) => {
    req.isAdmin = checkToken(req.cookies.mo_session, getSetting('session_secret', ''));
  });

  /* 未登录后台 POST 在读取请求体前立即拒绝，避免无效大表单占用内存。 */
  app.usePre((req, res) => {
    if (req.method !== 'POST' || req.isAdmin || !req.pathname.startsWith(ADMIN_PATH + '/')) return;
    if (req.pathname === adminUrl('/login') || req.pathname === adminUrl('/logout')) return;
    res.redirect(adminUrl('/login'));
  });

  app.setBodyLimit(req => {
    if (req.isAdmin && (req.pathname === adminUrl('/settings') || req.pathname === adminUrl('/import'))) {
      return 20 * 1024 * 1024;
    }
    if (req.isAdmin && req.pathname === adminUrl('/favicon')) return 768 * 1024;
    // URL 编码后的多字节正文最坏会明显膨胀，业务层仍按 512 KiB UTF-8 正文限制。
    if (req.isAdmin && req.pathname === adminUrl('/editor/save')) return 5 * 1024 * 1024;
    return 64 * 1024;
  });

  /* 健康检查(部署探活用) */
  app.get('/healthz', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));

  frontRoutes.register(app);
  adminRoutes.register(app);

  /* 404 */
  app.notFound((req, res) => {
    const s = siteSettings();
    const { locale, t } = attachRequestI18n(req, s.locale);
    res.html(frontView.notFound({
      s,
      locale,
      t,
      year: String(new Date().getFullYear()),
      nav: '',
      currentPath: safeLocalPath(req.url)
    }), 404);
  });

  return app;
}

module.exports = { buildApp };
