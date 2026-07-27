/* 测试辅助:在临时数据目录内启动一个真实服务实例,提供极简 HTTP 客户端 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

/** 交给系统选择可绑定端口，避开 Windows 动态排除端口段 */
function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(err => err ? reject(err) : resolve(port));
    });
  });
}

/** 用干净的临时数据目录启动应用(需在 require 应用前设好环境变量) */
async function startServer(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablog-test-'));
  // 每个实例独立进程级模块缓存不可行,故用子进程隔离
  const { spawn } = require('child_process');
  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      ABLOG_DATA_DIR: dataDir,
      ADMIN_PASSWORD: 'test-pass-123',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });

  const base = `http://127.0.0.1:${port}`;
  const ready = new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const req = http.get(base + '/healthz', res => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() - started > 8000) reject(new Error('server did not start:\n' + log));
        else setTimeout(tick, 100);
      });
    };
    tick();
  });

  return {
    base, port, dataDir, child,
    ready,
    log: () => log,
    stop() {
      try { child.kill('SIGTERM'); } catch (e) { /* ignore */ }
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
  };
}

/** 极简请求:返回 { status, headers, body, location, cookies } */
function request(base, method, urlPath, opts = {}) {
  const u = new URL(urlPath, base);
  const headers = Object.assign({}, opts.headers);
  let body = opts.body;
  if (opts.form) {
    body = new URLSearchParams(opts.form).toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  if (opts.cookies) headers['Cookie'] = opts.cookies;
  if (body) headers['Content-Length'] = Buffer.byteLength(body);

  return new Promise((resolve, reject) => {
    const req = http.request(u, { method, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] || [];
        const cookies = setCookie.map(c => c.split(';')[0]).join('; ');
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          location: res.headers.location,
          cookies
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** 登录并返回会话 cookie */
async function login(base, password = 'test-pass-123') {
  const r = await request(base, 'POST', '/admin/login', { form: { password } });
  return r.cookies;
}

module.exports = { startServer, request, login };
