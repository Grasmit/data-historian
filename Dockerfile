FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY src ./src
RUN mkdir -p /app/data /app/reports
VOLUME ["/app/data", "/app/reports"]
CMD ["node", "src/historian.js"]
