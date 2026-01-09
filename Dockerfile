FROM node:20-alpine

# Install Chromium deps for Puppeteer
RUN apk update && apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser


WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build Next.js app
# Note: Requires SUPABASE env vars at build time or runtime. 
# For Railway, these are injected at runtime.
RUN npm run build

# Expose port
EXPOSE 3000

# Start
CMD ["npm", "start"]
