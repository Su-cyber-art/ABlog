/* 默·博客 — 匿名独立访客、文章去重阅读与可信代理地区信息 */
'use strict';
const crypto = require('crypto');
const net = require('net');
const { q, tx, getSetting, setSetting } = require('./db');
const { clientIp, cookieOptions } = require('./auth');

const VISITOR_COOKIE = 'mo_visitor';
const VISITOR_COOKIE_AGE = 365 * 24 * 60 * 60;
const VISITOR_RETENTION_DAYS = 90;
let lastPurgeAt = 0;

function sign(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function visitorSecret() {
  let secret = getSetting('visitor_secret', '');
  if (!/^[a-f0-9]{64}$/.test(secret)) {
    secret = crypto.randomBytes(32).toString('hex');
    setSetting('visitor_secret', secret);
  }
  return secret;
}

function visitorToken() {
  const nonce = crypto.randomBytes(24).toString('base64url');
  return 'v1.' + nonce + '.' + sign(visitorSecret(), 'mo-visitor:' + nonce);
}

function visitorKey(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !/^[A-Za-z0-9_-]{20,64}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{20,64}$/.test(parts[2])) return '';
  const expected = sign(visitorSecret(), 'mo-visitor:' + parts[1]);
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return '';
  return crypto.createHash('sha256').update('mo-visitor:' + parts[1]).digest('hex');
}

function appendCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  const values = !current ? [] : (Array.isArray(current) ? current : [current]);
  values.push(cookie);
  res.setHeader('Set-Cookie', values);
}

function getVisitorKey(req, res) {
  const known = visitorKey(req.cookies[VISITOR_COOKIE]);
  if (known) return known;
  const token = visitorToken();
  appendCookie(res, `${VISITOR_COOKIE}=${token}; ${cookieOptions(VISITOR_COOKIE_AGE)}`);
  return visitorKey(token);
}

function normalizeIp(value) {
  let ip = String(value || '').trim().slice(0, 64);
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  const zone = ip.indexOf('%');
  if (zone >= 0) ip = ip.slice(0, zone);
  return net.isIP(ip) ? ip : '';
}

function isPrivateIp(ip) {
  if (ip === '::1' || ip === '127.0.0.1') return true;
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return /^f[cd]|^fe[89ab]/i.test(ip);
}

function countryName(code) {
  try { return new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(code) || code; } catch (e) { return code; }
}

function countryFlag(code) {
  if (code === 'LOCAL') return '🏠';
  if (!/^[A-Z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...[...code].map(ch => 0x1f1a5 + ch.charCodeAt(0)));
}

function trustedLocation(req, ip) {
  if (isPrivateIp(ip)) return { code: 'LOCAL', country: '本地网络', region: '', city: '' };
  if (process.env.TRUST_PROXY !== '1') return null;
  const header = String(process.env.VISITOR_COUNTRY_HEADER || 'cf-ipcountry').toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(header)) return null;
  const code = String(req.headers[header] || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return null;
  return { code, country: countryName(code), region: '', city: '' };
}

function isBot(req) {
  const ua = String(req.headers['user-agent'] || '');
  const purpose = String(req.headers.purpose || req.headers['sec-purpose'] || '');
  return /bot|spider|crawler|slurp|facebookexternalhit|preview/i.test(ua) || /prefetch/i.test(purpose);
}

function shouldTrack(req) {
  return req.method === 'GET' && !req.isAdmin && !isBot(req) && req.headers.dnt !== '1' && req.headers['sec-gpc'] !== '1';
}

function purgeOldVisitors(force = false) {
  const now = Date.now();
  if (!force && now - lastPurgeAt < 6 * 60 * 60 * 1000) return;
  const cutoff = new Date(now - VISITOR_RETENTION_DAYS * 86400000).toISOString();
  tx(() => {
    q.deleteExpiredVisitors.run(cutoff);
    q.deleteOrphanPostVisitors.run();
    // 文章独立访客与匿名访客采用相同的 90 天保留窗口。
    q.recomputeUniqueViews.run();
  });
  lastPurgeAt = now;
}

// 即使长时间没有公开访问，也在启动和之后的定时任务中执行保留期清理。
purgeOldVisitors();
setInterval(() => {
  try { purgeOldVisitors(); } catch (e) { console.error('[默·博客] 访客保留期清理失败:', e.message); }
}, 6 * 60 * 60 * 1000).unref();

function trackVisitor(req, res, pagePath) {
  if (!shouldTrack(req)) return null;
  purgeOldVisitors();

  const key = getVisitorKey(req, res);
  const now = new Date().toISOString();
  const ip = normalizeIp(clientIp(req)) || '未知';
  const existing = q.visitorByKey.get(key);
  const location = trustedLocation(req, ip);
  const newSession = !existing || Date.parse(now) - Date.parse(existing.last_seen) > 30 * 60 * 1000 ? 1 : 0;

  tx(() => {
    if (!existing) {
      q.insertVisitor.run(key, ip, location ? location.code : '', location ? location.country : '', location ? location.region : '', location ? location.city : '', now, now, String(pagePath || '/').slice(0, 160));
      return;
    }
    q.touchVisitor.run(ip, now, newSession, String(pagePath || '/').slice(0, 160), key);
    if (location) q.setVisitorLocation.run(location.code, location.country, location.region, location.city, now, key);
    else if (existing.last_ip !== ip) q.clearVisitorLocation.run(key);
  });
  return { key, isNew: !existing };
}

function trackArticleVisitor(postId, visitor) {
  if (!visitor) return false;
  const now = new Date().toISOString();
  let firstRead = false;
  tx(() => {
    const info = q.insertPostVisitor.run(postId, visitor.key, now);
    if (info.changes) {
      q.bumpUniqueViews.run(postId);
      firstRead = true;
    }
  });
  return firstRead;
}

module.exports = { trackVisitor, trackArticleVisitor, shouldTrack, countryFlag, purgeOldVisitors, VISITOR_RETENTION_DAYS };
