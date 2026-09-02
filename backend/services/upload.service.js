const fs = require('fs').promises;
const fsSync = require('fs');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const { normalizeToUtf8AndValidateVtt } = require('../utils/subtitle');
const { getUploadSessionRegistry } = require('../uploadSessionRegistry');

function dirKeyForField(fieldname) {
  if (fieldname === 'movie') return 'movies';
  if (fieldname === 'subtitle') return 'subtitles';
  if (fieldname === 'heroBanner') return 'heroBanners';
  return 'thumbnails';
}

function flattenUploadedFiles(req) {
  return Object.values(req.files || {}).flat();
}

function safeMovieName(title) {
  return String(title || 'Untitled')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') || 'Untitled';
}

async function cleanupUploadedFiles(files, dirs) {
  await Promise.allSettled(
    (files || []).map((file) => {
      if (file.path) return fs.unlink(file.path).catch(() => {});
      const dirKey = dirKeyForField(file.fieldname);
      return fs.unlink(path.join(dirs.uploadTemp || dirs[dirKey], dirKey, file.filename)).catch(() => {});
    })
  );
}

async function validateUpload(req, dirs) {
  const uploadedFiles = flattenUploadedFiles(req);

  if (!req.files?.movie?.[0]) {
    await cleanupUploadedFiles(uploadedFiles, dirs);
    const err = new Error('Request failed');
    err.statusCode = 400;
    throw err;
  }

  for (const file of uploadedFiles) {
    const dirKey = dirKeyForField(file.fieldname);
    try {
      const stat = await fs.stat(file.path || path.join(dirs.uploadTemp, dirKey, file.filename));
      if (!stat.isFile()) throw new Error('not file');
    } catch {
      await cleanupUploadedFiles(uploadedFiles, dirs);
      const err = new Error('Request failed');
      err.statusCode = 400;
      throw err;
    }
  }

  const movieFile = req.files.movie[0];
  if (!movieFile.size || movieFile.size < 1024) {
    await cleanupUploadedFiles(uploadedFiles, dirs);
    const err = new Error('Request failed');
    err.statusCode = 400;
    throw err;
  }

  if (req.files?.subtitle?.[0]) {
    try {
      const subtitleFile = req.files.subtitle[0];
      await normalizeToUtf8AndValidateVtt(subtitleFile.path || path.join(dirs.uploadTemp, 'subtitles', subtitleFile.filename));
    } catch (err) {
      await cleanupUploadedFiles(uploadedFiles, dirs);
      throw err;
    }
  }

  return uploadedFiles;
}

function createUpload(config) {
  const effectiveDirs = config.dirs;
  const uploadSessionRegistry = getUploadSessionRegistry({ dirs: effectiveDirs });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dirKey = dirKeyForField(file.fieldname);
      // Write directly to the configured folder (no extra subfolder)
      const dest = effectiveDirs[dirKey] || effectiveDirs.movies;
      fsSync.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    },

    filename: (req, file, cb) => {
      const ext = path.extname(String(file.originalname || '')).toLowerCase();
      const fallbackExt = file.fieldname === 'movie' ? '.mp4' : file.fieldname === 'subtitle' ? '.vtt' : '.jpg';
      const safeExt = /^[.][a-z0-9]{1,10}$/i.test(ext) ? ext : fallbackExt;
      const title = safeMovieName(req.body && req.body.title);
      const suffix = file.fieldname === 'movie' ? ''
        : file.fieldname === 'thumbnail' ? ' thumbnail'
          : file.fieldname === 'subtitle' ? ' subtitle' : ' hero banner';
      const dirKey = dirKeyForField(file.fieldname);
      const dir = effectiveDirs[dirKey] || effectiveDirs.movies;
      let finalName = `${title}${suffix}${safeExt}`;
      let counter = 2;
      while (fsSync.existsSync(path.join(dir, finalName))) {
        finalName = `${title}${suffix} (${counter++})${safeExt}`;
      }

      const uploadSessionId =
        (req.body && req.body.uploadSessionId) || (req.headers && req.headers['x-upload-session-id']) || null;
      const sessionIdStr = uploadSessionId ? String(uploadSessionId) : null;

      const finalPath = path.resolve(effectiveDirs[dirKey] || effectiveDirs.movies, finalName);

      const fileMeta = {
        fieldname: file.fieldname,
        path: finalPath,
        originalname: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      };

      // registerFile must happen only after the file is fully written.
      // Multer's diskStorage provides a writable stream via file.stream in the lifecycle.
      if (sessionIdStr && file && file.stream && typeof file.stream.once === 'function') {
        try {
          file.stream.once('finish', () => {
            uploadSessionRegistry.registerFile(sessionIdStr, fileMeta);
          });
          file.stream.once('error', () => {
            try {
              uploadSessionRegistry.updateSessionStatus(sessionIdStr, 'failed', {
                reason: 'file_stream_error',
              });
            } catch {}
          });
        } catch {}
      }


      cb(null, finalName);
    },
  });

  return multer({
    storage,
    limits: {
      fileSize: config.uploadFileSize,
      files: config.uploadMaxFiles,
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = new Set([
        'video/mp4',
        'video/webm',
        'video/mkv',
        'video/x-matroska',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif',
        'text/vtt',
      ]);
      const banned = /\.(exe|bat|sh|php|jsp|dll|com|scr)$/i;

      const original = String(file.originalname || '');
      if (banned.test(original)) return cb(new Error('Upload rejected'), false);

      const ext = path.extname(original).toLowerCase();
      const extLooksLikeMovie = ['.mp4', '.mkv', '.webm'].includes(ext);
      const extLooksLikeImage = ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext);
      const extLooksLikeVtt = ['.vtt'].includes(ext);

      if (allowedMimes.has(file.mimetype)) return cb(null, true);
      if (extLooksLikeMovie) return cb(null, true);
      if (extLooksLikeImage) return cb(null, true);
      if (extLooksLikeVtt) return cb(null, true);

      return cb(new Error('Upload rejected'), false);
    },
  });
}

async function cleanupStaleTempFiles() {
  // No-op for local/dev reliability.
  // Server.js expects this export; temp cleanup is handled elsewhere or is optional.
  return;
}

module.exports = {
  createUpload,
  flattenUploadedFiles,
  cleanupUploadedFiles,
  validateUpload,
  cleanupStaleTempFiles,
};
