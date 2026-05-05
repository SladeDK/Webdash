# Use a small, modern Node image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first (for better Docker caching)
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy the rest of the application
COPY . .

# Expose the app port
EXPOSE 3000

# Start the server
CMD ["node", "server/server.js"]