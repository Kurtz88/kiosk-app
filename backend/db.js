const path = require('path');
const fs = require('fs');
const os = require('os');
const CATEGORY_DEFAULTS = require('../lib/categoryDefaults');
const SUBCATEGORY_DEFAULTS = require('../lib/subcategoryDefaults');

const rootDir = path.join(__dirname, '..');

/** Vercel 등: 프로젝트 루트는 읽기 전용 — SQLite는 /tmp 만 안정적으로 쓰기 가능 */
function resolveKioskPaths() {
    if (process.env.VERCEL) {
        const dataDir = path.join(os.tmpdir(), 'kiosk-app', 'data');
        return {
            dataDir,
            dbFile: path.join(dataDir, 'kiosk.sqlite'),
            legacyDb: path.join(rootDir, 'data', 'kiosk.sqlite'),
        };
    }
    const dataDir = path.join(rootDir, 'data');
    return {
        dataDir,
        dbFile: path.join(dataDir, 'kiosk.sqlite'),
        legacyDb: path.join(rootDir, 'kiosk.sqlite'),
    };
}

const { dataDir, dbFile, legacyDb } = resolveKioskPaths();

try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
} catch (e) {
    console.error('dataDir 생성 실패:', dataDir, e.message);
    throw e;
}

if (!fs.existsSync(dbFile) && legacyDb && fs.existsSync(legacyDb)) {
    try {
        fs.copyFileSync(legacyDb, dbFile);
    } catch (e) {
        console.error('기존 kiosk.sqlite 복사 실패:', e.message);
    }
}

let resolveReady;
let rejectReady;
const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
});

function markReady() {
    resolveReady();
}

