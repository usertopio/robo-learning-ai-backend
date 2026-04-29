const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbRun, dbGet } = require('../config/db');
const { SECRET_KEY } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = bcrypt.hashSync(password, 8);
        await dbRun("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword]);
        res.status(201).json({ success: true, message: 'Registered successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Username already exists or DB error' });
    }
});

router.post('/login', async (req, res) => {
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

module.exports = router;
