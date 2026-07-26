/* 默·博客 — 运行配置与 URL 生成 */
'use strict';

const DEFAULT_ADMIN_PATH = '/admin';
const RESERVED_ADMIN_PATHS = new Set([
  '/about',
  '/archive',
  '/css',
  '/favicon',
  '/fonts',
  '/js',
  '/post',
  '/subscribe'
]);

function normalizeAdminPath(value) {
  let adminPath = String(value || DEFAULT_ADMIN_PATH).trim();
  if (!adminPath.startsWith('/')) adminPath = '/' + adminPath;
  adminPath = adminPath.replace(/\/+$/, '');

  if (!/^\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(adminPath)) {
    throw new Error('ADMIN_PATH 必须是单段路径，例如 /admin 或 /manage_7f3a');
  }
  if (RESERVED_ADMIN_PATHS.has(adminPath.toLowerCase())) {
    throw new Error(`ADMIN_PATH 不能使用保留路径 ${adminPath}`);
  }
  return adminPath;
}

const ADMIN_PATH = normalizeAdminPath(process.env.ADMIN_PATH);

function adminUrl(suffix = '') {
  if (!suffix) return ADMIN_PATH;
  const value = String(suffix);
  if (value.startsWith('?')) return ADMIN_PATH + value;
  return ADMIN_PATH + (value.startsWith('/') ? value : '/' + value);
}

module.exports = { ADMIN_PATH, DEFAULT_ADMIN_PATH, adminUrl, normalizeAdminPath };
