/* 后台集成测试
 * 每个用例独立服务实例:避免登录限速状态、改密、数据变更在用例间串味 */
'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, request, multipart, login } = require('./helpers');

let srv;
beforeEach(async () => { srv = await startServer(); await srv.ready; });
afterEach(() => srv.stop());

test('未登录访问后台跳转登录页', async () => {
  const r = await request(srv.base, 'GET', '/admin');
  assert.equal(r.status, 302);
  assert.match(r.location, /\/admin\/login/);
});

test('错误密码被拒、正确密码发放会话', async () => {
  const bad = await request(srv.base, 'POST', '/admin/login', { form: { password: 'wrong' } });
  assert.match(bad.location, /failed=1/);
  const cookies = await login(srv.base);
  assert.match(cookies, /mo_session=/);
  const dash = await request(srv.base, 'GET', '/admin', { cookies });
  assert.equal(dash.status, 200);
  assert.match(dash.body, /仪表盘/);
});

test('登录限速:多次失败后锁定', async () => {
  for (let i = 0; i < 8; i++) await request(srv.base, 'POST', '/admin/login', { form: { password: 'x' } });
  const r = await request(srv.base, 'POST', '/admin/login', { form: { password: 'x' } });
  assert.match(r.location, /blocked=1/);
});

test('跨站 POST 被 403 拦截', async () => {
  const r = await request(srv.base, 'POST', '/admin/login', {
    form: { password: 'x' }, headers: { Origin: 'https://evil.example' }
  });
  assert.equal(r.status, 403);
});

test('发布文章后出现在前台首页', async () => {
  const cookies = await login(srv.base);
  const r = await request(srv.base, 'POST', '/admin/editor/save', {
    cookies,
    form: { title: '集成测试随笔', cat: '生活', tags: '测试,新标签', content: '# 标题\n\n正文。', action: 'publish' }
  });
  assert.equal(r.status, 302);
  const home = await request(srv.base, 'GET', '/');
  assert.match(home.body, /集成测试随笔/);
});

test('存草稿重定向到草稿筛选(非 ASCII Location 编码正确)', async () => {
  const cookies = await login(srv.base);
  const r = await request(srv.base, 'POST', '/admin/editor/save', {
    cookies, form: { title: '一篇草稿', cat: '未分类', tags: '', content: 'x', action: 'draft' }
  });
  assert.equal(r.status, 302);
  assert.match(r.location, /filter=%E8%8D%89%E7%A8%BF/);
  const list = await request(srv.base, 'GET', r.location, { cookies });
  assert.match(list.body, /一篇草稿/);
});

test('新标签随文章自动入库', async () => {
  const cookies = await login(srv.base);
  await request(srv.base, 'POST', '/admin/editor/save', {
    cookies, form: { title: '带标签', cat: '生活', tags: '独有标签xyz', content: 'x', action: 'publish' }
  });
  const tax = await request(srv.base, 'GET', '/admin/taxonomy', { cookies });
  assert.match(tax.body, /独有标签xyz/);
});

test('评论审核:通过后前台可见', async () => {
  const cookies = await login(srv.base);
  await request(srv.base, 'POST', '/post/2/comment', { form: { name: '待审者', text: '等待通过的评论' } });
  const list = await request(srv.base, 'GET', '/admin/comments?filter=' + encodeURIComponent('待审'), { cookies });
  const m = list.body.match(/\/admin\/comments\/(\d+)\/status/);
  assert.ok(m, '应能找到待审评论的操作表单');
  await request(srv.base, 'POST', `/admin/comments/${m[1]}/status`, { cookies, form: { status: 'approved' } });
  const post = await request(srv.base, 'GET', '/post/2');
  assert.match(post.body, /等待通过的评论/);
});

