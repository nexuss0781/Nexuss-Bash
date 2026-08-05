# Webhook Service Dockerfile
FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY shared/package*.json ./shared/
COPY services/webhook/package*.json ./services/webhook/

RUN npm ci --workspaces --include-workspace-root

COPY shared/src ./shared/src
COPY shared/tsconfig.json ./shared/
COPY services/webhook/src ./services/webhook/src

WORKDIR /app/shared
RUN npm run build

WORKDIR /app/services/webhook

EXPOSE 3001

CMD ["node", "src/index.js"]