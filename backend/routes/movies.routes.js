const express = require('express');
const auth = require('../middleware/auth');
const { sendError } = require('../middleware/errorContract');
const asyncHandler = require('../utils/asyncHandler');

function isValidNumericId(id) {
  return /^\d+$/.test(String(id));
}

function createMoviesRouter({ db, upload }) {
  const router = express.Router();

  router.options('/:id', auth, (req, res) => res.status(204).end());
  router.head('/:id', auth, (req, res) => res.status(204).end());

  router.param('id', (req, res, next, id) => {
    if (!isValidNumericId(id)) return sendError(res, 400, 'Request failed');
    return next();
  });

  router.get('/', asyncHandler(async (req, res) => {
    const movies = await db.getMovies();
    return res.json(movies);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const movie = await db.getMovieById(req.params.id);
    if (!movie) return sendError(res, 404, 'Not found');
    return res.json(movie);
  }));

  router.patch(
    '/:id',
    auth,
    upload.fields([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'heroBanner', maxCount: 1 },
      { name: 'subtitle', maxCount: 1 },
    ]),
    asyncHandler(async (req, res) => {
      const updates = {};
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.category !== undefined) updates.category = req.body.category;

      if (req.files) {
        if (req.files.thumbnail?.[0]?.filename) updates.thumbnail = req.files.thumbnail[0].filename;
        if (req.files.heroBanner?.[0]?.filename) updates.heroBanner = req.files.heroBanner[0].filename;
        if (req.files.subtitle?.[0]?.filename) updates.subtitle = req.files.subtitle[0].filename;
      }

      if (req.body.thumbnail !== undefined) updates.thumbnail = req.body.thumbnail;
      if (req.body.heroBanner !== undefined) updates.heroBanner = req.body.heroBanner;
      if (req.body.subtitle !== undefined) updates.subtitle = req.body.subtitle;

      if (Object.keys(updates).length === 0) return res.json({ success: true, changes: 0 });
      const result = await db.updateMovie(req.params.id, updates);
      return res.json({ success: true, result, updated: updates });
    })
  );

  router.delete('/:id', auth, asyncHandler(async (req, res) => {
    const result = await db.deleteMovie(req.params.id);
    if (result.changes === 0) return sendError(res, 404, 'Not found');
    return res.json({ success: true });
  }));

  return router;
}

module.exports = createMoviesRouter;
