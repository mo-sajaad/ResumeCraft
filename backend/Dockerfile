# Node 22 LTS, pinned by digest so builds are repeatable.
# To update: docker buildx imagetools inspect node:22-bookworm-slim
FROM node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb

# Debian Chromium for Puppeteer PDF export, fonts, and tini as the init process
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Force Puppeteer to skip downloading redundant Chrome binaries and point to installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy dependency manifests first for Docker layer caching
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source (owned by root, read-only for the app user)
COPY . .

# Run as the unprivileged user that ships with the Node image
USER node

EXPOSE 8080
ENV PORT=8080

# tini reaps Chromium child processes and forwards signals to Node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
