const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const authRoutes = require('./routes/auth');
const voiceprintRoutes = require('./routes/voiceprints');
const synthesisRoutes = require('./routes/synthesis');
const marketplaceRoutes = require('./routes/marketplace');
const subscriptionRoutes = require('./routes/subscription');
const paymentRoutes = require('./routes/payment');
const v2Routes = require('./routes/v2');
const { v1DeprecationNotice } = require('./routes/v2');

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Rate limiter (in-memory, per-IP) with bounded store
// ---------------------------------------------------------------------------

const rateLimitStore = new Map();
const MAX_STORE_SIZE = 10000; // Prevent unbounded memory growth

function rateLimit({ windowMs = 60000, max = 60, message = 'Too many requests' } = {}) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    let entry = rateLimitStore.get(key);

    if (!entry || now - entry.start > windowMs) {
      // Prevent unbounded growth
      if (rateLimitStore.size >= MAX_STORE_SIZE && !entry) {
        // Evict oldest entries
        const sortedEntries = [...rateLimitStore.entries()]
          .sort((a, b) => a[1].start - b[1].start);
        for (let i = 0; i < Math.min(1000, sortedEntries.length); i++) {
          rateLimitStore.delete(sortedEntries[i][0]);
        }
      }
      entry = { start: now, count: 0 };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    if (entry.count > max) {
      res.set('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: message });
    }

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    next();
  };
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 300000;
  for (const [key, entry] of rateLimitStore) {
    if (entry.start < cutoff) rateLimitStore.delete(key);
  }
}, 300000);

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------

function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('X-XSS-Protection', '1; mode=block');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'microphone=(self), camera=()');
  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // Add request ID for tracing
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.set('X-Request-ID', requestId);
  next();
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(securityHeaders);
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
// Differentiated body size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Global rate limit: 60 requests per minute
app.use(rateLimit({ windowMs: 60000, max: 60 }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000 || res.statusCode >= 400) {
      console.log(`[${req.requestId}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// ---------------------------------------------------------------------------
// v1 routes (backward compatible at /api/)
// ---------------------------------------------------------------------------
app.use('/api', v1DeprecationNotice);

// Health check (v1)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Routes (with tighter limits on expensive operations)
// Auth: 10 requests per minute per IP to prevent brute-force
app.use('/api/auth', rateLimit({ windowMs: 60000, max: 10, message: 'Too many authentication attempts. Please try again later.' }));
app.use('/api/auth', authRoutes);
app.use('/api', voiceprintRoutes);
app.use('/api/synthesize', rateLimit({ windowMs: 60000, max: 10, message: 'Synthesis rate limit exceeded' }));
app.use('/api', synthesisRoutes);
app.use('/api', marketplaceRoutes);
app.use('/api', subscriptionRoutes);
app.use('/api', paymentRoutes);

// ---------------------------------------------------------------------------
// v2 routes at /api/v2/
// ---------------------------------------------------------------------------
app.use('/api/v2', v2Routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error(`[${req.requestId || 'unknown'}] Unhandled error:`, err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Only start listening when run directly (not when required by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Voooice server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
