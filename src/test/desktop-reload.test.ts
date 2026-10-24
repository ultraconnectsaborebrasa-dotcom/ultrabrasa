import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const policy = require('../../electron/update-policy.cjs');

function desktop(response: number) {
  const handlers = new Map<string, (...args: any[]) => any>();
  const reload = vi.fn();
  const win = { isDestroyed: () => false, webContents: { getURL: () => policy.APP_URL, reloadIgnoringCache: reload } };
  const showMessageBox = vi.fn(async () => ({ response }));
  const electron = {
    app: { requestSingleInstanceLock: () => true, on: vi.fn(), whenReady: () => ({ then: (fn: () => void) => { fn(); return { catch: vi.fn() }; } }) },
    ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => handlers.set(name, fn) },
    BrowserWindow: { fromWebContents: () => win },
    dialog: { showMessageBox }, Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  };
  // Do not create a real window: start-up is exercised separately by Electron.
  const source = readFileSync(require.resolve('../../electron/main.cjs'), 'utf8').replace('  createWindow(url);', '');
  runInNewContext(source, { __dirname: '/desktop/electron', require: (name: string) => name === 'electron' ? electron : name === './update-policy.cjs' ? policy : require(name) });
  return { update: handlers.get('ultraconnect:update'), reload, showMessageBox };
}

describe('desktop confirmed updates', () => {
  it('does not reload or discard a draft when updating is declined', async () => {
    const app = desktop(0);
    expect(await app.update?.({ senderFrame: { url: policy.APP_URL }, sender: {} })).toBe(false);
    expect(app.reload).not.toHaveBeenCalled();
  });
  it('bypasses stale cache only after explicit confirmation', async () => {
    const app = desktop(1);
    expect(await app.update?.({ senderFrame: { url: policy.APP_URL }, sender: {} })).toBe(true);
    expect(app.reload).toHaveBeenCalledOnce();
  });
  it('rejects reload requests from an external page before showing a dialog', async () => {
    const app = desktop(1);
    expect(await app.update?.({ senderFrame: { url: 'https://evil.example' }, sender: {} })).toBe(false);
    expect(app.showMessageBox).not.toHaveBeenCalled();
    expect(app.reload).not.toHaveBeenCalled();
  });
});