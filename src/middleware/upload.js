const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
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

module.exports = { upload, uploadZip, UPLOADS_DIR };
