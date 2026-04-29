const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, dbGet, dbAll, dbRun } = require('../config/db');
const { uploadZip, UPLOADS_DIR } = require('../middleware/upload');
const { validateAndSaveDataset } = require('../utils/datasetHelpers');

module.exports = (io) => {
    const router = express.Router();

    router.post('/upload', uploadZip.single('dataset'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Please upload a .zip file' });
        console.log(`📦 Processing dataset ZIP: ${req.file.originalname}`);
        res.json({ message: 'Validating dataset, please wait...', status: 'processing' });

        try {
            const result = await validateAndSaveDataset(req.file.path, req.file.originalname);
            if (!result.ok) {
                io.emit('dataset_status', { status: 'error', error: result.error });
                return;
            }
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

    router.get('/', async (req, res) => {
        try {
            const rows = await dbAll('SELECT id, name, classes, num_train, num_val, status, created_at FROM datasets ORDER BY created_at DESC');
            res.json(rows.map(r => ({ ...r, classes: JSON.parse(r.classes || '[]') })));
        } catch (err) { res.status(500).json({ error: 'Failed to fetch datasets' }); }
    });

    router.delete('/:id', async (req, res) => {
        try {
            const ds = await dbGet('SELECT folder FROM datasets WHERE id = ?', [req.params.id]);
            if (ds) {
                const dir = path.join(UPLOADS_DIR, 'datasets', ds.folder);
                if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
            }
            await dbRun('DELETE FROM datasets WHERE id = ?', [req.params.id]);
            res.json({ deleted: true });
        } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
    });

    return router;
};
