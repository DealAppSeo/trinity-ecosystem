# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (cached)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build Next.js app
# ENV NEXT_PUBLIC_... must be available here if baked in, 
# but for Railway/Vercel they are often injected at runtime or build time via arguments.
# We trust Railway to inject configured variables during this RUN.
RUN npm run build


# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

# Install Puppetter deps (Alpine) - Only if strictly needed for runtime agents
# Keeping it light for now, but enabling if Agents run in this container
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

# Copy artifact from builder
COPY --from=builder /app/.next /app/.next
COPY --from=builder /app/public /app/public
COPY --from=builder /app/package.json /app/package-lock.json ./

# Install PROD dependencies only
RUN npm ci --production

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
