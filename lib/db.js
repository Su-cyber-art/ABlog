/* 默·博客 — SQLite 数据层(schema、示例数据、常用查询) */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { hashPassword } = require('./auth');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('[默·博客] 需要 Node.js 22.13+、23.4+ 或 24+（内置 SQLite）。当前版本:' + process.version);
  console.error('[默·博客] 请到 https://nodejs.org 安装最新 LTS 后重试。');
  process.exit(1);
}

const DATA_DIR = process.env.ABLOG_DATA_DIR
  ? path.resolve(process.env.ABLOG_DATA_DIR)
  : path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
if (process.platform !== 'win32') fs.chmodSync(DATA_DIR, 0o700);
const DB_PATH = path.join(DATA_DIR, 'blog.db');
const db = new DatabaseSync(DB_PATH);
if (process.platform !== 'win32') fs.chmodSync(DB_PATH, 0o600);
db.exec('PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;');

/** 事务包装(node:sqlite 没有 transaction 助手) */
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
}

db.exec(`
CREATE TABLE IF NOT EXISTS posts(
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  title   TEXT NOT NULL,
  cat     TEXT NOT NULL DEFAULT '未分类',
  tags    TEXT NOT NULL DEFAULT '[]',
  date    TEXT NOT NULL,
  status  TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('published','draft')),
  views   INTEGER NOT NULL DEFAULT 0,
  unique_views INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS comments(
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author  TEXT NOT NULL,
  date    TEXT NOT NULL,
  status  TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','spam')),
  text    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cats(name TEXT PRIMARY KEY, pos INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tags(name TEXT PRIMARY KEY, pos INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subscribers(email TEXT PRIMARY KEY, date TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visitors(
  visitor_key  TEXT PRIMARY KEY,
  first_seen   TEXT NOT NULL,
  last_seen    TEXT NOT NULL,
  last_ip      TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT '',
  country_name TEXT NOT NULL DEFAULT '',
  region       TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  page_views   INTEGER NOT NULL DEFAULT 0,
  visit_count  INTEGER NOT NULL DEFAULT 0,
  last_path    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS visitors_last_seen_idx ON visitors(last_seen DESC);
CREATE TABLE IF NOT EXISTS post_visitors(
  post_id      INTEGER NOT NULL,
  visitor_key  TEXT NOT NULL,
  first_seen   TEXT NOT NULL,
  PRIMARY KEY(post_id, visitor_key)
);
CREATE INDEX IF NOT EXISTS post_visitors_post_idx ON post_visitors(post_id);
`);

// 旧版数据库的 posts 表没有独立访客列，启动时无损补齐。
if (!db.prepare('PRAGMA table_info(posts)').all().some(column => column.name === 'unique_views')) {
  db.exec('ALTER TABLE posts ADD COLUMN unique_views INTEGER NOT NULL DEFAULT 0');
}

/* ── 设置 ── */
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key=?');
const setSettingStmt = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
function getSetting(key, fallback) {
  const row = getSettingStmt.get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) { setSettingStmt.run(key, String(value)); }

/** 站点设置(与设计稿一致的字段) */
function siteSettings() {
  const portraitFile = getSetting('portrait_file', '');
  const portraitUrl = /^portrait\.(?:jpg|png|webp)$/.test(portraitFile)
    ? '/uploads/' + portraitFile + '?v=' + encodeURIComponent(getSetting('portrait_updated', ''))
    : '';
  return {
    title: getSetting('title', '默'),
    subtitle: getSetting('subtitle', '一册记录日常的随笔'),
    author: getSetting('author', '默'),
    footer: getSetting('footer', '灯下手记，随写随存'),
    perPage: Math.max(1, parseInt(getSetting('perPage', '5'), 10) || 5),
    portraitUrl
  };
}

/* ── 示例数据(与设计稿 seed 完全一致) ── */
function seedBody(extra) {
  const P1 = '这是一段占位文字。它并不承载确切的意思，只示意一段随笔在页面上的样子：句子有长短，语气有起伏，读起来像是从某个安静的下午里摘出来的。';
  const P2 = '写随笔的好处，是可以不必从头说起，也不必给出结论。想到哪里，笔就到哪里；停在哪里，日子就在哪里折了一个小小的角。';
  const P3 = '此处仍是占位文字，用来撑起段落之间的呼吸。真正的内容可以稍后再填，版式先把位置留好。';
  const P4 = '结尾通常短一些。像合上一本薄薄的册子，或者把茶杯轻轻放回桌面。';
  const Q = '> 记下来，不是为了记住，而是为了可以放心地忘记。';
  return P1 + '\n\n' + P2 + '\n\n' + Q + '\n\n## 小标题也先占个位\n\n' + P3 + (extra ? '\n\n' + extra : '') + '\n\n---\n\n' + P4;
}

