/* 默·博客 — 运行配置与 URL 生成 */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_ADMIN_PATH = '/admin';
const CONFIG_DATA_DIR = process.env.ABLOG_DATA_DIR
  ? path.resolve(process.env.ABLOG_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const ADMIN_PATH_FILE = path.join(CONFIG_DATA_DIR, 'admin-path.json');
const RESERVED_ADMIN_PATHS = new Set([
  '/about',
  '/archive',
  '/css',
  '/feed.xml',
  '/favicon',
  '/fonts',
  '/healthz',
  '/js',
  '/post',
  '/robots.txt',
  '/search',
  '/sitemap.xml',
  '/subscribe',
  '/uploads'
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

function readAdminPathOverride() {
  try {
    const raw = fs.readFileSync(ADMIN_PATH_FILE, 'utf8');
    if (raw.length > 512) return '';
    const saved = JSON.parse(raw);
    if (!saved || typeof saved.adminPath !== 'string') return '';
    return normalizeAdminPath(saved.adminPath);
  } catch (e) {
    return '';
  }
}

function saveAdminPathOverride(value) {
  const adminPath = normalizeAdminPath(value);
  const temp = ADMIN_PATH_FILE + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.mkdirSync(CONFIG_DATA_DIR, { recursive: true, mode: 0o750 });
  try {
    fs.writeFileSync(temp, JSON.stringify({ adminPath }) + '\n', { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, ADMIN_PATH_FILE);
  } catch (e) {
    try { fs.unlinkSync(temp); } catch (_) {}
    throw e;
  }
  return adminPath;
}

// 由后台保存的路径优先于初次部署环境变量；无效或损坏的文件安全回退到环境配置。
const ADMIN_PATH = readAdminPathOverride() || normalizeAdminPath(process.env.ADMIN_PATH);

function adminUrl(suffix = '') {
  if (!suffix) return ADMIN_PATH;
  const value = String(suffix);
  if (value.startsWith('?')) return ADMIN_PATH + value;
  return ADMIN_PATH + (value.startsWith('/') ? value : '/' + value);
}

module.exports = {
  ADMIN_PATH, ADMIN_PATH_FILE, DEFAULT_ADMIN_PATH,
  adminUrl, normalizeAdminPath, readAdminPathOverride, saveAdminPathOverride
};