/** sqlite3 / node-sqlite-shim 공통 부트스트랩 */
function bootstrapSchema(db) {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS restaurants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            name_en TEXT,
            category TEXT NOT NULL,
            image_url TEXT,
            map_url TEXT,
            description TEXT,
            description_en TEXT,
            address TEXT,
            phone TEXT,
            homepage TEXT,
            menu_url TEXT,
            open_time TEXT,
            close_time TEXT,
            tags TEXT,
            walk_time INTEGER
        )`);

        db.run('ALTER TABLE restaurants ADD COLUMN tags TEXT;', () => {});
        db.run('ALTER TABLE restaurants ADD COLUMN walk_time INTEGER;', () => {});
        db.run('ALTER TABLE restaurants ADD COLUMN subcategory TEXT;', () => {});

        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            value TEXT NOT NULL UNIQUE,
            label_ko TEXT NOT NULL,
            label_en TEXT,
            icon TEXT,
            sort_order INTEGER DEFAULT 0
        )`);

        db.run(
            `CREATE TABLE IF NOT EXISTS subcategories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_value TEXT NOT NULL,
            value TEXT NOT NULL,
            label_ko TEXT NOT NULL,
            label_en TEXT,
            sort_order INTEGER DEFAULT 0,
            UNIQUE(category_value, value)
        )`,
            (e3) => {
                if (e3) console.error('subcategories 테이블:', e3.message);
            }
        );

        db.run(`CREATE TABLE IF NOT EXISTS kiosk_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`);
        db.run(`INSERT OR IGNORE INTO kiosk_settings (key, value) VALUES ('map_slot_assignments', '{}')`, (e2) => {
            if (e2) {
                console.error('kiosk_settings 기본값:', e2.message);
                rejectReady(e2);
                return;
            }
            markReady();

            db.all('PRAGMA table_info(restaurants)', [], (pragmaRErr, rCols) => {
                if (pragmaRErr) return;
                const rNames = new Set((rCols || []).map((c) => c.name));
                if (!rNames.has('kiosk_hidden')) {
                    db.run('ALTER TABLE restaurants ADD COLUMN kiosk_hidden INTEGER NOT NULL DEFAULT 0;', () => {});
                }
                if (!rNames.has('closed_days')) {
                    db.run('ALTER TABLE restaurants ADD COLUMN closed_days TEXT;', () => {});
                }
                if (!rNames.has('image_gallery')) {
                    db.run('ALTER TABLE restaurants ADD COLUMN image_gallery TEXT;', () => {});
                }
                if (!rNames.has('main_menu')) {
                    db.run('ALTER TABLE restaurants ADD COLUMN main_menu TEXT;', () => {});
                }
                if (!rNames.has('dest_lat')) {
                    db.run('ALTER TABLE restaurants ADD COLUMN dest_lat REAL;', () => {});
                }
                if (!rNames.has('dest_lng')) {
                    db.run('ALTER TABLE restaurants ADD COLUMN dest_lng REAL;', () => {});
                }
                if (!rNames.has('naver_place_id')) {
                    db.run('ALTER TABLE restaurants ADD COLUMN naver_place_id TEXT;', () => {});
                }
                if (!rNames.has('naver_place_url')) {
                    db.run('ALTER TABLE restaurants ADD COLUMN naver_place_url TEXT;', () => {});
                }
            });

            db.all('PRAGMA table_info(categories)', [], (pragmaErr, cols) => {
                if (pragmaErr) return;
                const colNames = new Set((cols || []).map((c) => c.name));
                const alters = [];
                if (!colNames.has('label_sub_ko')) alters.push('ALTER TABLE categories ADD COLUMN label_sub_ko TEXT');
                if (!colNames.has('expected_count')) alters.push('ALTER TABLE categories ADD COLUMN expected_count INTEGER');
                if (!colNames.has('icon_image')) alters.push('ALTER TABLE categories ADD COLUMN icon_image TEXT');
                let ai = 0;
                function runAlterThenSeed() {
                    if (ai < alters.length) {
                        db.run(alters[ai++], runAlterThenSeed);
                        return;
                    }
                    function seedSubcategoriesIfEmpty() {
                        db.get('SELECT COUNT(*) AS c FROM subcategories', [], (e3, row2) => {
                            if (e3 || !row2 || row2.c > 0) return;
                            const st = db.prepare(
                                'INSERT OR IGNORE INTO subcategories (category_value, value, label_ko, label_en, sort_order) VALUES (?, ?, ?, ?, ?)'
                            );
                            SUBCATEGORY_DEFAULTS.forEach((d) => {
                                st.run(d.category_value, d.value, d.label_ko, d.label_en || null, d.sort_order);
                            });
                            st.finalize();
                        });
                    }

                    db.get('SELECT COUNT(*) AS c FROM categories', [], (e, row) => {
                        if (e) {
                            seedSubcategoriesIfEmpty();
                            return;
                        }
                        if (!row || row.c > 0) {
                            seedSubcategoriesIfEmpty();
                            return;
                        }
                        const stmt = db.prepare(
                            'INSERT INTO categories (value, label_ko, label_en, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
                        );
                        CATEGORY_DEFAULTS.forEach((d) => {
                            stmt.run(d.value, d.label_ko, d.label_en, d.icon, d.sort_order);
                        });
                        stmt.finalize(() => seedSubcategoriesIfEmpty());
                    });
                }
                runAlterThenSeed();
            });
        });
    });
}

let db;

if (process.env.VERCEL) {
    let DatabaseSync;
    try {
        ({ DatabaseSync } = require('node:sqlite'));
    } catch (e) {
        console.error('node:sqlite 로드 실패 — Vercel 프로젝트 Node 버전을 22.5 이상으로 설정하세요.', e.message);
        rejectReady(e);
        db = {};
    }
    if (DatabaseSync) {
        const { wrapDb } = require('./node-sqlite-shim');
        try {
            const native = new DatabaseSync(dbFile);
            db = wrapDb(native);
            bootstrapSchema(db);
        } catch (e) {
            console.error('Vercel SQLite 초기화 실패:', e);
            rejectReady(e);
            db = {};
        }
    }
} else {
    const sqlite3 = require('sqlite3').verbose();
    db = new sqlite3.Database(dbFile, (err) => {
        if (err) {
            console.error('Error opening database', err.message);
            rejectReady(err);
            return;
        }
        bootstrapSchema(db);
    });
}

db.ready = readyPromise;
module.exports = db;
