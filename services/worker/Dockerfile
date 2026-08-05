# Worker Service Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install system dependencies for apt packages
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY shared/package.json ./shared/
COPY services/worker/package.json ./services/worker/

# Install dependencies
RUN npm ci --workspaces --include-workspace-root

# Copy source code
COPY shared/src ./shared/src
COPY shared/tsconfig.json ./shared/
COPY services/worker/src ./services/worker/src

# Build shared package
WORKDIR /app/shared
RUN npm run build

WORKDIR /app/services/worker

CMD ["node", "src/index.js"]