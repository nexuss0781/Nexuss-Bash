# Webhook Service Dockerfile
FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Build shared package first
COPY shared/package*.json ./shared/
WORKDIR /app/shared
RUN npm install && npm run build

# Install webhook dependencies
WORKDIR /app
COPY services/webhook/package*.json ./services/webhook/
WORKDIR /app/services/webhook
RUN npm install

# Copy source code
WORKDIR /app
COPY shared/src ./shared/src
COPY shared/tsconfig.json ./shared/
COPY services/webhook/src ./services/webhook/src

WORKDIR /app/services/webhook

EXPOSE 3001

CMD ["node", "src/index.js"]