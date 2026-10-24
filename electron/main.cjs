// Connected desktop: published PDV updates arrive on the next opening.
// Never reload a sale automatically while the cashier is working.
const { app, BrowserWindow, shell, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const { APP_URL, isAppUrl, isSafeExternalUrl } = require('./update-policy.cjs');

async function updatePdv(win) {
  if (!win || win.isDestroyed()) return false;
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', title: 'Atualizar Ultrabrasa',
    message: 'Abrir a versão mais recente publicada?',
    detail: 'Finalize ou salve o pedido em edição antes de continuar. A tela será recarregada. Pedidos já enviados permanecem salvos.',
    buttons: ['Agora não', 'Atualizar'], defaultId: 0, cancelId: 0,
  });
  if (response !== 1 || win.isDestroyed()) return false;
  if (!isAppUrl(win.webContents.getURL())) {
    await win.loadURL(APP_URL);
  } else {
    win.webContents.reloadIgnoringCache();
  }
  return true;
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true, // opens in fullscreen (F11 toggles, Alt+F4 exits)
    autoHideMenuBar: true,
    backgroundColor: "#0c0a09",
    title: "Ultraconnect Sabor e Brasa",
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.setMenuBarVisibility(false);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r'))) {
      event.preventDefault(); void updatePdv(win);
    }
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
    if (isSafeExternalUrl(target)) {
      shell.openExternal(target);
    }
    return { action: "deny" };
  });

  win.webContents.on('will-navigate', (event, target) => {
    if (!isAppUrl(target)) {
      event.preventDefault();
      if (isSafeExternalUrl(target)) void shell.openExternal(target);
    }
  });
  win.webContents.on('did-fail-load', async (_event, code, _description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3 || win.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning', title: 'Ultrabrasa', message: 'Não foi possível conectar ao PDV.',
      detail: 'Verifique a internet e tente novamente. Seus pedidos enviados continuam salvos.',
      buttons: ['Fechar', 'Tentar novamente'], defaultId: 1, cancelId: 0,
    });
    if (win.isDestroyed()) return;
    if (response === 1) void win.loadURL(APP_URL).catch(() => {}); else win.close();
  });
  // Avoid a stale HTTP cache; persistent login and local settings are retained.
  void win.webContents.session.clearCache().then(() => {
    if (!win.isDestroyed()) return win.loadURL(url);
  }).catch(() => {});
}

const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
app.on('second-instance', () => { const win = BrowserWindow.getAllWindows()[0]; if(win){if(win.isMinimized())win.restore();win.focus();} });
app.whenReady().then(async () => {
  ipcMain.handle('ultraconnect:toggle-fullscreen', event => {
    if (!isAppUrl(event.senderFrame?.url)) return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    win.setFullScreen(!win.isFullScreen()); return win.isFullScreen();
  });
  ipcMain.handle('ultraconnect:is-fullscreen', event => isAppUrl(event.senderFrame?.url) && (BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false));
  ipcMain.handle('ultraconnect:update', event => {
    if (!isAppUrl(event.senderFrame?.url)) return false;
    return updatePdv(BrowserWindow.fromWebContents(event.sender));
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Ultrabrasa', submenu: [
    { label: 'Atualizar PDV publicado', click: () => void updatePdv(BrowserWindow.getFocusedWindow()) },
    { type: 'separator' }, { role: 'quit', label: 'Sair' },
  ] }]));
  const url = APP_URL;
  createWindow(url);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
  });
}).catch(() => { dialog.showErrorBox('Ultraconnect', 'Não foi possível abrir o PDV. Feche o aplicativo e tente novamente.'); app.quit(); });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
