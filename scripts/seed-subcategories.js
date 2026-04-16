/**
 * 2차 분류 기본값을 INSERT OR IGNORE 로 넣습니다. (이미 같은 category_value+value 가 있으면 유지)
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const SUBCATEGORY_DEFAULTS = require('../lib/subcategoryDefaults');

const dbFile = path.join(__dirname, '..', 'data', 'kiosk.sqlite');
const db = new sqlite3.Database(dbFile);

const stmt = db.prepare(
    'INSERT OR IGNORE INTO subcategories (category_value, value, label_ko, label_en, sort_order) VALUES (?,?,?,?,?)'
);
SUBCATEGORY_DEFAULTS.forEach((d) => {
    stmt.run(d.category_value, d.value, d.label_ko, d.label_en || null, d.sort_order);
});
stmt.finalize(() => {
    db.close();
    console.log('2차 분류 시드 완료 (중복 value 는 무시).', dbFile);
});
