/* 纯函数单元测试:Markdown 渲染与配置校验 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { mdToHtml } = require('../lib/md');
const { normalizeAdminPath, normalizeSiteUrl, assertPrivateDataDir } = require('../lib/config');

test('标题/引用/列表/分隔线', () => {
  assert.match(mdToHtml('# 一'), /<h1/);
  assert.match(mdToHtml('## 二'), /<h2/);
  assert.match(mdToHtml('> 引用'), /<blockquote/);
  assert.match(mdToHtml('- 甲\n- 乙'), /<ul[\s\S]*<li[\s\S]*<li/);
  assert.match(mdToHtml('1. 甲\n2. 乙'), /<ol/);
  assert.match(mdToHtml('---'), /<div[^>]*height:1px/);
});

test('行内:粗体/斜体/代码/链接', () => {
  assert.match(mdToHtml('**粗**'), /<strong>粗<\/strong>/);
  assert.match(mdToHtml('*斜*'), /<em>斜<\/em>/);
  assert.match(mdToHtml('`码`'), /<code/);
  assert.match(mdToHtml('[文字](https://x.cn)'), /<a href="https:\/\/x\.cn"/);
});

test('危险链接协议被降级为 #', () => {
  assert.match(mdToHtml('[x](javascript:alert(1))'), /href="#"/);
});

test('围栏代码块原样转义、不解析行内', () => {
  const h = mdToHtml('```\nconst a = "<b>x</b>";\n**raw**\n```');
  assert.match(h, /<pre[\s\S]*<code>/);
  assert.match(h, /&lt;b&gt;/);
  assert.match(h, /\*\*raw\*\*/); // 未被转成 strong
});

test('未闭合围栏容错', () => {
  assert.match(mdToHtml('```\nabc'), /<pre/);
});

test('图片语法与来源白名单', () => {
  assert.match(mdToHtml('![说明](https://a.cn/b.png)'), /<img src="https:\/\/a\.cn\/b\.png"/);
  assert.match(mdToHtml('![x](data:image/png;base64,AAAA)'), /<img src="data:image\/png/);
  // 非法来源降级为纯文本(alt)
  const bad = mdToHtml('![坏](javascript:alert(1))');
  assert.doesNotMatch(bad, /<img/);
  assert.match(bad, /坏/);
});

test('图片 alt 转义防属性注入', () => {
  const h = mdToHtml('![x" onerror="alert(1)](https://a.cn/b.png)');
  assert.match(h, /alt="x&quot; onerror=&quot;alert\(1\)"/);
});

test('HTML 转义', () => {
  assert.match(mdToHtml('a <script> b'), /&lt;script&gt;/);
});

test('版式选项:关闭对齐与缩进', () => {
  const h = mdToHtml('一段文字', { justify: false, indent: false });
  assert.match(h, /text-align:left/);
  assert.match(h, /text-indent:0/);
});

test('normalizeAdminPath 接受合法、拒绝非法与保留字', () => {
  assert.equal(normalizeAdminPath('/manage_7f3a'), '/manage_7f3a');
  assert.equal(normalizeAdminPath('admin'), '/admin');
  assert.equal(normalizeAdminPath('/admin/'), '/admin');
  assert.throws(() => normalizeAdminPath('/a/b'));
  assert.throws(() => normalizeAdminPath('/post'));
  assert.throws(() => normalizeAdminPath('/search'));
  assert.throws(() => normalizeAdminPath('/uploads'));
});

test('SITE_URL 只接受规范站点源，数据目录不能位于 public 内', () => {
  assert.equal(normalizeSiteUrl('https://blog.example.com/'), 'https://blog.example.com');
  assert.throws(() => normalizeSiteUrl('https://blog.example.com/path'));
  assert.throws(() => normalizeSiteUrl('https://blog.example.com/?x=1'));
  assert.throws(() => normalizeSiteUrl('https://user:pass@blog.example.com'));
  assert.throws(() => assertPrivateDataDir(path.join(__dirname, '..', 'public', 'data')));
  assert.doesNotThrow(() => assertPrivateDataDir(path.join(os.tmpdir(), 'ablog-private-data')));
});

test('无效端口在数据库初始化前失败', () => {
  const dataDir = path.join(os.tmpdir(), 'ablog-invalid-port-' + process.pid + '-' + Date.now());
  const result = require('child_process').spawnSync(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: 'not-a-port', ABLOG_DATA_DIR: dataDir },
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(dataDir), false);
});

test('后台保存的路径在下次启动时覆盖初始环境变量', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablog-admin-path-'));
  const env = { ...process.env, ABLOG_DATA_DIR: dataDir, ADMIN_PATH: '/from-env' };
  const configFile = path.join(dataDir, 'admin-path.json');
  try {
    fs.writeFileSync(configFile, JSON.stringify({ adminPath: '/from-settings' }) + '\n');
    const overridden = execFileSync(process.execPath, ['-e', `
      process.stdout.write(require('./lib/config').ADMIN_PATH);
    `], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });
    assert.equal(overridden, '/from-settings');

    fs.writeFileSync(configFile, '{invalid json');
    const fallback = execFileSync(process.execPath, ['-e', `
      process.stdout.write(require('./lib/config').ADMIN_PATH);
    `], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });
    assert.equal(fallback, '/from-env');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('旧版数据库启动时无损补齐独立访客列', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablog-old-schema-'));
  const env = { ...process.env, ABLOG_DATA_DIR: dataDir, ADMIN_PASSWORD: 'test-pass-123' };
  try {
    execFileSync(process.execPath, ['-e', `
      const path = require('path');
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(path.join(process.env.ABLOG_DATA_DIR, 'blog.db'));
      db.exec("CREATE TABLE posts(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,cat TEXT NOT NULL DEFAULT '未分类',tags TEXT NOT NULL DEFAULT '[]',date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',views INTEGER NOT NULL DEFAULT 0,content TEXT NOT NULL DEFAULT ''); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO settings(key,value) VALUES('initialized','1'),('session_secret','x'),('admin_pass','x');");
      db.close();
    `], { cwd: path.join(__dirname, '..'), env });
    const result = execFileSync(process.execPath, ['-e', `
      const { db } = require('./lib/db');
      process.stdout.write(String(db.prepare('PRAGMA table_info(posts)').all().some(c => c.name === 'unique_views')));
      db.close();
    `], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });
    assert.match(result, /true/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('启动时清理超过保留期的访客 IP', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablog-expired-visitor-'));
  const env = { ...process.env, ABLOG_DATA_DIR: dataDir, ADMIN_PASSWORD: 'test-pass-123' };
  try {
    const result = execFileSync(process.execPath, ['-e', `
      const { q, db } = require('./lib/db');
      const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
      const key = 'a'.repeat(64);
      q.insertVisitor.run(key, '203.0.113.1', '', '', '', '', old, old, '/');
      const { purgeOldVisitors } = require('./lib/visitors');
      purgeOldVisitors(true);
      process.stdout.write(q.visitorByKey.get(key) ? 'retained' : 'purged');
      db.close();
    `], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });
    assert.match(result, /purged/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
