const express = require('express');
const fs = require('fs');
const path = require('path');
const { upload, UPLOADS_DIR } = require('../middleware/upload');

module.exports = (io) => {
    const router = express.Router();

    router.post('/images', upload.array('images', 100), (req, res) => {
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
        
        io.emit('image_folder_uploaded', {
            folder,
            files,
            folderPath: path.join(UPLOADS_DIR, folder)
        });
        
        res.json({ success: true, folder, count: files.length, files });
    });

    router.get('/list', (req, res) => {
        const folder = req.query.folder || 'default';
        const folderPath = path.join(UPLOADS_DIR, folder);
        if (!fs.existsSync(folderPath)) return res.json({ files: [] });
        
        const files = fs.readdirSync(folderPath)
            .filter(f => ['.jpg','.jpeg','.png','.bmp','.webp'].includes(path.extname(f).toLowerCase()))
            .map(f => ({ name: f, url: `/uploads/${folder}/${f}` }));
        res.json({ files });
    });

    router.post('/run-inference', (req, res) => {
        const { folder } = req.body;
        if (!folder) return res.status(400).json({ error: 'folder required' });
        const folderPath = path.join(UPLOADS_DIR, folder);
        io.emit('run_image_inference', { folder, folderPath });
        res.json({ message: `Inference started on folder: ${folder}` });
    });

    return router;
};
