# Multi-stage Dockerfile for Samrat Fitness King Gym Retention App

# 1. Build Stage
FROM node:22-alpine AS builder
WORKDIR /app

# Copy root and subpackage definitions
COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/web/package.json ./frontend/web/

# Install dependencies
RUN npm run install:all

# Copy all source files
COPY . .

# Build frontend production bundle
RUN npm run build:frontend

# 2. Production Runner Stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5001
ENV TIMEZONE=Asia/Kolkata

# Copy backend and built frontend dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/frontend/web/dist ./frontend/web/dist
COPY --from=builder /app/scripts ./scripts

EXPOSE 5001

CMD ["npm", "start"]
