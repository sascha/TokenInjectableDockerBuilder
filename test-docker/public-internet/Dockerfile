# Use the official Node.js 18 image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy application files
COPY app/ .

# Install dependencies (if any)
RUN npm install

# Run the app
CMD ["node", "index.js"]
