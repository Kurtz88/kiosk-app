/** 업체별 신고 여러 건 INSERT/SELECT 확인 */
const path = require('path');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(os.tmpdir(), 'kiosk-info-reports-test-' + Date.now() + '.sqlite');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

(async () => {
    await run(`CREATE TABLE info_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER,
        restaurant_name TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TEXT NOT NULL
    )`);
    await run(
        'INSERT INTO info_reports (restaurant_id, restaurant_name, message, status, created_at) VALUES (?, ?, ?, ?, ?)',
        [1, '테스트식당', '첫 번째', 'new', '2026-05-19T10:00:00Z']
    );
    await run(
        'INSERT INTO info_reports (restaurant_id, restaurant_name, message, status, created_at) VALUES (?, ?, ?, ?, ?)',
        [1, '테스트식당', '두 번째', 'new', '2026-05-19T11:00:00Z']
    );
    const rows = await all('SELECT id, message FROM info_reports WHERE restaurant_id = 1 ORDER BY id');
    console.log('rows:', rows.length, rows);
    if (rows.length !== 2) {
        console.error('FAIL: expected 2 rows');
        process.exit(1);
    }
    console.log('OK');
    db.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
