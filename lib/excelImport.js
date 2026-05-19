const XLSX = require('xlsx');

function runAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function allAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function normalizeHeaderKey(s) {
    return String(s ?? '')
        .replace(/^\uFEFF/, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .trim()
        .replace(/\s+/g, '')
        .replace(/_/g, '')
        .toLowerCase();
}

/** 특수문자·괄호·슬래시 등을 제거한 느슨 비교용 헤더 키 */
function normalizeLooseHeaderKey(s) {
    return normalizeHeaderKey(s).replace(/[^0-9a-z\uac00-\ud7a3]/g, '');
}

const FIELD_ALIASES = {
    /** 표시·저장 순서 (숫자 작을수록 위). 비우면 시트 행 순 */
    sort_key: ['순서', 'order', 'sort', 'sortorder', '정렬', '정렬순서'],
    name: ['상호명', 'name', '식당명', '한글상호', '한글상호명'],
    name_en: ['상호명영문', '상호명(영문)', 'nameen', '영문상호', 'name_en', 'englishname'],
    category: ['카테고리', 'category', '분류'],
    subcategory: ['2차분류', '2차', 'subcategory', '서브카테고리', '하위분류'],
    kiosk_hidden: ['키오스크숨김', '키오스크숨김여부', 'kioskhidden', 'kiosk_hidden', '숨김'],
    address: ['주소', 'address', '상세위치', '위치'],
    phone: ['전화', 'phone', '전화번호', 'tel'],
    homepage: ['홈페이지', 'homepage', 'url', '웹사이트', 'sns'],
    /** "09:00-21:00" 형태 한 칸 — open_time/close_time 열이 비어 있을 때만 사용 */
    business_hours: ['영업시간', '영업', 'businesshours', '영업시간대', '운영시간', 'openinghours', 'opening hours', 'business hours'],
    open_time: ['오픈', 'opentime', '오픈시간', 'open_time', '영업시작'],
    close_time: ['마감', 'closetime', '마감시간', 'close_time', '영업종료'],
    closed_days: ['휴무', '휴무일', 'closeddays', 'closed_days', '정기휴무', '쉬는날'],
    walk_time: ['도보', 'walktime', '도보소요', '도보분', 'walk_time', '도보시간', '도보(분)'],
    tags: ['태그', 'tags', '시설', '시설및서비스'],
    description: [
        '소개',
        'description',
        '식당소개',
        '소개한',
        '한글소개',
        '소개(한)',
        '한줄설명',
        '한줄소개',
        '요약',
        '설명',
        '매장소개',
        '비고',
        '안내',
        '소개글'
    ],
    main_menu: [
        '주요메뉴',
        '메인메뉴',
        'mainmenu',
        'main_menu',
        '대표메뉴',
        '메뉴요약',
        '메뉴',
        '메뉴내역',
        '메뉴목록',
        '메뉴리스트',
        '판매메뉴',
        'menus',
        'menu'
    ],
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
    ],
    naver_place_id: [
        '네이버장소id',
        '네이버장소ID',
        'naver_place_id',
        'naverplaceid',
        '장소id',
        '장소ID',
        'placeid',
        'did',
        'f_road'
    ]
};

/** 시트 셀 값 — 숫자·문자·하이퍼링크/배열 등 XLSX 형태를 문자열·숫자로 통일 */
function coerceExcelCellValue(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'object') {
        if (Array.isArray(v)) {
            return v
                .map((x) => coerceExcelCellValue(x))
                .filter((x) => x !== '' && !(typeof x === 'string' && x.trim() === ''))
                .join(',');
        }
        if (v.w != null && String(v.w).trim() !== '') return String(v.w);
        if (v.v !== undefined && v.v !== null) return coerceExcelCellValue(v.v);
        if (v.r != null) return String(v.r);
    }
    return String(v);
}

