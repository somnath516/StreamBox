const logger = require('../utils/logger');

const DEFAULT_ADMIN_TOKEN = 'STREAMBOX_ADMIN';

// Check if auth is disabled (development mode only)
const DISABLE_AUTH = process.env.DISABLE_AUTH === 'true' || process.env.DISABLE_AUTH === '1';

function getExpectedAdminToken() {
  // Supports stable runtime config. If env is missing, we fall back to default.
  // UI uses localStorage+prompt; we keep prompt default aligned with this value.
  return process.env.STREAMBOX_ADMIN || DEFAULT_ADMIN_TOKEN;
}

function maskToken(v) {
  if (!v) return v;
  const s = String(v);
  if (s.length <= 6) return '***';
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

function auth(req, res, next) {
  // Development mode: bypass auth with warning
  if (DISABLE_AUTH) {
    logger.warn('auth_bypassed_dev_mode', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      warning: 'DISABLE_AUTH is enabled. This should NEVER be used in production.',
    });
    // Set a dummy user for downstream middleware
    req.user = { role: 'admin', devMode: true };
    return next();
  }

  const header = req.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : (typeof req.headers['x-admin-token'] === 'string' ? req.headers['x-admin-token'].trim() : null);

  const expected = getExpectedAdminToken();

  // Detailed auth failure classification
  if (!token) {
    logger.warn('auth_failed_missing_token', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      reason: 'missing_token',
      hasAuthorizationHeader: !!header,
    });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      code: 'MISSING_TOKEN',
      message: 'No authentication token provided',
      requestId: req.id,
    });
  }

  if (token !== expected) {
    logger.warn('auth_failed_invalid_token', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      reason: 'invalid_token',
      providedToken: maskToken(token),
      expectedToken: maskToken(expected),
      tokenLength: token.length,
      expectedLength: expected.length,
    });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      code: 'INVALID_TOKEN',
      message: 'Invalid authentication token',
      requestId: req.id,
    });
  }

  // Success: set user context
  req.user = { role: 'admin' };
  return next();
}

module.exports = auth;
module.exports.getExpectedAdminToken = getExpectedAdminToken;
module.exports.maskToken = maskToken;

