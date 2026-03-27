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
const securityRoutes   = require('./routes/security');
const { pruneExpiredNonces } = require('./middleware/replayProtection');
const { query } = require('./config/db');

const app  = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for rate limiting (behind Nginx)
app.set('trust proxy', 1);

// ── Security & Parsing ───────────────────────────────────────
app.use(helmet());
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf('*') !== -1 || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'X-Requested-With',
    'X-Device-ID', 'X-Nonce', 'X-Timestamp',  // Zero-Trust headers
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' })); // 10mb for base64 selfie images
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
app.use('/api/security',    securityRoutes);  // Zero-Trust security layer

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
  console.log(`   CORS: ${allowedOrigins.join(',')}`);
  console.log(`   DB:  ${process.env.DATABASE_URL ? 'USING DATABASE_URL' : 'USING DIRECT ENV'}`);
  console.log(`   SECURITY: Zero-Trust Device Binding ACTIVE\n`);

  // Prune expired nonces every 5 minutes
  setInterval(pruneExpiredNonces, 5 * 60 * 1000);
});