test('使用中的分类不可删除', async () => {
  const cookies = await login(srv.base);
  await request(srv.base, 'POST', '/admin/cats/delete', { cookies, form: { name: '生活' } });
  const tax = await request(srv.base, 'GET', '/admin/taxonomy', { cookies });
  assert.match(tax.body, /生活/); // 仍在
});

test('删除标签会清除文章上的引用', async () => {
  const cookies = await login(srv.base);
  await request(srv.base, 'POST', '/admin/tags/delete', { cookies, form: { name: '雨' } });
  const post = await request(srv.base, 'GET', '/post/1'); // 雨夜札记原带「雨」
  assert.doesNotMatch(post.body, /archive\?tag=%E9%9B%A8"/);
});

test('订阅者管理与 CSV 导出', async () => {
  const cookies = await login(srv.base);
  await request(srv.base, 'POST', '/subscribe', { form: { email: 'csv@test.cn' } });
  const page = await request(srv.base, 'GET', '/admin/subscribers', { cookies });
  assert.match(page.body, /csv@test\.cn/);
  const csv = await request(srv.base, 'GET', '/admin/subscribers.csv', { cookies });
  assert.match(csv.headers['content-disposition'], /\.csv/);
  assert.match(csv.body, /csv@test\.cn/);
});

test('访客管理展示最后 IP 和本地网络归属', async () => {
  const denied = await request(srv.base, 'GET', '/admin/visitors');
  assert.equal(denied.status, 302);
  assert.match(denied.location, /\/admin\/login/);

  await request(srv.base, 'GET', '/about');
  const cookies = await login(srv.base);
  const page = await request(srv.base, 'GET', '/admin/visitors', { cookies });
  assert.equal(page.status, 200);
  assert.match(page.body, /访客管理/);
  assert.match(page.body, /127\.0\.0\.1/);
  assert.match(page.body, /本地网络/);
  assert.match(page.body, /🏠/);
});

test('可信代理国家头显示归属地和旗帜', async () => {
  const trusted = await startServer({ TRUST_PROXY: '1', VISITOR_COUNTRY_HEADER: 'cf-ipcountry' });
  try {
    await trusted.ready;
    await request(trusted.base, 'GET', '/about', {
      headers: { 'X-Forwarded-For': '203.0.113.9', 'CF-IPCountry': 'JP' }
    });
    const cookies = await login(trusted.base);
    const page = await request(trusted.base, 'GET', '/admin/visitors', { cookies });
    assert.match(page.body, /日本/);
    assert.match(page.body, /🇯🇵/);
  } finally {
    trusted.stop();
  }
});

test('自定义后台路径可访问，旧 /admin 不暴露后台', async () => {
  const custom = await startServer({ ADMIN_PATH: '/manage_7f3a' });
  try {
    await custom.ready;
    const cookies = await login(custom.base, 'test-pass-123', '/manage_7f3a');
    const visitors = await request(custom.base, 'GET', '/manage_7f3a/visitors', { cookies });
    assert.equal(visitors.status, 200);
    const oldPath = await request(custom.base, 'GET', '/admin');
    assert.equal(oldPath.status, 404);
  } finally {
    custom.stop();
  }
});

test('站点设置可保存后台路径，手工启动时提示重启', async () => {
  const cookies = await login(srv.base);
  const changed = await request(srv.base, 'POST', '/admin/settings', {
    cookies,
    form: { title: '默', subtitle: 's', author: '默', footer: 'f', perPage: '5', adminPath: '/studio_7f3a' }
  });
  assert.equal(changed.status, 302);
  assert.match(changed.location, /saved=1/);
  assert.match(changed.location, /adminPath=%2Fstudio_7f3a/);
  assert.match(changed.location, /restart=0/);

  const stored = JSON.parse(fs.readFileSync(path.join(srv.dataDir, 'admin-path.json'), 'utf8'));
  assert.deepEqual(stored, { adminPath: '/studio_7f3a' });

  const settings = await request(srv.base, 'GET', changed.location, { cookies });
  assert.match(settings.body, /后台路径已改为/);
  assert.match(settings.body, /请重启服务后使用新路径/);
});

test('站点设置拒绝保留的后台路径且不写入覆盖配置', async () => {
  const cookies = await login(srv.base);
  const rejected = await request(srv.base, 'POST', '/admin/settings', {
    cookies,
    form: { title: '默', subtitle: 's', author: '默', footer: 'f', perPage: '5', adminPath: '/about' }
  });
  assert.equal(rejected.status, 302);
  assert.match(rejected.location, /adminPath=err/);
  assert.equal(fs.existsSync(path.join(srv.dataDir, 'admin-path.json')), false);
});

test('设置页可上传关于页照片，拒绝伪造图片', async () => {
  const cookies = await login(srv.base);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9KgAAAABJRU5ErkJggg==', 'base64');
  const upload = multipart({ title: '默', subtitle: 's', author: '默', footer: 'f', perPage: '5' }, [{
    name: 'portrait', filename: 'portrait.png', contentType: 'image/png', data: png
  }]);
  const saved = await request(srv.base, 'POST', '/admin/settings', {
    cookies,
    body: upload.body,
    headers: { 'Content-Type': upload.contentType }
  });
  assert.match(saved.location, /saved=1/);
  const about = await request(srv.base, 'GET', '/about');
  assert.match(about.body, /\/uploads\/portrait\.png/);
  const image = await request(srv.base, 'GET', '/uploads/portrait.png');
  assert.match(image.headers['content-type'], /image\/png/);

  const bad = multipart({ title: '默', subtitle: 's', author: '默', footer: 'f', perPage: '5' }, [{
    name: 'portrait', filename: 'not-image.png', contentType: 'image/png',
    data: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)])
  }]);
  const rejected = await request(srv.base, 'POST', '/admin/settings', {
    cookies,
    body: bad.body,
    headers: { 'Content-Type': bad.contentType }
  });
  assert.match(rejected.location, /photo=err/);
});

