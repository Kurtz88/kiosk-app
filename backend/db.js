const path = require('path');
const fs = require('fs');
const os = require('os');
const CATEGORY_DEFAULTS = require('../lib/categoryDefaults');
const SUBCATEGORY_DEFAULTS = require('../lib/subcategoryDefaults');

const rootDir = path.join(__dirname, '..');
const persistentDataDir = path.join(rootDir, 'data');
const persistentDbFile = path.join(persistentDataDir, 'kiosk.sqlite');
const tmpDataDir = path.join(os.tmpdir(), 'kiosk-app', 'data');
const tmpDbFile = path.join(tmpDataDir, 'kiosk.sqlite');

/**
 * 기본: 프로젝트 data/kiosk.sqlite (틀린정보 신고·식당 데이터 영구 저장).
 * /tmp DB는 KIOSK_USE_TMP_DB=1 일 때만 (Vercel 프로덕션 등).
 */
function shouldUseTmpSqlite() {
    if (process.env.KIOSK_DB_FILE) return false;
    if (process.env.KIOSK_DATA_DIR) return false;
    return process.env.KIOSK_USE_TMP_DB === '1';
}

function resolveKioskPaths() {
    if (process.env.KIOSK_DB_FILE) {
        const f = path.resolve(process.env.KIOSK_DB_FILE);
        return {
            dataDir: path.dirname(f),
            dbFile: f,
            legacyDb: persistentDbFile,
            usesTmpDb: false,
        };
    }
    if (process.env.KIOSK_DATA_DIR) {
        const dir = path.resolve(process.env.KIOSK_DATA_DIR);
        return {
            dataDir: dir,
            dbFile: path.join(dir, 'kiosk.sqlite'),
            legacyDb: persistentDbFile,
            usesTmpDb: false,
        };
    }
    if (shouldUseTmpSqlite()) {
        return {
            dataDir: tmpDataDir,
            dbFile: tmpDbFile,
            legacyDb: persistentDbFile,
            usesTmpDb: true,
        };
    }
    return {
        dataDir: persistentDataDir,
        dbFile: persistentDbFile,
        legacyDb: path.join(rootDir, 'kiosk.sqlite'),
        usesTmpDb: false,
    };
}

const { dataDir, dbFile, legacyDb, usesTmpDb } = resolveKioskPaths();

try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
} catch (e) {
    console.error('dataDir 생성 실패:', dataDir, e.message);
    throw e;
}

if (!fs.existsSync(dbFile) && legacyDb && fs.existsSync(legacyDb)) {
    try {
        fs.copyFileSync(legacyDb, dbFile);
        console.log('[kiosk] DB 초기 복사:', legacyDb, '→', dbFile);
    } catch (e) {
        console.error('기존 kiosk.sqlite 복사 실패:', e.message);
    }
}

/** vercel dev 등으로 /tmp에만 쌓인 틀린정보 신고를 data/kiosk.sqlite로 합침 */
function migrateTmpReportsToPersistent(done) {
    if (usesTmpDb) return done();
    if (!fs.existsSync(tmpDbFile)) return done();

    if (!fs.existsSync(persistentDbFile)) {
        try {
            if (!fs.existsSync(persistentDataDir)) fs.mkdirSync(persistentDataDir, { recursive: true });
            fs.copyFileSync(tmpDbFile, persistentDbFile);
            console.log('[kiosk] 임시 DB를 data/kiosk.sqlite로 복사했습니다.');
        } catch (e) {
            console.error('[kiosk] tmp → data DB 복사 실패:', e.message);
        }
        return done();
    }

    const sqlite3 = require('sqlite3').verbose();
    const main = new sqlite3.Database(persistentDbFile);
    main.serialize(() => {
        main.run('ATTACH DATABASE ? AS tmpdb', [tmpDbFile], (attachErr) => {
            if (attachErr) {
                console.error('[kiosk] tmp DB attach 실패:', attachErr.message);
                main.close(() => done());
                return;
            }
            main.run(
                `CREATE TABLE IF NOT EXISTS info_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                restaurant_id INTEGER,
                restaurant_name TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'new',
                created_at TEXT NOT NULL
            )`,
                () => {
                    main.run(
                        `INSERT INTO info_reports (restaurant_id, restaurant_name, message, status, created_at)
                     SELECT t.restaurant_id, t.restaurant_name, t.message, t.status, t.created_at
                     FROM tmpdb.info_reports t
                     WHERE NOT EXISTS (
                        SELECT 1 FROM info_reports p
                        WHERE IFNULL(p.restaurant_id, -1) = IFNULL(t.restaurant_id, -1)
                          AND p.message = t.message
                          AND p.created_at = t.created_at
                     )`,
                        function (mergeErr) {
                            const merged = mergeErr ? 0 : this.changes;
                            if (mergeErr) console.error('[kiosk] 신고 병합 실패:', mergeErr.message);
                            else if (merged > 0) {
                                console.log(`[kiosk] /tmp에 있던 틀린정보 신고 ${merged}건을 data/kiosk.sqlite로 옮겼습니다.`);
                            }
                            main.run('DETACH DATABASE tmpdb', () => main.close(() => done()));
                        }
                    );
                }
            );
        });
    });
}

let resolveReady;
let rejectReady;
const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
});

function markReady() {
    kioskDb.get('SELECT COUNT(*) AS c FROM info_reports', [], (err, row) => {
        if (!err && row && !usesTmpDb) {
            console.log(`[kiosk] 틀린정보 신고(info_reports): ${row.c}건 → ${dbFile}`);
        }
        resolveReady();
    });
}