/** 주요메뉴·태그 등 — 전각 쉼표·세미콜론을 영문 쉼표로 (목록 split과 맞춤) */
function normalizeListCellForDb(raw) {
    const s = String(coerceExcelCellValue(raw) ?? '').trim();
    if (!s) return '';
    return s
        .replace(/\uFF0C/g, ',')
        .replace(/[;；]/g, ',')
        .replace(/\s*,\s*/g, ',')
        .trim();
}

function pickExcelField(row, fieldKey) {
    const aliases = FIELD_ALIASES[fieldKey];
    if (!aliases) return '';
    for (const k of Object.keys(row)) {
        const nk = normalizeHeaderKey(k);
        for (const a of aliases) {
            if (normalizeHeaderKey(a) === nk) {
                const v = row[k];
                if (v === undefined || v == null) return '';
                return coerceExcelCellValue(v);
            }
        }
    }
    return '';
}

/** 헤더에 '설명'·'한줄설명' 등이 들어간 열 (열명 변형) */
function pickDescriptionCell(row) {
    const direct = pickExcelField(row, 'description');
    if (String(coerceExcelCellValue(direct) || '').trim() !== '') return direct;

    const markers = ['한줄설명', '매장소개', '한줄소개', '식당소개', '설명', '비고', '요약', '소개글', '안내'];
    for (const k of Object.keys(row)) {
        const nk = normalizeHeaderKey(k);
        const lk = normalizeLooseHeaderKey(k);
        for (const m of markers) {
            const nm = normalizeHeaderKey(m);
            if (!nm) continue;
            const match = nk === nm || (nm.length >= 4 && nk.includes(nm));
            if (!match) continue;
            const v = row[k];
            if (v === undefined || v === null) continue;
            const out = coerceExcelCellValue(v);
            if (String(out).trim() !== '') return out;
        }
        // 영문/변형 헤더를 위한 느슨 매칭 (예: description_kr, intro_text)
        const likelyDescription =
            lk.includes('설명') ||
            lk.includes('소개') ||
            lk.includes('description') ||
            lk.includes('intro') ||
            lk.includes('summary');
        const likelyEnglishOnly = lk.includes('descriptionen') || lk.includes('소개영') || lk.includes('영문소개');
        if (likelyDescription && !likelyEnglishOnly) {
            const out = coerceExcelCellValue(row[k]);
            if (String(out).trim() !== '') return out;
        }
    }
    return '';
}

/**
 * 헤더에 '주요메뉴'·'대표메뉴' 등이 들어간 열.
 * 짧은 '메뉴'는 정확히 일치할 때만 매칭(메뉴url·메뉴판 등과 구분).
 */
function pickMainMenuCell(row) {
    const direct = pickExcelField(row, 'main_menu');
    if (String(coerceExcelCellValue(direct) || '').trim() !== '') return direct;

    const markers = [
        '주요메뉴',
        '대표메뉴',
        '메뉴목록',
        '메뉴내역',
        '메뉴리스트',
        '메인메뉴',
        '판매메뉴',
        'mainmenu',
        'menus',
        '메뉴'
    ];
    for (const k of Object.keys(row)) {
        const nk = normalizeHeaderKey(k);
        const lk = normalizeLooseHeaderKey(k);
        for (const m of markers) {
            const nm = normalizeHeaderKey(m);
            if (!nm) continue;
            const match = nk === nm || (nm.length >= 4 && nk.includes(nm));
            if (!match) continue;
            const v = row[k];
            if (v === undefined || v === null) continue;
            const out = coerceExcelCellValue(v);
            if (String(out).trim() !== '') return out;
        }
        // 느슨 매칭: 메뉴 관련이지만 URL/이미지 성격 열은 제외
        const likelyMenu =
            lk.includes('메뉴') ||
            lk.includes('mainmenu') ||
            lk.includes('menulist') ||
            lk.includes('menus');
        const likelyMenuUrl =
            lk.includes('menuurl') ||
            lk.includes('메뉴url') ||
            lk.includes('메뉴판url') ||
            lk.includes('url') ||
            lk.includes('링크') ||
            lk.includes('image') ||
            lk.includes('이미지');
        if (likelyMenu && !likelyMenuUrl) {
            const out = coerceExcelCellValue(row[k]);
            if (String(out).trim() !== '') return out;
        }
    }
    return '';
}

