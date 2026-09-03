const { createApp } = require('../backend/server');

// If running on Vercel, avoid local .env reads.
// Credentials/env should come from Vercel project settings.
if (process.env.VERCEL) {
  process.env.DISABLE_AUTH = process.env.DISABLE_AUTH || 'false';
}




let appPromise;

function getExpressApp() {
  if (!appPromise) appPromise = Promise.resolve().then(() => createApp());
  return appPromise;
}

module.exports = { getExpressApp };
