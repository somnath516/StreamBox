const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('./config.service');
const logger = require('../utils/logger');

const dbPath = path.join(config.dirs.data, 'streambox.db');
let db;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      return resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function initDb() {
  await fs.mkdir(config.dirs.data, { recursive: true });
  if (db) return db;

  db = new sqlite3.Database(dbPath);
  await run('PRAGMA journal_mode = WAL');
  await run('PRAGMA synchronous = NORMAL');
  await run('PRAGMA foreign_keys = ON');
  await run('PRAGMA busy_timeout = 5000');
  await run('PRAGMA cache_size = -64000'); // 64MB cache for better performance
  await run('PRAGMA temp_store = MEMORY');
  await run('PRAGMA mmap_size = 268435456'); // 256MB memory-mapped I/O

  await run(`CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    movie TEXT NOT NULL,
    subtitle TEXT,
    thumbnail TEXT,
    heroBanner TEXT,
    duration INTEGER DEFAULT 0,
    category TEXT DEFAULT 'Movie',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    views INTEGER DEFAULT 0
  )`);

  await run('ALTER TABLE movies ADD COLUMN heroBanner TEXT').catch((err) => {
    if (!/duplicate column name/i.test(err.message || '')) throw err;
  });
  await run('CREATE INDEX IF NOT EXISTS idx_title ON movies(title)');
  await run('CREATE INDEX IF NOT EXISTS idx_category ON movies(category)');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_filename ON movies(movie)');

  const integrity = await get('PRAGMA integrity_check');
  const result = integrity && Object.values(integrity)[0];
  if (result !== 'ok') {
    logger.error('db_integrity_failed', { result: String(result || 'unknown') });
    throw new Error('Database integrity check failed');
  }

  const diagnostics = await getMediaDiagnostics();
  logger.info('startup_diagnostics', diagnostics);

  return db;
}

function getDb() {
  if (!db) throw new Error('Database has not been initialized');
  return db;
}

async function getMovies() {
  return all('SELECT * FROM movies ORDER BY createdAt DESC');
}

