const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'ai-teachstack-secret-key';

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

module.exports = { authenticate, SECRET_KEY };
