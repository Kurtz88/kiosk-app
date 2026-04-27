const express = require('express');
const path = require('path');
const os = require('os');
const multer = require('multer');
const fs = require('fs');
const db = require('./db');
const { importRowsFromBuffer } = require('../lib/excelImport');
const QRCode = require('qrcode');

const app = express();
// 로컬에서 PC 전역 PORT(예: 3002)가 잡혀 있으면 서버·브라우저 포트가 어긋나 API 404가 납니다. 프로덕션 또는 RUN_WITH_ENV_PORT=1 일 때만 PORT 사용.
if (process.env.NODE_ENV !== 'production' && process.env.RUN_WITH_ENV_PORT !== '1') {
    delete process.env.PORT;
}
const port = Number(process.env.PORT) || 3000;

const projectRoot = path.join(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
/** Vercel: 배포 루트 읽기 전용 — 업로드 파일은 /tmp 아래 webroot 로 미러 */
const filesRoot = process.env.VERCEL ? path.join(os.tmpdir(), 'kiosk-app', 'webroot') : publicDir;
const uploadsDir = path.join(filesRoot, 'uploads');
const categoryIconsDir = path.join(uploadsDir, 'categories');
try {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(categoryIconsDir)) fs.mkdirSync(categoryIconsDir, { recursive: true });
} catch (e) {
    console.error('uploads 디렉터리 생성 실패:', e.message);
    throw e;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/** Vercel 등 listen 없이 앱만 로드될 때, DB 준비 전 요청을 막음 */
app.use((req, res, next) => {
    db.ready
        .then(() => next())
        .catch((err) => {
            console.error(err);
            res.status(500).type('text/plain').send('Database init failed');
        });
});

function safeUnlinkCategoryIcon(urlPath) {
    if (urlPath == null || typeof urlPath !== 'string') return;
    const p = urlPath.replace(/^\//, '');
    if (!p.startsWith('uploads/categories/')) return;
    const full = path.join(filesRoot, p);
    if (!full.startsWith(filesRoot)) return;
    try {
        if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch (_) {}
}

function saveCategoryIconBuffer(categoryId, file) {
    if (!file || !file.buffer || !file.buffer.length) return null;
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = IMAGE_EXT.has(ext) ? ext : '.png';
    const name = 'cat_' + categoryId + '_' + Date.now() + safeExt;
    const rel = 'uploads/categories/' + name;
    fs.writeFileSync(path.join(filesRoot, rel), file.buffer);
    invalidateUploadListCache();
    return '/' + rel;
}

function sanitizeRestaurantFileBase(name) {
    let s = String(name || '').trim();
    if (!s) s = '식당';
    s = s.replace(/[\\/:*?"<>|#\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
    if (s.length > 80) s = s.slice(0, 80).trim();
    s = s.replace(/[.\s]+$/g, '');
    return s || '식당';
}

function suffixForRestaurantUploadField(fieldname) {
    if (fieldname === 'image') return '_사진';
    if (fieldname === 'gallery') return '_갤러리';
    if (fieldname === 'map_image') return '_지도';
    if (fieldname === 'menu_image') return '_메뉴판';
    return '_' + fieldname;
}

function uniqueNamedUploadFilename(restaurantName, fieldname, originalname) {
    const ext = path.extname(originalname || '').toLowerCase() || '.jpg';
    const base = sanitizeRestaurantFileBase(restaurantName) + suffixForRestaurantUploadField(fieldname);
    let candidate = base + ext;
    let n = 2;
    while (fs.existsSync(path.join(uploadsDir, candidate))) {
        candidate = base + '_' + n + ext;
        n++;
    }
    return candidate;
}

/** multer disk filename 단계에서는 multipart 순서 때문에 req.body.name 이 비는 경우가 많아, 메모리 수신 후 라우트에서 저장한다. */
function saveRestaurantUploadFile(restaurantName, fieldname, file) {
    if (!file || !file.buffer || !file.buffer.length) return null;
    const filename = uniqueNamedUploadFilename(restaurantName, fieldname, file.originalname);
    fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
    invalidateUploadListCache();
    return '/uploads/' + filename;
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let uploadListCache = { mtimeMs: -1, list: [] };

function invalidateUploadListCache() {
    uploadListCache.mtimeMs = -1;
}

function getCachedUploadFiles() {
    try {
        const st = fs.statSync(uploadsDir);
        if (st.mtimeMs !== uploadListCache.mtimeMs || uploadListCache.list.length === 0) {
            uploadListCache.mtimeMs = st.mtimeMs;
            uploadListCache.list = fs.readdirSync(uploadsDir).filter((n) => IMAGE_EXT.has(path.extname(n).toLowerCase()));
        }
        return uploadListCache.list;
    } catch {
        return [];
    }
}

function baseNameNoExt(filename) {
    return path.basename(filename, path.extname(filename));
}

/** DB에 URL이 없을 때 uploads 안 파일명으로 매칭 (예: 설빙_사진.jpg, 설빙_지도.png, 설빙_메뉴판.jpg 또는 설빙_메뉴.jpg) */
function pickUploadFileForRestaurant(filenames, nameBase, kind) {
    const reB = escapeRegex(nameBase);
    let re;
    if (kind === 'photo') {
        re = new RegExp('^' + reB + '_사진(_[0-9]+)?$');
    } else if (kind === 'map') {
        re = new RegExp('^' + reB + '_지도(_[0-9]+)?$');
    } else {
        re = new RegExp('^' + reB + '_메뉴판(_[0-9]+)?$|^' + reB + '_메뉴(_[0-9]+)?$');
    }
    const scored = [];
    for (const f of filenames) {
        const bn = baseNameNoExt(f);
        if (!re.test(bn)) continue;
        const tail = bn.match(/_([0-9]+)$/);
        const variant = tail ? parseInt(tail[1], 10) : 0;
        let menuRank = 0;
        if (kind === 'menu') {
            if (bn.indexOf('_메뉴판') !== -1) menuRank = 0;
            else menuRank = 1;
        }
        scored.push({ f, variant, menuRank });
    }
    scored.sort((a, b) => {
        if (a.variant !== b.variant) return a.variant - b.variant;
        if (a.menuRank !== b.menuRank) return a.menuRank - b.menuRank;
        return a.f.localeCompare(b.f);
    });
    return scored[0] ? scored[0].f : null;
}

function isBlankUrl(u) {
    return u == null || String(u).trim() === '';
}

function enrichRestaurantWithUploadFolder(row) {
    const base = sanitizeRestaurantFileBase(row.name);
    const files = getCachedUploadFiles();
    const out = { ...row };
    if (isBlankUrl(out.image_url)) {
        const hit = pickUploadFileForRestaurant(files, base, 'photo');
        if (hit) out.image_url = '/uploads/' + hit;
    }
    if (isBlankUrl(out.map_url)) {
        const hit = pickUploadFileForRestaurant(files, base, 'map');
        if (hit) out.map_url = '/uploads/' + hit;
    }
    if (isBlankUrl(out.menu_url)) {
        const hit = pickUploadFileForRestaurant(files, base, 'menu');
        if (hit) out.menu_url = '/uploads/' + hit;
    }
    return out;
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
});
const cpUpload = upload.fields([
    { name: 'images', maxCount: 4 },
    { name: 'map_image', maxCount: 1 },
    { name: 'menu_image', maxCount: 1 }
]);

const categoryIconUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

const RESTAURANT_COLUMNS =
    'id, name, name_en, category, subcategory, image_url, image_gallery, map_url, description, description_en, address, phone, homepage, menu_url, open_time, close_time, closed_days, tags, main_menu, walk_time, kiosk_hidden, dest_lat, dest_lng, naver_place_id, naver_place_url';

function isSafeRestaurantImageUrl(u) {
    if (!u || typeof u !== 'string') return false;
    const s = u.trim();
    if (!s.startsWith('/uploads/')) return false;
    if (s.includes('..')) return false;
    return true;
}

/** multipart gallery_manifest JSON + files.images 순서로 최대 4장 URL 배열. body에 키가 없으면 skip(이미지 컬럼 유지). */
function buildGalleryUrlsFromManifest(body, files, restaurantName) {
    if (!body || !Object.prototype.hasOwnProperty.call(body, 'gallery_manifest')) {
        return { skip: true };
    }
    const raw = body.gallery_manifest;
    if (raw === '' || raw == null) return { error: 'gallery_manifest 값이 필요합니다.' };
    let manifest;
    try {
        manifest = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
        return { error: 'gallery_manifest JSON이 올바르지 않습니다.' };
    }
    if (!Array.isArray(manifest)) return { error: 'gallery_manifest는 배열이어야 합니다.' };
    if (manifest.length > 4) return { error: '대표 이미지는 최대 4장까지입니다.' };
    const imageFiles = (files && files.images) || [];
    let fi = 0;
    const urls = [];
    for (const step of manifest) {
        if (step && step.t === 'u' && step.u != null) {
            const u = String(step.u).trim();
            if (!isSafeRestaurantImageUrl(u)) return { error: '허용되지 않은 기존 이미지 경로입니다.' };
            urls.push(u);
        } else if (step && step.t === 'n') {
            const f = imageFiles[fi++];
            if (!f || !f.buffer || !f.buffer.length) return { error: '업로드할 이미지 파일이 부족합니다.' };
            const saved = saveRestaurantUploadFile(restaurantName, 'gallery', f);
            if (!saved) return { error: '이미지 저장에 실패했습니다.' };
            urls.push(saved);
        } else {
            return { error: 'gallery_manifest 항목 형식이 올바르지 않습니다.' };
        }
    }
    if (fi !== imageFiles.length) return { error: '업로드 파일 개수와 순서가 맞지 않습니다.' };
    return { urls };
}

/** 관리자 폼/엑셀: 목적지 WGS84 — 비우면 null */
function parseOptionalWgsNumber(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (s === '' || s.toLowerCase() === 'null') return null;
    const n = parseFloat(s.replace(/,/g, '.'));
    return Number.isFinite(n) ? n : null;
}

function parseKioskHidden(v) {
    if (v === true || v === 1 || v === '1' || v === 'on' || v === 'true') return 1;
    if (v === false || v === 0 || v === '0' || v === 'off' || v === 'false' || v === '' || v == null) return 0;
    const s = String(v).trim().toLowerCase();
    if (s === '예' || s === 'y' || s === 'yes' || s === '숨김' || s === 'hide') return 1;
    return 0;
}

const excelUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (ext === '.xlsx' || ext === '.xls') cb(null, true);
        else cb(new Error('.xlsx 또는 .xls 파일만 업로드할 수 있습니다.'));
    }
});

// GET
app.get('/api/restaurants', (req, res) => {
    db.all(`SELECT ${RESTAURANT_COLUMNS} FROM restaurants ORDER BY id DESC`, [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ data: rows.map((r) => enrichRestaurantWithUploadFolder(r)) });
    });
});

