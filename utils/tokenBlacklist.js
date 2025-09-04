// Simple in-memory token blacklist with expiry cleanup
const blacklisted = new Map(); // token -> expiryMs

function add(token, expiryMs) {
  if (!token) return;
  blacklisted.set(token, expiryMs || Date.now());
}

function isBlacklisted(token) {
  if (!token) return false;
  const exp = blacklisted.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    blacklisted.delete(token);
    return false;
  }
  return true;
}

// optional: periodic cleanup to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [t, e] of blacklisted.entries()) {
    if (now > e) blacklisted.delete(t);
  }
}, 1000 * 60 * 5); // every 5 minutes

module.exports = { add, isBlacklisted };
