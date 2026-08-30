FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application files
COPY . .

# Expose server port
EXPOSE 3047

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3047

# Start the application
CMD ["node", "server/server.js"]
