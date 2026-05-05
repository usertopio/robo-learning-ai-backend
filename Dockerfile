FROM node:24.15.0
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
RUN npm rebuild sqlite3 --build-from-source
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
