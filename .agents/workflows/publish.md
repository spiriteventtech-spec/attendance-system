---
description: Steps to publish the Attendance System to production
---

# Publishing Workflow

This workflow guides you through the process of publishing the Attendance System.

## Step 1: Prepare Production Environment
Ensure your server has Docker and Docker Compose installed.

## Step 2: Configure Secrets
1. Generate a strong password for PostgreSQL.
2. Generate a 64-character random string for `JWT_SECRET`.
3. Create `backend/.env` on the server with these values.

## Step 3: Deploy Infrastructure
Run the following command on your server:
// turbo
```bash
docker compose up --build -d
```

## Step 4: Verify Deployment
1. Access the Admin Dashboard at `http://<your-server-ip>:3000`.
2. Verify API health at `http://<your-server-ip>:3001/health`.

## Step 5: Mobile App Store Submission
// turbo
```bash
cd mobile
npx eas-cli build --platform all
```