/** 별칭 일치 후에도 헤더에 '영업시간' 등이 포함된 열을 찾음(엑셀 변형·숨은 문자 대응) */
function pickBusinessHoursCell(row) {
    const direct = pickExcelField(row, 'business_hours');
    if (direct !== '' && direct != null) return direct;

    const markers = [
        normalizeHeaderKey('영업시간'),
        normalizeHeaderKey('운영시간'),
        normalizeHeaderKey('opening hours'),
        normalizeHeaderKey('business hours')
    ].filter(Boolean);

    for (const k of Object.keys(row)) {
        const nk = normalizeHeaderKey(k);
        const lk = normalizeLooseHeaderKey(k);
        for (const m of markers) {
            if (!m) continue;
            if (nk === m || nk.includes(m)) {
                const v = row[k];
                if (v !== undefined && v !== null && String(coerceExcelCellValue(v)).trim() !== '') return coerceExcelCellValue(v);
            }
        }
        // 느슨 매칭: 영업/운영 시간성 헤더
        const likelyBusinessHours =
            lk.includes('영업시간') ||
            lk.includes('운영시간') ||
            lk.includes('openinghours') ||
            lk.includes('businesshours') ||
            lk.includes('hours');
        const likelyClosedDays = lk.includes('휴무');
        if (likelyBusinessHours && !likelyClosedDays) {
            const out = coerceExcelCellValue(row[k]);
            if (String(out).trim() !== '') return out;
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

/** 엑셀 "순서" 칸 — 비어 있으면 null (행 순서로 대체) */
function parseSortOrderCell(v) {
    if (v === '' || v == null) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = String(v).trim();
    if (s === '') return null;
    const n = parseFloat(s.replace(/,/g, '.'));
    return Number.isFinite(n) ? n : null;
}

/**
 * 한 칸 영업시간: "09:00-21:00", "9:00~21:30", "09:00 - 21:00" 등
 * open_time/close_time 별도 열이 있으면 그쪽이 우선(rowToRestaurantRecord에서 처리)
 */
function parseCombinedBusinessHours(raw) {
    if (raw === '' || raw == null) return { open: '', close: '' };
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return { open: '', close: '' };
    }
    const s = String(raw).trim();
    const m = s.match(/^(\d{1,2}:\d{2})\s*[-~～〜至－—]\s*(\d{1,2}:\d{2})/);
    if (!m) return { open: '', close: '' };
    return {
        open: excelTimeToHHMM(m[1]) || '',
        close: excelTimeToHHMM(m[2]) || ''
    };
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

function normalizeRestaurantCategoriesCell(raw) {
    const parts = String(raw || '')
        .split(/[,，]/)
        .map((x) => x.trim())
        .filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const p of parts) {
        if (!seen.has(p)) {
            seen.add(p);
            out.push(p);
        }
    }
    return out.join(',');
}

/**
 * 관리자에 등록된 categories 행으로 엑셀 토큰(저장값·한글·영문 표기) → DB 저장값(value) 해석
 * @param {Array<{ value: string, label_ko?: string, label_en?: string }>} rows
 */
function buildCategoryResolver(rows) {
    const map = new Map();
    for (const row of rows || []) {
        const value = row && row.value != null ? String(row.value).trim() : '';
        if (!value) continue;
        map.set(normalizeHeaderKey(value), value);
        const lk = row.label_ko != null ? String(row.label_ko).trim() : '';
        if (lk) map.set(normalizeHeaderKey(lk), value);
        const le = row.label_en != null ? String(row.label_en).trim() : '';
        if (le) map.set(normalizeHeaderKey(le), value);
        const lsk = row.label_sub_ko != null ? String(row.label_sub_ko).trim() : '';
        if (lsk) map.set(normalizeHeaderKey(lsk), value);
    }
    return (token) => {
        const t = String(token || '').trim();
        if (!t) return null;
        const hit = map.get(normalizeHeaderKey(t));
        return hit != null ? hit : null;
    };
}

/**
 * 쉼표로 구분된 카테고리 문자열의 각 토큰을 저장값으로 치환. 알 수 없는 토큰은 unknown에 담음.
 */
function resolveCategoryCsv(rawCsv, resolveToken) {
    const parts = String(rawCsv || '')
        .split(/[,，]/)
        .map((x) => x.trim())
        .filter(Boolean);
    const unknown = [];
    const seen = new Set();
    const out = [];
    for (const p of parts) {
        const v = resolveToken(p);
        if (!v) {
            unknown.push(p);
            continue;
        }
        if (!seen.has(v)) {
            seen.add(v);
            out.push(v);
        }
    }
    return { csv: out.join(','), unknown };
}

function rowToRestaurantRecord(row) {
    const name = String(pickExcelField(row, 'name') || '').trim();
    const category = normalizeRestaurantCategoriesCell(pickExcelField(row, 'category'));
    const subcategory = null;
    const address = String(pickExcelField(row, 'address') || '').trim();
    const tagsRaw = pickExcelField(row, 'tags');
    const tagsNorm = normalizeListCellForDb(tagsRaw);
    const tags = tagsNorm || '';
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

    let hoursOne = '';
    const ot = excelTimeToHHMM(pickExcelField(row, 'open_time')) || '';
    const ct = excelTimeToHHMM(pickExcelField(row, 'close_time')) || '';
    if (ot && ct) hoursOne = ot + '-' + ct;
    else if (ot) hoursOne = ot;
    else if (ct) hoursOne = ct;
    else {
        const bh = pickBusinessHoursCell(row);
        if (bh !== '' && bh != null) {
            if (typeof bh === 'number' && Number.isFinite(bh)) {
                const t = excelTimeToHHMM(bh);
                if (t) hoursOne = t;
            } else {
                const p = parseCombinedBusinessHours(bh);
                if (p.open && p.close) hoursOne = p.open + '-' + p.close;
                else if (p.open) hoursOne = p.open;
                else {
                    const s = String(bh).trim();
                    if (s) hoursOne = s;
                }
            }
        }
    }

    const mmNorm = normalizeListCellForDb(pickMainMenuCell(row));
    const main_menu = mmNorm ? mmNorm.slice(0, 2000) : null;

    const descRaw = pickDescriptionCell(row);
    const description =
        String(coerceExcelCellValue(descRaw) || '')
            .trim()
            .slice(0, 4000) || null;

    return {
        name,
        name_en: String(pickExcelField(row, 'name_en') || '').trim() || null,
        category,
        subcategory,
        image_url: String(pickExcelField(row, 'image_url') || '').trim() || null,
        map_url: String(pickExcelField(row, 'map_url') || '').trim() || null,
        description,
        description_en: String(pickExcelField(row, 'description_en') || '').trim() || null,
        address,
        phone: String(pickExcelField(row, 'phone') || '').trim() || null,
        homepage: String(pickExcelField(row, 'homepage') || '').trim() || null,
        menu_url: String(pickExcelField(row, 'menu_url') || '').trim() || null,
        open_time: hoursOne || null,
        close_time: null,
        closed_days: String(pickExcelField(row, 'closed_days') || '').trim() || null,
        tags: tags || null,
        main_menu,
        walk_time: parseWalkTimeCell(pickExcelField(row, 'walk_time')),
        kiosk_hidden,
        dest_lat: parseCoordCell(pickExcelField(row, 'dest_lat')),
        dest_lng: parseCoordCell(pickExcelField(row, 'dest_lng')),
        naver_place_id: parseNaverPlaceId(pickExcelField(row, 'naver_place_id'))
    };
}

function parseNaverPlaceId(v) {
    if (v === '' || v == null) return null;
    const s = String(v).trim().replace(/\D/g, '');
    return s.length > 0 ? s : null;
}

function insertOne(db, rec, displayOrder) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO restaurants (name, name_en, category, subcategory, image_url, image_gallery, map_url, description, description_en, address, phone, homepage, menu_url, open_time, close_time, closed_days, tags, main_menu, walk_time, kiosk_hidden, dest_lat, dest_lng, naver_place_id, display_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                rec.name, rec.name_en, rec.category, rec.subcategory, rec.image_url, null, rec.map_url,
                rec.description, rec.description_en, rec.address, rec.phone, rec.homepage, rec.menu_url,
                rec.open_time, rec.close_time, rec.closed_days, rec.tags, rec.main_menu, rec.walk_time,
                rec.kiosk_hidden ? 1 : 0, rec.dest_lat, rec.dest_lng, rec.naver_place_id,
                displayOrder
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
        let categoryRows;
        try {
            categoryRows = await allAsync(
                db,
                'SELECT value, label_ko, label_en, label_sub_ko FROM categories ORDER BY sort_order ASC, id ASC',
                []
            );
        } catch (e) {
            return Promise.reject(new Error('카테고리 목록을 읽을 수 없습니다.'));
        }
        const resolveCategoryToken = buildCategoryResolver(categoryRows);

        const plan = [];
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
            const { csv: catResolved, unknown: catUnknown } = resolveCategoryCsv(rec.category, resolveCategoryToken);
            if (catUnknown.length) {
                errors.push({
                    row: i + 2,
                    message: `등록되지 않은 카테고리: ${catUnknown.join(', ')} (관리자「카테고리」에 있는 표시명·저장값과 동일하게 적어 주세요)`
                });
                continue;
            }
            if (!catResolved) {
                errors.push({ row: i + 2, message: '카테고리와 주소는 필수입니다.' });
                continue;
            }
            rec.category = catResolved;
            const sortKey = parseSortOrderCell(pickExcelField(rows[i], 'sort_key'));
            plan.push({ sheetRow: i + 2, rec, sortKey });
        }

        plan.sort((a, b) => {
            const ak = a.sortKey != null ? a.sortKey : Number.POSITIVE_INFINITY;
            const bk = b.sortKey != null ? b.sortKey : Number.POSITIVE_INFINITY;
            if (ak !== bk) return ak - bk;
            return a.sheetRow - b.sheetRow;
        });

        if (plan.length === 0) {
            return { imported, emptySkipped, errors, replacedAll: false };
        }

        try {
            await runAsync(db, 'BEGIN IMMEDIATE');
            await runAsync(db, 'DELETE FROM restaurants');
            await runAsync(db, "DELETE FROM sqlite_sequence WHERE name = 'restaurants'");
            await runAsync(db, "INSERT OR REPLACE INTO kiosk_settings (key, value) VALUES ('map_slot_assignments', '{}')");
            let okCount = 0;
            let dbErr = false;
            for (let j = 0; j < plan.length; j++) {
                const { sheetRow, rec } = plan[j];
                const displayOrder = 10 + j * 10;
                try {
                    await insertOne(db, rec, displayOrder);
                    okCount++;
                } catch (e) {
                    dbErr = true;
                    errors.push({ row: sheetRow, message: e.message || 'DB 오류' });
                }
            }
            if (dbErr || okCount === 0) {
                await runAsync(db, 'ROLLBACK');
                return { imported: 0, emptySkipped, errors, replacedAll: false };
            }
            await runAsync(db, 'COMMIT');
            imported = okCount;
        } catch (e) {
            try {
                await runAsync(db, 'ROLLBACK');
            } catch (rollbackErr) {
                /* ignore */
            }
            throw e;
        }

        return { imported, emptySkipped, errors, replacedAll: imported > 0 };
    })();
}

module.exports = {
    importRowsFromBuffer,
    rowToRestaurantRecord,
    FIELD_ALIASES,
    buildCategoryResolver,
    resolveCategoryCsv
};
