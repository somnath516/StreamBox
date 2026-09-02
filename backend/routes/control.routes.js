const express = require('express');

function createControlRouter() {
  const router = express.Router();
  let remoteCommands = [];

  router.get('/control/:action', (req, res) => {
    remoteCommands.push({
      id: Date.now(),
      action: req.params.action,
      timestamp: new Date().toISOString(),
    });
    if (remoteCommands.length > 10) remoteCommands.shift();
    return res.json({ success: true });
  });

  router.get('/remote-commands', (req, res) => {
    const commands = remoteCommands;
    remoteCommands = [];
    return res.json(commands);
  });

  return router;
}

module.exports = createControlRouter;
