# API Service Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache python3 make g++ sqlite-dev

# Copy package files
COPY package*.json ./
COPY shared/package.json ./shared/
COPY services/api/package.json ./services/api/

# Install dependencies
RUN npm ci --workspaces --include-workspace-root

# Copy source code
COPY shared/src ./shared/src
COPY shared/tsconfig.json ./shared/
COPY services/api/src ./services/api/src
COPY services/api/server.js ./services/api/

# Build shared package
WORKDIR /app/shared
RUN npm run build

WORKDIR /app/services/api

EXPOSE 3000

CMD ["node", "server.js"]