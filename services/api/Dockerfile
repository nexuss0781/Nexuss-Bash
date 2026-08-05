# API Service Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache python3 make g++ sqlite-dev

# Copy entire workspace structure (needed for npm workspaces)
COPY package*.json ./
COPY turbo.json ./
COPY shared/ ./shared/
COPY services/api/ ./services/api/

# Install dependencies (copy package-lock.json first for caching)
RUN npm install --workspaces --include-workspace-root

# Build shared package
WORKDIR /app/shared
RUN npm run build

WORKDIR /app/services/api

EXPOSE 3000

CMD ["node", "server.js"]