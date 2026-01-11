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
        function get(currentUrl, redirectCount = 0) {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects'));
                return;
            }

            https.get(currentUrl, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    if (!response.headers.location) {
                        reject(new Error('Redirect with no location header'));
                        return;
                    }
                    // Handle relative or absolute redirects
                    const nextUrl = new URL(response.headers.location, currentUrl).toString();
                    get(nextUrl, redirectCount + 1);
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
        }

        get(url);
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
