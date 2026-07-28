/* 默·博客 — 登录会话与密码工具(零额外依赖,Node 内置 crypto) */
'use strict';
const crypto = require('crypto');

const SESSION_DAYS = 7;

/** scrypt 加盐哈希,格式 s2:<salt>:<hash> */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return `s2:${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  try {
    const [tag, salt, hash] = String(stored).split(':');
    if (tag !== 's2' || !salt || !hash) return false;
    const got = crypto.scryptSync(String(pw), salt, 32);
    return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
  } catch (e) { return false; }
}

function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/** 生成会话令牌:<过期时间戳>.<HMAC 签名> */
function makeToken(secret) {
  const exp = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  return exp + '.' + sign(secret, 'mo-session:' + exp);
}

function checkToken(token, secret) {
  if (!token) return false;
  const i = token.indexOf('.');
  if (i < 0) return false;
  const exp = token.slice(0, i), sig = token.slice(i + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const want = sign(secret, 'mo-session:' + exp);
  const a = Buffer.from(sig), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** 极简 cookie 解析 */
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch (e) { /* 畸形 cookie 直接忽略，不能让请求失败 */ }
  }
  return out;
}

/** 客户端 IP(设 TRUST_PROXY=1 时信任反向代理的 X-Forwarded-For 首值) */
function clientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress || 'unknown';
}

/* ── 登录失败限速:同一 IP 15 分钟内失败 8 次即锁定 ── */
const LOGIN_MAX_FAILS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFails = new Map(); // ip → { count, resetAt }

function pruneLoginFails(now) {
  if (loginFails.size < 256) return;
  for (const [ip, e] of loginFails) { if (e.resetAt <= now) loginFails.delete(ip); }
}

function loginBlocked(ip) {
  const e = loginFails.get(ip);
  if (!e) return false;
  if (e.resetAt <= Date.now()) { loginFails.delete(ip); return false; }
  return e.count >= LOGIN_MAX_FAILS;
}

function recordLoginFail(ip) {
  const now = Date.now();
  pruneLoginFails(now);
  const e = loginFails.get(ip);
  if (!e || e.resetAt <= now) loginFails.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  else e.count += 1;
}

function clearLoginFails(ip) { loginFails.delete(ip); }

module.exports = {
  hashPassword, verifyPassword, makeToken, checkToken, parseCookies, SESSION_DAYS,
  clientIp, loginBlocked, recordLoginFail, clearLoginFails, LOGIN_MAX_FAILS
};