// POST
app.post('/api/restaurants', cpUpload, (req, res) => {
    const {
        name,
        name_en,
        category,
        subcategory,
        description,
        description_en,
        address,
        phone,
        homepage,
        open_time,
        close_time,
        closed_days,
        tags,
        main_menu,
        walk_time,
        kiosk_hidden,
        dest_lat,
        dest_lng,
        naver_place_id,
        naver_place_url
    } = req.body;
    const dLat = parseOptionalWgsNumber(dest_lat);
    const dLng = parseOptionalWgsNumber(dest_lng);
    const npid = naver_place_id != null && String(naver_place_id).trim() !== '' ? String(naver_place_id).trim().replace(/\D/g, '') : null;
    const npurl = naver_place_url != null && String(naver_place_url).trim() !== '' ? String(naver_place_url).trim() : null;
    const kh = parseKioskHidden(kiosk_hidden);
    const mm = main_menu != null && String(main_menu).trim() !== '' ? String(main_menu).trim() : null;
    const files = req.files || {};
    const g = buildGalleryUrlsFromManifest(req.body, files, name);
    if (g.error) return res.status(400).json({ error: g.error });
    let image_url = null;
    let image_gallery = null;
    if (!g.skip && g.urls) {
        image_url = g.urls[0] || null;
        image_gallery = g.urls.length > 0 ? JSON.stringify(g.urls) : null;
    }
    let map_url = files['map_image'] ? saveRestaurantUploadFile(name, 'map_image', files['map_image'][0]) : null;
    let menu_url = files['menu_image'] ? saveRestaurantUploadFile(name, 'menu_image', files['menu_image'][0]) : null;

    const nb = sanitizeRestaurantFileBase(name);
    const fl = getCachedUploadFiles();
    if (g.skip && !image_url) {
        const h = pickUploadFileForRestaurant(fl, nb, 'photo');
        if (h) image_url = '/uploads/' + h;
    }
    if (!map_url) {
        const h = pickUploadFileForRestaurant(fl, nb, 'map');
        if (h) map_url = '/uploads/' + h;
    }
    if (!menu_url) {
        const h = pickUploadFileForRestaurant(fl, nb, 'menu');
        if (h) menu_url = '/uploads/' + h;
    }

    const sub = subcategory != null && String(subcategory).trim() !== '' ? String(subcategory).trim() : null;
    const cd =
        closed_days != null && String(closed_days).trim() !== '' ? String(closed_days).trim() : null;
    db.run(`INSERT INTO restaurants (name, name_en, category, subcategory, image_url, image_gallery, map_url, description, description_en, address, phone, homepage, menu_url, open_time, close_time, closed_days, tags, main_menu, walk_time, kiosk_hidden, dest_lat, dest_lng, naver_place_id, naver_place_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, name_en, category, sub, image_url, image_gallery, map_url, description, description_en, address, phone, homepage, menu_url, open_time, close_time, cd, tags, mm, walk_time || null, kh, dLat, dLng, npid, npurl],
        function(err) {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ id: this.lastID });
        });
});

// PUT
app.put('/api/restaurants/:id', cpUpload, (req, res) => {
    const {
        name,
        name_en,
        category,
        subcategory,
        description,
        description_en,
        address,
        phone,
        homepage,
        open_time,
        close_time,
        closed_days,
        tags,
        main_menu,
        walk_time,
        kiosk_hidden,
        dest_lat,
        dest_lng,
        naver_place_id,
        naver_place_url
    } = req.body;
    const dLatU = parseOptionalWgsNumber(dest_lat);
    const dLngU = parseOptionalWgsNumber(dest_lng);
    const npidU = naver_place_id != null && String(naver_place_id).trim() !== '' ? String(naver_place_id).trim().replace(/\D/g, '') : null;
    const npurlU = naver_place_url != null && String(naver_place_url).trim() !== '' ? String(naver_place_url).trim() : null;
    const files = req.files || {};
    const sub = subcategory != null && String(subcategory).trim() !== '' ? String(subcategory).trim() : null;
    const kh = parseKioskHidden(kiosk_hidden);
    const cd =
        closed_days != null && String(closed_days).trim() !== '' ? String(closed_days).trim() : null;
    const mm =
        main_menu != null && String(main_menu).trim() !== '' ? String(main_menu).trim() : null;
    let updates = [
        'name = ?',
        'name_en = ?',
        'category = ?',
        'subcategory = ?',
        'description = ?',
        'description_en = ?',
        'address = ?',
        'phone = ?',
        'homepage = ?',
        'open_time = ?',
        'close_time = ?',
        'closed_days = ?',
        'tags = ?',
        'main_menu = ?',
        'walk_time = ?',
        'kiosk_hidden = ?',
        'dest_lat = ?',
        'dest_lng = ?',
        'naver_place_id = ?',
        'naver_place_url = ?'
    ];
    let params = [name, name_en, category, sub, description, description_en, address, phone, homepage, open_time, close_time, cd, tags, mm, walk_time || null, kh, dLatU, dLngU, npidU, npurlU];

    const g = buildGalleryUrlsFromManifest(req.body, files, name);
    if (g.error) return res.status(400).json({ error: g.error });
    if (!g.skip && g.urls) {
        const image_url = g.urls[0] || null;
        const image_gallery = g.urls.length > 0 ? JSON.stringify(g.urls) : null;
        updates.push('image_url = ?');
        params.push(image_url);
        updates.push('image_gallery = ?');
        params.push(image_gallery);
    }
    if (files['map_image']) {
        const u = saveRestaurantUploadFile(name, 'map_image', files['map_image'][0]);
        if (u) { updates.push("map_url = ?"); params.push(u); }
    }
    if (files['menu_image']) {
        const u = saveRestaurantUploadFile(name, 'menu_image', files['menu_image'][0]);
        if (u) { updates.push("menu_url = ?"); params.push(u); }
    }

    params.push(req.params.id);

    db.run(`UPDATE restaurants SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ updated: this.changes });
    });
});

