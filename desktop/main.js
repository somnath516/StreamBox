const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const port = Number(process.env.PORT || 5000);
let backend;

function backendRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend');
}

function startBackend() {
  const root = backendRoot();
  backend = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port) },
    windowsHide: true,
    stdio: 'ignore',
  });

  backend.once('error', (error) => {
    dialog.showErrorBox('Stream Box could not start', error.message);
    app.quit();
  });
}

function waitForBackend(attempt = 0) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/health`, (response) => {
      response.resume();
      if (response.statusCode >= 200 && response.statusCode < 500) {
        resolve();
        return;
      }
      reject(new Error(`Backend returned HTTP ${response.statusCode}`));
    });

    request.on('error', () => {
      if (attempt >= 60) {
        reject(new Error(`The local server did not become ready on port ${port}.`));
        return;
      }
      setTimeout(() => waitForBackend(attempt + 1).then(resolve, reject), 250);
    });
    request.setTimeout(1000, () => request.destroy());
  });
}

async function createWindow() {
  startBackend();
  try {
    await waitForBackend();
  } catch (error) {
    dialog.showErrorBox('Stream Box could not start', error.message);
    app.quit();
    return;
  }

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#141414',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await window.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backend && !backend.killed) backend.kill();
});
