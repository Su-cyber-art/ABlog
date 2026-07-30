/* 多语言集成测试:翻译完整性、访客切换与站点默认语言 */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, request, login } = require('./helpers');
const {
  DEFAULT_LOCALE,
  LOCALES,
  TABLE,
  createTranslator,
  normalizeLocale,
  safeLocalPath
} = require('../lib/i18n');

let srv;
before(async () => { srv = await startServer(); await srv.ready; });
after(() => srv.stop());

test('七种语言翻译完整且无效语言安全回退', () => {
  assert.deepEqual(LOCALES.map(locale => locale.code), ['zh-CN', 'zh-TW', 'en', 'fr', 'ru', 'de', 'ja']);
  for (const [key, messages] of Object.entries(TABLE)) {
    assert.equal(messages.length, LOCALES.length, key);
    assert.ok(messages.every(message => typeof message === 'string' && message.length > 0), key);
    const placeholders = message =>
      [...message.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match => match[1]).sort();
    const expected = placeholders(messages[0]);
    messages.forEach(message => assert.deepEqual(placeholders(message), expected, key));
  }
  assert.equal(normalizeLocale('xx'), DEFAULT_LOCALE);
  assert.equal(createTranslator('en')('front.postsCount', { count: 3 }), '3 posts');
  assert.equal(safeLocalPath('/archive?cat=life'), '/archive?cat=life');
  assert.equal(safeLocalPath('https://evil.example/'), '/');
  assert.equal(safeLocalPath('//evil.example/'), '/');
});

test('访客可切换七种语言且 Cookie 覆盖前后台界面', async () => {
  const homeLabels = {
    'zh-CN': '首页',
    'zh-TW': '首頁',
    en: 'Home',
    fr: 'Accueil',
    ru: 'Главная',
    de: 'Startseite',
    ja: 'ホーム'
  };

  for (const locale of LOCALES.map(item => item.code)) {
    const switched = await request(srv.base, 'POST', '/language', {
      form: { locale, returnTo: '/archive?cat=life' }
    });
    assert.equal(switched.status, 302);
    assert.equal(switched.location, '/archive?cat=life');
    assert.match(switched.cookies, new RegExp(`(?:^|; )ablog_locale=${locale}(?:;|$)`));
    assert.match(String(switched.headers['set-cookie']), /HttpOnly/);
    assert.match(String(switched.headers['set-cookie']), /SameSite=Lax/);

    const home = await request(srv.base, 'GET', '/', { cookies: switched.cookies });
    assert.match(home.body, new RegExp(`<html lang="${locale}">`));
    assert.ok(home.body.includes(`>${homeLabels[locale]}</a>`), locale);
    assert.match(home.body, /雨夜札记/);

    const loginPage = await request(srv.base, 'GET', '/admin/login', { cookies: switched.cookies });
    assert.match(loginPage.body, new RegExp(`<html lang="${locale}">`));
    assert.ok(loginPage.body.includes(createTranslator(locale)('admin.login.submit')), locale);
  }
});

test('语言切换拒绝无效值和站外回跳', async () => {
  const invalid = await request(srv.base, 'POST', '/language', {
    form: { locale: 'es', returnTo: '/' }
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.cookies, '');

  const external = await request(srv.base, 'POST', '/language', {
    form: { locale: 'en', returnTo: 'https://evil.example/' }
  });
  assert.equal(external.status, 302);
  assert.equal(external.location, '/');
});

test('站点默认语言持久化到设置、RSS 与备份，访客选择仍可覆盖', async () => {
  const isolated = await startServer();
  await isolated.ready;
  try {
    const session = await login(isolated.base);
    const saved = await request(isolated.base, 'POST', '/admin/settings', {
      cookies: session,
      form: {
        title: '默',
        subtitle: 'Essays',
        author: '默',
        footer: 'All rights reserved',
        perPage: '5',
        adminPath: '/admin',
        locale: 'de',
        newPassword: ''
      }
    });
    assert.equal(saved.status, 302);
    assert.match(saved.location, /saved=1/);

    const home = await request(isolated.base, 'GET', '/');
    assert.match(home.body, /<html lang="de">/);
    assert.ok(home.body.includes('>Startseite</a>'));

    const settings = await request(isolated.base, 'GET', '/admin/settings', { cookies: session });
    assert.match(settings.body, /Standardsprache der Website/);
    assert.match(settings.body, /for="settings-locale"/);
    assert.match(settings.body, /<option value="de" selected>Deutsch<\/option>/);
    assert.match(settings.body, /admin\.favicon\.invalidType/);
    assert.match(settings.body, /Wählen Sie ein SVG-/);

    const feed = await request(isolated.base, 'GET', '/feed.xml');
    assert.match(feed.body, /<language>de<\/language>/);

    const backup = JSON.parse((await request(isolated.base, 'GET', '/admin/export', { cookies: session })).body);
    assert.equal(backup.settings.locale, 'de');

    const switched = await request(isolated.base, 'POST', '/language', {
      form: { locale: 'ja', returnTo: '/' }
    });
    const japanese = await request(isolated.base, 'GET', '/', { cookies: switched.cookies });
    assert.match(japanese.body, /<html lang="ja">/);
    assert.ok(japanese.body.includes('>ホーム</a>'));

    const rejected = await request(isolated.base, 'POST', '/admin/settings', {
      cookies: session,
      form: { adminPath: '/admin', locale: 'es' }
    });
    assert.equal(rejected.status, 400);
    assert.match((await request(isolated.base, 'GET', '/')).body, /<html lang="de">/);
  } finally {
    isolated.stop();
  }
});
