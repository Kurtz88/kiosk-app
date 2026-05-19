const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'kiosk.sqlite');
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');

const db = new sqlite3.Database(dbPath);
db.all(
    `SELECT id, name, image_url, image_gallery FROM restaurants ORDER BY id LIMIT 15`,
    (err, rows) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        let emptyUrl = 0;
        let missingFile = 0;
        let ok = 0;
        rows.forEach((r) => {
            const url = r.image_url ? String(r.image_url).trim() : '';
            if (!url) emptyUrl++;
            else {
                const fn = url.replace(/^\/uploads\//, '');
                const exists = fs.existsSync(path.join(uploadsDir, fn));
                if (!exists) missingFile++;
                else ok++;
            }
        });
        console.log('--- sample (first 15) ---');
        rows.forEach((r) => {
            console.log(
                r.id,
                r.name,
                '| image_url:',
                r.image_url || '(empty)',
                '| gallery:',
                r.image_gallery ? String(r.image_gallery).slice(0, 60) + '...' : '(none)'
            );
        });
        db.get(
            `SELECT COUNT(*) AS total,
              SUM(CASE WHEN image_url IS NULL OR TRIM(image_url) = '' THEN 1 ELSE 0 END) AS empty_url
             FROM restaurants`,
            (e2, stat) => {
                console.log('\n--- all restaurants ---');
                console.log(stat);
                db.all(
                    `SELECT id, name, image_url FROM restaurants`,
                    (e3, all) => {
                        let missing = 0;
                        all.forEach((r) => {
                            const url = r.image_url ? String(r.image_url).trim() : '';
                            if (!url) return;
                            const fn = url.replace(/^\/uploads\//, '');
                            if (!fs.existsSync(path.join(uploadsDir, fn))) {
                                missing++;
                                if (missing <= 10) console.log('MISSING FILE:', r.name, '->', url);
                            }
                        });
                        console.log('rows with image_url but file missing on disk:', missing);
                        db.close();
                    }
                );
            }
        );
    }
);