// 네이버 빠른길찾기 QR용 - 출발지 고정
// 출발지: 대구광역시 달성군 유가읍 테크노상업로 100
const FIXED_START = {
    lat: 35.8507,
    lng: 128.4178,
    name: '테크노상업로 100',
    address: '대구광역시 달성군 유가읍 테크노상업로 100'
};

app.get('/naver-route', (req, res) => {
    const { lat, lng, name, did } = req.query;
    const destName = (name || '목적지').trim() || '목적지';
    const navDid = (did || '').replace(/\D/g, '');
    const appname = req.get('host') || 'kiosk-naver-route';

    // did(네이버 장소 ID)가 있으면 → 앱 딥링크로 플레이스 열기
    if (navDid) {
        const nmapUrl = `nmap://place?id=${navDid}&appname=${encodeURIComponent(appname)}`;
        const webFallback = `https://m.place.naver.com/restaurant/${navDid}/home`;
        const intentUrl = `intent://place?id=${navDid}&appname=${encodeURIComponent(appname)}#Intent;scheme=nmap;package=com.nhn.android.nmap;S.browser_fallback_url=${encodeURIComponent(webFallback)};end`;

        const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>네이버 지도 열기…</title>
<style>
html,body{margin:0;padding:0;background:#fff;color:#666;font:14px/1.6 -apple-system,BlinkMacSystemFont,sans-serif}
.wrap{display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:6px;text-align:center;padding:24px}
.t{color:#03c75a;font-weight:600;font-size:15px}
.s{color:#999;font-size:12px}
a{color:#03c75a;text-decoration:underline}
</style>
</head>
<body>
<div class="wrap">
<div class="t">네이버 지도 앱을 여는 중…</div>
<div class="s">앱이 자동으로 열리지 않으면 <a href="${webFallback}">여기를 눌러 주세요</a></div>
</div>
<script>
(function(){
var nmap=${JSON.stringify(nmapUrl)};
var web=${JSON.stringify(webFallback)};
var intent=${JSON.stringify(intentUrl)};
var ua=navigator.userAgent||"";
var isAndroid=/Android/i.test(ua);
var isIOS=/iPhone|iPad|iPod/i.test(ua);
if(!isAndroid&&!isIOS){location.replace(web);return;}
var t=setTimeout(function(){location.replace(web);},1500);
function cancel(){clearTimeout(t);}
document.addEventListener("visibilitychange",function(){if(document.hidden)cancel();});
window.addEventListener("pagehide",cancel);
window.addEventListener("blur",cancel);
if(isAndroid){location.href=intent;}else{location.href=nmap;}
})();
</script>
</body>
</html>`;
        return res.type('html').send(html);
    }

    // did 없음 → 좌표/이름 기반 길찾기 (네이버 공식 launchApp/route 런처)
    const hasCoords = lat && lng;
    let dlat, dlng;
    if (hasCoords) {
        dlat = parseFloat(lat);
        dlng = parseFloat(lng);
        if (!Number.isFinite(dlat) || !Number.isFinite(dlng)) {
            return res.status(400).send('잘못된 좌표');
        }
    }

    // 좌표도 없으면 에러
    if (!hasCoords) {
        return res.status(400).send('네이버 장소 ID(did) 또는 좌표(lat, lng)가 필요합니다.');
    }

    // 네이버 공식 런처 URL (앱으로 자동 연결)
    // https://nmap.place.naver.com/launchApp/route?path=route&type=place&dlat=...&dlng=...&dname=...&appname=...
    const naverUrl = `https://nmap.place.naver.com/launchApp/route?path=route&type=place&dlat=${dlat}&dlng=${dlng}&dname=${encodeURIComponent(destName)}&appname=${encodeURIComponent(appname)}`;
    res.redirect(naverUrl);
});

// DELETE
app.delete('/api/restaurants/:id', (req, res) => {
    db.run("DELETE FROM restaurants WHERE id = ?", req.params.id, function(err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ deleted: this.changes });
    });
});

// Categories
app.get('/api/categories', (req, res) => {
    db.all(
        'SELECT id, value, label_ko, label_en, icon, icon_image, sort_order FROM categories ORDER BY sort_order ASC, id ASC',
        [],
        (err, rows) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ data: rows });
        }
    );
});

