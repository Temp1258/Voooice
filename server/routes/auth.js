const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticateToken, JWT_SECRET, checkLoginAttempts, recordLoginAttempt } = require('../middleware/auth');

const router = express.Router();

// Shorter token lifetime for security; use refresh endpoint for renewal
const TOKEN_EXPIRY = '2h';

function generateToken(userId) {
  return jwt.sign({ userId, iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

// Password validation: min 8 chars, at least 1 uppercase, 1 lowercase, 1 number
function validatePassword(password) {
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  return null;
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 12);
    const created_at = Date.now();

    // Use UNIQUE constraint error handling to prevent race conditions
    try {
      db.prepare(
        'INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, email.toLowerCase().trim(), password_hash, displayName || null, created_at);
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      throw err;
    }

    const token = generateToken(id);

    res.status(201).json({
      token,
      user: {
        id,
        email: email.toLowerCase().trim(),
        display_name: displayName || null,
        plan: 'free',
        voice_quota: 5,
        used_quota: 0,
        created_at,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check brute-force lockout
    const lockoutCheck = checkLoginAttempts(normalizedEmail);
    if (!lockoutCheck.allowed) {
      return res.status(429).json({ error: lockoutCheck.message });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!user) {
      recordLoginAttempt(normalizedEmail, false);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      recordLoginAttempt(normalizedEmail, false);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Successful login — clear attempts
    recordLoginAttempt(normalizedEmail, true);

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        plan: user.plan,
        voice_quota: user.voice_quota,
        used_quota: user.used_quota,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', authenticateToken, (req, res) => {
  try {
    const token = generateToken(req.user.id);
    res.json({ token, user: req.user });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
