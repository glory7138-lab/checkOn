FROM node:20-alpine

# Set Timezone to Asia/Seoul
RUN apk add --no-cache tzdata
ENV TZ=Asia/Seoul

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application files
COPY . .

# Expose server port
EXPOSE 3033

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3033

# Start the application
CMD ["node", "server/server.js"]