app.post('/api/categories', express.json(), (req, res) => {
    const { value, label_ko, label_en, icon, icon_image, sort_order } = req.body || {};
    const v = (value || '').trim();
    const lk = (label_ko || '').trim();
    if (!v || !lk) return res.status(400).json({ error: '저장값(value)과 한글 표시(label_ko)는 필수입니다.' });
    const le = label_en != null ? String(label_en).trim() : null;
    const ic = icon != null ? String(icon).trim() : null;
    const ii =
        icon_image != null && String(icon_image).trim() !== ''
            ? String(icon_image).trim().startsWith('/')
                ? String(icon_image).trim()
                : '/' + String(icon_image).trim().replace(/^\//, '')
            : null;
    const so = sort_order != null && req.body.sort_order !== '' ? parseInt(sort_order, 10) : null;

    const insert = (order) => {
        db.run(
            'INSERT INTO categories (value, label_ko, label_en, icon, icon_image, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
            [v, lk, le || null, ic || null, ii, order],
            function(insErr) {
                if (insErr) {
                    if (String(insErr.message).includes('UNIQUE')) return res.status(400).json({ error: '이미 같은 저장값(value)이 있습니다.' });
                    return res.status(500).json({ error: insErr.message });
                }
                res.json({ id: this.lastID });
            }
        );
    };

    if (so != null && !Number.isNaN(so)) insert(so);
    else {
        db.get('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM categories', [], (gErr, row) => {
            if (gErr) return res.status(500).json({ error: gErr.message });
            insert(row && row.next != null ? row.next : 10);
        });
    }
});

app.put('/api/categories/:id', express.json(), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID' });

    const { value, label_ko, label_en, icon, icon_image, sort_order } = req.body || {};
    const v = (value || '').trim();
    const lk = (label_ko || '').trim();
    if (!v || !lk) return res.status(400).json({ error: '저장값(value)과 한글 표시(label_ko)는 필수입니다.' });
    const le = label_en != null ? String(label_en).trim() : null;
    const ic = icon != null ? String(icon).trim() : null;
    const body = req.body || {};
    let nextIconImage;
    if (Object.prototype.hasOwnProperty.call(body, 'icon_image')) {
        if (icon_image === null || (typeof icon_image === 'string' && icon_image.trim() === '')) {
            nextIconImage = null;
        } else {
            const s = String(icon_image).trim();
            nextIconImage = s.startsWith('/') ? s : '/' + s.replace(/^\//, '');
        }
    } else {
        nextIconImage = undefined;
    }

    db.get('SELECT value, sort_order, icon_image FROM categories WHERE id = ?', [id], (gErr, row) => {
        if (gErr) return res.status(500).json({ error: gErr.message });
        if (!row) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
        const oldVal = row.value;
        const prevIconImage = row.icon_image;
        const ii = nextIconImage !== undefined ? nextIconImage : prevIconImage;
        let so = row.sort_order != null ? row.sort_order : 0;
        if (sort_order != null && req.body.sort_order !== '') {
            const parsed = parseInt(sort_order, 10);
            if (Number.isNaN(parsed)) return res.status(400).json({ error: '표시 순서는 숫자여야 합니다.' });
            so = parsed;
        }

        const finish = () => {
            db.run(
                'UPDATE categories SET value = ?, label_ko = ?, label_en = ?, icon = ?, icon_image = ?, sort_order = ? WHERE id = ?',
                [v, lk, le || null, ic || null, ii, so, id],
                function(uErr) {
                    if (uErr) {
                        if (String(uErr.message).includes('UNIQUE')) return res.status(400).json({ error: '이미 같은 저장값(value)이 있습니다.' });
                        return res.status(500).json({ error: uErr.message });
                    }
                    if (prevIconImage && prevIconImage !== ii) safeUnlinkCategoryIcon(prevIconImage);
                    res.json({ updated: this.changes });
                }
            );
        };

        if (oldVal !== v) {
            db.run('UPDATE subcategories SET category_value = ? WHERE category_value = ?', [v, oldVal], () => {
                db.run('UPDATE restaurants SET category = ? WHERE category = ?', [v, oldVal], (mErr) => {
                    if (mErr) return res.status(500).json({ error: mErr.message });
                    finish();
                });
            });
        } else finish();
    });
});

app.post('/api/categories/:id/icon', categoryIconUpload.single('icon_image'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID' });
    if (!req.file || !req.file.buffer || !req.file.buffer.length) {
        return res.status(400).json({ error: '이미지 파일이 없습니다.' });
    }
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!IMAGE_EXT.has(ext)) return res.status(400).json({ error: '지원 형식: jpg, png, gif, webp, bmp' });

    db.get('SELECT icon_image FROM categories WHERE id = ?', [id], (gErr, row) => {
        if (gErr) return res.status(500).json({ error: gErr.message });
        if (!row) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
        const prev = row.icon_image;
        const url = saveCategoryIconBuffer(id, req.file);
        if (!url) return res.status(500).json({ error: '파일 저장에 실패했습니다.' });
        db.run('UPDATE categories SET icon_image = ? WHERE id = ?', [url, id], function(uErr) {
            if (uErr) return res.status(500).json({ error: uErr.message });
            if (prev && prev !== url) safeUnlinkCategoryIcon(prev);
            res.json({ ok: true, icon_image: url });
        });
    });
});

