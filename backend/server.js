require('dotenv').config({ quiet: true });

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./src/config/database');
const { seedDatabase } = require('./src/config/seed');
const { validateAuthConfiguration, authenticateToken } = require('./src/middleware/auth.middleware');
const authRoutes = require('./src/routes/auth');
const apiRoutes = require('./src/routes/api');

validateAuthConfiguration();
initDatabase();
seedDatabase();

const app = express();
const PORT = Number(process.env.PORT || 5001);

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Google Identity Services serves the Sign-in button, popup, and its
      // one-tap prompt from accounts.google.com / apis.google.com.
      scriptSrc: ["'self'", 'https://accounts.google.com', 'https://apis.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com', 'https://apis.google.com'],
      imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'https://lh3.googleusercontent.com'],
      connectSrc: ["'self'", 'ws:', 'wss:', 'https://accounts.google.com', 'https://oauth2.googleapis.com'],
      frameSrc: ["'self'", 'https://accounts.google.com'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'", 'https://arena.ai', 'https://*.arena.ai', 'https://*.e2b.app']
    }
  },
  // Arena previews are intentionally embedded; CSP above remains the source of truth.
  frameguard: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '100kb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// API responses containing operational data must never be cached by shared clients.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Public endpoints: authentication and a metadata-only health probe.
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', app: 'Samrat Fitness King API', time: new Date().toISOString() });
});
app.use('/api/auth', authRoutes);

// Every remaining API route requires a live, non-revoked JWT session.
app.use('/api', authenticateToken, apiRoutes);
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'API route not found.', code: 'NOT_FOUND' });
});

// Serve the production React bundle from the same origin as the protected API.
const frontendDist = path.join(__dirname, '../frontend/web/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { index: false }));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (res.headersSent) return next(err);
  const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : (err.message || 'Internal Server Error');
  return res.status(err.status || 500).json({ success: false, error: message });
});

function startServer(port = PORT) {
  return app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Samrat Fitness King API running on http://0.0.0.0:${port}`);
  });
}

if (require.main === module) startServer();

module.exports = { app, startServer };
