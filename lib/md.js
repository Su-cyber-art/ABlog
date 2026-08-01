/* 默·博客 - Markdown 渲染器（Node 与浏览器构建共用） */
'use strict';

const MarkdownIt = require('markdown-it');
const anchor = require('markdown-it-anchor');
const footnote = require('markdown-it-footnote');
const taskLists = require('markdown-it-task-lists');
const toc = require('markdown-it-toc-done-right');
const hljs = require('highlight.js/lib/common');

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slugify(value) {
  const slug = String(value || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}_ -]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return slug || 'section';
}

function safeHref(value) {
  const href = String(value || '').trim();
  if (!href || /[\u0000-\u001f\u007f"'<>]/.test(href)) return '#';
  if (/^(?:https?:|mailto:)/i.test(href)) return href;
  if (/^\/(?!\/)/.test(href) || href.startsWith('#')) return href;
  return '#';
}

function safeImgSrc(value) {
  const src = String(value || '').trim();
  if (!src || /[\u0000-\u001f\u007f"'<>]/.test(src)) return '';
  if (/^https?:/i.test(src) || /^\/(?!\/)/.test(src)) return src;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)) return src;
  return '';
}

function highlight(code, language) {
  if (!language || !hljs.getLanguage(language)) return '';
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch (error) {
    return '';
  }
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  breaks: false,
  highlight
});

md.use(anchor, { slugify, permalink: false });
md.use(footnote);
md.use(taskLists, { enabled: false, label: false });
md.use(toc, { slugify, level: [1, 2, 3] });

const defaultLinkOpen = md.renderer.rules.link_open
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const hrefIndex = tokens[idx].attrIndex('href');
  if (hrefIndex >= 0) tokens[idx].attrs[hrefIndex][1] = safeHref(tokens[idx].attrs[hrefIndex][1]);
  return defaultLinkOpen(tokens, idx, options, env, self);
};

const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const srcIndex = tokens[idx].attrIndex('src');
  const src = srcIndex >= 0 ? safeImgSrc(tokens[idx].attrs[srcIndex][1]) : '';
  if (!src) return esc(tokens[idx].content);
  tokens[idx].attrs[srcIndex][1] = src;
  tokens[idx].attrSet('loading', 'lazy');
  tokens[idx].attrSet('decoding', 'async');
  return defaultImage(tokens, idx, options, env, self);
};

const defaultParagraphOpen = md.renderer.rules.paragraph_open
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
  const renderOptions = env.renderOptions || {};
  tokens[idx].attrJoin('class', 'md-paragraph');
  if (renderOptions.justify === false) tokens[idx].attrJoin('class', 'md-align-left');
  if (renderOptions.indent === false) tokens[idx].attrJoin('class', 'md-no-indent');
  return defaultParagraphOpen(tokens, idx, options, env, self);
};

/**
 * @param {string} source Markdown source
 * @param {{justify?: boolean, indent?: boolean}} [options] Typography options
 */
function mdToHtml(source, options) {
  return md.render(String(source || ''), { renderOptions: options || {} });
}

module.exports = { mdToHtml, esc, safeHref, safeImgSrc, slugify };
