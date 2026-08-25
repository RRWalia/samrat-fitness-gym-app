const express = require('express');
const { rateLimit } = require('express-rate-limit');
const AuthController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
    code: 'LOGIN_RATE_LIMITED'
  }
});

router.post('/login', loginLimiter, AuthController.login);
router.get('/me', authenticateToken, AuthController.me);
router.post('/logout', authenticateToken, AuthController.logout);
router.post('/logout-all', authenticateToken, AuthController.logoutAll);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/change-password', authenticateToken, AuthController.changePassword);

module.exports = router;
