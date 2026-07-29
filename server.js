/* 默·博客 — 服务入口(零依赖:Node 内置 http + node:sqlite) */
'use strict';

function readPort(value) {
  const raw = value == null || value === '' ? '3000' : String(value);
  if (!/^\d+$/.test(raw)) throw new Error('PORT 必须是 1 到 65535 之间的十进制整数');
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是 1 到 65535 之间的十进制整数');
  }
  return port;
}

const PORT = readPort(process.env.PORT);
const HOST = process.env.HOST == null || process.env.HOST === '' ? '127.0.0.1' : String(process.env.HOST).trim();
if (!HOST || /[\s/\\]/.test(HOST)) throw new Error('HOST 不是有效的监听地址');

const { ADMIN_PATH, IS_SYSTEMD_MANAGED } = require('./lib/config');
const { buildApp } = require('./lib/app');
const { db } = require('./lib/db');

const server = buildApp().listen(PORT, HOST, () => {
  console.log(`[默·博客] 前台  http://localhost:${PORT}`);
  console.log(`[默·博客] 后台  http://localhost:${PORT}${ADMIN_PATH}`);
});
server.on('error', err => {
  console.error(`[默·博客] 无法监听 ${HOST}:${PORT}: ${err.message}`);
  try { db.close(); } catch (e) { /* 忽略 */ }
  process.exit(1);
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

// 仅由 ABlog 自身的 systemd 单元标记时使用失败码触发 Restart=on-failure。
process.on('ablog:restart', () => {
  if (IS_SYSTEMD_MANAGED) shutdown('后台路径更新', 1);
});