app.delete('/api/categories/:id/icon', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID' });
    db.get('SELECT icon_image FROM categories WHERE id = ?', [id], (gErr, row) => {
        if (gErr) return res.status(500).json({ error: gErr.message });
        if (!row) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
        const prev = row.icon_image;
        db.run('UPDATE categories SET icon_image = NULL WHERE id = ?', [id], function(uErr) {
            if (uErr) return res.status(500).json({ error: uErr.message });
            if (prev) safeUnlinkCategoryIcon(prev);
            res.json({ ok: true });
        });
    });
});

app.delete('/api/categories/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID' });
    const reassignTo =
        req.query.reassign_to != null ? String(req.query.reassign_to).trim() : '';

    db.get('SELECT value, icon_image FROM categories WHERE id = ?', [id], (gErr, row) => {
        if (gErr) return res.status(500).json({ error: gErr.message });
        if (!row) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });

        const doDelete = () => {
            db.run('DELETE FROM subcategories WHERE category_value = ?', [row.value], () => {
                db.run('DELETE FROM categories WHERE id = ?', [id], function(dErr) {
                    if (dErr) return res.status(500).json({ error: dErr.message });
                    if (row.icon_image) safeUnlinkCategoryIcon(row.icon_image);
                    res.json({ deleted: this.changes });
                });
            });
        };

        db.get('SELECT COUNT(*) AS c FROM restaurants WHERE category = ?', [row.value], (cErr, countRow) => {
            if (cErr) return res.status(500).json({ error: cErr.message });
            const n = countRow && countRow.c != null ? countRow.c : 0;
            if (n > 0) {
                if (!reassignTo) {
                    return res.status(400).json({
                        error:
                            '이 카테고리를 사용 중인 식당이 ' +
                            n +
                            '곳 있습니다. 식당을 다른 1차로 옮긴 뒤 삭제하거나, reassign_to 로 한 번에 옮길 수 있습니다.',
                        inUseCount: n,
                        code: 'CATEGORY_IN_USE'
                    });
                }
                if (reassignTo === row.value) {
                    return res.status(400).json({ error: '같은 카테고리 저장값으로는 옮길 수 없습니다.' });
                }
                db.get('SELECT id FROM categories WHERE value = ?', [reassignTo], (e4, trow) => {
                    if (e4) return res.status(500).json({ error: e4.message });
                    if (!trow) {
                        return res
                            .status(400)
                            .json({ error: '이동할 카테고리를 찾을 수 없습니다. 저장값을 확인하세요: ' + reassignTo });
                    }
                    db.run(
                        'UPDATE restaurants SET category = ?, subcategory = NULL WHERE category = ?',
                        [reassignTo, row.value],
                        function(uErr) {
                            if (uErr) return res.status(500).json({ error: uErr.message });
                            doDelete();
                        }
                    );
                });
                return;
            }
            doDelete();
        });
    });
});

