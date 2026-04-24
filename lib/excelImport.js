const XLSX = require('xlsx');

function normalizeHeaderKey(s) {
    return String(s ?? '').trim().replace(/\s+/g, '').replace(/_/g, '').toLowerCase();
}

const FIELD_ALIASES = {
    name: ['상호명', 'name', '식당명', '한글상호', '한글상호명'],
    name_en: ['상호명영문', '상호명(영문)', 'nameen', '영문상호', 'name_en', 'englishname'],
    category: ['카테고리', 'category', '분류'],
    subcategory: ['2차분류', '2차', 'subcategory', '서브카테고리', '하위분류'],
    kiosk_hidden: ['키오스크숨김', '키오스크숨김여부', 'kioskhidden', 'kiosk_hidden', '숨김'],
    address: ['주소', 'address', '상세위치', '위치'],
    phone: ['전화', 'phone', '전화번호', 'tel'],
    homepage: ['홈페이지', 'homepage', 'url', '웹사이트', 'sns'],
    open_time: ['오픈', 'opentime', '오픈시간', 'open_time', '영업시작'],
    close_time: ['마감', 'closetime', '마감시간', 'close_time', '영업종료'],
    closed_days: ['휴무', '휴무일', 'closeddays', 'closed_days', '정기휴무', '쉬는날'],
    walk_time: ['도보', 'walktime', '도보소요', '도보분', 'walk_time', '도보시간', '도보(분)'],
    tags: ['태그', 'tags', '시설', '시설및서비스'],
    description: ['소개', 'description', '식당소개', '소개한', '한글소개', '소개(한)'],
    description_en: ['소개영문', 'descriptionen', '소개영', '영문소개', 'description_en', '소개(영)'],
    image_url: ['이미지url', 'imageurl', '대표이미지url', 'image_url', '이미지'],
    map_url: ['약도url', 'mapurl', 'map_url', '가시는길url'],
    menu_url: ['메뉴url', 'menuurl', 'menu_url', '메뉴판url'],
    dest_lat: [
        '목적지위도',
        '도착위도',
        '위도',
        'destlat',
        'dest_lat',
        'latitude',
        'lat',
        'wgs84lat',
        'y좌표'
    ],
    dest_lng: [
        '목적지경도',
        '도착경도',
        '경도',
        'destlng',
        'dest_lng',
        'longitude',
        'lng',
        'lon',
        'wgs84lng',
        'x좌표'
    ]
};

function pickExcelField(row, fieldKey) {
    const aliases = FIELD_ALIASES[fieldKey];
    if (!aliases) return '';
    for (const k of Object.keys(row)) {
        const nk = normalizeHeaderKey(k);
        for (const a of aliases) {
            if (normalizeHeaderKey(a) === nk) {
                const v = row[k];
                if (v === undefined || v === null) return '';
                return v;
            }
        }
    }
    return '';
}

function excelTimeToHHMM(v) {
    if (v === '' || v == null) return '';
    if (typeof v === 'number' && Number.isFinite(v)) {
        const frac = ((v % 1) + 1) % 1;
        const totalMins = Math.round(frac * 24 * 60) % (24 * 60);
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
    const s = String(v).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) return m[1].padStart(2, '0') + ':' + m[2];
    return s;
}