test('备份导出与导入恢复', async () => {
  const cookies = await login(srv.base);
  const visitor = await request(srv.base, 'GET', '/post/1');
  const exp = await request(srv.base, 'GET', '/admin/export', { cookies });
  const data = JSON.parse(exp.body);
  assert.equal(data.app, 'mo-blog');
  assert.equal(data.visitors, undefined);
  assert.equal(data.posts[0].uniqueViews, undefined);
  assert.doesNotMatch(exp.body, /127\.0\.0\.1/);
  const originalCount = data.posts.length;
  // 删一篇再导入恢复
  await request(srv.base, 'POST', '/admin/posts/1/delete', { cookies });
  const imp = await request(srv.base, 'POST', '/admin/import', { cookies, form: { payload: exp.body } });
  assert.match(imp.location, /import=ok/);
  const exp2 = await request(srv.base, 'GET', '/admin/export', { cookies });
  assert.equal(JSON.parse(exp2.body).posts.length, originalCount);
  // JSON 不携带文章去重基线，导入后同一 cookie 的第一次阅读从 1 重新计数，不能伪装成 2。
  const afterImport = await request(srv.base, 'GET', '/post/1', { cookies: visitor.cookies });
  assert.match(afterImport.body, /1 位独立访客/);
});

test('改密后旧会话失效、新密码可登录', async () => {
  const a = await login(srv.base);
  const b = await login(srv.base);
  await request(srv.base, 'POST', '/admin/settings', {
    cookies: a,
    form: { title: '默', subtitle: 's', author: '默', footer: 'f', perPage: '5', newPassword: 'brand-new-pass' }
  });
  const bAfter = await request(srv.base, 'GET', '/admin', { cookies: b });
  assert.equal(bAfter.status, 302); // 旧会话被踢
  const relog = await request(srv.base, 'POST', '/admin/login', { form: { password: 'brand-new-pass' } });
  assert.match(relog.location, /\/admin$/);
});
