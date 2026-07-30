/* 默·博客 — 极简 HTTP 框架(零依赖,Node 内置 http)
 * 提供:路由(带 :参数)、静态文件(gzip/304)、表单解析、cookie、渲染/重定向助手 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { parseCookies } = require('./auth');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf'
};

/** 值得 gzip 的类型(字体/图片本身已压缩,不重复处理) */
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|rss\+xml))|image\/svg/;
const GZIP_MIN = 1024; // 小于 1KB 不压缩

/** 静态文件 gzip 结果的小型内存缓存:fsPath → { mtimeMs, gz } */
const gzCache = new Map();
const GZ_CACHE_MAX = 32;

function encodingQuality(header, name) {
  let exact = null; let wildcard = null;
  for (const item of String(header || '').split(',')) {
    const [token, ...params] = item.trim().toLowerCase().split(';');
    if (!token) continue;
    let q = 1; let invalid = false;
    for (const param of params) {
      if (!/^\s*q\s*=/.test(param)) continue;
      const match = /^\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/.exec(param);
      if (!match) { invalid = true; break; }
      q = Number(match[1]);
    }
    if (invalid) q = 0;
    if (token === name) exact = exact == null ? q : Math.max(exact, q);
    if (token === '*') wildcard = wildcard == null ? q : Math.max(wildcard, q);
  }
  if (exact != null) return exact;
  if (name === 'identity') return wildcard === 0 ? 0 : 1;
  return wildcard == null ? 0 : wildcard;
}

function prefersGzip(req) {
  const gzip = encodingQuality(req.headers['accept-encoding'], 'gzip');
  const identity = encodingQuality(req.headers['accept-encoding'], 'identity');
  return gzip > 0 && gzip >= identity;
}

function mergeVary(res, value) {
  const values = String(res.getHeader('Vary') || '').split(',').map(v => v.trim()).filter(Boolean);
  if (!values.some(v => v.toLowerCase() === value.toLowerCase())) values.push(value);
  if (values.length) res.setHeader('Vary', values.join(', '));
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

/** '/post/:id' → { re, keys } */
function compile(pattern) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\?:([A-Za-z_][A-Za-z0-9_]*)/g, (m, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  return { re, keys };
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    let settled = false;
    const length = Number(req.headers['content-length']);
    if (Number.isFinite(length) && length > limit) {
      settled = true;
      req.resume();
      reject(httpError('payload too large', 413));
      return;
    }
    req.on('data', c => {
      if (settled) return;
      size += c.length;
      if (size > limit) {
        settled = true;
        chunks.length = 0;
        reject(httpError('payload too large', 413));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', err => { if (!settled) { settled = true; reject(err); } });
  });
}

/**
 * 只覆盖后台上传所需的 multipart 子集。字段和文件都保留在内存中，
 * 由路由请求体上限和业务层的图片大小校验共同约束。
 */
function parseMultipart(raw, contentType) {
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = match && (match[1] || match[2]);
  if (!boundary || boundary.length > 200 || /[\r\n]/.test(boundary)) throw httpError('invalid multipart boundary', 400);

  const marker = Buffer.from('--' + boundary);
  const separator = Buffer.from('\r\n--' + boundary);
  const headerSeparator = Buffer.from('\r\n\r\n');
  const body = {};
  const files = [];
  let parts = 0;
  let pos = raw.indexOf(marker);
  if (pos !== 0) throw httpError('invalid multipart body', 400);
  pos += marker.length;

  while (pos < raw.length) {
    if (raw.subarray(pos, pos + 2).toString('ascii') === '--') {
      const end = pos + 2;
      if (end !== raw.length && raw.subarray(end, end + 2).toString('ascii') !== '\r\n') throw httpError('invalid multipart ending', 400);
      return { body, files };
    }
    if (++parts > 128 || raw.subarray(pos, pos + 2).toString('ascii') !== '\r\n') throw httpError('invalid multipart body', 400);
    pos += 2;

    const headerEnd = raw.indexOf(headerSeparator, pos);
    if (headerEnd < 0 || headerEnd - pos > 16 * 1024) throw httpError('invalid multipart headers', 400);
    const headers = raw.subarray(pos, headerEnd).toString('utf8');
    const disposition = headers.split('\r\n').find(line => /^content-disposition\s*:/i.test(line));
    const nameMatch = disposition && /(?:^|;)\s*name="([^"]*)"/i.exec(disposition);
    if (!nameMatch || !/^[A-Za-z0-9_-]{1,80}$/.test(nameMatch[1])) throw httpError('invalid multipart field', 400);
    const filenameMatch = /(?:^|;)\s*filename="([^"]*)"/i.exec(disposition);
    const next = raw.indexOf(separator, headerEnd + headerSeparator.length);
    if (next < 0) throw httpError('truncated multipart body', 400);
    const data = raw.subarray(headerEnd + headerSeparator.length, next);
    const name = nameMatch[1];
    if (filenameMatch && filenameMatch[1]) {
      if (files.length >= 8) throw httpError('too many multipart files', 413);
      files.push({
        name,
        filename: path.basename(filenameMatch[1]).slice(0, 160),
        contentType: (headers.match(/^content-type:\s*([^\r\n]+)/im) || [])[1] || '',
        data: Buffer.from(data)
      });
    } else {
      body[name] = data.toString('utf8');
    }
    pos = next + 2 + marker.length;
  }
  throw httpError('truncated multipart body', 400);
}

