const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { promisify } = require('util');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');
const yaml = require('js-yaml');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'ai-teachstack-secret-key';

// --- Database Setup (Promisified) ---
const DB_PATH = process.env.NODE_ENV === 'test' ? ':memory:' : './database.sqlite';
const db = new sqlite3.Database(DB_PATH);
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

const initDb = async () => {
    try {
        await dbRun("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)");
        await dbRun("CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, nodes TEXT, edges TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
        await dbRun(`CREATE TABLE IF NOT EXISTS datasets (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            folder     TEXT NOT NULL,
            yaml_path  TEXT NOT NULL,
            classes    TEXT DEFAULT '[]',
            num_train  INTEGER DEFAULT 0,
            num_val    INTEGER DEFAULT 0,
            status     TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        // Ensure guest user exists for no-auth mode
        await dbRun("INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'guest', 'no-auth')");
        console.log('✅ Database initialized');
    } catch (err) {
        console.error('❌ DB Init Error:', err.message);
    }
};
// initDb() called in start script or test setup

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// --- File Upload Setup (multer) ---
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folder = req.query.folder || 'default';
        const dest = path.join(UPLOADS_DIR, folder);
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ 
    storage,
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.bmp', '.webp'];
        cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
    },
    limits: { fileSize: 20 * 1024 * 1024 }
});

// Multer for ZIP uploads (datasets)
const zipStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tmpDir = path.join(UPLOADS_DIR, 'datasets', '_tmp');
        fs.mkdirSync(tmpDir, { recursive: true });
        cb(null, tmpDir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});
const uploadZip = multer({
    storage: zipStorage,
    fileFilter: (req, file, cb) => {
        const ok = file.originalname.toLowerCase().endsWith('.zip');
        cb(null, ok);
    },
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB
});

// Serve uploaded files statically
app.use('/uploads', express.static(UPLOADS_DIR));

// --- Dataset Helpers ---
function countImages(dir) {
    if (!fs.existsSync(dir)) return 0;
    try {
        return fs.readdirSync(dir).filter(f =>
            ['.jpg','.jpeg','.png','.bmp','.webp'].includes(path.extname(f).toLowerCase())
        ).length;
    } catch { return 0; }
}

function findDataYaml(rootDir) {
    // Check root
    if (fs.existsSync(path.join(rootDir, 'data.yaml'))) return path.join(rootDir, 'data.yaml');
    // Check one level deep
    try {
        const dirs = fs.readdirSync(rootDir).filter(f => fs.statSync(path.join(rootDir, f)).isDirectory());
        for (const d of dirs) {
            const p = path.join(rootDir, d, 'data.yaml');
            if (fs.existsSync(p)) return p;
        }
    } catch {}
    return null;
}

async function validateAndSaveDataset(zipPath, originalName) {
    const folderName = `ds_${Date.now()}`;
    const destDir = path.join(UPLOADS_DIR, 'datasets', folderName);
    fs.mkdirSync(destDir, { recursive: true });

    // Extract ZIP
    await fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: destDir }))
        .promise();

    // Cleanup tmp ZIP
    try { fs.unlinkSync(zipPath); } catch {}

    // Find data.yaml (may be nested in a subfolder)
    const yamlPath = findDataYaml(destDir);
    if (!yamlPath) {
        return { ok: false, error: 'data.yaml not found in ZIP' };
    }

    // Parse yaml
    let yamlData;
    try {
        yamlData = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
    } catch (e) {
        return { ok: false, error: `Cannot parse data.yaml: ${e.message}` };
    }

    const classes = yamlData.names || [];
    const datasetRoot = path.dirname(yamlPath);

    // Count images (support both flat and train/valid/test split)
    const trainDir = path.join(datasetRoot, yamlData.train || 'train/images');
    const valDir   = path.join(datasetRoot, yamlData.val   || 'valid/images');
    const numTrain = countImages(trainDir.replace('/images', '').includes('images') ? trainDir : path.join(trainDir, 'images'));
    const numVal   = countImages(valDir.replace('/images', '').includes('images') ? valDir : path.join(valDir, 'images'));

    return {
        ok: true,
        folder: folderName,
        yaml_path: yamlPath,
        classes,
        num_train: numTrain,
        num_val: numVal,
        name: originalName.replace('.zip', '')
    };
}

// --- Global State ---
let globalFlow = { nodes: [], edges: [] };
let globalAiRunning = false;
let globalTargetClasses = '';

// --- Middleware ---
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'] || req.headers['x-access-token'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

    if (!token || token === 'null') return res.status(401).json({ error: 'No token provided' });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Failed to authenticate token' });
        req.userId = decoded.id;
        next();
    });
};

// --- Auth Routes ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = bcrypt.hashSync(password, 8);
        await dbRun("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword]);
        res.status(201).json({ success: true, message: 'Registered successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Username already exists or DB error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await dbGet("SELECT * FROM users WHERE username = ?", [username]);
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ auth: true, token, user: { id: user.id, username: user.username } });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Project Routes (No Auth - Guest Mode) ---
const GUEST_USER_ID = 1; // Fixed guest user, no login needed

// Ensure guest user exists on startup
// Guest user is created in initDb() above

app.get('/api/projects', async (req, res) => {
    try {
        const projects = await dbAll("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC", [GUEST_USER_ID]);
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

app.post('/api/save-flow', async (req, res) => {
    try {
        const { name, flow_data, project_id } = req.body;
        const nodesStr = JSON.stringify(flow_data?.nodes || []);
        const edgesStr = JSON.stringify(flow_data?.edges || []);

        if (project_id) {
            await dbRun("UPDATE projects SET name = ?, nodes = ?, edges = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [name, nodesStr, edgesStr, project_id]);
            res.json({ project_id, updated: true });
        } else {
            // Use callback-style to get lastID reliably
            db.run("INSERT INTO projects (user_id, name, nodes, edges) VALUES (?, ?, ?, ?)",
                [GUEST_USER_ID, name || 'Untitled', nodesStr, edgesStr], function(err) {
                    if (err) return res.status(500).json({ error: 'Failed to create project' });
                    res.json({ project_id: this.lastID, created: true });
                });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to save project' });
    }
});

app.get('/api/projects/:id/flow', async (req, res) => {
    try {
        const row = await dbGet("SELECT * FROM projects WHERE id = ?", [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Project not found' });
        res.json({
            id: row.id,
            name: row.name,
            flow_data: {
                nodes: JSON.parse(row.nodes || '[]'),
                edges: JSON.parse(row.edges || '[]')
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal error' });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        await dbRun("DELETE FROM projects WHERE id = ?", [req.params.id]);
        res.json({ deleted: true });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// --- File Upload API ---
// POST /api/upload/images?folder=test_images  → upload image files
app.post('/api/upload/images', upload.array('images', 100), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No valid image files uploaded' });
    }
    const folder = req.query.folder || 'default';
    const files = req.files.map(f => ({
        name: f.originalname,
        url: `/uploads/${folder}/${f.originalname}`,
        path: f.path
    }));
    console.log(`📁 Uploaded ${files.length} images to folder: ${folder}`);
    
    // Notify AI bridge to process these images
    io.emit('image_folder_uploaded', {
        folder,
        files,
        folderPath: path.join(UPLOADS_DIR, folder)
    });
    
    res.json({ success: true, folder, count: files.length, files });
});

// GET /api/upload/list?folder=test_images  → list uploaded images
app.get('/api/upload/list', (req, res) => {
    const folder = req.query.folder || 'default';
    const folderPath = path.join(UPLOADS_DIR, folder);
    if (!fs.existsSync(folderPath)) return res.json({ files: [] });
    
    const files = fs.readdirSync(folderPath)
        .filter(f => ['.jpg','.jpeg','.png','.bmp','.webp'].includes(path.extname(f).toLowerCase()))
        .map(f => ({ name: f, url: `/uploads/${folder}/${f}` }));
    res.json({ files });
});

// POST /api/upload/run-inference  → ask AI bridge to run on a folder
app.post('/api/upload/run-inference', (req, res) => {
    const { folder } = req.body;
    if (!folder) return res.status(400).json({ error: 'folder required' });
    const folderPath = path.join(UPLOADS_DIR, folder);
    io.emit('run_image_inference', { folder, folderPath });
    res.json({ message: `Inference started on folder: ${folder}` });
});

// --- Training & AI Control ---
app.post('/api/train/start', async (req, res) => {
    const { mode, hyperparams, dataset_id } = req.body;
    if (!mode?.includes('Training')) {
        return res.status(400).json({ error: 'Please select "Training" mode' });
    }

    // Look up dataset yaml_path from DB (fallback to coco8)
    let yaml_path = 'coco8.yaml';
    let dataset_name = 'COCO8 (demo)';
    if (dataset_id) {
        try {
            const ds = await dbGet('SELECT * FROM datasets WHERE id = ? AND status = "valid"', [dataset_id]);
            if (ds) {
                yaml_path = ds.yaml_path;
                dataset_name = ds.name;
            }
        } catch (e) { console.error('Dataset lookup failed:', e.message); }
    }

    console.log(`🎓 Training start | dataset: ${dataset_name} | yaml: ${yaml_path}`);
    io.emit('start_training', { mode, hyperparams: hyperparams || {}, yaml_path, dataset_name });
    globalAiRunning = true;
    io.emit('ai_system_sync', { running: true });
    res.json({ message: `Training started on: ${dataset_name}`, yaml_path });
});

// --- Dataset Management API ---
// POST /api/datasets/upload  → upload & validate Roboflow ZIP
app.post('/api/datasets/upload', uploadZip.single('dataset'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Please upload a .zip file' });
    console.log(`📦 Processing dataset ZIP: ${req.file.originalname}`);

    // Validate & extract async
    res.json({ message: 'Validating dataset, please wait...', status: 'processing' });

    try {
        const result = await validateAndSaveDataset(req.file.path, req.file.originalname);
        if (!result.ok) {
            io.emit('dataset_status', { status: 'error', error: result.error });
            return;
        }
        // Save to DB
        db.run(
            'INSERT INTO datasets (name, folder, yaml_path, classes, num_train, num_val, status) VALUES (?,?,?,?,?,?,"valid")',
            [result.name, result.folder, result.yaml_path, JSON.stringify(result.classes), result.num_train, result.num_val],
            function(err) {
                if (err) {
                    io.emit('dataset_status', { status: 'error', error: 'DB insert failed' });
                    return;
                }
                const payload = { 
                    status: 'valid', id: this.lastID,
                    name: result.name, classes: result.classes,
                    num_train: result.num_train, num_val: result.num_val
                };
                io.emit('dataset_status', payload);
                console.log(`✅ Dataset saved: ${result.name} (${result.classes.length} classes)`);
            }
        );
    } catch (e) {
        console.error('Dataset processing error:', e.message);
        io.emit('dataset_status', { status: 'error', error: e.message });
    }
});

// GET /api/datasets  → list all valid datasets
app.get('/api/datasets', async (req, res) => {
    try {
        const rows = await dbAll('SELECT id, name, classes, num_train, num_val, status, created_at FROM datasets ORDER BY created_at DESC');
        res.json(rows.map(r => ({ ...r, classes: JSON.parse(r.classes || '[]') })));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch datasets' }); }
});

// DELETE /api/datasets/:id  → delete dataset
app.delete('/api/datasets/:id', async (req, res) => {
    try {
        const ds = await dbGet('SELECT folder FROM datasets WHERE id = ?', [req.params.id]);
        if (ds) {
            // Remove files
            const dir = path.join(UPLOADS_DIR, 'datasets', ds.folder);
            if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        }
        await dbRun('DELETE FROM datasets WHERE id = ?', [req.params.id]);
        res.json({ deleted: true });
    } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
});


// --- Socket.IO Handlers ---
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    const syncToClient = () => {
        socket.emit('ai_flow_sync', globalFlow);
        socket.emit('ai_system_sync', { running: globalAiRunning });
        socket.emit('ai_search_sync', globalTargetClasses);
    };

    socket.on('join_robot_room', (robotId) => {
        socket.join(robotId);
        if (robotId === 'WEBCAM_PROCESSED') syncToClient();
    });

    socket.on('flow_topology_update', (data) => {
        globalFlow = data;
        io.emit('ai_flow_sync', data);
    });

    socket.on('ai_system_toggle', (data) => {
        globalAiRunning = data.running;
        io.emit('ai_system_sync', data);
    });

    socket.on('ai_params_sync', (data) => {
        io.emit('ai_params_sync', data);
    });

    // Relay handlers
    socket.on('video_frame_from_robot', (data) => socket.to(data.robotId).emit('stream_to_web', data.image));
    socket.on('video_frame_from_webcam', (data) => io.emit('ai_webcam_frame', data));
    socket.on('training_progress', (data) => io.emit('ai_training_progress', data));
    
    socket.on('send_command_to_robot', (data) => {
        console.log(`🤖 Command to ${data.robotId}: ${data.command}`);
        io.to(data.robotId).emit('robot_execute', data);
    });

    // Relay: AI Bridge → Robot (direct robot_command from ai_bridge.py)
    socket.on('robot_command', (data) => {
        console.log(`🤖 [AI→Robot] ${data.robotId}: ${data.command}`);
        io.to(data.robotId).emit('robot_execute', data);
        io.emit('robot_command_log', data); // also broadcast to dashboard
    });

    // Relay: AI Bridge → All Frontends (detection table data)
    socket.on('det_results', (data) => {
        io.emit('det_results', data);
    });

    socket.on('robot_ping', (data) => {
        io.emit('robot_online', { robotId: data.robotId, ts: Date.now() });
        syncToClient();
    });

    socket.on('disconnect', () => console.log(`❌ Client disconnected: ${socket.id}`));
});

if (require.main === module) {
    initDb().then(() => {
        server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
    });
}

module.exports = { app, server, initDb, db };
