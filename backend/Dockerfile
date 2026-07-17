FROM node:22-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Expose port the app runs on
EXPOSE 5000

# Start command
CMD ["npm", "start"]
