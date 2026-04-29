const express = require('express');
const { db, dbRun, dbGet, dbAll } = require('../config/db');

const router = express.Router();
const GUEST_USER_ID = 1;

router.get('/projects', async (req, res) => {
    try {
        const projects = await dbAll("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC", [GUEST_USER_ID]);
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

router.post('/save-flow', async (req, res) => {
    try {
        const { name, flow_data, project_id } = req.body;
        const nodesStr = JSON.stringify(flow_data?.nodes || []);
        const edgesStr = JSON.stringify(flow_data?.edges || []);

        if (project_id) {
            await dbRun("UPDATE projects SET name = ?, nodes = ?, edges = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [name, nodesStr, edgesStr, project_id]);
            res.json({ project_id, updated: true });
        } else {
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

router.get('/projects/:id/flow', async (req, res) => {
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

router.delete('/projects/:id', async (req, res) => {
    try {
        await dbRun("DELETE FROM projects WHERE id = ?", [req.params.id]);
        res.json({ deleted: true });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

module.exports = router;
