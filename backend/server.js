const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./src/config/database');
const { seedDatabase } = require('./src/config/seed');
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(morgan('dev'));

// Initialize DB and Seed data
initDatabase();
seedDatabase();

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    app: 'Samrat Fitness King API',
    time: new Date().toISOString()
  });
});

// API Routes
app.use('/api', apiRoutes);

// Static frontend serving if built
const frontendDist = path.join(__dirname, '../frontend/web/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    next();
  });
}

// Error Handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Samrat Fitness King Backend running on http://0.0.0.0:${PORT}`);
});
