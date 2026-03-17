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

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', voiceprintRoutes);
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
  console.log(`VocalText server running on http://localhost:${PORT}`);
});

module.exports = app;