async function addMovie(movie) {
  await run('BEGIN IMMEDIATE TRANSACTION');
  try {
    // Normalize stored media filenames to safe basenames.
    // Prevents DB rows from containing path fragments like "C:\\..." or "uploads\\...".
    const toBase = (v) => (v ? String(v).replace(/\\/g, '/').split('/').pop() : v);

    const normalized = {
      title: movie.title,
      description: movie.description,
      movie: toBase(movie.movie),
      subtitle: toBase(movie.subtitle),
      thumbnail: toBase(movie.thumbnail),
      heroBanner: toBase(movie.heroBanner || null),
      category: movie.category || 'Movie',
    };

    const result = await run(
      `INSERT INTO movies (title, description, movie, subtitle, thumbnail, heroBanner, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.title,
        normalized.description,
        normalized.movie,
        normalized.subtitle,
        normalized.thumbnail,
        normalized.heroBanner,
        normalized.category,
      ]
    );
    await run('COMMIT');
    logger.info('db_movie_inserted', { id: result.lastID, movie: normalized.movie });
    return { id: result.lastID, ...normalized };
  } catch (err) {
    await run('ROLLBACK').catch(() => {});
    logger.error('db_movie_insert_failed', { code: err.code, message: err.message, movie: movie && movie.movie });
    throw err;
  }
}

async function getMovieById(id) {
  return get('SELECT * FROM movies WHERE id = ?', [id]);
}

async function unlinkIfPresent(filename, dir) {
  if (!filename) return false;

  const rawValue = String(filename).trim();
  const candidate = rawValue.replace(/\\/g, '/');
  const directPath = path.isAbsolute(candidate)
    ? path.normalize(candidate)
    : path.join(dir, candidate);

  const resolvedPath = candidate.includes('/') && !path.isAbsolute(candidate)
    ? path.join(dir, candidate)
    : directPath;

  const basenameCandidate = path.basename(candidate);
  const fallbackPath = basenameCandidate && basenameCandidate !== candidate
    ? path.join(dir, basenameCandidate)
    : resolvedPath;

  const candidates = Array.from(new Set([resolvedPath, fallbackPath, path.join(dir, rawValue)]));

  let lastErr = null;
  for (const fullPath of candidates) {
    try {
      await fs.unlink(fullPath);
      return true;
    } catch (err) {
      if (err.code !== 'ENOENT') lastErr = err;
    }
  }

  if (lastErr) logger.warn('delete_file_failed', { code: lastErr.code, file: rawValue, dir, candidates });
  return false;
}

async function deleteMovie(id) {
  const row = await getMovieById(id);
  if (!row) return { deletedId: id, changes: 0, deletedFiles: 0 };

  const results = await Promise.all([
    unlinkIfPresent(toBase(row.movie), config.dirs.movies),
    unlinkIfPresent(toBase(row.subtitle), config.dirs.subtitles),
    unlinkIfPresent(toBase(row.thumbnail), config.dirs.thumbnails),
    unlinkIfPresent(toBase(row.heroBanner), config.dirs.heroBanners),
  ]);

  const result = await run('DELETE FROM movies WHERE id = ?', [id]);
  return { deletedId: id, changes: result.changes, deletedFiles: results.filter(Boolean).length };
}

const UPDATE_FIELDS = new Set(['title', 'description', 'category', 'thumbnail', 'heroBanner', 'subtitle']);

function toBase(v) {
  if (!v) return v;
  return String(v).replace(/\\/g, '/').split('/').pop();
}

async function updateMovie(id, updates) {
  const fields = Object.keys(updates).filter((field) => UPDATE_FIELDS.has(field));
  if (!fields.length) return { id, changes: 0 };

  // Normalize any media filename fields to basenames.
  const values = fields.map((field) => {
    const v = updates[field];
    if (field === 'thumbnail' || field === 'heroBanner' || field === 'subtitle') return toBase(v);
    return v;
  });

  values.push(id);
  const sql = `UPDATE movies SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`;
  const result = await run(sql, values);
  return { id, changes: result.changes };
}

async function closeDb() {
  if (!db) return;
  const closing = db;
  db = null;
  await new Promise((resolve, reject) => closing.close((err) => (err ? reject(err) : resolve())));
}

async function listBasenames(dir, allowedExts) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => !allowedExts || allowedExts.has(path.extname(name).toLowerCase()));
  } catch (err) {
    logger.warn('media_dir_scan_failed', { dir, code: err.code, message: err.message });
    return [];
  }
}

async function getMediaDiagnostics() {
  const rows = await getMovies();
  const movieFiles = await listBasenames(config.dirs.movies, new Set(['.mp4', '.mkv', '.webm']));
  const subtitleFiles = await listBasenames(config.dirs.subtitles, new Set(['.vtt']));
  const thumbnailFiles = await listBasenames(config.dirs.thumbnails, new Set(['.jpg', '.jpeg', '.png', '.webp']));
  const heroBannerFiles = await listBasenames(config.dirs.heroBanners, new Set(['.jpg', '.jpeg', '.png', '.webp']));

  const rowMovieSet = new Set(rows.map((row) => toBase(row.movie)).filter(Boolean));
  const missingMovieRows = [];
  const staleAssetRows = [];

  for (const row of rows) {
    if (row.movie && !movieFiles.includes(toBase(row.movie))) missingMovieRows.push({ id: row.id, movie: row.movie });
    if (row.subtitle && !subtitleFiles.includes(toBase(row.subtitle))) staleAssetRows.push({ id: row.id, field: 'subtitle', file: row.subtitle });
    if (row.thumbnail && !thumbnailFiles.includes(toBase(row.thumbnail))) staleAssetRows.push({ id: row.id, field: 'thumbnail', file: row.thumbnail });
    if (row.heroBanner && !heroBannerFiles.includes(toBase(row.heroBanner))) staleAssetRows.push({ id: row.id, field: 'heroBanner', file: row.heroBanner });
  }

  return {
    dbPath,
    movieRows: rows.length,
    mediaDirs: {
      movies: config.dirs.movies,
      subtitles: config.dirs.subtitles,
      thumbnails: config.dirs.thumbnails,
      heroBanners: config.dirs.heroBanners,
    },
    files: {
      movies: movieFiles.length,
      subtitles: subtitleFiles.length,
      thumbnails: thumbnailFiles.length,
      heroBanners: heroBannerFiles.length,
    },
    orphanMovies: movieFiles.filter((file) => !rowMovieSet.has(file)),
    missingMovieRows,
    staleAssetRows,
  };
}

async function recoverOrphanMovies() {
  const diagnostics = await getMediaDiagnostics();
  const recovered = [];

  for (const filename of diagnostics.orphanMovies) {
    const fullPath = path.join(config.dirs.movies, filename);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat || !stat.isFile() || stat.size < 1024) continue;

    const title = path.basename(filename, path.extname(filename))
      .replace(/^[0-9a-f-]{36}-/i, '')
      .replace(/^\d+-[a-z0-9]+-/i, '')
      .replace(/[._-]+/g, ' ')
      .trim() || 'Recovered Movie';

    const saved = await addMovie({
      title,
      description: 'Recovered from existing movie file during startup diagnostics.',
      movie: filename,
      subtitle: null,
      thumbnail: null,
      heroBanner: null,
      category: 'Recovered',
    }).catch((err) => {
      logger.warn('orphan_movie_recovery_failed', { filename, code: err.code, message: err.message });
      return null;
    });
    if (saved) recovered.push(saved);
  }

  if (recovered.length) logger.warn('orphan_movies_recovered', { count: recovered.length });
  return recovered;
}

module.exports = {
  addMovie,
  closeDb,
  db: { get instance() { return getDb(); } },
  deleteMovie,
  getMediaDiagnostics,
  getMovieById,
  getMovies,
  initDb,
  recoverOrphanMovies,
  updateMovie,
};