// 2차 분류 (상위 categories.value = category_value)
app.get('/api/subcategories', (req, res) => {
    const cat = req.query.category != null ? String(req.query.category).trim() : '';
    const sql = cat
        ? 'SELECT id, category_value, value, label_ko, label_en, sort_order FROM subcategories WHERE category_value = ? ORDER BY sort_order ASC, id ASC'
        : 'SELECT id, category_value, value, label_ko, label_en, sort_order FROM subcategories ORDER BY category_value ASC, sort_order ASC, id ASC';
    const params = cat ? [cat] : [];
    db.all(sql, params, (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ data: rows });
    });
});

app.post('/api/subcategories', express.json(), (req, res) => {
    const { category_value, value, label_ko, label_en, sort_order } = req.body || {};
    const cv = (category_value || '').trim();
    const vv = (value || '').trim();
    const lk = (label_ko || '').trim();
    if (!cv || !vv || !lk) return res.status(400).json({ error: '상위 카테고리 저장값, 2차 저장값, 한글 표시는 필수입니다.' });
    const le = label_en != null ? String(label_en).trim() : null;
    const so = sort_order != null && req.body.sort_order !== '' ? parseInt(sort_order, 10) : null;

    const insert = (order) => {
        db.run(
            'INSERT INTO subcategories (category_value, value, label_ko, label_en, sort_order) VALUES (?, ?, ?, ?, ?)',
            [cv, vv, lk, le || null, order],
            function(insErr) {
                if (insErr) {
                    if (String(insErr.message).includes('UNIQUE')) {
                        return res.status(400).json({ error: '같은 상위 아래에 이미 같은 2차 저장값이 있습니다.' });
                    }
                    return res.status(500).json({ error: insErr.message });
                }
                res.json({ id: this.lastID });
            }
        );
    };

    if (so != null && !Number.isNaN(so)) insert(so);
    else {
        db.get(
            'SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM subcategories WHERE category_value = ?',
            [cv],
            (gErr, row) => {
                if (gErr) return res.status(500).json({ error: gErr.message });
                insert(row && row.next != null ? row.next : 10);
            }
        );
    }
});

