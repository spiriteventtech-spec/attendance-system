// src/index.js
require('dotenv').config();
const express      = require('express');
const path         = require('path');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');

const authRoutes       = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const locationRoutes   = require('./routes/location');
const userRoutes       = require('./routes/users');
const reportRoutes     = require('./routes/reports');
const announcementRoutes = require('./routes/announcements');
const { query } = require('./config/db');

const app  = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for rate limiting (behind Nginx)
app.set('trust proxy', 1);

// ── Security & Parsing ───────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Rate Limiting ────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});
app.use(limiter);

// Stricter limit on login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  validate: { xForwardedForHeader: false },
});
app.use('/api/login', loginLimiter);

// ── Health Check ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok',
  env: process.env.NODE_ENV,
  timestamp: new Date().toISOString(),
}));

app.get('/api/db-health', async (req, res) => {
  try {
    const { rows } = await query('SELECT NOW()');
    res.json({ status: 'ok', now: rows[0].now });
  } catch (err) {
    console.error('DB Health Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api',             authRoutes);
app.use('/api/attendance',  attendanceRoutes);
app.use('/api/location',    locationRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/reports',     reportRoutes);
app.use('/api/announcements', announcementRoutes);

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));

// ── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Attendance API running on http://localhost:${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV}`);
  console.log(`   DB:  ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}\n`);
});
