/* 默·博客 — 持久化媒体上传(数据目录，不随 Release 替换) */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR, getSetting, setSetting } = require('./db');

const MEDIA_DIR = path.join(DATA_DIR, 'uploads');
const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;
const PORTRAIT_FILES = new Set(['portrait.jpg', 'portrait.png', 'portrait.webp']);

function imageKind(data) {
  if (!Buffer.isBuffer(data)) return null;
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
    && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9) return 'jpg';
  if (data.length >= 45
    && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    && data.readUInt32BE(8) === 13
    && data.subarray(12, 16).toString('ascii') === 'IHDR'
    && data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0
    && data.subarray(-8).equals(Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]))) return 'png';
  if (data.length >= 20
    && data.subarray(0, 4).toString('ascii') === 'RIFF'
    && data.readUInt32LE(4) + 8 === data.length
    && data.subarray(8, 12).toString('ascii') === 'WEBP'
    && ['VP8 ', 'VP8L', 'VP8X'].includes(data.subarray(12, 16).toString('ascii'))) return 'webp';
  return null;
}

function portraitFile() {
  const value = getSetting('portrait_file', '');
  return PORTRAIT_FILES.has(value) ? value : '';
}

function savePortrait(file) {
  if (!file || !Buffer.isBuffer(file.data) || !file.data.length) throw new Error('请选择照片文件');
  if (file.data.length > MAX_PORTRAIT_BYTES) throw new Error('照片不能超过 5 MiB');
  const kind = imageKind(file.data);
  if (!kind) throw new Error('仅支持 JPEG、PNG 或 WebP 图片');

  const filename = 'portrait.' + kind;
  const target = path.join(MEDIA_DIR, filename);
  const temp = path.join(MEDIA_DIR, '.portrait-' + crypto.randomUUID() + '.tmp');
  const previous = path.join(MEDIA_DIR, '.portrait-previous-' + crypto.randomUUID() + '.tmp');
  fs.mkdirSync(MEDIA_DIR, { recursive: true, mode: 0o750 });
  fs.writeFileSync(temp, file.data, { mode: 0o640 });
  let movedPrevious = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, previous);
      movedPrevious = true;
    }
    fs.renameSync(temp, target);
    if (movedPrevious) fs.unlinkSync(previous);
  } catch (e) {
    try { fs.unlinkSync(temp); } catch (_) {}
    if (movedPrevious && !fs.existsSync(target)) {
      try { fs.renameSync(previous, target); } catch (_) {}
    }
    throw e;
  }

  for (const old of PORTRAIT_FILES) {
    if (old === filename) continue;
    try { fs.unlinkSync(path.join(MEDIA_DIR, old)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  setSetting('portrait_file', filename);
  setSetting('portrait_updated', String(Date.now()));
  return filename;
}

function removePortrait() {
  const filename = portraitFile();
  if (filename) {
    try { fs.unlinkSync(path.join(MEDIA_DIR, filename)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  setSetting('portrait_file', '');
  setSetting('portrait_updated', String(Date.now()));
}

module.exports = { MEDIA_DIR, MAX_PORTRAIT_BYTES, savePortrait, removePortrait };