const SEED = {
  posts: [
    { title: '雨夜札记', cat: '生活', tags: ['雨', '夜'], date: '2026-07-18', status: 'published', views: 321, extra: '- 占位列表项一\n- 占位列表项二\n- 占位列表项三' },
    { title: '旧书店的下午', cat: '读书', tags: ['旧书', '城市'], date: '2026-06-30', status: 'published', views: 508 },
    { title: '关于慢', cat: '杂感', tags: ['独处'], date: '2026-06-11', status: 'published', views: 412 },
    { title: '南方的站台', cat: '旅行', tags: ['火车', '南方'], date: '2026-05-24', status: 'published', views: 630 },
    { title: '茶凉之前', cat: '生活', tags: ['茶'], date: '2026-05-02', status: 'published', views: 275 },
    { title: '读《山月记》', cat: '读书', tags: ['旧书'], date: '2026-04-15', status: 'published', views: 389 },
    { title: '灯下的旧照片', cat: '杂感', tags: ['夜'], date: '2025-12-19', status: 'published', views: 566 },
    { title: '六月未寄的信', cat: '杂感', tags: ['信'], date: '2026-07-25', status: 'draft', views: 0 },
    { title: '海边三日', cat: '旅行', tags: ['海'], date: '2026-07-22', status: 'draft', views: 0 }
  ],
  comments: [
    { post: 1, author: '林间', date: '2026-07-19', status: 'approved', text: '占位评论：读到雨声那段，想起自己窗外也在下雨。' },
    { post: 1, author: '白鹭', date: '2026-07-20', status: 'pending', text: '占位评论：等待审核的一条留言，示意后台的审核流程。' },
    { post: 2, author: '陈迟', date: '2026-07-02', status: 'approved', text: '占位评论：那家书店我好像也去过，柜台后面有一只猫。' },
    { post: 4, author: '阿禾', date: '2026-05-25', status: 'approved', text: '占位评论：站台这个词，天生就带着一点告别的意思。' },
    { post: 3, author: '匿名', date: '2026-06-12', status: 'spam', text: '占位垃圾评论：点击此链接领取优惠……' },
    { post: 2, author: '小满', date: '2026-07-21', status: 'pending', text: '占位评论：另一条待审核的留言，问一句：周末营业吗？' }
  ],
  cats: ['生活', '读书', '旅行', '杂感'],
  tags: ['雨', '夜', '旧书', '城市', '独处', '火车', '南方', '茶', '信', '海'],
  settings: { title: '默', subtitle: '一册记录日常的随笔', author: '默', footer: '灯下手记，随写随存', perPage: '5' }
};

/** 恢复示例数据(保留登录密码与会话密钥) */
const seedAll = () => tx(() => {
  db.exec('DELETE FROM post_visitors; DELETE FROM posts; DELETE FROM comments; DELETE FROM cats; DELETE FROM tags;');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('posts','comments');");
  const insP = db.prepare('INSERT INTO posts(title,cat,tags,date,status,views,content) VALUES(?,?,?,?,?,?,?)');
  const idMap = {};
  SEED.posts.forEach((p, i) => {
    const info = insP.run(p.title, p.cat, JSON.stringify(p.tags), p.date, p.status, p.views, seedBody(p.extra));
    idMap[i + 1] = info.lastInsertRowid;
  });
  const insC = db.prepare('INSERT INTO comments(post_id,author,date,status,text) VALUES(?,?,?,?,?)');
  SEED.comments.forEach(c => insC.run(idMap[c.post], c.author, c.date, c.status, c.text));
  const insCat = db.prepare('INSERT INTO cats(name,pos) VALUES(?,?)');
  SEED.cats.forEach((n, i) => insCat.run(n, i));
  const insTag = db.prepare('INSERT INTO tags(name,pos) VALUES(?,?)');
  SEED.tags.forEach((n, i) => insTag.run(n, i));
  for (const [k, v] of Object.entries(SEED.settings)) setSetting(k, v);
});

/* ── 首次初始化 ── */
if (!getSetting('initialized')) {
  seedAll();
  setSetting('initialized', '1');
}
if (!getSetting('session_secret')) setSetting('session_secret', crypto.randomBytes(32).toString('hex'));
if (!getSetting('admin_pass')) {
  const configured = process.env.ADMIN_PASSWORD;
  const initial = configured || crypto.randomBytes(18).toString('base64url');
  setSetting('admin_pass', hashPassword(initial));
  if (!configured) {
    console.log(`[默·博客] 已生成随机后台初始密码：${initial}`);
    console.log('[默·博客] 请立即保存此密码并在「站点设置」中修改。');
  }
}

