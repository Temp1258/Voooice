// Payment routes for order management and payment processing
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Shared plan config — single source of truth
const { PLANS } = require('./plans');

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

// Verify Stripe webhook signature
function verifyStripeSignature(req) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    throw new Error('Missing stripe-signature header');
  }

  // Parse Stripe signature header: t=timestamp,v1=signature
  const parts = {};
  for (const item of signature.split(',')) {
    const [key, value] = item.split('=');
    parts[key] = value;
  }

  if (!parts.t || !parts.v1) {
    throw new Error('Invalid stripe-signature format');
  }

  const timestamp = parts.t;
  const expectedSig = parts.v1;

  // Verify timestamp is within 5 minutes
  const tolerance = 300; // 5 minutes
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > tolerance) {
    throw new Error('Webhook timestamp too old');
  }

  // Compute expected signature
  const payload = `${timestamp}.${JSON.stringify(req.body)}`;
  const computedSig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(computedSig))) {
    throw new Error('Invalid webhook signature');
  }

  return true;
}

// Transactional payment processing — ensures atomicity
function processPayment(db, orderId, plan) {
  const processPaymentTx = db.transaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'paid') return order; // Idempotent

    const now = Date.now();
    // Use yearly billing for yearly plans
    const planInfo = PLANS[plan];
    const durationMs = (planInfo && planInfo.pricePermanent)
      ? 365 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
    const expiresAt = now + durationMs;

    db.prepare('UPDATE orders SET status = ?, paid_at = ?, expires_at = ?, payment_id = ? WHERE id = ?')
      .run('paid', now, expiresAt, 'stripe_' + orderId, orderId);

    db.prepare(`
      INSERT INTO subscriptions (user_id, plan, started_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, started_at = excluded.started_at, expires_at = excluded.expires_at
    `).run(order.user_id, order.plan, now, expiresAt);

    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(order.plan, order.user_id);

    return order;
  });

  return processPaymentTx();
}

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
// SECURITY: Signature verification required
router.post('/payment/webhook/stripe', (req, res) => {
  try {
    const db = getDb();

    // Verify webhook signature in production
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      try {
        verifyStripeSignature(req);
      } catch (sigErr) {
        console.error('Stripe webhook signature verification failed:', sigErr.message);
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.error('STRIPE_WEBHOOK_SECRET not set in production — rejecting webhook');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

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
      processPayment(db, orderId, order.plan);
    } else {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('failed', orderId);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// POST /api/payment/confirm (auth required)
// SECURITY: Only available in development mode
router.post('/payment/confirm', authMiddleware, (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'This endpoint is disabled in production' });
  }

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

    processPayment(db, orderId, order.plan);

    res.json({
      success: true,
      plan: order.plan,
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
