const path = require('path');
const fs = require('fs');
const os = require('os');

// Set up test database BEFORE requiring the app
const TEST_DB_PATH = path.join(os.tmpdir(), `vocaltext-auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.DB_PATH = TEST_DB_PATH;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-auth-tests';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');

const VALID_PASSWORD = 'StrongPass1';
const VALID_EMAIL = 'test@example.com';

// Helper to register a user and return token + user
async function createTestUser(email = VALID_EMAIL, password = VALID_PASSWORD) {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email, password, displayName: 'Test User' });
  return res.body;
}

afterAll(() => {
  // Clean up test database files
  try {
    const db = require('../db');
    if (db && typeof db.close === 'function') db.close();
  } catch (e) { /* ignore */ }

  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(TEST_DB_PATH + suffix); } catch (e) { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// ---------------------------------------------------------------------------
describe('POST /api/auth/signup', () => {
  test('successful registration returns 201 with token and user', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'signup-success@example.com', password: VALID_PASSWORD, displayName: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      email: 'signup-success@example.com',
      display_name: 'New User',
      plan: 'free',
      voice_quota: 5,
      used_quota: 0,
    });
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('created_at');
  });

  test('duplicate email returns 409', async () => {
    const email = 'dup@example.com';
    await request(app)
      .post('/api/auth/signup')
      .send({ email, password: VALID_PASSWORD });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email, password: VALID_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  test('duplicate email is case-insensitive', async () => {
    const email = 'casetest@example.com';
    await request(app)
      .post('/api/auth/signup')
      .send({ email, password: VALID_PASSWORD });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'CASETEST@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(409);
  });

  test('weak password (too short) returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'weak1@example.com', password: 'Ab1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  test('weak password (no uppercase) returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'weak2@example.com', password: 'lowercase1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/uppercase/i);
  });

  test('weak password (no number) returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'weak3@example.com', password: 'NoNumberHere' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/number/i);
  });

  test('missing email returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ password: VALID_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email.*password.*required/i);
  });

  test('missing password returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'nopw@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email.*password.*required/i);
  });

  test('missing both fields returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({});

    expect(res.status).toBe(400);
  });

  test('invalid email format returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', password: VALID_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid email/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
  const loginEmail = 'login-user@example.com';

  beforeAll(async () => {
    await createTestUser(loginEmail);
  });

  test('successful login returns token and user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: loginEmail, password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(loginEmail);
  });

  test('wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: loginEmail, password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  test('non-existent email returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  test('missing fields returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('account lockout after too many failed attempts', async () => {
    const lockoutEmail = 'lockout-user@example.com';
    await createTestUser(lockoutEmail);

    // Exhaust login attempts (MAX_LOGIN_ATTEMPTS = 5)
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: lockoutEmail, password: 'WrongPass1' });
    }

    // Next attempt should be locked out
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: lockoutEmail, password: VALID_PASSWORD });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/locked|try again/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
describe('GET /api/auth/me', () => {
  let validToken;
  let userEmail;

  beforeAll(async () => {
    userEmail = 'me-user@example.com';
    const { token } = await createTestUser(userEmail);
    validToken = token;
  });

  test('with valid token returns user profile', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user.email).toBe(userEmail);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  test('without token returns 401', async () => {
    const res = await request(app)
      .get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication required/i);
  });

  test('with expired token returns 401', async () => {
    const expiredToken = jwt.sign(
      { userId: 'some-user-id', iat: Math.floor(Date.now() / 1000) - 7200 },
      process.env.JWT_SECRET,
      { expiresIn: '1s' }
    );

    // Wait briefly to ensure the token is expired
    await new Promise(resolve => setTimeout(resolve, 1100));

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

  test('with invalid/malformed token returns 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.token');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid token/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
describe('POST /api/auth/refresh', () => {
  let validToken;

  beforeAll(async () => {
    const { token } = await createTestUser('refresh-user@example.com');
    validToken = token;
  });

  test('with valid token returns new token', async () => {
    // Wait 1 second so the new token gets a different iat claim
    await new Promise(resolve => setTimeout(resolve, 1100));

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.token).not.toBe(validToken); // Should be a new token
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe('refresh-user@example.com');
  });

  test('without token returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh');

    expect(res.status).toBe(401);
  });

  test('refreshed token is usable', async () => {
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${validToken}`);

    const newToken = refreshRes.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${newToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('refresh-user@example.com');
  });
});
