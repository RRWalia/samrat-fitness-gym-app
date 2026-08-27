const express = require('express');
const { rateLimit } = require('express-rate-limit');
const PublicController = require('../controllers/public.controller');

const router = express.Router();

// Light throttling so the endpoint cannot be used to brute-force member phone
// numbers or spam attendance. Generous for normal gate traffic.
const checkInLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many check-in attempts. Please wait a moment and try again.',
    code: 'RATE_LIMITED'
  }
});

router.post('/member-checkin', checkInLimiter, PublicController.memberCheckIn);

module.exports = router;
