const APP_URL = 'https://ultrabrasa.lovable.app/';
const APP_ORIGIN = new URL(APP_URL).origin;

function isAppUrl(url) {
  try { return new URL(url).origin === APP_ORIGIN; } catch { return false; }
}

function isSafeExternalUrl(url) {
  try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; }
}

module.exports = { APP_URL, isAppUrl, isSafeExternalUrl };