/* ── 查询助手 ── */
const q = {
  publishedPosts: db.prepare("SELECT * FROM posts WHERE status='published' ORDER BY date DESC, id DESC"),
  searchPosts: db.prepare(
    "SELECT * FROM posts WHERE status='published' AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\') ORDER BY date DESC, id DESC LIMIT 50"
  ),
  allPosts: db.prepare('SELECT * FROM posts ORDER BY date DESC, id DESC'),
  postById: db.prepare('SELECT * FROM posts WHERE id=?'),
  bumpViews: db.prepare('UPDATE posts SET views=views+1 WHERE id=?'),
  bumpUniqueViews: db.prepare('UPDATE posts SET unique_views=unique_views+1 WHERE id=?'),
  insertPost: db.prepare('INSERT INTO posts(title,cat,tags,date,status,views,content) VALUES(?,?,?,?,?,0,?)'),
  updatePost: db.prepare('UPDATE posts SET title=?,cat=?,tags=?,date=?,status=?,content=? WHERE id=?'),
  deletePost: db.prepare('DELETE FROM posts WHERE id=?'),
  deletePostComments: db.prepare('DELETE FROM comments WHERE post_id=?'),
  deletePostVisitors: db.prepare('DELETE FROM post_visitors WHERE post_id=?'),

  commentsAll: db.prepare('SELECT * FROM comments ORDER BY date DESC, id DESC'),
  commentsFor: db.prepare("SELECT * FROM comments WHERE post_id=? AND status='approved' ORDER BY date ASC, id ASC"),
  commentById: db.prepare('SELECT * FROM comments WHERE id=?'),
  pendingComments: db.prepare("SELECT * FROM comments WHERE status='pending' ORDER BY date DESC, id DESC"),
  pendingCommentsLimited: db.prepare("SELECT * FROM comments WHERE status='pending' ORDER BY date DESC, id DESC LIMIT ?"),
  pendingCommentCount: db.prepare("SELECT COUNT(*) AS count FROM comments WHERE status='pending'"),
  insertComment: db.prepare("INSERT INTO comments(post_id,author,date,status,text) VALUES(?,?,?,'pending',?)"),
  setCommentStatus: db.prepare('UPDATE comments SET status=? WHERE id=?'),
  deleteComment: db.prepare('DELETE FROM comments WHERE id=?'),

  cats: db.prepare('SELECT name FROM cats ORDER BY pos, rowid'),
  addCat: db.prepare('INSERT OR IGNORE INTO cats(name,pos) VALUES(?, (SELECT COALESCE(MAX(pos),0)+1 FROM cats))'),
  delCat: db.prepare('DELETE FROM cats WHERE name=?'),
  tags: db.prepare('SELECT name FROM tags ORDER BY pos, rowid'),
  addTag: db.prepare('INSERT OR IGNORE INTO tags(name,pos) VALUES(?, (SELECT COALESCE(MAX(pos),0)+1 FROM tags))'),
  delTag: db.prepare('DELETE FROM tags WHERE name=?'),

  addSubscriber: db.prepare('INSERT OR IGNORE INTO subscribers(email,date) VALUES(?,?)'),
  listSubscribers: db.prepare('SELECT email, date FROM subscribers ORDER BY date DESC, email'),
  delSubscriber: db.prepare('DELETE FROM subscribers WHERE email=?'),

  visitorByKey: db.prepare('SELECT * FROM visitors WHERE visitor_key=?'),
  insertVisitor: db.prepare(
    'INSERT INTO visitors(visitor_key,last_ip,country_code,country_name,region,city,first_seen,last_seen,last_path,page_views,visit_count) VALUES(?,?,?,?,?,?,?,?,?,1,1)'
  ),
  touchVisitor: db.prepare(
    'UPDATE visitors SET last_ip=?,last_seen=?,page_views=page_views+1,visit_count=visit_count+?,last_path=? WHERE visitor_key=?'
  ),
  setVisitorLocation: db.prepare(
    'UPDATE visitors SET country_code=?,country_name=?,region=?,city=?,last_seen=? WHERE visitor_key=?'
  ),
  clearVisitorLocation: db.prepare(
    "UPDATE visitors SET country_code='',country_name='',region='',city='' WHERE visitor_key=?"
  ),
  insertPostVisitor: db.prepare('INSERT OR IGNORE INTO post_visitors(post_id,visitor_key,first_seen) VALUES(?,?,?)'),
  deleteExpiredVisitors: db.prepare('DELETE FROM visitors WHERE last_seen < ?'),
  deleteOrphanPostVisitors: db.prepare('DELETE FROM post_visitors WHERE visitor_key NOT IN (SELECT visitor_key FROM visitors)'),
  visitorStats: db.prepare('SELECT COUNT(*) AS visitors, COALESCE(SUM(page_views),0) AS page_views FROM visitors'),
  listVisitors: db.prepare('SELECT * FROM visitors ORDER BY last_seen DESC LIMIT ?'),
  deleteVisitor: db.prepare('DELETE FROM visitors WHERE visitor_key=?'),
  deleteVisitorPostRows: db.prepare('DELETE FROM post_visitors WHERE visitor_key=?'),
  clearVisitors: db.prepare('DELETE FROM visitors'),
  clearPostVisitors: db.prepare('DELETE FROM post_visitors'),
  recomputeUniqueViews: db.prepare('UPDATE posts SET unique_views=(SELECT COUNT(*) FROM post_visitors WHERE post_id=posts.id)'),
  resetUniqueViews: db.prepare('UPDATE posts SET unique_views=0')
};

function parseTags(p) { try { return JSON.parse(p.tags) || []; } catch (e) { return []; } }

module.exports = { DATA_DIR, db, q, tx, getSetting, setSetting, siteSettings, seedAll, parseTags };
