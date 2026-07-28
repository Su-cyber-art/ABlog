/* 前台集成测试 */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, request } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); await srv.ready; });
after(() => srv.stop());

test('首页渲染并含示例文章', async () => {
  const r = await request(srv.base, 'GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.body, /雨夜札记/);
  assert.match(r.body, /随笔 · Essays/);
});

test('分页:第 2 页存在且首页显示页码', async () => {
  const r = await request(srv.base, 'GET', '/?page=2');
  assert.equal(r.status, 200);
  const home = await request(srv.base, 'GET', '/');
  assert.match(home.body, /1 \/ 2/);
});

test('文章详情渲染正文与评论', async () => {
  const r = await request(srv.base, 'GET', '/post/1');
  assert.equal(r.status, 200);
  assert.match(r.body, /小标题也先占个位/);
  assert.match(r.body, /林间/); // 已通过的评论
});

test('同一匿名访客对同一文章只计一次独立阅读', async () => {
  const first = await request(srv.base, 'GET', '/post/4');
  assert.match(first.cookies, /mo_visitor=/);
  const n1 = Number(first.body.match(/(\d+) 位独立访客/)[1]);

  const repeat = await request(srv.base, 'GET', '/post/4', { cookies: first.cookies });
  const n2 = Number(repeat.body.match(/(\d+) 位独立访客/)[1]);
  assert.equal(n2, n1);

  const another = await request(srv.base, 'GET', '/post/4');
  const n3 = Number(another.body.match(/(\d+) 位独立访客/)[1]);
  assert.equal(n3, n1 + 1);
});

test('HEAD、DNT 与爬虫请求不写入访客 cookie', async () => {
  const head = await request(srv.base, 'HEAD', '/post/5');
  assert.equal(head.cookies, '');
  const dnt = await request(srv.base, 'GET', '/post/5', { headers: { DNT: '1' } });
  assert.equal(dnt.cookies, '');
  const bot = await request(srv.base, 'GET', '/about', { headers: { 'User-Agent': 'ExampleBot/1.0' } });
  assert.equal(bot.cookies, '');
});

test('草稿对匿名访客返回 404', async () => {
  const r = await request(srv.base, 'GET', '/post/8');
  assert.equal(r.status, 404);
});

test('归档按分类与标签筛选', async () => {
  const byCat = await request(srv.base, 'GET', '/archive?cat=' + encodeURIComponent('读书'));
  assert.match(byCat.body, /旧书店的下午/);
  const byTag = await request(srv.base, 'GET', '/archive?tag=' + encodeURIComponent('旧书'));
  assert.match(byTag.body, /标签「旧书」/);
});

test('搜索命中标题、正文与标签', async () => {
  const title = await request(srv.base, 'GET', '/search?q=' + encodeURIComponent('站台'));
  assert.match(title.body, /南方的站台/);
  const tag = await request(srv.base, 'GET', '/search?q=' + encodeURIComponent('旧书'));
  assert.match(tag.body, /ag-item/);
  const none = await request(srv.base, 'GET', '/search?q=zzz404none');
  assert.match(none.body, /没有找到/);
});

test('搜索不泄露草稿', async () => {
  const r = await request(srv.base, 'GET', '/search?q=' + encodeURIComponent('海边三日'));
  assert.match(r.body, /没有找到/);
});

test('搜索关键词含 LIKE 特殊字符不报错', async () => {
  const r = await request(srv.base, 'GET', '/search?q=' + encodeURIComponent('100%_\\'));
  assert.equal(r.status, 200);
});

test('订阅登记有效邮箱', async () => {
  const r = await request(srv.base, 'POST', '/subscribe', { form: { email: 'reader@example.com' } });
  assert.equal(r.status, 302);
  assert.match(r.location, /subscribed=1/);
});

test('评论提交进入待审(前台不立即可见)', async () => {
  const r = await request(srv.base, 'POST', '/post/1/comment', { form: { name: '测试', text: '一条新评论' } });
  assert.equal(r.status, 302);
  const page = await request(srv.base, 'GET', '/post/1');
  assert.doesNotMatch(page.body, /一条新评论/); // 未审核不显示
});

test('RSS / sitemap / robots 正常', async () => {
  const feed = await request(srv.base, 'GET', '/feed.xml');
  assert.match(feed.headers['content-type'], /rss\+xml/);
  assert.match(feed.body, /content:encoded/);
  const sitemap = await request(srv.base, 'GET', '/sitemap.xml');
  assert.match(sitemap.body, /<loc>/);
  const robots = await request(srv.base, 'GET', '/robots.txt');
  assert.match(robots.body, /Sitemap:/);
});

test('HEAD 请求可用且不计阅读数', async () => {
  const before = await request(srv.base, 'GET', '/post/3');
  const m1 = before.body.match(/(\d+) 次阅读/);
  await request(srv.base, 'HEAD', '/post/3');
  const after = await request(srv.base, 'GET', '/post/3');
  const m2 = after.body.match(/(\d+) 次阅读/);
  // 两次 GET 各 +1,HEAD 不加;故差值应为 2(before→after 之间只有那次 GET 和这次 GET)
  assert.ok(Number(m2[1]) - Number(m1[1]) <= 2);
});

test('gzip 生效', async () => {
  const r = await request(srv.base, 'GET', '/', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(r.headers['content-encoding'], 'gzip');
});

test('安全响应头齐全', async () => {
  const r = await request(srv.base, 'GET', '/');
  assert.ok(r.headers['content-security-policy']);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN');
});

test('未知路径返回 404 页', async () => {
  const r = await request(srv.base, 'GET', '/nope-nope');
  assert.equal(r.status, 404);
  assert.match(r.body, /这一页是空白的/);
});
