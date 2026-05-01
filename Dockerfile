FROM node:24.15.0
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npm rebuild sqlite3 --build-from-source
RUN apt-get update -y -o Acquire::Check-Valid-Until=false && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
