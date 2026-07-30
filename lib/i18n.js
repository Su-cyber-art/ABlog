'use strict';

const { TABLE } = require('./i18n-messages');

const DEFAULT_LOCALE = 'zh-CN';
const LOCALES = Object.freeze([
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'ru', name: 'Русский' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ja', name: '日本語' }
]);
const LOCALE_INDEX = new Map(LOCALES.map((locale, index) => [locale.code, index]));
const LOCALE_COOKIE = 'ablog_locale';
const CLIENT_MESSAGE_KEYS = Object.freeze([
  'admin.favicon.invalidType',
  'admin.favicon.tooLarge',
  'admin.favicon.reading',
  'admin.favicon.readFailed',
  'admin.favicon.decodeFailed',
  'admin.favicon.dimensions',
  'admin.favicon.cropReady',
  'admin.favicon.unsafe',
  'admin.favicon.uploading',
  'admin.favicon.generateFailed',
  'admin.favicon.uploadFailed',
  'admin.favicon.cacheRefreshing',
  'admin.favicon.retry',
  'admin.editor.previewEmpty',
  'admin.draft.found',
  'admin.draft.minutes',
  'admin.draft.hours',
  'admin.draft.restore',
  'admin.draft.discard'
]);

for (const [key, messages] of Object.entries(TABLE)) {
  if (!Array.isArray(messages) || messages.length !== LOCALES.length
    || messages.some(message => typeof message !== 'string' || !message)) {
    throw new Error(`Invalid translations for ${key}`);
  }
}

function isSupportedLocale(value) {
  return LOCALE_INDEX.has(String(value || ''));
}

function normalizeLocale(value, fallback = DEFAULT_LOCALE) {
  const locale = String(value || '');
  if (isSupportedLocale(locale)) return locale;
  return isSupportedLocale(fallback) ? fallback : DEFAULT_LOCALE;
}

function interpolate(message, values) {
  if (!values) return message;
  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match);
}

function createTranslator(locale) {
  const normalized = normalizeLocale(locale);
  const index = LOCALE_INDEX.get(normalized);
  return (key, values) => {
    const messages = TABLE[key];
    const message = messages ? messages[index] : key;
    return interpolate(message, values);
  };
}

function attachRequestI18n(req, defaultLocale) {
  const locale = normalizeLocale(req.cookies && req.cookies[LOCALE_COOKIE], normalizeLocale(defaultLocale));
  req.locale = locale;
  req.t = createTranslator(locale);
  return { locale, t: req.t };
}

function safeLocalPath(value, fallback = '/') {
  const raw = String(value || '');
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\0\r\n]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, 'http://ablog.local');
    if (url.origin !== 'http://ablog.local') return fallback;
    return url.pathname + url.search;
  } catch (e) {
    return fallback;
  }
}

function clientMessages(t) {
  return Object.fromEntries(CLIENT_MESSAGE_KEYS.map(key => [key, t(key)]));
}

module.exports = {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  TABLE,
  isSupportedLocale,
  normalizeLocale,
  createTranslator,
  attachRequestI18n,
  safeLocalPath,
  clientMessages
};
