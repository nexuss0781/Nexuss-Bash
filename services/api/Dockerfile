# API Service Dockerfile
FROM ubuntu:24.04

# System dependencies: runtime stack for the sandbox (bash, python3, php) and
# package installs (apt, dpkg, pip, composer).
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git ca-certificates unzip tar gnupg \
    build-essential python3 python3-pip python3-venv php-cli composer \
    sudo bubblewrap sqlite3 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Jobs/processes run as uid 1000 (processLauncher default), matching runner.
RUN useradd -m -s /bin/bash runner && \
    echo 'runner ALL=(root) NOPASSWD: /usr/bin/apt-get install -y *' > /etc/sudoers.d/nexuss-runner && \
    echo 'runner ALL=(root) NOPASSWD: /usr/bin/apt-get remove -y *' >> /etc/sudoers.d/nexuss-runner && \
    echo 'runner ALL=(root) NOPASSWD: /usr/bin/apt-get update' >> /etc/sudoers.d/nexuss-runner && \
    chmod 0440 /etc/sudoers.d/nexuss-runner

WORKDIR /app

# Copy entire workspace structure (needed for npm workspaces)
COPY package*.json ./
COPY turbo.json ./
COPY shared/ ./shared/
COPY services/api/ ./services/api/

# Install dependencies
RUN npm install --workspaces --include-workspace-root

# Build shared package
WORKDIR /app/shared
RUN npm run build

WORKDIR /app/services/api

EXPOSE 3000

CMD ["node", "server.js"]
