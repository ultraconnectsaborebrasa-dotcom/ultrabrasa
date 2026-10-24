import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { APP_URL, isAppUrl, isSafeExternalUrl } = require('../../electron/update-policy.cjs');

describe('connected desktop updates', () => {
  it('loads the published Ultrabrasa site, not a bundled snapshot', () => {
    expect(APP_URL).toBe('https://ultrabrasa.lovable.app/');
    expect(isAppUrl('http://127.0.0.1:43187/')).toBe(false);
  });
  it('keeps desktop actions limited to the exact HTTPS application origin', () => {
    expect(isAppUrl('https://ultrabrasa.lovable.app/auth')).toBe(true);
    expect(isAppUrl('https://ultrabrasa.lovable.app.evil.example/')).toBe(false);
    expect(isAppUrl('http://ultrabrasa.lovable.app/')).toBe(false);
    expect(isAppUrl(undefined)).toBe(false);
  });
  it('does not launch executable or javascript links externally', () => {
    expect(isSafeExternalUrl('https://wa.me/5511999999999')).toBe(true);
    expect(isSafeExternalUrl('file:///C:/Windows/system32/cmd.exe')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });
});