const fs = require('fs').promises;
const path = require('path');
const db = require('../backend/services/db.service');
const config = require('../backend/services/config.service');

const apply = process.argv.includes('--apply');

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
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

  const candidates = [
    ...(await listFiles(config.dirs.movies)),
    ...(await listFiles(config.dirs.subtitles)),
    ...(await listFiles(config.dirs.thumbnails)),
    ...(await listFiles(config.dirs.heroBanners)),
    ...(await listFiles(config.dirs.uploads)),
  ];

  const orphaned = candidates.filter((file) => !refs.has(file));
  if (apply) {
    await Promise.allSettled(orphaned.map((file) => fs.rm(file, { force: true })));
  }

  await db.closeDb();
  console.log(JSON.stringify({ ok: true, mode: apply ? 'apply' : 'dry-run', orphanedCount: orphaned.length, orphaned }, null, 2));
}

main().catch(async (err) => {
  await db.closeDb().catch(() => {});
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
