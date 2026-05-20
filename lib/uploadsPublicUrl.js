/**
 * DB의 /uploads/… → http://iniini.co.kr/kiosk/uploads/… 직접 (API 프록시 없음)
 * 로컬 public/uploads만 쓸 때: KIOSK_UPLOADS_BASE_URL=0
 */
const INIINI_UPLOADS_HTTP_BASE = 'http://iniini.co.kr/kiosk/uploads';

function getUploadsPublicBase() {
    const raw = process.env.KIOSK_UPLOADS_BASE_URL;
    if (raw === '0' || raw === 'false' || raw === 'off') return '';
    let base = (raw != null && String(raw).trim() !== ''
        ? String(raw).trim()
        : INIINI_UPLOADS_HTTP_BASE
    ).replace(/\/+$/, '');
    /* iniini 업로드는 http만 제공 — https로 설정돼 있어도 http로 통일 */
    if (/^https:\/\/([^/]*iniini\.co\.kr)\/kiosk\/uploads/i.test(base)) {
        base = 'http://' + base.replace(/^https:\/\//i, '');
    }
    return base;
}

function isIniiniKioskUploadUrl(urlStr) {
    try {
        const u = new URL(String(urlStr).trim());
        return /(^|\.)iniini\.co\.kr$/i.test(u.hostname) && /\/kiosk\/uploads(\/|$)/i.test(u.pathname);
    } catch {
        return false;
    }
}

/** https://iniini…/kiosk/uploads/… → http://iniini…/kiosk/uploads/… (경로·인코딩 유지) */
function iniiniKioskUploadToHttp(urlStr) {
    const rel = extractUploadRelFromStored(urlStr);
    if (rel != null) {
        const encoded = encodeUploadRelPath(rel);
        if (encoded) return toClientUploadUrl(encoded);
    }
    try {
        const u = new URL(String(urlStr).trim());
        if (!isIniiniKioskUploadUrl(u.href)) return urlStr;
        u.protocol = 'http:';
        u.pathname = u.pathname
            .split('/')
            .map((seg) => (seg ? encodeUploadPathSegment(seg) : seg))
            .join('/');
        return u.href;
    } catch {
        return urlStr;
    }
}

/** 경로 한 segment */
function encodeUploadPathSegment(seg) {
    const rawUtf8 = process.env.KIOSK_UPLOADS_RAW_UTF8 === '1' || process.env.KIOSK_UPLOADS_RAW_UTF8 === 'true';
    if (rawUtf8) return String(seg).replace(/ /g, '%20');
    try {
        return encodeURIComponent(decodeURIComponent(String(seg)));
    } catch {
        return encodeURIComponent(String(seg));
    }
}

function encodeUploadRelPath(rel) {
    return String(rel || '')
        .split('/')
        .filter((seg) => seg.length > 0)
        .map((seg) => encodeUploadPathSegment(seg))
        .join('/');
}

/** /uploads/a.jpg · http://iniini…/a.jpg → 상대 경로 a.jpg (없으면 null) */
function extractUploadRelFromStored(stored) {
    const s = String(stored || '').trim();
    if (!s) return null;
    if (s.startsWith('/uploads/')) return s.slice('/uploads/'.length);
    if (s.startsWith('uploads/')) return s.slice('uploads/'.length);
    if (!/^https?:\/\//i.test(s)) return null;
    const base = getUploadsPublicBase();
    if (!base) return null;
    try {
        const u = new URL(s);
        const baseU = new URL(base.endsWith('/') ? base : base + '/');
        const basePath = baseU.pathname.replace(/\/$/, '') || '';
        let p = u.pathname;
        if (basePath && p.startsWith(basePath)) p = p.slice(basePath.length);
        return p.replace(/^\//, '') || null;
    } catch {
        return null;
    }
}

/** 브라우저에 줄 URL — iniini 직접 */
function toClientUploadUrl(encodedRel) {
    if (!encodedRel) return '';
    const base = getUploadsPublicBase();
    return base ? base + '/' + encodedRel : '/uploads/' + encodedRel;
}

/** 서버가 iniini에서 가져올 절대 URL */
function buildOriginUploadUrl(encodedRel) {
    const base = getUploadsPublicBase();
    if (!base || !encodedRel) return '';
    return base.replace(/\/+$/, '') + '/' + encodedRel;
}

/** 절대 URL — iniini 업로드는 http로, 그 외는 pathname 인코딩만 */
function normalizeAbsoluteUploadUrl(urlStr) {
    if (isIniiniKioskUploadUrl(urlStr)) return iniiniKioskUploadToHttp(urlStr);
    const rel = extractUploadRelFromStored(urlStr);
    if (rel != null) {
        const encoded = encodeUploadRelPath(rel);
        if (encoded) return toClientUploadUrl(encoded);
    }
    try {
        const u = new URL(urlStr);
        u.pathname = u.pathname
            .split('/')
            .map((seg) => (seg ? encodeUploadPathSegment(seg) : seg))
            .join('/');
        return u.href;
    } catch {
        return urlStr;
    }
}

/** /uploads/foo.jpg → http://iniini.co.kr/kiosk/uploads/foo.jpg */
function toPublicUploadUrl(stored) {
    if (stored == null) return stored;
    const s = String(stored).trim();
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return normalizeAbsoluteUploadUrl(s);
    const base = getUploadsPublicBase();
    if (!base) return s;
    const rel = extractUploadRelFromStored(s);
    if (rel == null) return s;
    const encoded = encodeUploadRelPath(rel);
    return encoded ? toClientUploadUrl(encoded) : s;
}

function applyPublicUploadUrlsToRestaurant(row) {
    if (!row || typeof row !== 'object') return row;
    if (!getUploadsPublicBase()) return row;
    const out = { ...row };
    if (out.image_url) out.image_url = toPublicUploadUrl(out.image_url);
    if (out.menu_url) out.menu_url = toPublicUploadUrl(out.menu_url);
    if (out.map_url && String(out.map_url).trim().startsWith('/uploads/')) {
        out.map_url = toPublicUploadUrl(out.map_url);
    }
    if (out.image_gallery) {
        try {
            const arr = JSON.parse(out.image_gallery);
            if (Array.isArray(arr)) {
                out.image_gallery = JSON.stringify(
                    arr.map((u) => (u != null ? toPublicUploadUrl(String(u)) : u))
                );
            }
        } catch (_) {}
    }
    return out;
}

function applyPublicUploadUrlsToCategory(row) {
    if (!row || typeof row !== 'object') return row;
    if (!getUploadsPublicBase()) return row;
    const out = { ...row };
    if (out.icon_image) out.icon_image = toPublicUploadUrl(out.icon_image);
    return out;
}

module.exports = {
    INIINI_UPLOADS_HTTP_BASE,
    getUploadsPublicBase,
    isIniiniKioskUploadUrl,
    iniiniKioskUploadToHttp,
    buildOriginUploadUrl,
    toPublicUploadUrl,
    applyPublicUploadUrlsToRestaurant,
    applyPublicUploadUrlsToCategory,
};
