require('dotenv').config({ quiet: true });
// Tracked, non-secret fallback (client ID + seeded owner Gmail) so preview
// deployments work without a gitignored .env. Real env/.env values win.
require('dotenv').config({ path: require('path').join(__dirname, '.env.arena'), quiet: true });

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

// Public policy pages referenced by the Google OAuth consent screen
// (App domain section). Plain server-rendered HTML so they load without
// authentication or any client-side routing.
function policyPage(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · Samrat Fitness King</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; background: #070b12; color: #e2e8f0; }
  main { max-width: 720px; margin: 0 auto; padding: 48px 20px 80px; line-height: 1.7; }
  h1 { color: #fbbf24; font-size: 1.6rem; } h2 { color: #f8fafc; font-size: 1.05rem; margin-top: 1.8rem; }
  p, li { color: #cbd5e1; font-size: 0.95rem; } a { color: #7dd3fc; }
  .brand { font-weight: 800; letter-spacing: 0.06em; color: #fbbf24; }
</style>
</head>
<body>
<main>
<p class="brand">SAMRAT FITNESS KING</p>
<h1>${title}</h1>
${bodyHtml}
<p><a href="/">&larr; Back to the staff portal</a></p>
</main>
</body>
</html>`;
}

app.get('/privacy-policy', (req, res) => {
  res.type('html').send(policyPage('Privacy Policy', `
<p>Samrat Fitness King Gym App is a private staff workspace for the gym at Main Market Road, Ahmedabad. This page explains the small amount of data the app handles when you sign in.</p>
<h2>What we collect when you sign in</h2>
<p>Sign-in is provided by Google (&ldquo;Sign in with Google&rdquo;). From Google we receive only your name, your Gmail address, and your Google account identifier. We do not receive your Google password, and we never store any password of our own.</p>
<h2>How it is used</h2>
<ul>
  <li>Your Gmail address is matched against the staff accounts registered by the gym owner to decide whether you may enter and with which role (owner, manager, front desk, trainer).</li>
  <li>Your name is displayed inside the staff workspace.</li>
  <li>Sign-in and sign-out events are written to an internal audit log for security.</li>
</ul>
<h2>What we do not do</h2>
<p>We do not sell or share your Google profile data, we do not use it for advertising, and we do not keep it after an account is removed by the gym owner. Member and payment records in the app are gym business data and are visible only to authenticated staff according to their role.</p>
<h2>Contact</h2>
<p>Questions about this policy: ask the gym owner/manager at the front desk, or the staff account administrator.</p>`));
});

app.get('/terms-of-service', (req, res) => {
  res.type('html').send(policyPage('Terms of Service', `
<p>These terms govern use of the Samrat Fitness King staff workspace (this website).</p>
<h2>1. Who may use the app</h2>
<p>The app is for authorized Samrat Fitness King staff only. Access requires a Google account whose Gmail address has been registered by the gym owner or manager. Attempting to access without authorization is prohibited.</p>
<h2>2. Your responsibilities</h2>
<ul>
  <li>Keep your Google account secure; your session in this app is tied to it.</li>
  <li>Use member records (contact details, attendance, payments) only to do your gym job &mdash; never for personal marketing or disclosure outside the gym.</li>
  <li>Do not share devices or sessions with people who are not registered staff.</li>
</ul>
<h2>3. Access control</h2>
<p>The gym may change your role, disable your account, or revoke your sessions at any time. Sessions expire automatically and all sensitive actions are logged.</p>
<h2>4. Availability and liability</h2>
<p>The service is provided &ldquo;as is&rdquo; for gym operations. To the extent permitted by law, the gym is not liable for indirect losses arising from use of the app.</p>
<h2>5. Changes</h2>
<p>These terms may be updated; continued use after a change means acceptance.</p>`));
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
