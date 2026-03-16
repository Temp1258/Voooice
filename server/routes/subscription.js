const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Plan definitions
const PLANS = {
  free: {
    name: 'Free',
    nameZh: '免费版',
    dailySynthesisLimit: 10,
    dailyCharacterLimit: 1000,
    maxVoiceprints: 3,
    cloudSynthesis: false,
    features: ['basic_recording', 'browser_tts', 'wav_export'],
    price: 0,
    priceYearly: 0,
  },
  creator: {
    name: 'Creator',
    nameZh: '创作者版',
    dailySynthesisLimit: 1000,
    dailyCharacterLimit: 100000,
    maxVoiceprints: -1,
    cloudSynthesis: true,
    features: ['basic_recording', 'cloud_tts', 'wav_export', 'mp3_export', 'audiobook_workbench', 'multi_role', 'voice_training'],
    price: 29.9,
    priceYearly: 299,
  },
  voicebank: {
    name: 'Voice Bank',
    nameZh: '声音银行版',
    dailySynthesisLimit: 100,
    dailyCharacterLimit: 10000,
    maxVoiceprints: 5,
    cloudSynthesis: true,
    features: ['basic_recording', 'cloud_tts', 'wav_export', 'guided_recording', 'voice_vault', 'voice_legacy', 'encrypted_backup'],
    price: 99,
    priceYearly: 99,
    pricePermanent: 199,
  },
  studio: {
    name: 'Studio',
    nameZh: '工作室版',
    dailySynthesisLimit: -1,
    dailyCharacterLimit: -1,
    maxVoiceprints: -1,
    cloudSynthesis: true,
    features: ['basic_recording', 'cloud_tts', 'wav_export', 'mp3_export', 'ogg_export', 'audiobook_workbench', 'multi_role', 'voice_training', 'api_access', 'batch_export', 'priority_queue'],
    price: 299,
    priceYearly: 2999,
  },
};

// Backward compatibility mappings
PLANS.pro = { ...PLANS.creator, name: 'Pro', nameZh: 'Pro' };
PLANS.enterprise = { ...PLANS.studio, name: 'Enterprise', nameZh: 'Enterprise', price: 99.9 };

// Helper to resolve plan key (for backward compat)
function resolvePlan(plan) {
  if (plan === 'pro') return 'creator';
  if (plan === 'enterprise') return 'studio';
  return plan;
}

// Find the lowest-tier plan that includes a given feature
function findRequiredPlan(feature) {
  const planOrder = ['free', 'creator', 'voicebank', 'studio'];
  for (const p of planOrder) {
    if (PLANS[p].features && PLANS[p].features.includes(feature)) {
      return p;
    }
  }
  return 'studio'; // default to highest if not found
}

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
  `);
}

ensureQuotaTables();

// Get current plan and usage
router.get('/subscription', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const subscription = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.id);
    const plan = subscription?.plan || user.plan || 'free';
    const planDetails = PLANS[plan] || PLANS.free;

    // Get today's usage
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayUsage = db.prepare(`
      SELECT
        COUNT(*) as synthesis_count,
        COALESCE(SUM(characters), 0) as total_characters
      FROM usage_log
      WHERE user_id = ? AND action = 'synthesis' AND created_at >= ?
    `).get(req.user.id, todayStart.getTime());

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

// Check quota before synthesis (middleware-style helper)
router.post('/subscription/check-quota', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { characters = 0 } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const subscription = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.id);
    const plan = subscription?.plan || user?.plan || 'free';
    const planDetails = PLANS[plan] || PLANS.free;

    // Check if subscription expired
    if (subscription?.expires_at && subscription.expires_at < Date.now()) {
      // Downgrade to free
      db.prepare('UPDATE subscriptions SET plan = ? WHERE user_id = ?').run('free', req.user.id);
      return res.json({
        allowed: false,
        reason: 'Subscription expired, downgraded to free plan',
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayUsage = db.prepare(`
      SELECT
        COUNT(*) as synthesis_count,
        COALESCE(SUM(characters), 0) as total_characters
      FROM usage_log
      WHERE user_id = ? AND action = 'synthesis' AND created_at >= ?
    `).get(req.user.id, todayStart.getTime());

    // Check synthesis count limit
    if (planDetails.dailySynthesisLimit >= 0 && todayUsage.synthesis_count >= planDetails.dailySynthesisLimit) {
      return res.json({
        allowed: false,
        reason: `Daily synthesis limit reached (${planDetails.dailySynthesisLimit} per day)`,
      });
    }

    // Check character limit
    if (planDetails.dailyCharacterLimit >= 0 && (todayUsage.total_characters + characters) > planDetails.dailyCharacterLimit) {
      return res.json({
        allowed: false,
        reason: `Daily character limit reached (${planDetails.dailyCharacterLimit} characters per day)`,
      });
    }

    res.json({ allowed: true });
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

    // Update user's used_quota
    db.prepare('UPDATE users SET used_quota = used_quota + 1 WHERE id = ?').run(req.user.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Record usage error:', err);
    res.status(500).json({ error: 'Failed to record usage' });
  }
});

// Upgrade plan (simulated — in production this would connect to App Store / Stripe)
router.post('/subscription/upgrade', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { plan, receipt } = req.body;

    if (!PLANS[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // In production: verify Apple/Stripe receipt here
    // For now, just update the plan
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, started_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, started_at = excluded.started_at, expires_at = excluded.expires_at
    `).run(req.user.id, plan, Date.now(), expiresAt);

    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, req.user.id);

    res.json({
      success: true,
      plan,
      expiresAt,
    });
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
