const express = require('express');
const { dbGet } = require('../config/db');
const socketState = require('../socket/socketState');

module.exports = (io) => {
    const router = express.Router();

    router.post('/start', async (req, res) => {
        const { mode, hyperparams, dataset_id } = req.body;
        if (!mode?.includes('Training')) {
            return res.status(400).json({ error: 'Please select "Training" mode' });
        }

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
        socketState.globalAiRunning = true;
        io.emit('ai_system_sync', { running: true });
        res.json({ message: `Training started on: ${dataset_name}`, yaml_path });
    });

    return router;
};
