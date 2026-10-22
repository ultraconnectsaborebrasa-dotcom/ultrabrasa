// Electron main process — opens Ultraconnect fullscreen as a desktop app.
// Serves the built app from a local-only internal server so it behaves
// exactly like the web version (SPA routing works, no file:// quirks).
const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

const APP_DIR = path.join(__dirname, "..", "dist", "client");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        if (urlPath === "/") urlPath = "/index.html";
        let filePath = path.join(APP_DIR, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));
        // SPA fallback: unknown paths without an extension get index.html
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          if (!path.extname(filePath)) {
            filePath = path.join(APP_DIR, "index.html");
          }
        }
        const ext = path.extname(filePath).toLowerCase();
        const body = fs.readFileSync(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(body);
      } catch (err) {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}/`);
    });
    server.on("error", reject);
  });
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true, // opens in fullscreen (F11 toggles, Alt+F4 exits)
    autoHideMenuBar: true,
    backgroundColor: "#0c0a09",
    title: "Ultraconnect Sabor e Brasa",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.setMenuBarVisibility(false);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
    if (input.type === 'keyDown' && input.key === 'Escape' && win.isFullScreen()) {
      event.preventDefault(); win.setFullScreen(false);
    }
  });

  // Open any external link (e.g. WhatsApp share) in the user's browser.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("http://") || target.startsWith("https://")) {
      shell.openExternal(target);
    }
    return { action: "deny" };
  });

  win.loadURL(url);
}

app.whenReady().then(async () => {
  ipcMain.handle('ultraconnect:toggle-fullscreen', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    win.setFullScreen(!win.isFullScreen()); return win.isFullScreen();
  });
  ipcMain.handle('ultraconnect:is-fullscreen', event => BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false);
  const url = await startServer();
  createWindow(url);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
