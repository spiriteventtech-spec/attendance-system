# ── Backend Dockerfile ───────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy source
COPY src/ ./src/
COPY *.sql ./

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodeuser -u 1001

# Create uploads directory and set permissions
RUN mkdir -p /app/uploads/profiles && chown -R nodeuser:nodejs /app/uploads
USER nodeuser

EXPOSE 3001
CMD ["npm", "start"]
