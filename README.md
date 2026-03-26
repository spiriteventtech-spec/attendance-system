# EventsTrack — Geofenced Attendance & Tracking System

A full-stack, production-ready attendance tracking platform with GPS geofencing,
real-time breach detection, admin overrides, and export capabilities.

---

## System Architecture

```
attendance-system/
├── backend/         Node.js + Express API
│   ├── schema.sql   PostgreSQL + PostGIS schema
│   └── src/
│       ├── config/  Database pool
│       ├── middleware/ Auth (JWT), validation
│       ├── routes/  auth, attendance, location, users, reports
│       └── utils/   Logger, migration runner
│
├── admin/           React 18 + TypeScript + Tailwind admin dashboard
│   └── src/
│       ├── pages/   Dashboard, LiveMap, Attendance, Staff, Sites, Reports, Settings
│       ├── components/ Sidebar, shared UI (Modal, Badge, StatCard…)
│       ├── services/ Axios API layer
│       └── store/   Zustand auth store
│
├── mobile/          React Native (Expo) staff mobile app
│   └── src/
│       ├── screens/ Login, CheckIn (map + notes), History, Profile
│       ├── services/ API layer with SecureStore token
│       └── context/ AuthContext
│
└── docker-compose.yml  Full-stack orchestration
```

---

## Prerequisites

| Tool          | Min Version | Purpose                     |
|---------------|-------------|------------------------------|
| Docker        | 24+         | Container orchestration      |
| Node.js       | 20+         | Backend & admin local dev    |
| PostgreSQL     | 15+         | Database (with PostGIS)      |
| Expo CLI      | latest      | Mobile development           |
| iOS/Android   | —           | Physical device recommended  |

---

## Quick Start (Docker — recommended)

```bash
# 1. Clone / unzip the project
cd attendance-system

# 2. Start the full stack
docker compose up --build

# Services started:
#   PostgreSQL+PostGIS  →  localhost:5432
#   Backend API         →  localhost:3001
#   Admin Dashboard     →  localhost:3000
```

**Default admin login:** `admin@company.com` / `Admin@1234`
⚠️ Change this password immediately via Settings → Change Password.

---

## Local Development (no Docker)

### 1. Database

Install PostgreSQL 15+ with PostGIS:
```bash
# macOS
brew install postgresql@16 postgis

# Ubuntu
sudo apt install postgresql-16 postgresql-16-postgis-3

# Create DB
createdb attendance_db
psql attendance_db < backend/schema.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env — set DB_PASSWORD and JWT_SECRET

npm install
npm run dev        # http://localhost:3001
```

### 3. Admin Dashboard

```bash
cd admin
npm install
npm run dev        # http://localhost:3000
```

### 4. Mobile App

```bash
cd mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your machine's local IP
# e.g. http://192.168.1.50:3001  (NOT localhost for physical devices)

npm install
npx expo start

# Scan QR with Expo Go app, or press:
# i = iOS simulator
# a = Android emulator
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable              | Required | Description                              |
|-----------------------|----------|------------------------------------------|
| `PORT`                | No       | API port (default: 3001)                 |
| `DB_HOST`             | Yes      | PostgreSQL host                          |
| `DB_PORT`             | No       | PostgreSQL port (default: 5432)          |
| `DB_NAME`             | Yes      | Database name                            |
| `DB_USER`             | Yes      | Database user                            |
| `DB_PASSWORD`         | Yes      | Database password                        |
| `DB_SSL`              | No       | Set `true` in production                 |
| `JWT_SECRET`          | Yes      | Min 32-char random string                |
| `JWT_EXPIRES_IN`      | No       | Token lifetime (default: 8h)             |
| `RATE_LIMIT_MAX`      | No       | Max requests per window (default: 200)   |

---

## API Reference

### Authentication
| Method | Endpoint                         | Auth    | Description                   |
|--------|----------------------------------|---------|-------------------------------|
| POST   | `/api/login`                     | None    | Login → returns JWT           |
| GET    | `/api/me`                        | JWT     | Get current user profile      |
| POST   | `/api/change-password`           | JWT     | Self-service password change  |
| POST   | `/api/admin/users/freeze`        | Admin   | Freeze/unfreeze account       |
| POST   | `/api/admin/users/archive`       | Admin   | Soft-delete user              |
| POST   | `/api/admin/users/reset-password`| Admin   | Force reset staff password    |

### Attendance
| Method | Endpoint                         | Auth    | Description                   |
|--------|----------------------------------|---------|-------------------------------|
| POST   | `/api/attendance/checkin`        | JWT     | Check in (PostGIS validated)  |
| POST   | `/api/attendance/checkout`       | JWT     | Check out                     |
| GET    | `/api/attendance/active`         | JWT     | Get own active session        |
| GET    | `/api/attendance/history`        | JWT     | Paginated own history         |
| GET    | `/api/attendance/logs`           | Admin   | All logs with filters         |
| POST   | `/api/attendance/override`       | Admin   | Override times + comment      |
| GET    | `/api/attendance/breaches/:id`   | JWT     | Breach log for a session      |

### Location
| Method | Endpoint               | Auth  | Description                              |
|--------|------------------------|-------|------------------------------------------|
| POST   | `/api/location/ping`   | JWT   | Poll location — opens/closes breach logs |
| GET    | `/api/location/live`   | JWT   | Live workforce feed (for admin map)      |

### Admin — Users & Sites
| Method | Endpoint                         | Auth  | Description          |
|--------|----------------------------------|-------|----------------------|
| GET    | `/api/admin/users`               | Admin | List / search users  |
| POST   | `/api/admin/users`               | Admin | Create user          |
| PUT    | `/api/admin/users/:id`           | Admin | Update user          |
| GET    | `/api/admin/users/:id/stats`     | Admin | Session statistics   |
| GET    | `/api/admin/users/sites/all`     | Admin | List all sites       |
| POST   | `/api/admin/users/sites`         | Admin | Create site          |

### Reports
| Method | Endpoint                           | Auth  | Description                    |
|--------|------------------------------------|-------|--------------------------------|
| GET    | `/api/reports/export?format=pdf`   | Admin | Download PDF report            |
| GET    | `/api/reports/export?format=xlsx`  | Admin | Download Excel spreadsheet     |
| GET    | `/api/reports/export?format=csv`   | Admin | Download CSV                   |

**Report query params:** `startDate`, `endDate`, `siteId`, `userId`

---

## Check-In / Check-Out Flow

```
Mobile App                     Backend API                    Database
    │                               │                              │
    │  GPS coords + note + siteId   │                              │
    │──────────────────────────────▶│                              │
    │                               │  ST_DWithin(user_loc,        │
    │                               │    site_location,            │
    │                               │    radius_meters)            │
    │                               │─────────────────────────────▶│
    │                               │◀─────────────────────────────│
    │                               │    true / false              │
    │    ✅ Checked in / ❌ Error    │                              │
    │◀──────────────────────────────│                              │
    │                               │                              │
    │  [Every 30s] location ping    │                              │
    │──────────────────────────────▶│  Compare with geofence       │
    │                               │  If outside & no breach:     │
    │                               │    INSERT breach_log         │
    │                               │  If inside & open breach:    │
    │                               │    UPDATE breach_log         │
    │                               │    (calc duration_away_min)  │
