/**
 * data/data.txt → restaurants 일괄 INSERT
 * 사용:
 *   node scripts/import-data-txt.js [--replace] [--file 경로]
 *   type data\data.txt | node scripts/import-data-txt.js --replace --stdin
 *   --replace   기존 식당 전부 삭제 후 삽입
 *   --file      TSV 파일 경로 (기본: data/data.txt)
 *   --stdin     표준입력에서 TSV 읽기
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const CATEGORY_DEFAULTS = require('../lib/categoryDefaults');
const SUBCATEGORY_DEFAULTS = require('../lib/subcategoryDefaults');
const { parseDataTxt } = require('../lib/importDataTxt');

const root = path.join(__dirname, '..');
const dbFile = path.join(root, 'data', 'kiosk.sqlite');

const replaceAll = process.argv.includes('--replace');
const useStdin = process.argv.includes('--stdin');
const fileArgIdx = process.argv.indexOf('--file');
const txtFile =
    fileArgIdx >= 0 && process.argv[fileArgIdx + 1]
        ? path.resolve(process.argv[fileArgIdx + 1])
        : path.join(root, 'data', 'data.txt');

if (!fs.existsSync(dbFile)) {
    console.error('DB 없음:', dbFile);
    process.exit(1);
}

let text;
if (useStdin) {
    try {
        text = fs.readFileSync(0, 'utf8');
    } catch (e) {
        console.error('stdin 읽기 실패:', e.message);
        process.exit(1);
    }
} else {
    if (!fs.existsSync(txtFile)) {
        console.error('파일 없음:', txtFile);
        process.exit(1);
    }
    text = fs.readFileSync(txtFile, 'utf8');
}

if (!text || !String(text).trim()) {
    console.error('TSV 내용이 비어 있습니다. 에디터에서 data/data.txt 를 UTF-8로 저장했는지 확인하세요.');
    process.exit(1);
}

let parsed;
try {
    parsed = parseDataTxt(text);
} catch (e) {
    console.error(e.message || e);
    process.exit(1);
}

const db = new sqlite3.Database(dbFile);

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function ensureCategoriesAndSubs() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            const cstmt = db.prepare(
                'INSERT OR IGNORE INTO categories (value, label_ko, label_en, icon, sort_order) VALUES (?,?,?,?,?)'
            );
            CATEGORY_DEFAULTS.forEach((d) => {
                cstmt.run(d.value, d.label_ko, d.label_en, d.icon, d.sort_order);
            });
            cstmt.finalize();

            const sstmt = db.prepare(
                'INSERT OR IGNORE INTO subcategories (category_value, value, label_ko, label_en, sort_order) VALUES (?,?,?,?,?)'
            );
            SUBCATEGORY_DEFAULTS.forEach((d) => {
                sstmt.run(d.category_value, d.value, d.label_ko, d.label_en || null, d.sort_order);
            });
            sstmt.finalize((err) => (err ? reject(err) : resolve()));
        });
    });
}

async function main() {
    await ensureCategoriesAndSubs();

    if (replaceAll) {
        await run('DELETE FROM restaurants');
        // AUTOINCREMENT 카운터는 DELETE만으로는 초기화되지 않아 id가 23처럼 이어짐 → sqlite_sequence 정리
        await run("DELETE FROM sqlite_sequence WHERE name = 'restaurants'");
        console.log('기존 restaurants 행 삭제함 (--replace), id 시퀀스 초기화');
    }

    const insertSql = `INSERT INTO restaurants (
        name, name_en, category, subcategory, image_url, map_url, description, description_en,
        address, phone, homepage, menu_url, open_time, close_time, closed_days, tags, walk_time, kiosk_hidden
    ) VALUES (?, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0)`;

    let ok = 0;
    for (const r of parsed.rows) {
        try {
            await run(insertSql, [r.name, r.category, r.subcategory, r.address]);
            ok++;
        } catch (e) {
            console.error('INSERT 실패:', r.name, e.message);
        }
    }

    console.log('삽입 완료:', ok, '건 / 파싱 행:', parsed.rows.length);
    if (parsed.unmappedSubs.length) {
        console.log('주의(미매핑·스킵된 카테고리 등):', parsed.unmappedSubs.length, '건');
        parsed.unmappedSubs.slice(0, 25).forEach((u) => console.log(' ', JSON.stringify(u)));
        if (parsed.unmappedSubs.length > 25) console.log('  … 외', parsed.unmappedSubs.length - 25, '건');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => db.close());
