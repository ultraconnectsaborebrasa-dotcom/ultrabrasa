// Electron main process — opens Ultraconnect fullscreen as a desktop app.
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function createWindow() {
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
      sandbox: false,
      // The app is loaded via file://, so Chromium's cross-origin check must be
      // off for ES module scripts to load from local files.
      webSecurity: false,
    },
  });

  win.setMenuBarVisibility(false);

  // Open any external link (e.g. WhatsApp share) in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.loadFile(path.join(__dirname, "..", "dist", "client", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
