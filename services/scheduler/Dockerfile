# Scheduler Service Dockerfile
FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY shared/package.json ./shared/
COPY services/scheduler/package.json ./services/scheduler/

RUN npm ci --workspaces --include-workspace-root

COPY shared/src ./shared/src
COPY shared/tsconfig.json ./shared/
COPY services/scheduler/src ./services/scheduler/src

WORKDIR /app/shared
RUN npm run build

WORKDIR /app/services/scheduler

CMD ["node", "src/index.js"]