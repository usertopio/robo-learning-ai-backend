const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

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

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const io = new Server(server, {
    cors: { origin: ALLOWED_ORIGIN, methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts, please try again later' },
});

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(limiter);
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', projectRoutes);
app.use('/api/upload', uploadRoutes(io));
app.use('/api/datasets', datasetRoutes(io));
app.use('/api/train', trainRoutes(io));

setupSocket(io);

const logger = require('./src/utils/logger');

if (require.main === module) {
    initDb().then(() => {
        server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
    });
}

module.exports = { app, server, initDb, db };
