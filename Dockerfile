FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git ca-certificates unzip tar gnupg \
    build-essential python3 python3-pip python3-venv php-cli \
    sudo bubblewrap \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash runner

RUN echo 'runner ALL=(root) NOPASSWD: /usr/bin/apt-get install -y *' > /etc/sudoers.d/nexuss-runner && \
    echo 'runner ALL=(root) NOPASSWD: /usr/bin/apt-get remove -y *' >> /etc/sudoers.d/nexuss-runner && \
    echo 'runner ALL=(root) NOPASSWD: /usr/bin/apt-get update' >> /etc/sudoers.d/nexuss-runner && \
    chmod 0440 /etc/sudoers.d/nexuss-runner

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN cd frontend && npm install --legacy-peer-deps && npm run build && cd ..

RUN mkdir -p /workspace/sessions /workspace/jobs /workspace/logs /workspace/uploads && \
    chown -R runner:runner /workspace

RUN mkdir -p /app/data && touch /app/data/packages.json && \
    chown root:root /app/data/packages.json

EXPOSE 3000

USER root
ENTRYPOINT ["node", "server.js"]
