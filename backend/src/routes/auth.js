const express = require('express');
const { rateLimit } = require('express-rate-limit');
const AuthController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
    code: 'LOGIN_RATE_LIMITED'
  }
});

// Google is the only credential check; the ID token itself is verified upstream.
router.get('/config', AuthController.config);
router.post('/google', signInLimiter, AuthController.googleLogin);
router.get('/me', authenticateToken, AuthController.me);
router.patch('/profile/phone', authenticateToken, AuthController.updateMyPhone);
router.post('/logout', authenticateToken, AuthController.logout);
router.post('/logout-all', authenticateToken, AuthController.logoutAll);

module.exports = router;
