# Worker Service Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install system dependencies for apt packages
RUN apk add --no-cache python3 make g++

# Build shared package first
COPY shared/package*.json ./shared/
WORKDIR /app/shared
RUN npm install && npm run build

# Install worker dependencies
WORKDIR /app
COPY services/worker/package*.json ./services/worker/
WORKDIR /app/services/worker
RUN npm ci

# Copy source code
WORKDIR /app
COPY shared/src ./shared/src
COPY shared/tsconfig.json ./shared/
COPY services/worker/src ./services/worker/src

WORKDIR /app/services/worker

CMD ["node", "src/index.js"]