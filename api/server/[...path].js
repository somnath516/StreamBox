const http = require('http');

const { getExpressApp } = require('./_boot');

module.exports = async (req, res) => {
  const app = await getExpressApp();

  const { method } = req;
  if (!method) return res.status(400).json({ error: 'Bad Request' });

  await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.on('error', reject);

    // Run Express against Vercel's provided req/res.
    server.emit('request', req, res);

    res.on('finish', () => {
      server.close(() => resolve());
    });
    res.on('close', () => {
      server.close(() => resolve());
    });
  });
};

