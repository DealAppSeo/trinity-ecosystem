# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source
COPY . .

# Build Next.js app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run clean && npm run build


# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

# Install runtime dependencies (Puppeteer optional support)
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

# Copy artifacts from builder
COPY --from=builder /app/.next /app/.next
COPY --from=builder /app/public /app/public
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/*.js ./
COPY --from=builder /app/tsconfig*.json ./

# Install PROD dependencies only
RUN npm ci --production --legacy-peer-deps

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