function parseWalkTimeCell(v) {
    if (v === '' || v == null) return null;
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function parseCoordCell(v) {
    if (v === '' || v == null) return null;
    const n = parseFloat(String(v).trim().replace(/,/g, '.'));
    return Number.isFinite(n) ? n : null;
}

function rowToRestaurantRecord(row) {
    const name = String(pickExcelField(row, 'name') || '').trim();
    const category = String(pickExcelField(row, 'category') || '').trim();
    const subRaw = pickExcelField(row, 'subcategory');
    const subcategory =
        subRaw !== '' && subRaw != null ? String(subRaw).trim() || null : null;
    const address = String(pickExcelField(row, 'address') || '').trim();
    const tagsRaw = pickExcelField(row, 'tags');
    const tags = typeof tagsRaw === 'string' ? tagsRaw.trim() : (tagsRaw != null ? String(tagsRaw) : '');
    const khRaw = pickExcelField(row, 'kiosk_hidden');
    let kiosk_hidden = 0;
    if (khRaw !== '' && khRaw != null) {
        const ks = String(khRaw).trim().toLowerCase();
        if (ks === '1' || ks === 'y' || ks === 'yes' || ks === '예' || ks === 'true' || ks === '숨김' || ks === 'hide') kiosk_hidden = 1;
        else if (ks === '0' || ks === 'n' || ks === 'no' || ks === '아니오' || ks === 'false' || ks === '표시') kiosk_hidden = 0;
        else {
            const n = parseInt(ks, 10);
            if (n === 1) kiosk_hidden = 1;
        }
    }

    return {
        name,
        name_en: String(pickExcelField(row, 'name_en') || '').trim() || null,
        category,
        subcategory,
        image_url: String(pickExcelField(row, 'image_url') || '').trim() || null,
        map_url: String(pickExcelField(row, 'map_url') || '').trim() || null,
        description: String(pickExcelField(row, 'description') || '').trim() || null,
        description_en: String(pickExcelField(row, 'description_en') || '').trim() || null,
        address,
        phone: String(pickExcelField(row, 'phone') || '').trim() || null,
        homepage: String(pickExcelField(row, 'homepage') || '').trim() || null,
        menu_url: String(pickExcelField(row, 'menu_url') || '').trim() || null,
        open_time: excelTimeToHHMM(pickExcelField(row, 'open_time')) || null,
        close_time: excelTimeToHHMM(pickExcelField(row, 'close_time')) || null,
        closed_days: String(pickExcelField(row, 'closed_days') || '').trim() || null,
        tags: tags || null,
        walk_time: parseWalkTimeCell(pickExcelField(row, 'walk_time')),
        kiosk_hidden,
        dest_lat: parseCoordCell(pickExcelField(row, 'dest_lat')),
        dest_lng: parseCoordCell(pickExcelField(row, 'dest_lng'))
    };
}

function insertOne(db, rec) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO restaurants (name, name_en, category, subcategory, image_url, image_gallery, map_url, description, description_en, address, phone, homepage, menu_url, open_time, close_time, closed_days, tags, main_menu, walk_time, kiosk_hidden, dest_lat, dest_lng)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                rec.name, rec.name_en, rec.category, rec.subcategory, rec.image_url, null, rec.map_url,
                rec.description, rec.description_en, rec.address, rec.phone, rec.homepage, rec.menu_url,
                rec.open_time, rec.close_time, rec.closed_days, rec.tags, null, rec.walk_time,
                rec.kiosk_hidden ? 1 : 0, rec.dest_lat, rec.dest_lng
            ],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

/** @param db sqlite3 Database 인스턴스 */
function importRowsFromBuffer(db, buffer) {
    let workbook;
    try {
        workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (e) {
        return Promise.reject(new Error('엑셀 파일을 읽을 수 없습니다.'));
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return Promise.reject(new Error('시트가 비어 있습니다.'));

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    const errors = [];
    let imported = 0;
    let emptySkipped = 0;

    return (async () => {
        for (let i = 0; i < rows.length; i++) {
            const rec = rowToRestaurantRecord(rows[i]);
            if (!rec.name) {
                const hasAny = Object.keys(rows[i]).some((k) => String(rows[i][k]).trim() !== '');
                if (hasAny) errors.push({ row: i + 2, message: '상호명이 비어 있습니다.' });
                else emptySkipped++;
                continue;
            }
            if (!rec.category || !rec.address) {
                errors.push({ row: i + 2, message: '카테고리와 주소는 필수입니다.' });
                continue;
            }
            try {
                await insertOne(db, rec);
                imported++;
            } catch (e) {
                errors.push({ row: i + 2, message: e.message || 'DB 오류' });
            }
        }
        return { imported, emptySkipped, errors };
    })();
}

module.exports = {
    importRowsFromBuffer,
    rowToRestaurantRecord,
    FIELD_ALIASES
};
