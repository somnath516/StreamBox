const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

function createUploadQueue({ db, dirs }) {
  const pending = [];
  const cancelled = new Set();
  let activeItem = null;
  let running = false;

  async function copyFileAtomic(source, destination) {
    const tempDestination = `${destination}.uploading-${process.pid}-${Date.now()}`;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.copyFile(source, tempDestination);
      await fs.unlink(destination).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
      await fs.rename(tempDestination, destination);
    } catch (err) {
      await fs.unlink(tempDestination).catch(() => {});
      throw err;
    }
  }

  function filesForMovie(movie) {
    const files = [
      { filename: movie.movie, dir: dirs.movies },
      { filename: movie.subtitle, dir: dirs.subtitles },
      { filename: movie.thumbnail, dir: dirs.thumbnails },
      { filename: movie.heroBanner, dir: dirs.heroBanners },
    ];

    return files
      .filter((file) => file.filename)
      .map((file) => ({
        source: path.join(dirs.uploadCache, file.filename),
        destination: path.join(file.dir, file.filename),
      }));
  }

  async function removeFiles(files, includeDestination = false) {
    await Promise.all(files.flatMap((file) => [
      fs.unlink(file.source).catch(() => {}),
      ...(includeDestination ? [fs.unlink(file.destination).catch(() => {})] : []),
    ]));
  }

  async function processNext() {
    if (running || pending.length === 0) return;
    running = true;
    const item = pending.shift();
    activeItem = item;

    try {
      if (cancelled.has(item.movieId)) return;
      await db.updateUploadStatus(item.movieId, 'copying');
      for (const file of item.files) {
        await copyFileAtomic(file.source, file.destination);
      }

      if (cancelled.has(item.movieId)) {
        await removeFiles(item.files, true);
        return;
      }

      await removeFiles(item.files);
      await db.updateUploadStatus(item.movieId, 'ready');
      logger.info('upload_copy_completed', { movieId: item.movieId });
    } catch (err) {
      await db.updateUploadStatus(item.movieId, 'failed').catch(() => {});
      logger.error('upload_copy_failed', {
        movieId: item.movieId,
        code: err.code,
        message: err.message,
      });
    } finally {
      cancelled.delete(item.movieId);
      activeItem = null;
      running = false;
      setImmediate(processNext);
    }
  }

  return {
    enqueue(item) {
      pending.push(item);
      setImmediate(processNext);
    },

    async recoverPending() {
      const movies = await db.getPendingUploads();
      for (const movie of movies) {
        const files = filesForMovie(movie);
        const movieFile = files.find((file) => file.source === path.join(dirs.uploadCache, movie.movie));
        if (!movieFile) continue;
        const exists = await fs.access(movieFile.source).then(() => true).catch(() => false);
        if (exists) pending.push({ movieId: movie.id, files });
      }
      setImmediate(processNext);
    },

    async remove(movieId) {
      const index = pending.findIndex((item) => item.movieId === movieId);
      if (index !== -1) {
        const [item] = pending.splice(index, 1);
        await removeFiles(item.files);
        return;
      }

      if (activeItem && activeItem.movieId === movieId) {
        cancelled.add(movieId);
      }
    },
  };
}

module.exports = { createUploadQueue };
