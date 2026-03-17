// Payment routes for order management and payment processing
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Import PLANS from subscription routes to stay in sync
const PLANS = {
  free: { price: 0, priceYearly: 0 },
  creator: { price: 29.9, priceYearly: 299 },
  voicebank: { price: 99, priceYearly: 99, pricePermanent: 199 },
  studio: { price: 299, priceYearly: 2999 },
  // Backward compatibility
  pro: { price: 29.9, priceYearly: 299 },
  enterprise: { price: 99.9, priceYearly: 999 },
};

// Ensure orders table exists
function ensureOrdersTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'CNY',
      payment_method TEXT,
      payment_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      paid_at INTEGER,
      expires_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

ensureOrdersTable();

// POST /api/payment/create-order
router.post('/payment/create-order', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { plan, paymentMethod } = req.body;

    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    if (!paymentMethod || !['stripe', 'wechat', 'alipay'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method. Must be stripe, wechat, or alipay' });
    }

    const planInfo = PLANS[plan];
    if (planInfo.price === 0) {
      return res.status(400).json({ error: 'Cannot create order for free plan' });
    }

    const orderId = crypto.randomUUID();
    const amount = planInfo.price;
    const currency = 'CNY';

    db.prepare(`
      INSERT INTO orders (id, user_id, plan, amount, currency, payment_method, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(orderId, req.user.id, plan, amount, currency, paymentMethod, Date.now());

    if (paymentMethod === 'stripe') {
      return res.json({
        orderId,
        clientSecret: 'mock_secret_' + orderId,
        amount,
        currency,
      });
    } else {
      // WeChat or Alipay
      return res.json({
        orderId,
        paymentUrl: 'https://pay.example.com/mock/' + orderId,
        amount,
        currency,
      });
    }
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// POST /api/payment/webhook/stripe (no auth - webhook from Stripe)
router.post('/payment/webhook/stripe', (req, res) => {
  try {
    const db = getDb();
    const { orderId, status } = req.body;

    if (!orderId || !status) {
      return res.status(400).json({ error: 'Missing orderId or status' });
    }

    if (!['succeeded', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be succeeded or failed' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (status === 'succeeded') {
      const now = Date.now();
      const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

      db.prepare('UPDATE orders SET status = ?, paid_at = ?, expires_at = ?, payment_id = ? WHERE id = ?')
        .run('paid', now, expiresAt, 'stripe_' + orderId, orderId);

      db.prepare(`
        INSERT INTO subscriptions (user_id, plan, started_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, started_at = excluded.started_at, expires_at = excluded.expires_at
      `).run(order.user_id, order.plan, now, expiresAt);

      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(order.plan, order.user_id);
    } else {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('failed', orderId);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// POST /api/payment/confirm (auth required - for dev/testing)
router.post('/payment/confirm', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, req.user.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: `Order is already ${order.status}` });
    }

    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

    db.prepare('UPDATE orders SET status = ?, paid_at = ?, expires_at = ? WHERE id = ?')
      .run('paid', now, expiresAt, orderId);

    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, started_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, started_at = excluded.started_at, expires_at = excluded.expires_at
    `).run(req.user.id, order.plan, now, expiresAt);

    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(order.plan, req.user.id);

    res.json({
      success: true,
      plan: order.plan,
      expiresAt,
    });
  } catch (err) {
    console.error('Confirm order error:', err);
    res.status(500).json({ error: 'Failed to confirm order' });
  }
});

// GET /api/payment/orders (auth required)
router.get('/payment/orders', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);

    const ordersWithPlanDetails = orders.map(order => ({
      id: order.id,
      plan: order.plan,
      planDetails: PLANS[order.plan] || null,
      amount: order.amount,
      currency: order.currency,
      paymentMethod: order.payment_method,
      paymentId: order.payment_id,
      status: order.status,
      createdAt: order.created_at,
      paidAt: order.paid_at,
      expiresAt: order.expires_at,
    }));

    res.json({ orders: ordersWithPlanDetails });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// GET /api/payment/orders/:id (auth required)
router.get('/payment/orders/:id', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      id: order.id,
      plan: order.plan,
      planDetails: PLANS[order.plan] || null,
      amount: order.amount,
      currency: order.currency,
      paymentMethod: order.payment_method,
      paymentId: order.payment_id,
      status: order.status,
      createdAt: order.created_at,
      paidAt: order.paid_at,
      expiresAt: order.expires_at,
    });
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

// POST /api/payment/cancel (auth required)
router.post('/payment/cancel', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, req.user.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending orders can be cancelled' });
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('cancelled', orderId);

    res.json({ success: true });
  } catch (err) {
    console.error('Cancel order error:', err);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

module.exports = router;
