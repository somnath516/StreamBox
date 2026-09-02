const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const { sendError } = require('../middleware/errorContract');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

const {
  cleanupUploadedFiles,
  flattenUploadedFiles,
  validateUpload,
} = require('../services/upload.service');

const { getUploadSessionRegistry } = require('../uploadSessionRegistry');

function createUploadRouter({ db, upload, config }) {
  const router = express.Router();
  const uploadLimiter = rateLimit({
    windowMs: Number(process.env.UPLOAD_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.UPLOAD_RATE_LIMIT || 10),
    message: { error: 'Request failed' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const uploadSessionRegistry = getUploadSessionRegistry({ dirs: config && config.dirs ? config.dirs : undefined });

  function safeMovieName(title) {
    return String(title || 'Untitled')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '') || 'Untitled';
  }

  async function renameUploadedFiles(req, dirs) {
    const title = safeMovieName(req.body.title);
    const files = flattenUploadedFiles(req);
    const usedNames = new Set();

    for (const file of files) {
      const dirKey = file.fieldname === 'movie' ? 'movies'
        : file.fieldname === 'subtitle' ? 'subtitles'
          : file.fieldname === 'heroBanner' ? 'heroBanners' : 'thumbnails';
      const suffix = file.fieldname === 'movie' ? ''
        : file.fieldname === 'thumbnail' ? ' thumbnail'
          : file.fieldname === 'subtitle' ? ' subtitle' : ' hero banner';
      const ext = path.extname(file.originalname || file.filename).toLowerCase() || (file.fieldname === 'movie' ? '.mp4' : '.jpg');
      const dir = dirs[dirKey] || dirs.movies;
      const source = file.path;
      let name = `${title}${suffix}${ext}`;
      let counter = 2;
      while (usedNames.has(name) || await fs.access(path.join(dir, name)).then(() => true).catch(() => false)) {
        name = `${title}${suffix} (${counter++})${ext}`;
      }
      const destination = path.join(dir, name);
      if (path.resolve(source) !== path.resolve(destination)) {
        await fs.rename(source, destination);
      }
      file.filename = name;
      file.path = destination;
      usedNames.add(name);
    }
  }

  router.options('/', auth, (req, res) => res.status(204).end());
  router.head('/', auth, (req, res) => res.status(204).end());

  async function atomicUpload(req, db, config) {
    const requestId = req.id;
    const uploadSessionId = req.uploadSessionId || null;

    const uploadedFiles = flattenUploadedFiles(req);

    logger.info('[UPLOAD] atomic_upload_started', {
      requestId,
      uploadSessionId,
      uploadMode: uploadSessionId ? 'session' : 'stateless',
      uploadState: 'active',
      fileCount: uploadedFiles.length,
    });

    try {
      if (!req.files || !req.files.movie || !req.files.movie[0]) {
        const err = new Error('No movie file uploaded');
        err.statusCode = 400;
        err.code = 'NO_FILE';
        throw err;
      }

      await validateUpload(req, config.dirs);
      await renameUploadedFiles(req, config.dirs);

      if (uploadSessionId) {
        // Promotion/finalization is handled after successful DB insert via registry.promoteSession.
      }


      const newMovie = {
        title: req.body.title?.trim() || 'Untitled',
        description: req.body.description?.trim() || '',
        movie: req.files.movie[0].filename,
        subtitle: req.files.subtitle?.[0]?.filename || null,
        thumbnail: req.files.thumbnail?.[0]?.filename || null,
        heroBanner: req.files.heroBanner?.[0]?.filename || null,
        category: req.body.category || 'Movie',
      };

      const savedMovie = await db.addMovie(newMovie);

      logger.info('[UPLOAD] atomic_upload_completed', {
        requestId,
        uploadSessionId,
        uploadMode: uploadSessionId ? 'session' : 'stateless',
        uploadState: 'completed',
        movieId: savedMovie.id,
      });

      return { success: true, movie: savedMovie };
    } catch (err) {
      if (uploadSessionId) {
        try {
          await uploadSessionRegistry.updateSessionStatus(uploadSessionId, 'failed');
        } catch {}
      }

      logger.error('[UPLOAD] atomic_upload_failed', {
        requestId,
        uploadSessionId,
        message: err && err.message ? err.message : String(err),
        code: err && err.code ? err.code : err && err.name,
      });

      await cleanupUploadedFiles(uploadedFiles, config.dirs).catch(() => {});
      throw err;
    }
  }

  router.post(
    '/',
    auth,
    uploadLimiter,
    (req, res, next) => {
      // Disable timeout killers for large uploads
      try {
        req.setTimeout(0);
        res.setTimeout(0);
        if (req.socket) {
          req.socket.setTimeout(0);
          req.socket.setKeepAlive(true);
        }
      } catch {}

      try {
        req.setTimeout(0);
        res.setTimeout(0);
        req.socket && req.socket.setTimeout && req.socket.setTimeout(0);
      } catch {}

      const headerSessionId = req.headers && req.headers['x-upload-session-id'] ? String(req.headers['x-upload-session-id']) : null;
      const bodySessionId = req.body && req.body.uploadSessionId ? String(req.body.uploadSessionId) : null;
      req.uploadSessionId = bodySessionId || headerSessionId || null;
      req.uploadMode = req.uploadSessionId ? 'session' : 'stateless';

      if (req.uploadSessionId) {
        try {
          uploadSessionRegistry.createSession(req.uploadSessionId);
          uploadSessionRegistry.updateSessionStatus(req.uploadSessionId, 'active');
        } catch {}
      }

      next();
    },
    (req, res, next) => {
      upload.fields([
        { name: 'movie', maxCount: 1 },
        { name: 'subtitle', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
        { name: 'heroBanner', maxCount: 1 },
      ])(req, res, async (err) => {
        if (err) {
          const uploadSessionId = req.uploadSessionId || null;
          logger.error('[UPLOAD] multer_error', {
            requestId: req.id,
            uploadSessionId,
            uploadMode: req.uploadMode,
            message: err.message,
            code: err.code || err.name,
          });

          if (uploadSessionId) {
            try {
              await uploadSessionRegistry.updateSessionStatus(uploadSessionId, 'aborted', { reason: 'client_disconnect' });
              // do NOT promote in aborted state
              try { await uploadSessionRegistry.moveOrphanFiles(uploadSessionId); } catch {}

            } catch {}
          }

          const message = err.code === 'ENOSPC'
            ? 'Not enough storage space for this upload'
            : 'Upload failed';
          return res.status(400).json({ success: false, error: message, code: err.code || err.name, requestId: req.id });
        }
        next();
      });
    },
    asyncHandler(async (req, res) => {
      try {
        const result = await atomicUpload(req, db, config);
        return res.status(201).json({ success: true, message: 'Upload successful', movie: result.movie });
      } catch (err) {
        const statusCode = err && err.statusCode ? err.statusCode : 500;
        return sendError(res, statusCode, err && err.message ? err.message : 'Upload processing failed', req.id);
      }
    })
  );

  setInterval(() => uploadSessionRegistry.recoverSessions().catch(() => {}), 10 * 60 * 1000);

  return router;
}

module.exports = createUploadRouter;
