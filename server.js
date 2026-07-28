/* 默·博客 — 服务入口(零依赖:Node 内置 http + node:sqlite) */
'use strict';
const { ADMIN_PATH } = require('./lib/config');
const { buildApp } = require('./lib/app');
const { db } = require('./lib/db');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = buildApp().listen(PORT, HOST, () => {
  console.log(`[默·博客] 前台  http://localhost:${PORT}`);
  console.log(`[默·博客] 后台  http://localhost:${PORT}${ADMIN_PATH}`);
});

/* 优雅退出:停止接收新连接 → 关闭数据库 → 退出(systemd 重启/升级时不丢请求) */
let closing = false;
function shutdown(signal, exitCode = 0) {
  if (closing) return;
  closing = true;
  console.log(`[默·博客] 收到 ${signal},正在退出…`);
  server.close(() => {
    try { db.close(); } catch (e) { /* 忽略 */ }
    process.exit(exitCode);
  });
  setTimeout(() => process.exit(exitCode), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// 仅由 systemd 托管时使用失败码触发 Restart=on-failure，手工启动不被后台设置强制退出。
process.on('ablog:restart', () => {
  if (process.env.INVOCATION_ID) shutdown('后台路径更新', 1);
});
