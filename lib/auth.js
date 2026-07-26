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
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

module.exports = { hashPassword, verifyPassword, makeToken, checkToken, parseCookies, SESSION_DAYS };
