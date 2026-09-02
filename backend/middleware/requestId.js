const crypto = require('crypto');

module.exports = function requestId(req, res, next) {
  const inbound = req.headers['x-request-id'];
  const id = typeof inbound === 'string' && /^[a-zA-Z0-9._:-]{8,80}$/.test(inbound)
    ? inbound
    : crypto.randomUUID();

  req.id = id;
  res.setHeader('X-Request-ID', id);
  return next();
};
