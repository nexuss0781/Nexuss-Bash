# Scheduler Service Dockerfile
FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Build shared package first
COPY shared/package*.json ./shared/
WORKDIR /app/shared
RUN npm install && npm run build

# Install scheduler dependencies
WORKDIR /app
COPY services/scheduler/package*.json ./services/scheduler/
WORKDIR /app/services/scheduler
RUN npm ci

# Copy source code
WORKDIR /app
COPY shared/src ./shared/src
COPY shared/tsconfig.json ./shared/
COPY services/scheduler/src ./services/scheduler/src

WORKDIR /app/services/scheduler

CMD ["node", "src/index.js"]