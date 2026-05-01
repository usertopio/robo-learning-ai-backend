const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
const dotenv = require('dotenv');

dotenv.config();

const DB_PATH = process.env.NODE_ENV === 'test' ? ':memory:' : (process.env.DATABASE_PATH || './database.sqlite');
const db = new sqlite3.Database(DB_PATH);
const dbRun = (query, params = []) => new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
    });
});
const dbGet = (query, params = []) => new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});
const dbAll = (query, params = []) => new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

const logger = require('../utils/logger');

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
        await dbRun("INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'guest', 'no-auth')");
        logger.info('✅ Database initialized');
    } catch (err) {
        logger.error(`❌ DB Init Error: ${err.message}`);
    }
};

module.exports = { db, dbRun, dbGet, dbAll, initDb };
