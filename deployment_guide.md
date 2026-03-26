# Attendance System - Production Deployment Guide

Follow these steps to "publish" your system to a live production server.

## 1. Prerequisites
- A Linux server (Ubuntu 22.04+ recommended)
- A domain name (e.g., `attendance.yourcompany.com`)
- Docker & Docker Compose installed

## 2. Server Setup
Clone the repository and prepare the folders:
```bash
git clone <your-repo-ur>
cd attendance-system
```

## 3. Secure Configuration
Create production `.env` files. **Never share these.**

### Backend (`backend/.env`)
```bash
NODE_ENV=production
DB_HOST=db
DB_NAME=attendance_db
DB_USER=postgres
DB_PASSWORD=YOUR_STRONG_DATABASE_PASSWORD
JWT_SECRET=YOUR_RANDOM_64_CHARACTER_SECRET
JWT_EXPIRES_IN=12h
```

## 4. Launching with Docker
```bash
# Build and start services in detached mode
docker compose up --build -d
```

## 5. SSL & Domain Configuration (Nginx Reverse Proxy)
We recommend using **Nginx Proxy Manager** or a manual **Certbot** setup to handle SSL.
Your server should route traffic as follows:
- `attendance.yourcompany.com` -> `localhost:3000` (Admin)
- `api.yourcompany.com` -> `localhost:3001` (Backend)

## 6. Mobile App Publishing
1. Update `mobile/.env` with your production API URL: `EXPO_PUBLIC_API_URL=https://api.yourcompany.com`.
2. Install EAS CLI: `npm install -g eas-cli`.
3. Build for production: `eas build --platform all`.
