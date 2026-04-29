const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to SQLite database
const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('✅ Connected to SQLite database (Auth Mode).');
        
        db.serialize(() => {
            // 1. Users Table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'student',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // 2. Projects Table (Now linked to user_id)
            db.run(`CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // 3. Canvas Flows Table
            db.run(`CREATE TABLE IF NOT EXISTS canvas_flows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                flow_data TEXT NOT NULL,
                version INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )`);

            // 4. Datasets Table
            db.run(`CREATE TABLE IF NOT EXISTS datasets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                name TEXT NOT NULL,
                source_type TEXT,
                config_path TEXT,
                classes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )`);

            // 5. Training Sessions Table
            db.run(`CREATE TABLE IF NOT EXISTS training_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                status TEXT DEFAULT 'pending',
                hyperparameters TEXT,
                start_time DATETIME,
                end_time DATETIME,
                best_map REAL,
                log_path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )`);

            // 6. Trained Models Table (NEW)
            db.run(`CREATE TABLE IF NOT EXISTS models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                training_session_id INTEGER,
                project_id INTEGER,
                name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                accuracy_map REAL,
                epoch_reached INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (training_session_id) REFERENCES training_sessions(id) ON DELETE SET NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )`);

            // 7. User Settings Table (NEW)
            db.run(`CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                theme TEXT DEFAULT 'light',
                language TEXT DEFAULT 'th',
                auto_save BOOLEAN DEFAULT 1,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // 8. Inference Logs Table (NEW)
            db.run(`CREATE TABLE IF NOT EXISTS inference_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                model_id INTEGER,
                input_source TEXT,
                detections_count INTEGER,
                latency_ms REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL
            )`, () => {
                console.log('🚀 Optimized AI Database schema initialized successfully.');
                db.close();
            });
        });
    }
});
