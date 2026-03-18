const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');

// SECURITY: Require JWT_SECRET in production, generate random one for dev
const NODE_ENV = process.env.NODE_ENV || 'development';
let JWT_SECRET;
if (process.env.JWT_SECRET) {
  JWT_SECRET = process.env.JWT_SECRET;
} else if (NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable must be set in production');
} else {
  JWT_SECRET = crypto.randomBytes(64).toString('hex');
  console.warn('[AUTH] No JWT_SECRET set — generated ephemeral key (tokens will not persist across restarts)');
}

// Login attempt tracking for brute-force protection
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Clean up stale lockout entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - LOCKOUT_WINDOW_MS;
  for (const [key, entry] of loginAttempts) {
    if (entry.firstAttempt < cutoff) loginAttempts.delete(key);
  }
}, 600000);

function checkLoginAttempts(email) {
  const entry = loginAttempts.get(email);
  if (!entry) return { allowed: true };

  const elapsed = Date.now() - entry.firstAttempt;
  if (elapsed > LOCKOUT_WINDOW_MS) {
    loginAttempts.delete(email);
    return { allowed: true };
  }

  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    const remainingMs = LOCKOUT_WINDOW_MS - elapsed;
    return {
      allowed: false,
      remainingMs,
      message: `Account temporarily locked. Try again in ${Math.ceil(remainingMs / 60000)} minutes.`,
    };
  }

  return { allowed: true };
}

function recordLoginAttempt(email, success) {
  if (success) {
    loginAttempts.delete(email);
    return;
  }
  const entry = loginAttempts.get(email) || { count: 0, firstAttempt: Date.now() };
  entry.count++;
  loginAttempts.set(email, entry);
}

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = db.prepare('SELECT id, email, display_name, plan, voice_quota, used_quota, created_at FROM users WHERE id = ?').get(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
}

// Optional auth — doesn't require token but populates req.user if available
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = db.prepare('SELECT id, email, display_name, plan, voice_quota, used_quota, created_at FROM users WHERE id = ?').get(decoded.userId);
      if (user) req.user = user;
    }
  } catch (err) {
    // Log failed token verifications for security auditing
    if (err.name !== 'TokenExpiredError') {
      console.warn('[AUTH] Optional auth token verification failed:', err.name);
    }
  }
  next();
}

module.exports = {
  authenticateToken,
  authMiddleware: authenticateToken,
  optionalAuth,
  JWT_SECRET,
  checkLoginAttempts,
  recordLoginAttempt,
};
