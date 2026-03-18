const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { PLANS, resolvePlan, findRequiredPlan } = require('./plans');

// Ensure quota tables exist
function ensureQuotaTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      characters INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY,
      plan TEXT DEFAULT 'free',
      started_at INTEGER NOT NULL,
      expires_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_log_user_action ON usage_log(user_id, action, created_at);
  `);
}

ensureQuotaTables();

// Use UTC midnight for consistent quota resets across timezones
function getUtcMidnight() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// Check quota — reusable function for middleware use
function checkUserQuota(db, userId, characters = 0) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const subscription = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
  const plan = subscription?.plan || user?.plan || 'free';
  const planDetails = PLANS[plan] || PLANS.free;

  // Check if subscription expired
  if (subscription?.expires_at && subscription.expires_at < Date.now()) {
    db.prepare('UPDATE subscriptions SET plan = ? WHERE user_id = ?').run('free', userId);
    return { allowed: false, reason: 'Subscription expired, downgraded to free plan' };
  }

  const todayStart = getUtcMidnight();

  const todayUsage = db.prepare(`
    SELECT
      COUNT(*) as synthesis_count,
      COALESCE(SUM(characters), 0) as total_characters
    FROM usage_log
    WHERE user_id = ? AND action = 'synthesis' AND created_at >= ?
  `).get(userId, todayStart);

  if (planDetails.dailySynthesisLimit >= 0 && todayUsage.synthesis_count >= planDetails.dailySynthesisLimit) {
    return { allowed: false, reason: `Daily synthesis limit reached (${planDetails.dailySynthesisLimit} per day)` };
  }

  if (planDetails.dailyCharacterLimit >= 0 && (todayUsage.total_characters + characters) > planDetails.dailyCharacterLimit) {
    return { allowed: false, reason: `Daily character limit reached (${planDetails.dailyCharacterLimit} characters per day)` };
  }

  return { allowed: true };
}

// Middleware to enforce quota on synthesis routes
function enforceQuota(req, res, next) {
  try {
    const db = getDb();
    const characters = req.body?.text?.length || 0;
    const result = checkUserQuota(db, req.user.id, characters);
    if (!result.allowed) {
      return res.status(429).json({ error: result.reason });
    }
    next();
  } catch (err) {
    console.error('Quota enforcement error:', err);
    next(); // Don't block on quota check errors
  }
}

// Get current plan and usage
router.get('/subscription', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const subscription = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.id);
    const plan = subscription?.plan || user.plan || 'free';
    const planDetails = PLANS[plan] || PLANS.free;

    const todayStart = getUtcMidnight();

    const todayUsage = db.prepare(`
      SELECT
        COUNT(*) as synthesis_count,
        COALESCE(SUM(characters), 0) as total_characters
      FROM usage_log
      WHERE user_id = ? AND action = 'synthesis' AND created_at >= ?
    `).get(req.user.id, todayStart);

    res.json({
      plan,
      planDetails,
      usage: {
        synthesisCount: todayUsage.synthesis_count,
        characterCount: todayUsage.total_characters,
        synthesisLimit: planDetails.dailySynthesisLimit,
        characterLimit: planDetails.dailyCharacterLimit,
      },
      subscription: subscription ? {
        startedAt: subscription.started_at,
        expiresAt: subscription.expires_at,
      } : null,
    });
  } catch (err) {
    console.error('Get subscription error:', err);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// Check quota before synthesis
router.post('/subscription/check-quota', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { characters = 0 } = req.body;
    const result = checkUserQuota(db, req.user.id, characters);
    res.json(result);
  } catch (err) {
    console.error('Check quota error:', err);
    res.status(500).json({ error: 'Failed to check quota' });
  }
});

// Record usage
router.post('/subscription/record-usage', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { action = 'synthesis', characters = 0 } = req.body;

    db.prepare('INSERT INTO usage_log (user_id, action, characters, created_at) VALUES (?, ?, ?, ?)')
      .run(req.user.id, action, characters, Date.now());

    res.json({ success: true });
  } catch (err) {
    console.error('Record usage error:', err);
    res.status(500).json({ error: 'Failed to record usage' });
  }
});

// Upgrade plan
router.post('/subscription/upgrade', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { plan, receipt } = req.body;

    if (!PLANS[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // In production: verify Apple/Stripe receipt here
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

    const upgradeTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO subscriptions (user_id, plan, started_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, started_at = excluded.started_at, expires_at = excluded.expires_at
      `).run(req.user.id, plan, Date.now(), expiresAt);

      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, req.user.id);
    });

    upgradeTx();

    res.json({ success: true, plan, expiresAt });
  } catch (err) {
    console.error('Upgrade plan error:', err);
    res.status(500).json({ error: 'Failed to upgrade plan' });
  }
});

// Check if user's plan includes a specific feature
router.post('/subscription/check-feature', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { feature } = req.body;

    if (!feature) {
      return res.status(400).json({ error: 'Missing feature parameter' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const subscription = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.id);
    const plan = subscription?.plan || user?.plan || 'free';
    const resolvedPlan = resolvePlan(plan);
    const planDetails = PLANS[resolvedPlan] || PLANS.free;

    const allowed = planDetails.features ? planDetails.features.includes(feature) : false;
    const requiredPlan = findRequiredPlan(feature);

    res.json({
      allowed,
      currentPlan: plan,
      requiredPlan: allowed ? plan : requiredPlan,
    });
  } catch (err) {
    console.error('Check feature error:', err);
    res.status(500).json({ error: 'Failed to check feature' });
  }
});

// Get available plans
router.get('/subscription/plans', (req, res) => {
  res.json({ plans: PLANS });
});

module.exports = router;
module.exports.enforceQuota = enforceQuota;
