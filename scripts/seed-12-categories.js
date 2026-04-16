/**
 * 기존 DB에 12개 1차 카테고리를 INSERT OR IGNORE 로 추가합니다.
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const CATEGORY_DEFAULTS = require('../lib/categoryDefaults');

const dbFile = path.join(__dirname, '..', 'data', 'kiosk.sqlite');
const db = new sqlite3.Database(dbFile);

const stmt = db.prepare(
    'INSERT OR IGNORE INTO categories (value, label_ko, label_en, icon, sort_order) VALUES (?,?,?,?,?)'
);
CATEGORY_DEFAULTS.forEach((d) => {
    stmt.run(d.value, d.label_ko, d.label_en, d.icon, d.sort_order);
});
stmt.finalize(() => {
    db.close();
    console.log('12개 1차 카테고리 시드 완료 (이미 있던 value 는 유지).', dbFile);
});
