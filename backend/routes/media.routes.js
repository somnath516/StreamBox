const express = require('express');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const { streamMedia } = require('../services/media.service');

function createMediaRouter({ config }) {
  const router = express.Router();

  router.get('/video/:filename', asyncHandler((req, res) => streamMedia(req, res, {
    baseDirs: [config.dirs.movies, path.join(config.dirs.cardBase, 'movies')],
    fallbackType: 'video/mp4',
    cacheControl: 'public, max-age=3600',
  })));

  router.get('/subtitle/:filename', asyncHandler((req, res) => streamMedia(req, res, {
    baseDirs: [config.dirs.subtitles],
    fallbackType: 'text/vtt; charset=utf-8',
    cacheControl: 'public, max-age=3600',
  })));

  router.get('/subtitle-card/:filename', asyncHandler((req, res) => streamMedia(req, res, {
    baseDirs: [path.join(config.dirs.cardBase, 'subtitles')],
    fallbackType: 'text/vtt; charset=utf-8',
    cacheControl: 'public, max-age=3600',
  })));

  router.get('/thumbnail/:filename', asyncHandler((req, res) => streamMedia(req, res, {
    baseDirs: [config.dirs.thumbnails],
    fallbackType: 'image/jpeg',
    cacheControl: 'public, max-age=86400',
  })));

  router.get('/thumbnail-card/:filename', asyncHandler((req, res) => streamMedia(req, res, {
    baseDirs: [path.join(config.dirs.cardBase, 'thumbnails')],
    fallbackType: 'image/jpeg',
    cacheControl: 'public, max-age=86400',
  })));

  router.get('/hero-banner/:filename', asyncHandler((req, res) => streamMedia(req, res, {
    baseDirs: [config.dirs.heroBanners],
    fallbackType: 'image/jpeg',
    cacheControl: 'public, max-age=86400',
  })));

  return router;
}

module.exports = createMediaRouter;
