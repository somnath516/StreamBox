const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath = path.join(__dirname, '..', '..', 'config', '.env')) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const root = path.join(__dirname, '..', '..');

/**
 * Render runs on Linux.
 * The previous default SD_BASE was Windows-only, which breaks media path resolution
 * (/thumbnail/*, /hero-banner/*) inside the container.
 *
 * We preserve backward compatibility by honoring SD_BASE when provided,
 * but we choose Linux-safe defaults matching the container filesystem.
 */
const defaultLinuxBase = '/media';
const defaultWindowsBase = 'E:\\StreamBox Database';

// Render runs on Linux. For local dev, default to the provided Windows SD-card root.
// SD_BASE (if provided) still wins, but we normalize known legacy /app/media → /media.
const sdBase = process.env.SD_BASE || (process.platform === 'win32' ? defaultWindowsBase : defaultLinuxBase);

function normalizeMediaBase(input) {
  const v = path.resolve(String(input || '')).replace(/\\/g, '/');

  // If someone previously set SD_BASE to /app/media in prod, normalize to /media.
  if (v === '/app/media' || v.startsWith('/app/media/')) {
    return v.replace(/^\/app\/media/, '/media');
  }

  return v;
}

const mediaRoot = normalizeMediaBase(sdBase);

const config = {

  port: Number(process.env.PORT || 5000),
  adminToken: process.env.STREAMBOX_ADMIN || 'STREAMBOX_ADMIN',
  // Default upload size.
  // Set very high to prevent unexpected LIMIT_FILE_SIZE rejections on typical large movie uploads.
  // Can still be overridden via UPLOAD_FILE_SIZE.
  uploadFileSize: Number(process.env.UPLOAD_FILE_SIZE || 100 * 1024 * 1024 * 1024),

  uploadMaxFiles: Number(process.env.UPLOAD_MAX_FILES || 4),
  phase6Probe: process.env.PHASE6_PROBE === '1',
  dirs: {
    movies: path.resolve(
      process.env.MOVIES_BASE || path.join(mediaRoot, 'movies')
    ),
    subtitles: path.resolve(
      process.env.SUBTITLES_BASE || path.join(mediaRoot, 'subtitles')
    ),
    thumbnails: path.resolve(
      process.env.THUMBNAILS_BASE || path.join(mediaRoot, 'thumbnails')
    ),

    // Preserve the required “hero banner” directory naming.
    heroBanners: path.resolve(
      process.env.HERO_BANNER_BASE || path.join(mediaRoot, 'hero banner')
    ),


    data: path.join(root, 'data'),

    // Used by card routes: /thumbnail-card and /subtitle-card
    // Must align with absolute dirs above.
    cardBase: path.resolve(
      process.env.MEDIA_PATH
        ? String(process.env.MEDIA_PATH).replace(/\\/g, '/')
        : mediaRoot
    ),


    logos: path.join(root, 'logos'),
    public: path.join(root, 'frontend'),
    uploads: path.join(root, 'uploads'),
    uploadTemp: path.join(root, 'uploads', 'tmp'),
  },
};

module.exports = config;
