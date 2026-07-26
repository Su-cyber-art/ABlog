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

function acceptsGzip(req) {
  return /(^|[,\s])gzip($|[,;\s])/.test(String(req.headers['accept-encoding'] || ''));
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
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

class App {
  constructor() {
    this.routes = [];
    this.statics = [];   // { prefix, dir, maxAge }
    this.files = new Map(); // 单文件路由:url → { fsPath, maxAge }
    this.pre = [];
    this.bodyLimit = 8 * 1024 * 1024;
    this.notFoundHandler = (req, res) => { res.statusCode = 404; res.end('Not Found'); };
    this.errorHandler = (err, req, res) => {
      console.error(err);
      if (!res.headersSent) { res.statusCode = err.status || 500; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); }
      res.end('服务器开小差了——请查看终端日志。');
    };
  }

  usePre(fn) { this.pre.push(fn); }
  useStatic(prefix, dir, maxAge = 86400) { this.statics.push({ prefix, dir: path.resolve(dir), maxAge }); }
  useFile(url, fsPath, maxAge = 86400) { this.files.set(url, { fsPath, maxAge }); }
  get(p, h) { const { re, keys } = compile(p); this.routes.push({ method: 'GET', re, keys, h }); }
  post(p, h) { const { re, keys } = compile(p); this.routes.push({ method: 'POST', re, keys, h }); }
  notFound(h) { this.notFoundHandler = h; }

  decorate(req, res) {
    const u = new URL(req.url, 'http://x');
    let pathname = u.pathname;
    try { pathname = decodeURIComponent(pathname); } catch (e) { /* 保留原样 */ }
    req.pathname = pathname;
    req.query = Object.fromEntries(u.searchParams);
    req.cookies = parseCookies(req);

    const send = (body, status, type) => {
      res.statusCode = status;
      res.setHeader('Content-Type', type);
      let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      if (buf.length >= GZIP_MIN && acceptsGzip(req)) {
        res.setHeader('Vary', 'Accept-Encoding');
        buf = zlib.gzipSync(buf);
        res.setHeader('Content-Encoding', 'gzip');
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
    let st;
    try { st = fs.statSync(fsPath); } catch (e) { return false; }
    if (!st.isFile()) return false;

    const mime = MIME[path.extname(fsPath).toLowerCase()] || 'application/octet-stream';
    const lastMod = new Date(st.mtimeMs).toUTCString();
    res.setHeader('Cache-Control', 'public, max-age=' + maxAge);
    res.setHeader('Last-Modified', lastMod);

    // 304 协商缓存
    if (req.headers['if-modified-since'] === lastMod) {
      res.statusCode = 304;
      res.end();
      return true;
    }

    res.setHeader('Content-Type', mime);

    // 文本类静态资源 gzip(带 mtime 失效的小缓存)
    if (COMPRESSIBLE.test(mime) && st.size >= GZIP_MIN && acceptsGzip(req)) {
      let entry = gzCache.get(fsPath);
      if (!entry || entry.mtimeMs !== st.mtimeMs) {
        entry = { mtimeMs: st.mtimeMs, gz: zlib.gzipSync(fs.readFileSync(fsPath)) };
        gzCache.set(fsPath, entry);
        if (gzCache.size > GZ_CACHE_MAX) gzCache.delete(gzCache.keys().next().value);
      }
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', entry.gz.length);
      res.statusCode = 200;
      res.end(req.method === 'HEAD' ? undefined : entry.gz);
      return true;
    }

    res.setHeader('Content-Length', st.size);
    res.statusCode = 200;
    if (req.method === 'HEAD') { res.end(); return true; }
    fs.createReadStream(fsPath).pipe(res);
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
      const raw = await readBody(req, this.bodyLimit);
      const type = String(req.headers['content-type'] || '');
      req.body = type.includes('application/x-www-form-urlencoded')
        ? Object.fromEntries(new URLSearchParams(raw.toString('utf8')))
        : {};
    } else {
      req.body = {};
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
    server.listen(port, host, cb);
    return server;
  }
}

module.exports = { App };
