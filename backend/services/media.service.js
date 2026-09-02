const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const { pipeline } = require('stream');
const { promisify } = require('util');

const pipe = promisify(pipeline);

const MIME = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.mkv': 'video/x-matroska',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.vtt': 'text/vtt; charset=utf-8',
  '.webp': 'image/webp',
};

function contentTypeFor(filename, fallback = 'application/octet-stream') {
  return MIME[path.extname(filename).toLowerCase()] || fallback;
}

function decodeFilename(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return null;
  }
}

function hasTraversal(value) {
  const raw = String(value || '');
  const decoded = decodeFilename(raw);
  const candidates = [raw, decoded || ''].map((v) => v.replace(/\\/g, '/').toLowerCase());
  return candidates.some((v) => v.includes('..') || v.includes('/') || /%2e|%2f|%5c/i.test(v));
}

function safeMediaPath(baseDir, filename) {
  const decoded = decodeFilename(filename);
  if (!decoded || hasTraversal(filename) || hasTraversal(decoded)) return null;

  const clean = path.basename(decoded);
  if (!clean || clean !== decoded) return null;

  const fullPath = path.resolve(baseDir, clean);
  const resolvedBase = path.resolve(baseDir);
  if (fullPath !== resolvedBase && fullPath.startsWith(resolvedBase + path.sep)) return fullPath;
  return null;
}

async function findMediaFile(baseDirs, filename) {
  for (const dir of baseDirs) {
    const fullPath = safeMediaPath(dir, filename);
    if (!fullPath) return null;
    try {
      const stat = await fsp.stat(fullPath);
      if (stat.isFile()) return { fullPath, stat };
    } catch {}
  }
  return null;
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return false;

  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);
  if ((start !== null && !Number.isSafeInteger(start)) || (end !== null && !Number.isSafeInteger(end))) return false;

  if (start === null) {
    const suffix = end;
    if (!suffix || suffix <= 0) return false;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    if (end === null || end >= size) end = size - 1;
  }

  if (start < 0 || end < start || start >= size) return false;
  return { start, end };
}

function generateETag(stat) {
  // Generate a weak ETag based on file size and modification time
  const hash = crypto.createHash('md5');
  hash.update(`${stat.size}-${stat.mtimeMs}`);
  return `W/"${hash.digest('hex')}"`;
}

async function streamMedia(req, res, options) {
  const filename = req.params.filename;
  const safeBasename = path.basename(String(filename || ''));

  const baseDirs = (options.baseDirs || []).map((d) => path.resolve(d));

  const decoded = decodeFilename(filename);
  const clean = decoded ? path.basename(decoded) : safeBasename;
  const candidatePaths = baseDirs.map((dir) => path.resolve(dir, clean));
  const candidateExists = candidatePaths.map((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  logger.debug('media_request', {
    route: req.path,
    filename,
    decodedFilename: decoded,
    cleanBasename: clean,
    effectiveBaseDirs: baseDirs,
    resolvedCandidates: candidatePaths,
    existsSync: candidateExists,
  });

  const found = await findMediaFile(baseDirs, filename);
  if (!found) {
    logger.warn('media_not_found', {
      requestId: req.id,
      route: req.path,
      filename,
      baseDirs,
    });
    return res.status(404).json({ success: false, error: 'Not found', code: 404, requestId: req.id });
  }

  const { fullPath, stat } = found;
  const type = options.contentType || contentTypeFor(fullPath, options.fallbackType);
  const range = parseRange(req.headers.range, stat.size);

  // Generate ETag for cache validation
  const etag = generateETag(stat);

  // Check If-None-Match for 304 response
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && ifNoneMatch === etag) {
    res.status(304).end();
    return;
  }

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', options.cacheControl || 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('ETag', etag);
  res.setHeader('Vary', 'Accept-Encoding');

  // Add stronger caching for images
  if (type.startsWith('image/')) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // 7 days
  }

  if (range === false) {
    res.setHeader('Content-Range', `bytes */${stat.size}`);
    return res.status(416).json({ error: 'Request failed' });
  }

  if (range) {
    const chunkSize = range.end - range.start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
    res.setHeader('Content-Length', chunkSize);
    await pipe(fs.createReadStream(fullPath, { start: range.start, end: range.end }), res);
    return;
  }

  res.setHeader('Content-Length', stat.size);
  await pipe(fs.createReadStream(fullPath), res);
}

module.exports = {
  contentTypeFor,
  safeMediaPath,
  streamMedia,
};