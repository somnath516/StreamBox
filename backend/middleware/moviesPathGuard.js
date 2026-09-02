const { sendError } = require('./errorContract');

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

module.exports = function moviesPathGuard(req, res, next) {
  const raw = String(req.originalUrl || req.url || '').split('?')[0].replace(/\\/g, '/');
  if (!raw.startsWith('/movies/') && !raw.startsWith('/api/movies/')) return next();

  const prefix = raw.startsWith('/api/movies/') ? '/api/movies/' : '/movies/';
  const afterRaw = raw.slice(prefix.length);
  const decoded = safeDecode(afterRaw);

  if (!decoded) return sendError(res, 400, 'Request failed');
  const normalized = decoded.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  if (segments.length !== 1 || !/^\d+$/.test(segments[0])) {
    return sendError(res, 400, 'Request failed');
  }

  return next();
};
