/* 默·博客 — 极简 HTTP 框架(零依赖,Node 内置 http)
 * 提供:路由(带 :参数)、静态文件、表单解析、cookie、渲染/重定向助手 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
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
    res.html = (body, status = 200) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(body);
    };
    res.text = (body, status = 200, type = 'text/plain; charset=utf-8') => {
      res.statusCode = status;
      res.setHeader('Content-Type', type);
      res.end(body);
    };
    res.redirect = (url) => { res.statusCode = 302; res.setHeader('Location', url); res.end(); };
  }

  sendFile(res, fsPath, maxAge) {
    let st;
    try { st = fs.statSync(fsPath); } catch (e) { return false; }
    if (!st.isFile()) return false;
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[path.extname(fsPath).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', st.size);
    res.setHeader('Cache-Control', 'public, max-age=' + maxAge);
    fs.createReadStream(fsPath).pipe(res);
    return true;
  }

  async handle(req, res) {
    this.decorate(req, res);

    for (const fn of this.pre) await fn(req, res);

    // 单文件路由
    if (req.method === 'GET' && this.files.has(req.pathname)) {
      const f = this.files.get(req.pathname);
      if (this.sendFile(res, f.fsPath, f.maxAge)) return;
    }

    // 静态目录(带路径穿越防护)
    if (req.method === 'GET' || req.method === 'HEAD') {
      for (const s of this.statics) {
        if (!req.pathname.startsWith(s.prefix)) continue;
        const rel = req.pathname.slice(s.prefix.length).replace(/^\/+/, '');
        if (rel.includes('\0')) break;
        const fsPath = path.resolve(s.dir, rel);
        if (fsPath !== s.dir && !fsPath.startsWith(s.dir + path.sep)) break;
        if (this.sendFile(res, fsPath, s.maxAge)) return;
      }
    }

    // 表单体
    if (req.method === 'POST') {
      const raw = await readBody(req, 2 * 1024 * 1024);
      const type = String(req.headers['content-type'] || '');
      req.body = type.includes('application/x-www-form-urlencoded')
        ? Object.fromEntries(new URLSearchParams(raw.toString('utf8')))
        : {};
    } else {
      req.body = {};
    }

    // 路由匹配
    for (const r of this.routes) {
      if (r.method !== req.method) continue;
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

  listen(port, cb) {
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch(err => this.errorHandler(err, req, res));
    });
    server.listen(port, cb);
    return server;
  }
}

module.exports = { App };
