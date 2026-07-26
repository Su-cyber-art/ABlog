/* 纯函数单元测试:Markdown 渲染与配置校验 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { mdToHtml } = require('../lib/md');
const { normalizeAdminPath } = require('../lib/config');

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
});