app.put('/api/subcategories/:id', express.json(), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID' });

    const { category_value, value, label_ko, label_en, sort_order } = req.body || {};
    const cv = (category_value || '').trim();
    const vv = (value || '').trim();
    const lk = (label_ko || '').trim();
    if (!cv || !vv || !lk) return res.status(400).json({ error: '상위 카테고리 저장값, 2차 저장값, 한글 표시는 필수입니다.' });
    const le = label_en != null ? String(label_en).trim() : null;

    db.get('SELECT category_value, value, sort_order FROM subcategories WHERE id = ?', [id], (gErr, row) => {
        if (gErr) return res.status(500).json({ error: gErr.message });
        if (!row) return res.status(404).json({ error: '2차 분류를 찾을 수 없습니다.' });
        const oldCv = row.category_value;
        const oldVv = row.value;
        let so = row.sort_order != null ? row.sort_order : 0;
        if (sort_order != null && req.body.sort_order !== '') {
            const parsed = parseInt(sort_order, 10);
            if (Number.isNaN(parsed)) return res.status(400).json({ error: '표시 순서는 숫자여야 합니다.' });
            so = parsed;
        }

        const finish = () => {
            db.run(
                'UPDATE subcategories SET category_value = ?, value = ?, label_ko = ?, label_en = ?, sort_order = ? WHERE id = ?',
                [cv, vv, lk, le || null, so, id],
                function(uErr) {
                    if (uErr) {
                        if (String(uErr.message).includes('UNIQUE')) {
                            return res.status(400).json({ error: '같은 상위 아래에 이미 같은 2차 저장값이 있습니다.' });
                        }
                        return res.status(500).json({ error: uErr.message });
                    }
                    res.json({ updated: this.changes });
                }
            );
        };

        if (oldCv !== cv || oldVv !== vv) {
            db.run(
                'UPDATE restaurants SET category = ?, subcategory = ? WHERE category = ? AND subcategory = ?',
                [cv, vv, oldCv, oldVv],
                function(rErr) {
                    if (rErr) return res.status(500).json({ error: rErr.message });
                    finish();
                }
            );
        } else finish();
    });
});

app.delete('/api/subcategories/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID' });
    const detach =
        req.query.detach === '1' ||
        req.query.detach === 'true' ||
        req.query.detach === 'yes';

    db.get('SELECT category_value, value FROM subcategories WHERE id = ?', [id], (gErr, row) => {
        if (gErr) return res.status(500).json({ error: gErr.message });
        if (!row) return res.status(404).json({ error: '2차 분류를 찾을 수 없습니다.' });

        const runDelete = () => {
            db.run('DELETE FROM subcategories WHERE id = ?', [id], function(dErr) {
                if (dErr) return res.status(500).json({ error: dErr.message });
                res.json({ deleted: this.changes });
            });
        };

        /** 식당 2차분류만 비우고 항목 삭제 — 확인필요 등 정리용 */
        if (detach) {
            db.run(
                'UPDATE restaurants SET subcategory = NULL WHERE category = ? AND subcategory = ?',
                [row.category_value, row.value],
                function(uErr) {
                    if (uErr) return res.status(500).json({ error: uErr.message });
                    runDelete();
                }
            );
            return;
        }

        db.get(
            'SELECT COUNT(*) AS c FROM restaurants WHERE category = ? AND subcategory = ?',
            [row.category_value, row.value],
            (cErr, countRow) => {
                if (cErr) return res.status(500).json({ error: cErr.message });
                const n = countRow && countRow.c != null ? countRow.c : 0;
                if (n > 0) {
                    return res.status(400).json({
                        error:
                            '이 2차 분류를 쓰는 식당이 ' +
                            n +
                            '곳 있습니다. 식당에서 2차분류를 바꾼 뒤 삭제하거나, 연결 끊기(관리자 화면)로 삭제하세요.',
                        inUseCount: n,
                        code: 'SUBCATEGORY_IN_USE'
                    });
                }
                runDelete();
            }
        );
    });
});

