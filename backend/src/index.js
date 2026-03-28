// src/index.js
require('dotenv').config();
const fastify = require('fastify')({
  logger: process.env.NODE_ENV === 'development',
  trustProxy: true,
  bodyLimit: 10 * 1024 * 1024 // 10mb for photo base64 fallback
});

const path = require('path');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const redisClient = require('./config/redis');

// ── Plugins ──────────────────────────────────────────────────
fastify.register(require('@fastify/helmet'), { global: true });
fastify.register(require('@fastify/cors'), {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-ID', 'X-Nonce', 'X-Timestamp'],
  credentials: true
});
fastify.register(require('@fastify/rate-limit'), {
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  timeWindow: '15m'
});
fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET || 'super-secret-key-change-it'
});
fastify.register(require('@fastify/multipart'), {
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '../uploads'),
  prefix: '/uploads/',
  maxAge: '1d',
  immutable: true
});

// ── Authentication Helper ────────────────────────────────────
const { authenticate } = require('./middleware/auth');
fastify.decorate('authenticate', authenticate);

// ── Routes Registration ──────────────────────────────────────
fastify.register(require('./routes/auth'),          { prefix: '/api' });
fastify.register(require('./routes/attendance'),    { prefix: '/api/attendance' });
fastify.register(require('./routes/location'),      { prefix: '/api/location' });
fastify.register(require('./routes/users'),         { prefix: '/api/admin/users' });
fastify.register(require('./routes/reports'),       { prefix: '/api/reports' });
fastify.register(require('./routes/announcements'), { prefix: '/api/announcements' });
fastify.register(require('./routes/security'),      { prefix: '/api/security' });
fastify.register(require('./routes/shifts'),        { prefix: '/api/shifts' });

// ── Health Check ─────────────────────────────────────────────
fastify.get('/health', async () => ({
  status: 'ok',
  node: process.version,
  fastify: fastify.version,
  timestamp: new Date().toISOString(),
  env: process.env.NODE_ENV
}));

// ── Socket.IO Implementation ─────────────────────────────────
const io = new Server(fastify.server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

// Redis Adapter for Socket.IO (Horizontal Scaling Support)
const pubClient = redisClient.duplicate();
const subClient = redisClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));

fastify.decorate('io', io);

io.on('connection', (socket) => {
  console.log(`🔌 New WebSocket Connection: ${socket.id}`);
  
  socket.on('join_admin_room', () => {
    socket.join('admins');
    console.log(`👤 Socket ${socket.id} joined 'admins' room`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 WebSocket Disconnected: ${socket.id}`);
  });
});

// ── Cron & Cleanup Tasks ─────────────────────────────────────
const { pruneExpiredNonces } = require('./middleware/replayProtection');
const { checkLateShifts, markAbsences } = require('./cron/shiftWatcher');
const { initWeeklyReportCron } = require('./cron/weeklyReport');

// ── Start Server ──────────────────────────────────────────────
const start = async () => {
  try {
    const PORT = process.env.PORT || 3001;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    
    console.log(`\n🚀 High-Performance Fastify API running on port ${PORT}`);
    console.log(`   REDIS: Connected (Session Cache Active)`);
    console.log(`   INFLUXDB: Ready (GPS Time-Series Sink)`);
    console.log(`   SOCKET.IO: Redis Adapter Ready\n`);

    // Initialization Logic
    setInterval(pruneExpiredNonces, 5 * 60 * 1000);
    setInterval(checkLateShifts, 5 * 60 * 1000);
    setInterval(markAbsences, 60 * 60 * 1000);
    initWeeklyReportCron();

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