/** 예전 스키마(restaurant_id UNIQUE 등)면 테이블 재생성 — 업체별 신고 여러 건 허용 */
function migrateInfoReportsAllowMultiple(db, cb) {
    const done = typeof cb === 'function' ? cb : () => {};
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='info_reports'", [], (err, row) => {
        if (err || !row || !row.sql) return done();
        const sql = String(row.sql);
        const needsRebuild =
            /restaurant_id\s+INTEGER\s+PRIMARY\s+KEY/i.test(sql) ||
            /restaurant_id\s+INTEGER\s+UNIQUE/i.test(sql) ||
            /UNIQUE\s*\(\s*restaurant_id\s*\)/i.test(sql);
        if (!needsRebuild) {
            db.all(
                "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='info_reports'",
                [],
                (idxErr, indexes) => {
                    const dropUniqueOnRestaurant = (i, next) => {
                        if (i >= (indexes || []).length) {
                            db.run(
                                'CREATE INDEX IF NOT EXISTS idx_info_reports_restaurant ON info_reports(restaurant_id)',
                                () => next()
                            );
                            return;
                        }
                        const idx = indexes[i];
                        const sqlIdx = idx && idx.sql ? String(idx.sql) : '';
                        if (/unique/i.test(sqlIdx) && /restaurant_id/i.test(sqlIdx)) {
                            db.run('DROP INDEX IF EXISTS ' + idx.name, () => dropUniqueOnRestaurant(i + 1, next));
                        } else {
                            dropUniqueOnRestaurant(i + 1, next);
                        }
                    };
                    if (idxErr) {
                        db.run(
                            'CREATE INDEX IF NOT EXISTS idx_info_reports_restaurant ON info_reports(restaurant_id)',
                            () => done()
                        );
                        return;
                    }
                    dropUniqueOnRestaurant(0, done);
                }
            );
            return;
        }
        console.warn('[db] info_reports: 업체별 1건만 허용하던 스키마 → 여러 건 허용으로 마이그레이션');
        db.serialize(() => {
            db.run(`CREATE TABLE info_reports_mig (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                restaurant_id INTEGER,
                restaurant_name TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'new',
                created_at TEXT NOT NULL
            )`);
            db.run(
                `INSERT INTO info_reports_mig (restaurant_id, restaurant_name, message, status, created_at)
                 SELECT restaurant_id, restaurant_name, message, status, created_at FROM info_reports`
            );
            db.run('DROP TABLE info_reports');
            db.run('ALTER TABLE info_reports_mig RENAME TO info_reports');
            db.run(
                'CREATE INDEX IF NOT EXISTS idx_info_reports_restaurant ON info_reports(restaurant_id)',
                () => done()
            );
        });
    });
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

        db.run(
            `CREATE TABLE IF NOT EXISTS info_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id INTEGER,
            restaurant_name TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'new',
            created_at TEXT NOT NULL
        )`,
            () => migrateInfoReportsAllowMultiple(db, () => {})
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
            db.run(`INSERT OR IGNORE INTO kiosk_settings (key, value) VALUES ('map_slot_address_hints', '{}')`, () => {});
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
                if (!rNames.has('display_order')) {
                    db.run('ALTER TABLE restaurants ADD COLUMN display_order INTEGER;', () => {
                        db.run('UPDATE restaurants SET display_order = id WHERE display_order IS NULL', () => {});
                    });
                } else {
                    db.run('UPDATE restaurants SET display_order = id WHERE display_order IS NULL', () => {});
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

const kioskDb = {
    ready: readyPromise,
    dbFile,
    usesTmpDb,
};

function attachSqliteConnection(conn) {
    ['serialize', 'run', 'get', 'all', 'prepare'].forEach((method) => {
        if (typeof conn[method] === 'function') {
            kioskDb[method] = conn[method].bind(conn);
        }
    });
}

/** Vercel + /tmp 일 때만 node:sqlite. 그 외 sqlite3 → data/kiosk.sqlite */
const useNodeSqlite = process.env.VERCEL === '1' && usesTmpDb;

function openMainDatabase() {
    console.log('[kiosk] SQLite:', dbFile, usesTmpDb ? '(임시 — 재시작 시 초기화)' : '(영구 · data/kiosk.sqlite)');

    if (useNodeSqlite) {
        let DatabaseSync;
        try {
            ({ DatabaseSync } = require('node:sqlite'));
        } catch (e) {
            console.error('node:sqlite 로드 실패 — Vercel 프로젝트 Node 버전을 22.5 이상으로 설정하세요.', e.message);
            rejectReady(e);
            return;
        }
        const { wrapDb } = require('./node-sqlite-shim');
        try {
            const native = new DatabaseSync(dbFile);
            attachSqliteConnection(wrapDb(native));
            bootstrapSchema(kioskDb);
        } catch (e) {
            console.error('Vercel SQLite 초기화 실패:', e);
            rejectReady(e);
        }
        return;
    }

    const sqlite3 = require('sqlite3').verbose();
    const conn = new sqlite3.Database(dbFile, (err) => {
        if (err) {
            console.error('Error opening database', err.message);
            rejectReady(err);
            return;
        }
        attachSqliteConnection(conn);
        bootstrapSchema(kioskDb);
    });
}

migrateTmpReportsToPersistent(() => openMainDatabase());

module.exports = kioskDb;
