const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const voiceprintRoutes = require('./routes/voiceprints');
const synthesisRoutes = require('./routes/synthesis');
const marketplaceRoutes = require('./routes/marketplace');
const subscriptionRoutes = require('./routes/subscription');
const paymentRoutes = require('./routes/payment');

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Rate limiter (in-memory, per-IP)
// ---------------------------------------------------------------------------

const rateLimitStore = new Map();

function rateLimit({ windowMs = 60000, max = 60, message = 'Too many requests' } = {}) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    let entry = rateLimitStore.get(key);

    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    if (entry.count > max) {
      res.set('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: message });
    }

    res.set('X-RateLimit-Limit', max);
    res.set('X-RateLimit-Remaining', Math.max(0, max - entry.count));
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
// Middleware
// ---------------------------------------------------------------------------

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map(s => s.trim());

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global rate limit: 60 requests per minute
app.use(rateLimit({ windowMs: 60000, max: 60 }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Routes (with tighter limits on expensive operations)
app.use('/api/auth', authRoutes);
app.use('/api', voiceprintRoutes);
app.use('/api/synthesize', rateLimit({ windowMs: 60000, max: 10, message: 'Synthesis rate limit exceeded' }));
app.use('/api', synthesisRoutes);
app.use('/api', marketplaceRoutes);
app.use('/api', subscriptionRoutes);
app.use('/api', paymentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Voooice server running on http://localhost:${PORT}`);
});

module.exports = app;
