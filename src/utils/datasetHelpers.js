const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');
const yaml = require('js-yaml');
const { UPLOADS_DIR } = require('../middleware/upload');

function countImages(dir) {
    if (!fs.existsSync(dir)) return 0;
    try {
        return fs.readdirSync(dir).filter(f =>
            ['.jpg','.jpeg','.png','.bmp','.webp'].includes(path.extname(f).toLowerCase())
        ).length;
    } catch { return 0; }
}

function findDataYaml(rootDir) {
    if (fs.existsSync(path.join(rootDir, 'data.yaml'))) return path.join(rootDir, 'data.yaml');
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

    await fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: destDir }))
        .promise();

    try { fs.unlinkSync(zipPath); } catch {}

    const yamlPath = findDataYaml(destDir);
    if (!yamlPath) {
        return { ok: false, error: 'data.yaml not found in ZIP' };
    }

    let yamlData;
    try {
        yamlData = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
    } catch (e) {
        return { ok: false, error: `Cannot parse data.yaml: ${e.message}` };
    }

    const classes = yamlData.names || [];
    const datasetRoot = path.dirname(yamlPath);

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

module.exports = { countImages, findDataYaml, validateAndSaveDataset };
