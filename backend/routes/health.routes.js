const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { sendError } = require('../middleware/errorContract');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../services/config.service');
const logger = require('../utils/logger');

function createHealthRouter({ db }) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    try {
      const movies = await db.getMovies();
      return res.json({ status: 'OK', uptime: process.uptime(), movies: movies.length });
    } catch {
      return sendError(res, 500, 'Internal server error');
    }
  }));

  router.get('/metrics', asyncHandler(async (req, res) => {
    const movies = await db.getMovies();
    const media = db.getMediaDiagnostics ? await db.getMediaDiagnostics() : null;
    const memory = process.memoryUsage();
    return res.json({
      status: 'OK',
      uptime: process.uptime(),
      movies: movies.length,
      media,
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
      },
      pid: process.pid,
      node: process.version,
    });
  }));

  router.get('/storage', asyncHandler(async (req, res) => {
    const moviesDir = config.dirs.movies;

    if (process.platform === 'win32') {
      // Windows: use PowerShell to get free space on the drive
      const driveRoot = path.parse(moviesDir).root;
      try {
        // Use PowerShell with Get-PSDrive which is simpler and more reliable
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        // Get-PSDrive returns FreeSpace in bytes directly
        // Extract just the drive letter (e.g., 'E' from 'E:\')
        const driveLetter = driveRoot.charAt(0).toUpperCase();
        const psScript = `Get-PSDrive -Name ${driveLetter} | Select-Object -ExpandProperty Free`;
        const result = await execAsync(`powershell -NonInteractive -Command "${psScript}"`);
        // Keep exact BYTES; don't truncate before converting on the frontend.
        const freeBytes = Math.floor(Number(String(result.stdout).trim())) || 0;
        return res.json({
          status: 'OK',
          freeSpace: freeBytes,
          drive: driveRoot,
          directory: moviesDir
        });
      } catch (err) {
        logger.error('storage_fetch_failed', {
          platform: process.platform,
          drive: driveRoot,
          directory: moviesDir,
          message: err && err.message ? err.message : String(err),
          stack: err && err.stack ? err.stack : undefined,
        });
        return res.status(503).json({
          status: 'ERROR',
          drive: driveRoot,
          directory: moviesDir,
          error: err.message
        });
      }
    } else {
      // Linux/Unix: use statvfs via df command
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const result = await execAsync(`df -B1 "${moviesDir}" | tail -1 | awk '{print $4}'`);
        // Keep exact BYTES; don't truncate before converting on the frontend.
        const freeBytes = Math.floor(Number(String(result.stdout).trim())) || 0;
        return res.json({
          status: 'OK',
          freeSpace: freeBytes,
          directory: moviesDir
        });
      } catch (err) {
        logger.error('storage_fetch_failed', {
          platform: process.platform,
          directory: moviesDir,
          message: err && err.message ? err.message : String(err),
          stack: err && err.stack ? err.stack : undefined,
        });
        return res.status(503).json({
          status: 'ERROR',
          directory: moviesDir,
          error: err.message
        });
      }
    }
  }));

  return router;
}

module.exports = createHealthRouter;
