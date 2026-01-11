const fs = require('fs');
const path = require('path');
const https = require('https');

const FILES = [
    'mmcif_pdbx_v50.dic.json',
    'mmcif_ma.dic.json'
];

const BASE_URL = 'https://github.com/N283T/mmcif-json-dictionary/releases/latest/download/';
const ASSETS_DIR = path.join(__dirname, '../assets');

if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

async function downloadFile(filename) {
    const url = BASE_URL + filename;
    const destPath = path.join(ASSETS_DIR, filename);
    const file = fs.createWriteStream(destPath);

    console.log(`Downloading ${filename} from ${url}...`);

    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow redirect
                https.get(response.headers.location, (res) => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`Failed to download ${filename}: Status ${res.statusCode}`));
                        return;
                    }
                    res.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        console.log(`Saved to ${destPath}`);
                        resolve();
                    });
                }).on('error', (err) => {
                    fs.unlink(destPath, () => { });
                    reject(err);
                });
            } else if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${filename}: Status ${response.statusCode}`));
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log(`Saved to ${destPath}`);
                    resolve();
                });
            }
        }).on('error', (err) => {
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
}

async function main() {
    let success = true;
    for (const file of FILES) {
        try {
            await downloadFile(file);
        } catch (error) {
            console.error(`Error downloading ${file}:`, error.message);
            success = false;
        }
    }

    if (!success) {
        process.exit(1);
    }
}

main();