class App {
  constructor() {
    this.routes = [];
    this.statics = [];   // { prefix, dir, maxAge }
    this.files = new Map(); // 单文件路由:url → { fsPath, maxAge }
    this.pre = [];
    this.bodyLimit = 64 * 1024;
    this.bodyLimitFor = null;
    this.notFoundHandler = (req, res) => { res.statusCode = 404; res.end('Not Found'); };
    this.errorHandler = (err, req, res) => {
      console.error(err);
      if (!res.headersSent) { res.statusCode = err.status || 500; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); }
      res.end(req && req.t ? req.t('error.server') : '服务器开小差了——请查看终端日志。');
    };
  }

  usePre(fn) { this.pre.push(fn); }
  setBodyLimit(fn) { this.bodyLimitFor = fn; }
  useStatic(prefix, dir, maxAge = 86400) { this.statics.push({ prefix, dir: path.resolve(dir), maxAge }); }
  useFile(url, fsPath, maxAge = 86400) { this.files.set(url, { fsPath, maxAge }); }
  get(p, h) { const { re, keys } = compile(p); this.routes.push({ method: 'GET', re, keys, h }); }
  post(p, h) { const { re, keys } = compile(p); this.routes.push({ method: 'POST', re, keys, h }); }
  notFound(h) { this.notFoundHandler = h; }

  decorate(req, res) {
    if (!req.url || !req.url.startsWith('/') || req.url.startsWith('//')) throw httpError('invalid request target', 400);
    let u;
    try { u = new URL('http://x' + req.url); } catch (e) { throw httpError('invalid request target', 400); }
    let pathname;
    try { pathname = decodeURIComponent(u.pathname); } catch (e) { throw httpError('invalid request path', 400); }
    req.pathname = pathname;
    req.query = Object.fromEntries(u.searchParams);
    req.cookies = parseCookies(req);

    const send = (body, status, type) => {
      res.statusCode = status;
      res.setHeader('Content-Type', type);
      let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      const compressible = COMPRESSIBLE.test(type);
      if (compressible) mergeVary(res, 'Accept-Encoding');
      if (compressible && buf.length >= GZIP_MIN && prefersGzip(req)) {
        buf = zlib.gzipSync(buf);
        res.setHeader('Content-Encoding', 'gzip');
      } else if (encodingQuality(req.headers['accept-encoding'], 'identity') === 0) {
        res.statusCode = 406;
        buf = Buffer.from('Not Acceptable');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.setHeader('Content-Length', buf.length);
      res.end(req.method === 'HEAD' ? undefined : buf);
    };
    res.html = (body, status = 200) => send(body, status, 'text/html; charset=utf-8');
    res.text = (body, status = 200, type = 'text/plain; charset=utf-8') => send(body, status, type);
    res.json = (obj, status = 200) => send(JSON.stringify(obj), status, 'application/json; charset=utf-8');
    res.redirect = (url) => {
      // Location 头只接受 ASCII;对非 ASCII 字符(如中文查询值)按 URI 编码
      const safe = String(url).replace(/[^\x00-\x7F]/g, ch => encodeURIComponent(ch));
      res.statusCode = 302;
      res.setHeader('Location', safe);
      res.end();
    };
    /** 触发浏览器下载 */
    res.download = (body, filename, type) => {
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      send(body, 200, type || 'application/octet-stream');
    };
  }

  sendFile(req, res, fsPath, maxAge) {
    let fd; let st;
    try {
      fd = fs.openSync(fsPath, 'r');
      st = fs.fstatSync(fd);
    } catch (e) {
      if (fd != null) try { fs.closeSync(fd); } catch (_) {}
      return false;
    }
    if (!st.isFile()) { fs.closeSync(fd); return false; }

    const mime = MIME[path.extname(fsPath).toLowerCase()] || 'application/octet-stream';
    const lastMod = new Date(st.mtimeMs).toUTCString();
    res.setHeader('Cache-Control', 'public, max-age=' + maxAge);
    res.setHeader('Last-Modified', lastMod);
    if (COMPRESSIBLE.test(mime) && st.size >= GZIP_MIN) mergeVary(res, 'Accept-Encoding');

    const ims = Date.parse(String(req.headers['if-modified-since'] || ''));
    if (Number.isFinite(ims) && Math.floor(st.mtimeMs / 1000) * 1000 <= ims) {
      fs.closeSync(fd);
      res.statusCode = 304;
      res.end();
      return true;
    }

    res.setHeader('Content-Type', mime);

    if (COMPRESSIBLE.test(mime) && st.size >= GZIP_MIN && prefersGzip(req)) {
      let entry = gzCache.get(fsPath);
      if (!entry || entry.mtimeMs !== st.mtimeMs) {
        entry = { mtimeMs: st.mtimeMs, gz: zlib.gzipSync(fs.readFileSync(fd)) };
        gzCache.set(fsPath, entry);
        if (gzCache.size > GZ_CACHE_MAX) gzCache.delete(gzCache.keys().next().value);
      }
      fs.closeSync(fd);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', entry.gz.length);
      res.statusCode = 200;
      res.end(req.method === 'HEAD' ? undefined : entry.gz);
      return true;
    }
    if (COMPRESSIBLE.test(mime) && st.size >= GZIP_MIN
      && encodingQuality(req.headers['accept-encoding'], 'identity') === 0) {
      fs.closeSync(fd);
      res.text('Not Acceptable', 406);
      return true;
    }

    res.setHeader('Content-Length', st.size);
    res.statusCode = 200;
    if (req.method === 'HEAD') { fs.closeSync(fd); res.end(); return true; }
    const stream = fs.createReadStream(null, { fd, autoClose: true });
    stream.on('error', err => {
      console.error('[默·博客] 静态文件读取失败:', err.message);
      if (!res.headersSent) res.statusCode = err.code === 'ENOENT' ? 404 : 500;
      res.destroy(err);
    });
    stream.pipe(res);
    return true;
  }

  async handle(req, res) {
    this.decorate(req, res);

    // 全站安全响应头
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");

    for (const fn of this.pre) await fn(req, res);
    if (res.writableEnded) return; // 前置中间件可直接完成响应(如限速拦截)

    const isRead = req.method === 'GET' || req.method === 'HEAD';

    // 单文件路由
    if (isRead && this.files.has(req.pathname)) {
      const f = this.files.get(req.pathname);
      if (this.sendFile(req, res, f.fsPath, f.maxAge)) return;
    }

    // 静态目录(带路径穿越防护)
    if (isRead) {
      for (const s of this.statics) {
        if (!req.pathname.startsWith(s.prefix)) continue;
        const rel = req.pathname.slice(s.prefix.length).replace(/^\/+/, '');
        if (rel.includes('\0')) break;
        const fsPath = path.resolve(s.dir, rel);
        if (fsPath !== s.dir && !fsPath.startsWith(s.dir + path.sep)) break;
        if (this.sendFile(req, res, fsPath, s.maxAge)) return;
      }
    }

    // 表单体
    if (req.method === 'POST') {
      const selectedLimit = this.bodyLimitFor ? Number(this.bodyLimitFor(req)) : this.bodyLimit;
      const bodyLimit = Number.isSafeInteger(selectedLimit) && selectedLimit > 0 ? selectedLimit : this.bodyLimit;
      const raw = await readBody(req, bodyLimit);
      const contentType = String(req.headers['content-type'] || '');
      const type = contentType.split(';', 1)[0].trim().toLowerCase();
      if (type === 'application/x-www-form-urlencoded') {
        const params = new URLSearchParams(raw.toString('utf8'));
        let count = 0;
        for (const _ of params) { if (++count > 256) throw httpError('too many form fields', 413); }
        req.body = Object.fromEntries(params);
        req.files = [];
      } else if (type === 'multipart/form-data') {
        const parsed = parseMultipart(raw, contentType);
        req.body = parsed.body;
        req.files = parsed.files;
      } else if (raw.length) {
        throw httpError('unsupported media type', 415);
      } else {
        req.body = {};
        req.files = [];
      }
    } else {
      req.body = {};
      req.files = [];
    }

    // 路由匹配(HEAD 复用 GET 处理器,Node 会自动省略响应体)
    const routeMethod = req.method === 'HEAD' ? 'GET' : req.method;
    for (const r of this.routes) {
      if (r.method !== routeMethod) continue;
      const m = r.re.exec(req.pathname);
      if (!m) continue;
      req.params = {};
      r.keys.forEach((k, i) => { req.params[k] = m[i + 1]; });
      const handled = await r.h(req, res);
      if (handled === false) break; // 处理器声明未命中 → 落到 404
      return;
    }

    await this.notFoundHandler(req, res);
  }

  listen(port, host, cb) {
    if (typeof host === 'function') { cb = host; host = undefined; }
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch(err => this.errorHandler(err, req, res));
    });
    server.headersTimeout = 15000;
    server.requestTimeout = 60000;
    server.keepAliveTimeout = 5000;
    server.timeout = 60000;
    server.maxHeadersCount = 100;
    server.maxRequestsPerSocket = 100;
    server.listen(port, host, cb);
    return server;
  }
}

module.exports = { App };