```

---

## Database Schema Overview

```sql
users               -- Staff & admin accounts (active/frozen/archived)
projects_sites      -- Geofenced locations (PostGIS GEOGRAPHY column)
attendance_logs     -- Check-in/out records with mandatory notes
breach_logs         -- Per-exit tracking with duration calculation
location_pings      -- Recent GPS pings for live map (last 500 per user)
```

**Key PostGIS query (check-in validation):**
```sql
SELECT ST_DWithin(
  location,
  ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
  radius_meters
) AS inside
FROM projects_sites WHERE id = :siteId
```

---

## Mobile App — Permission Requirements

### iOS (`app.json` → `infoPlist`)
- `NSLocationWhenInUseUsageDescription` — check-in/out
- `NSLocationAlwaysAndWhenInUseUsageDescription` — background polling
- `UIBackgroundModes`: `["location", "fetch"]`

### Android (`app.json` → `permissions`)
- `ACCESS_FINE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE`

---

## Production Deployment Checklist

- [ ] Change default admin password
- [ ] Set strong `JWT_SECRET` (32+ random chars)
- [ ] Enable `DB_SSL=true` and provision SSL cert
- [ ] Set `NODE_ENV=production`
- [ ] Configure `ALLOWED_ORIGINS` to your domain only
- [ ] Set up database backups (daily minimum)
- [ ] Configure reverse proxy (nginx/Caddy) with HTTPS
- [ ] Update `EXPO_PUBLIC_API_URL` to production API URL
- [ ] Build mobile app with `eas build` for app stores
- [ ] Set `app.json` → `extra.eas.projectId` for EAS builds
- [ ] Enable PostgreSQL connection pooling (PgBouncer) for scale
- [ ] Set up log rotation for `logs/` directory
- [ ] Review and tune rate limits for your user volume

---

## Building Mobile for Production

```bash
cd mobile

# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login

# Configure project
eas build:configure

# Build for both platforms
eas build --platform all

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

---

## Common Issues

**"You are outside the geofence" on valid location**
- Check `radius_meters` on the site — try increasing to 150–200m to account for GPS drift
- PostGIS uses meters; confirm lat/lng are correct (not swapped)

**Background location stops on iOS**
- Ensure `UIBackgroundModes` includes `"location"` in `app.json`
- On iOS, background location requires "Always" permission

**JWT expired immediately**
- Check server time — JWT uses server clock; ensure it's synced (NTP)
- Adjust `JWT_EXPIRES_IN` in `.env`

**Map not loading in admin**
- Leaflet requires CSS import — confirm `@import 'leaflet/dist/leaflet.css'` is in `index.css`
- Check browser console for mixed-content warnings in production

---

## License

MIT — use freely for commercial and personal projects.
