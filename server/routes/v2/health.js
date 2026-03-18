const express = require('express');
const router = express.Router();

const startTime = Date.now();

router.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();

  res.json({
    status: 'ok',
    version: 2,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
      external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100,
      unit: 'MB',
    },
    database: {
      status: 'connected',
    },
    timestamp: Date.now(),
  });
});

module.exports = router;
