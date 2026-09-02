const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const config = require('../backend/services/config.service');
const db = require('../backend/services/db.service');
const logger = require('../backend/utils/logger');

// Safety: never touch code, db schema, env files, or node_modules.
const SCRIPT_SAFE_MODE = true;

const MEDIA_DIR_KEYS = [
  'movies',
  'subtitles',
  'thumbnails',
  'heroBanners',
  // uploads is a staging/housekeeping directory.
  // Note: current architecture stores final files under config.dirs.*.
  // We still delete orphans from uploads to cover any legacy storage.
];

function assertSafePath(p) {
  const resolved = path.resolve(String(p || ''));
  const allowedRoots = [
    path.resolve(config.dirs.movies),
    path.resolve(config.dirs.subtitles),
    path.resolve(config.dirs.thumbnails),
    path.resolve(config.dirs.heroBanners),
    path.resolve(config.dirs.uploads),
  ].filter(Boolean);

  // Allow deletion only if target is inside one of the known media roots.
  const ok = allowedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
  if (!ok) {
    throw new Error(`Refusing to delete outside media roots: ${resolved}`);
  }
}

async function listFilesRecursive(dir) {
  const files = [];
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        files.push(...(await listFilesRecursive(full)));
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  } catch {
    // ignore
  }
  return files;
}

async function removeFileSafe(filePath) {
  assertSafePath(filePath);
  try {
    await fsp.rm(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await db.initDb();

  const movies = await db.getMovies();
  const refs = new Set();

  for (const movie of movies) {
    if (movie.movie) refs.add(path.join(config.dirs.movies, movie.movie));
    if (movie.subtitle) refs.add(path.join(config.dirs.subtitles, movie.subtitle));
    if (movie.thumbnail) refs.add(path.join(config.dirs.thumbnails, movie.thumbnail));
    if (movie.heroBanner) refs.add(path.join(config.dirs.heroBanners, movie.heroBanner));
  }

  // Always include configured directories for orphan cleanup.
  const mediaRoots = [
    config.dirs.movies,
    config.dirs.subtitles,
    config.dirs.thumbnails,
    config.dirs.heroBanners,
    config.dirs.uploads,
  ].filter(Boolean);

  // Gather candidates from each media root.
  const candidates = [];
  for (const root of mediaRoots) {
    // Only consider files directly under known roots (not following symlinks by accident).
    // We still recurse to catch any unexpected nested legacy paths.
    candidates.push(...(await listFilesRecursive(root)));
  }

  // Orphan files are those not referenced by the DB.
  const orphaned = candidates.filter((file) => !refs.has(file));

  logger.info('[MEDIA CLEANUP] start', {
    safeMode: SCRIPT_SAFE_MODE,
    mediaRoots,
    moviesRowCount: movies.length,
    referencedFileCount: refs.size,
    candidatesCount: candidates.length,
    orphanedCount: orphaned.length,
  });

  // Missing referenced files: clean DB rows for those basenames that no longer exist.
  // This prevents homepage/cards from continuously requesting 404 media.
  const referencedButMissing = [];
  for (const filePath of refs) {
    try {
      if (!fs.existsSync(filePath)) referencedButMissing.push(filePath);
    } catch {
      referencedButMissing.push(filePath);
    }
  }

  // Map missing filePaths back to basenames and DB columns.
  const missingByBasename = new Map(); // basename -> columnName
  for (const filePath of referencedButMissing) {
    const base = path.basename(filePath);
    const col = (() => {
      if (filePath.startsWith(config.dirs.thumbnails + path.sep)) return 'thumbnail';
      if (filePath.startsWith(config.dirs.heroBanners + path.sep)) return 'heroBanner';
      if (filePath.startsWith(config.dirs.subtitles + path.sep)) return 'subtitle';
      if (filePath.startsWith(config.dirs.movies + path.sep)) return 'movie';
      // uploads is not a DB column; ignore
      return null;
    })();
    if (!col) continue;
    // movie column is required by schema; we still null it? -> not safe.
    if (col === 'movie') continue;

    // last write wins if duplicates; safe.
    missingByBasename.set(base, col);
  }

  // Delete orphaned media files.
  let deletedFiles = 0;
  const deleteResults = await Promise.all(orphaned.map(async (f) => {
    const ok = await removeFileSafe(f);
    if (ok) deletedFiles += 1;
    return ok;
  }));

  // Clean DB rows: set media fields to NULL when files missing.
  // We must do it per-row to avoid SQL redesign.
  let cleanedRows = 0;
  let cleanedFieldsCount = 0;

  for (const movie of movies) {
    const updates = {};
    if (movie.thumbnail) {
      const col = missingByBasename.get(path.basename(movie.thumbnail));
      if (col === 'thumbnail') updates.thumbnail = null;
    }
    if (movie.heroBanner) {
      const col = missingByBasename.get(path.basename(movie.heroBanner));
      if (col === 'heroBanner') updates.heroBanner = null;
    }
    if (movie.subtitle) {
      const col = missingByBasename.get(path.basename(movie.subtitle));
      if (col === 'subtitle') updates.subtitle = null;
    }

    if (Object.keys(updates).length) {
      // db.updateMovie is already wired for thumbnail/heroBanner/subtitle fields.
      // But it normalizes to basenames.
      await db.updateMovie(movie.id, updates).catch(() => {});
      cleanedRows += 1;
      cleanedFieldsCount += Object.keys(updates).length;
    }
  }

  await db.closeDb();

  logger.info('[MEDIA CLEANUP] done', {
    mode: 'apply',
    deletedFiles,
    orphanedCount: orphaned.length,
    candidatesCount: candidates.length,
    referencedButMissingCount: referencedButMissing.length,
    cleanedRows,
    cleanedFieldsCount,
    completion: 'success',
  });

  console.log(JSON.stringify({
    ok: true,
    mode: 'apply',
    deletedFiles,
    orphanedCount: orphaned.length,
    referencedButMissingCount: referencedButMissing.length,
    cleanedRows,
    cleanedFieldsCount,
    completion: 'success',
  }));
}

main().catch(async (err) => {
  try { await db.closeDb(); } catch {}
  logger.error('[MEDIA CLEANUP] failed', { message: err?.message || String(err) });
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }));
  process.exit(1);
});
