const express = require('express');
const router = express.Router();

// Import existing v1 route modules
const authRoutes = require('../auth');
const voiceprintRoutes = require('../voiceprints');
const synthesisRoutes = require('../synthesis');
const marketplaceRoutes = require('../marketplace');
const subscriptionRoutes = require('../subscription');
const paymentRoutes = require('../payment');

// Import v2-specific routes
const healthRoutes = require('./health');

// ---------------------------------------------------------------------------
// API version header middleware – applied to all v2 routes
// ---------------------------------------------------------------------------
router.use((req, res, next) => {
  res.set('X-API-Version', '2');
  next();
});

// ---------------------------------------------------------------------------
// Deprecation notice middleware for v1 endpoints
// ---------------------------------------------------------------------------
function v1DeprecationNotice(req, res, next) {
  res.set('X-API-Version', '1');
  res.set('Deprecation', 'true');
  res.set('Sunset', '2027-03-18');
  res.set('Link', '</api/v2' + req.path + '>; rel="successor-version"');
  next();
}

// ---------------------------------------------------------------------------
// v2-specific routes
// ---------------------------------------------------------------------------
router.use(healthRoutes);

// ---------------------------------------------------------------------------
// Re-export existing routes under /api/v2/ namespace
// ---------------------------------------------------------------------------
router.use('/auth', authRoutes);
router.use(voiceprintRoutes);
router.use(synthesisRoutes);
router.use(marketplaceRoutes);
router.use(subscriptionRoutes);
router.use(paymentRoutes);

module.exports = router;
module.exports.v1DeprecationNotice = v1DeprecationNotice;
