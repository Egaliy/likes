const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'egorspasibo';
const COOKIE_NAME = 'admin_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function getSessionToken() {
  return crypto
    .createHash('sha256')
    .update(`likes-admin:${ADMIN_PASSWORD}`)
    .digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return null;
        return [
          part.slice(0, index).trim(),
          decodeURIComponent(part.slice(index + 1).trim()),
        ];
      })
      .filter(Boolean)
  );
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] === getSessionToken();
}

function requireAdmin(req, res, next) {
  if (isAuthenticated(req)) {
    return next();
  }

  return res.status(401).json({ error: 'unauthorized' });
}

function setAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${getSessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
  );
}

function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

module.exports = {
  ADMIN_PASSWORD,
  isAuthenticated,
  requireAdmin,
  setAuthCookie,
  clearAuthCookie,
};
