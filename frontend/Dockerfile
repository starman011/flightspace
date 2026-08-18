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

# Start the server
CMD ["serve", "-s", "dist", "-l", "3000"]

