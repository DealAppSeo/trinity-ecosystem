FROM node:20-alpine

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
