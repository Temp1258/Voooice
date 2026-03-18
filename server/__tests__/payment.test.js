const path = require('path');
const fs = require('fs');
const os = require('os');

// Set up test database BEFORE requiring the app
const TEST_DB_PATH = path.join(os.tmpdir(), `vocaltext-payment-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.DB_PATH = TEST_DB_PATH;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-payment-tests';

const request = require('supertest');
const app = require('../index');

const VALID_PASSWORD = 'StrongPass1';

// Helper to register a user and return { token, user }
async function createTestUser(email) {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: VALID_PASSWORD, displayName: 'Payment Tester' });
  return { token: res.body.token, user: res.body.user };
}

// Helper to create an order and return the response body
async function createOrder(token, plan = 'creator', paymentMethod = 'stripe') {
  const res = await request(app)
    .post('/api/payment/create-order')
    .set('Authorization', `Bearer ${token}`)
    .send({ plan, paymentMethod });
  return res;
}

afterAll(() => {
  try {
    const db = require('../db');
    if (db && typeof db.close === 'function') db.close();
  } catch (e) { /* ignore */ }

  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(TEST_DB_PATH + suffix); } catch (e) { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// POST /api/payment/create-order
// ---------------------------------------------------------------------------
describe('POST /api/payment/create-order', () => {
  let token;

  beforeAll(async () => {
    ({ token } = await createTestUser('order-create@example.com'));
  });

  test('valid order with stripe returns orderId and clientSecret', async () => {
    const res = await createOrder(token, 'creator', 'stripe');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('orderId');
    expect(res.body).toHaveProperty('clientSecret');
    expect(res.body).toHaveProperty('amount');
    expect(res.body.amount).toBe(29.9);
    expect(res.body.currency).toBe('CNY');
  });

  test('valid order with wechat returns paymentUrl', async () => {
    const res = await createOrder(token, 'studio', 'wechat');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('orderId');
    expect(res.body).toHaveProperty('paymentUrl');
    expect(res.body.amount).toBe(299);
  });

  test('invalid plan returns 400', async () => {
    const res = await request(app)
      .post('/api/payment/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: 'nonexistent', paymentMethod: 'stripe' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid plan/i);
  });

  test('free plan returns 400', async () => {
    const res = await createOrder(token, 'free', 'stripe');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/free plan/i);
  });

  test('invalid payment method returns 400', async () => {
    const res = await request(app)
      .post('/api/payment/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: 'creator', paymentMethod: 'bitcoin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid payment method/i);
  });

  test('without auth returns 401', async () => {
    const res = await request(app)
      .post('/api/payment/create-order')
      .send({ plan: 'creator', paymentMethod: 'stripe' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/payment/webhook/stripe
// ---------------------------------------------------------------------------
describe('POST /api/payment/webhook/stripe', () => {
  let token;
  let orderId;

  beforeAll(async () => {
    ({ token } = await createTestUser('webhook-user@example.com'));
    // Create an order to use in webhook tests
    const orderRes = await createOrder(token, 'creator', 'stripe');
    orderId = orderRes.body.orderId;
  });

  test('in development mode processes succeeded webhook without signature', async () => {
    // NODE_ENV is 'test' and STRIPE_WEBHOOK_SECRET is not set, so no signature needed
    const res = await request(app)
      .post('/api/payment/webhook/stripe')
      .send({ orderId, status: 'succeeded' });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  test('processes failed status', async () => {
    // Create a fresh order for the failure test
    const orderRes = await createOrder(token, 'voicebank', 'stripe');
    const failOrderId = orderRes.body.orderId;

    const res = await request(app)
      .post('/api/payment/webhook/stripe')
      .send({ orderId: failOrderId, status: 'failed' });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  test('missing orderId returns 400', async () => {
    const res = await request(app)
      .post('/api/payment/webhook/stripe')
      .send({ status: 'succeeded' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing/i);
  });

  test('invalid status returns 400', async () => {
    const res = await request(app)
      .post('/api/payment/webhook/stripe')
      .send({ orderId: 'some-id', status: 'pending' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid status/i);
  });

  test('non-existent order returns 404', async () => {
    const res = await request(app)
      .post('/api/payment/webhook/stripe')
      .send({ orderId: 'non-existent-order', status: 'succeeded' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/payment/confirm (development mode only)
// ---------------------------------------------------------------------------
describe('POST /api/payment/confirm', () => {
  let token;
  let pendingOrderId;

  beforeAll(async () => {
    ({ token } = await createTestUser('confirm-user@example.com'));
    const orderRes = await createOrder(token, 'creator', 'stripe');
    pendingOrderId = orderRes.body.orderId;
  });

  test('confirms a pending order in development mode', async () => {
    const res = await request(app)
      .post('/api/payment/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: pendingOrderId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.plan).toBe('creator');
  });

  test('confirming already-paid order returns 400', async () => {
    // pendingOrderId was already confirmed above
    const res = await request(app)
      .post('/api/payment/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: pendingOrderId });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already/i);
  });

  test('invalid orderId returns 404', async () => {
    const res = await request(app)
      .post('/api/payment/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: 'nonexistent-order-id' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('missing orderId returns 400', async () => {
    const res = await request(app)
      .post('/api/payment/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing/i);
  });

  test('without auth returns 401', async () => {
    const res = await request(app)
      .post('/api/payment/confirm')
      .send({ orderId: pendingOrderId });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/payment/orders
// ---------------------------------------------------------------------------
describe('GET /api/payment/orders', () => {
  let token;

  beforeAll(async () => {
    ({ token } = await createTestUser('list-orders@example.com'));
    // Create a couple of orders
    await createOrder(token, 'creator', 'stripe');
    await createOrder(token, 'studio', 'alipay');
  });

  test('returns list of user orders', async () => {
    const res = await request(app)
      .get('/api/payment/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('orders');
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.orders.length).toBeGreaterThanOrEqual(2);

    const order = res.body.orders[0];
    expect(order).toHaveProperty('id');
    expect(order).toHaveProperty('plan');
    expect(order).toHaveProperty('amount');
    expect(order).toHaveProperty('status');
    expect(order).toHaveProperty('createdAt');
  });

  test('orders are sorted by creation date descending', async () => {
    const res = await request(app)
      .get('/api/payment/orders')
      .set('Authorization', `Bearer ${token}`);

    const orders = res.body.orders;
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i - 1].createdAt).toBeGreaterThanOrEqual(orders[i].createdAt);
    }
  });

  test('does not show orders from other users', async () => {
    const { token: otherToken } = await createTestUser('other-user-orders@example.com');

    const res = await request(app)
      .get('/api/payment/orders')
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders.length).toBe(0);
  });

  test('without auth returns 401', async () => {
    const res = await request(app)
      .get('/api/payment/orders');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/payment/cancel
// ---------------------------------------------------------------------------
describe('POST /api/payment/cancel', () => {
  let token;
  let pendingOrderId;

  beforeAll(async () => {
    ({ token } = await createTestUser('cancel-user@example.com'));
    const orderRes = await createOrder(token, 'creator', 'stripe');
    pendingOrderId = orderRes.body.orderId;
  });

  test('cancels a pending order', async () => {
    const res = await request(app)
      .post('/api/payment/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: pendingOrderId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('cannot cancel an already-cancelled order', async () => {
    // pendingOrderId was cancelled above
    const res = await request(app)
      .post('/api/payment/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: pendingOrderId });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pending/i);
  });

  test('cannot cancel a paid order', async () => {
    // Create and confirm an order first
    const orderRes = await createOrder(token, 'studio', 'stripe');
    const paidOrderId = orderRes.body.orderId;

    await request(app)
      .post('/api/payment/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: paidOrderId });

    const res = await request(app)
      .post('/api/payment/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: paidOrderId });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pending/i);
  });

  test('non-existent order returns 404', async () => {
    const res = await request(app)
      .post('/api/payment/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: 'no-such-order' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('missing orderId returns 400', async () => {
    const res = await request(app)
      .post('/api/payment/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing/i);
  });

  test('without auth returns 401', async () => {
    const res = await request(app)
      .post('/api/payment/cancel')
      .send({ orderId: pendingOrderId });

    expect(res.status).toBe(401);
  });
});
