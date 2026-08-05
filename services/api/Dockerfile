# API Service Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache python3 make g++ sqlite-dev

# Build shared package first
COPY shared/package*.json ./shared/
WORKDIR /app/shared
RUN npm ci && npm run build

# Install API dependencies
WORKDIR /app
COPY services/api/package*.json ./services/api/
WORKDIR /app/services/api
RUN npm ci

# Copy source code
WORKDIR /app
COPY shared/src ./shared/src
COPY shared/tsconfig.json ./shared/
COPY services/api/src ./services/api/src
COPY services/api/server.js ./services/api/

EXPOSE 3000

CMD ["node", "server.js"]