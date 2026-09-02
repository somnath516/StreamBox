const logger = require('../utils/logger');

const API_PREFIXES = [
  '/admin',
  '/api',
  '/control',
  '/health',
  '/movies',
  '/remote-commands',
  '/subtitle',
  '/thumbnail',
  '/thumbnail-card',
  '/upload',
  '/video',
];

function isApiRequest(pathname) {
  return API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
}

module.exports = function requestTiming(req, res, next) {
  if (!isApiRequest(req.path || '')) return next();

  const started = process.hrtime.bigint();
  const loggedPath = String(req.originalUrl || req.url || '').split('?')[0];
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    logger.debug('api_request', {
      requestId: req.id,
      method: req.method,
      path: loggedPath,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });

  return next();
};