// Keyboard API — 예전에는 osk.exe(화상 키보드)를 띄웠으나, 터치 자판 UI만 쓰므로 no-op
app.get('/api/keyboard', (req, res) => {
    res.json({ success: true, keyboard: 'disabled' });
});

// 엑셀 일괄 등록 — 업로드
app.post('/api/restaurants/import-excel', (req, res) => {
    excelUpload.single('excel')(req, res, (multerErr) => {
        if (multerErr) return res.status(400).json({ error: multerErr.message });
        if (!req.file) return res.status(400).json({ error: '엑셀 파일을 선택해주세요.' });

        importRowsFromBuffer(db, req.file.buffer)
            .then((result) => res.json(result))
            .catch((e) => res.status(400).json({ error: e.message || '처리 실패' }));
    });
});

// QR Code API
app.get('/api/qrcode', async (req, res) => {
    const text = req.query.text;
    if(!text) return res.status(400).json({error: 'text query required'});
    try {
        const dataUrl = await QRCode.toDataURL(text, { margin: 1, width: 200, color: { dark: '#000000', light: '#ffffff' } });
        res.json({ dataUrl });
    } catch(err) {
        res.status(500).json({error: 'qr failed'});
    }
});

/** 키오스크 지도: 슬롯 번호(문자열) → 식당 id 배열 JSON */
app.get('/api/map-slot-assignments', (req, res) => {
    db.get('SELECT value FROM kiosk_settings WHERE key = ?', ['map_slot_assignments'], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        let parsed = {};
        try {
            parsed = row && row.value ? JSON.parse(row.value) : {};
        } catch (e) {
            parsed = {};
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};
        res.json({ assignments: parsed });
    });
});

/** 슬롯당 항목: 레거시 숫자 id 또는 { id, floor?, unit? } — 층·위치(호수 등) */
function normalizeMapSlotArray(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const item of arr) {
        if (typeof item === 'number' && Number.isFinite(item)) {
            out.push({ id: item, floor: '', unit: '' });
            continue;
        }
        if (typeof item === 'string' && item.trim() !== '') {
            const n = parseInt(item, 10);
            if (!Number.isNaN(n)) out.push({ id: n, floor: '', unit: '' });
            continue;
        }
        if (item && typeof item === 'object' && !Array.isArray(item) && item.id != null) {
            const id = parseInt(item.id, 10);
            if (Number.isNaN(id)) continue;
            const floor = item.floor != null ? String(item.floor).trim().slice(0, 80) : '';
            const unit = item.unit != null ? String(item.unit).trim().slice(0, 120) : '';
            out.push({ id, floor, unit });
        }
    }
    return out;
}

app.put('/api/map-slot-assignments', express.json(), (req, res) => {
    const { assignments } = req.body || {};
    if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) {
        return res.status(400).json({ error: 'assignments 객체가 필요합니다.' });
    }
    const normalized = {};
    for (const [k, v] of Object.entries(assignments)) {
        const key = String(k).trim();
        if (!key) continue;
        if (!Array.isArray(v)) continue;
        normalized[key] = normalizeMapSlotArray(v);
    }
    const json = JSON.stringify(normalized);
    db.run(
        'INSERT OR REPLACE INTO kiosk_settings (key, value) VALUES (?, ?)',
        ['map_slot_assignments', json],
        function(err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ ok: true, assignments: normalized });
        }
    );
});

// 정적 파일은 API 라우트 뒤에 두어 /api/* 가 실수로 HTML로 가지 않게 함
app.use('/api', (req, res) => {
    res.status(404).json({ error: '알 수 없는 API입니다.', path: req.originalUrl });
});

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(publicDir));

function firstLanIPv4() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            const v4 = net.family === 'IPv4' || net.family === 4;
            if (v4 && !net.internal) return net.address;
        }
    }
    return null;
}

const host = process.env.HOST || '0.0.0.0';

function printListenBanner() {
    const lan = firstLanIPv4();
    const line = '  ─────────────────────────────────────────────────────────────';
    const box = '  ═════════════════════════════════════════════════════════════';
    console.log('');
    console.log(box);
    console.log('   RESTAURANT KIOSK · 서버 준비됨');
    console.log(line);
    console.log('   이 PC       http://localhost:' + port + '/');
    if (lan) {
        console.log('   같은 Wi-Fi  http://' + lan + ':' + port + '/   관리자 /admin.html');
    }
    console.log(line);
    if (host === '0.0.0.0') {
        console.log('   Tip: 스마트폰에서 안 열리면 Windows 방화벽에서 TCP ' + port + ' 허용');
        console.log('        bat\\allow-firewall-port-3000.bat (관리자 권한으로 실행)');
    }
    console.log(box);
    console.log('');
}

module.exports = app;

if (require.main === module) {
    db.ready
        .then(() => {
            app.listen(port, host, printListenBanner);
        })
        .catch((err) => {
            console.error('DB 초기화 실패 — 서버를 시작할 수 없습니다:', err);
            process.exit(1);
        });
}
