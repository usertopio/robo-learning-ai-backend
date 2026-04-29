const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

dotenv.config();

const { initDb, db } = require('./src/config/db');
const { UPLOADS_DIR } = require('./src/middleware/upload');
const setupSocket = require('./src/socket/index');

const authRoutes = require('./src/routes/authRoutes');
const projectRoutes = require('./src/routes/projectRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');
const datasetRoutes = require('./src/routes/datasetRoutes');
const trainRoutes = require('./src/routes/trainRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Setup Routes
app.use('/api/auth', authRoutes);
app.use('/api', projectRoutes);
app.use('/api/upload', uploadRoutes(io));
app.use('/api/datasets', datasetRoutes(io));
app.use('/api/train', trainRoutes(io));

// Setup WebSockets
setupSocket(io);

if (require.main === module) {
    initDb().then(() => {
        server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
    });
}

module.exports = { app, server, initDb, db };
