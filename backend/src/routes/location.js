// src/routes/location.js
const { body, validationResult } = require('fastify-plugin'); // Note: Using standard validation logic for now
const { query, withTransaction } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { sendNotification } = require('../utils/notificationService');
const { logSecurityEvent } = require('../utils/securityLogger');
const { writeApi, Point } = require('../config/influx');
const redis = require('../config/redis');

// Threshold (km/h) for spoofing
const MAX_SPEED_KPH = parseFloat(process.env.MAX_SPEED_KPH) || 300;

function calculateSpeedKph(lat1, lon1, lat2, lon2, timeDiffMs) {
  if (!timeDiffMs || timeDiffMs <= 0) return 0;
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return (distKm / (timeDiffMs / 3_600_000));
}

module.exports = async function (fastify, opts) {

  // ── POST /api/location/ping ──────────────────────────────────
  fastify.post('/ping', { preHandler: [authenticate] }, async (request, reply) => {
    const { latitude, longitude, accuracy, isMockLocation } = request.body;
    const userId = request.user.id;

    if (isMockLocation === true) {
      await logSecurityEvent({
        userId,
        eventType: 'mock_location',
        severity: 'critical',
        detail: { latitude, longitude, device: request.headers['x-device-id'] },
        ipAddress: request.ip,
      });
      return reply.status(403).send({ error: 'MOCK_LOCATION_DETECTED', code: 'GPS_SPOOFING' });
    }

    try {
      // 1. Fetch last position from Redis instead of PostgreSQL for speed
      const lastPosKey = `last_pos:${userId}`;
      const lastPosJson = await redis.get(lastPosKey);
      let isInside = false;

      if (lastPosJson) {
        const last = JSON.parse(lastPosJson);
        const timeDiffMs = Date.now() - last.ts;
        const speedKph = calculateSpeedKph(last.lat, last.lng, latitude, longitude, timeDiffMs);
        
        if (speedKph > MAX_SPEED_KPH) {
          // Log violation (Keep log in Postgres for audit, but it's async)
          logSecurityEvent({ userId, eventType: 'velocity_violation', severity: 'critical', detail: { speedKph } });
        }
      }

      // 2. Perform Geofence Check (PostGIS)
      // We still use Postgres for the ST_DWithin check because it's spatial.
      // Optimization: site details are cached in next phase?
      const { rows: sessions } = await query(`
        SELECT al.id as log_id, al.site_id,
               ST_DWithin(ps.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, ps.radius_meters) AS inside
        FROM attendance_logs al
        JOIN projects_sites ps ON ps.id = al.site_id
        WHERE al.user_id = $3 AND al.status = 'active'
      `, [latitude, longitude, userId]);

      if (sessions.length > 0) {
        const session = sessions[0];
        isInside = session.inside;

        // Transaction for Breach Updates in Postgres (Transactional)
        await withTransaction(async (client) => {
          const { rows: openBreaches } = await client.query(
            'SELECT id FROM breach_logs WHERE attendance_log_id = $1 AND return_time IS NULL', 
            [session.log_id]
          );
          const hasOpenBreach = openBreaches.length > 0;

          if (!isInside && !hasOpenBreach) {
             await client.query(
               'INSERT INTO breach_logs (attendance_log_id, user_id, exit_time, exit_lat, exit_lng) VALUES ($1, $2, NOW(), $3, $4)',
               [session.log_id, userId, latitude, longitude]
             );
          } else if (isInside && hasOpenBreach) {
             await client.query(
               'UPDATE breach_logs SET return_time = NOW(), return_lat = $2, return_lng = $3 WHERE attendance_log_id = $1 AND return_time IS NULL',
               [session.log_id, latitude, longitude]
             );
          }
        });
      }

      // ── PERFORMANCE: Redirection to InfluxDB for time-series persistence ──
      const point = new Point('location_pings')
        .tag('user_id', userId)
        .tag('is_inside', isInside ? 'true' : 'false')
        .floatField('latitude', latitude)
        .floatField('longitude', longitude)
        .floatField('accuracy', accuracy || 0);
      
      writeApi.writePoint(point);
      // Data is buffered and sent efficiently by the influx client

      // ── REAL-TIME: Emit to Admin via Socket.IO ──
      if (fastify.io) {
        fastify.io.emit('location_update', {
          userId,
          latitude,
          longitude,
          isInside,
          pingedAt: new Date().toISOString()
        });
      }

      // ── CACHE: Store current position in Redis for next speed check ──
      await redis.set(lastPosKey, JSON.stringify({ lat: latitude, lng: longitude, ts: Date.now() }), 'EX', 120);

      reply.send({ status: 'ok', isInside });

    } catch (err) {
      console.error('Ping Error:', err);
      reply.status(500).send({ error: 'Ping processing failure' });
    }
  });

  // ── GET /api/location/live (Admin) ───────────────────────────
  fastify.get('/live', { preHandler: [authenticate] }, async (request, reply) => {
    // Admins usually get the latest of everyone. 
    // We can still query Postgres for the active session join, but pings come from Influx or a Redis Latest Pos map.
    try {
      const { rows } = await query(`
         SELECT al.user_id, u.first_name, u.last_name, al.site_id, ps.name as site_name
         FROM attendance_logs al
         JOIN users u ON u.id = al.user_id
         JOIN projects_sites ps ON ps.id = al.site_id
         WHERE al.status = 'active'
      `);
      
      // Enrich with Redis latest position for speed
      const results = await Promise.all(rows.map(async (row) => {
        const pos = await redis.get(`last_pos:${row.user_id}`);
        return {
          ...row,
          pos: pos ? JSON.parse(pos) : null
        };
      }));

      reply.send(results);
    } catch (err) {
      reply.status(500).send({ error: 'Failed to fetch live workforce' });
    }
  });
};
