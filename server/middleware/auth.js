const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'voooice-dev-secret-change-in-production';

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
  } catch {}
  next();
}

module.exports = { authenticateToken, authMiddleware: authenticateToken, optionalAuth, JWT_SECRET };
