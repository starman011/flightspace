# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (npm install allows version resolution)
RUN npm install

# Copy source
COPY . .

# Build the frontend
RUN npm run build

# Production stage - serve with a simple HTTP server
FROM node:20-alpine

WORKDIR /app

# Install a lightweight HTTP server
RUN npm install -g serve

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Expose port 3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the server
CMD ["serve", "-s", "dist", "-l", "3000"]

