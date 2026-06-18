/**
 * DB의 /uploads/… → https://dalseongfood.go.kr/uploads/… 직접 (API 프록시 없음)
 * 로컬 public/uploads만 쓸 때: KIOSK_UPLOADS_BASE_URL=0
 */
const DEFAULT_UPLOADS_PUBLIC_BASE = 'https://dalseongfood.go.kr/uploads';

/** 예전 iniini · dgbukfood 경로 → 새 호스트로 치환 */
const LEGACY_INIINI_UPLOAD_PREFIX_RE = /^https?:\/\/(?:www\.)?iniini\.co\.kr\/kiosk\/uploads\/?/i;
const LEGACY_DGBUKFOOD_UPLOAD_PREFIX_RE = /^https?:\/\/(?:www\.)?dgbukfood\.co\.kr\/uploads\/?/i;

function getUploadsPublicBase() {
    const raw = process.env.KIOSK_UPLOADS_BASE_URL;
    if (raw === '0' || raw === 'false' || raw === 'off') return '';
    const base = (raw != null && String(raw).trim() !== ''
        ? String(raw).trim()
        : DEFAULT_UPLOADS_PUBLIC_BASE
    ).replace(/\/+$/, '');
    return base;
}

function migrateLegacyUploadUrl(urlStr) {
    const base = (getUploadsPublicBase() || DEFAULT_UPLOADS_PUBLIC_BASE).replace(/\/+$/, '') + '/';
    return String(urlStr || '')
        .replace(LEGACY_INIINI_UPLOAD_PREFIX_RE, base)
        .replace(LEGACY_DGBUKFOOD_UPLOAD_PREFIX_RE, base);
}

function isPublicUploadUrl(urlStr) {
    try {
        const u = new URL(String(urlStr).trim());
        const base = getUploadsPublicBase() || DEFAULT_UPLOADS_PUBLIC_BASE;
        const baseU = new URL(base.endsWith('/') ? base : base + '/');
        if (u.hostname === baseU.hostname) {
            const basePath = baseU.pathname.replace(/\/$/, '') || '';
            return !basePath || u.pathname.startsWith(basePath);
        }
        return LEGACY_INIINI_UPLOAD_PREFIX_RE.test(u.href) || LEGACY_DGBUKFOOD_UPLOAD_PREFIX_RE.test(u.href);
    } catch {
        return false;
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

/** /uploads/a.jpg · https://dalseongfood…/uploads/a.jpg → 상대 경로 a.jpg */
function extractUploadRelFromStored(stored) {
    let s = migrateLegacyUploadUrl(String(stored || '').trim());
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

function toClientUploadUrl(encodedRel) {
    if (!encodedRel) return '';
    const base = getUploadsPublicBase();
    return base ? base + '/' + encodedRel : '/uploads/' + encodedRel;
}

function buildOriginUploadUrl(encodedRel) {
    const base = getUploadsPublicBase();
    if (!base || !encodedRel) return '';
    return base.replace(/\/+$/, '') + '/' + encodedRel;
}

function normalizeAbsoluteUploadUrl(urlStr) {
    const rel = extractUploadRelFromStored(urlStr);
    if (rel != null) {
        const encoded = encodeUploadRelPath(rel);
        if (encoded) return toClientUploadUrl(encoded);
    }
    try {
        const u = new URL(migrateLegacyUploadUrl(urlStr));
        u.pathname = u.pathname
            .split('/')
            .map((seg) => (seg ? encodeUploadPathSegment(seg) : seg))
            .join('/');
        return u.href;
    } catch {
        return migrateLegacyUploadUrl(urlStr);
    }
}

function toPublicUploadUrl(stored) {
    if (stored == null) return stored;
    let s = migrateLegacyUploadUrl(String(stored).trim());
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
    const out = { ...row };
    const base = getUploadsPublicBase();
    if (!base) {
        if (out.image_url) out.image_url = toPublicUploadUrl(out.image_url);
        if (out.menu_url) out.menu_url = toPublicUploadUrl(out.menu_url);
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
    const out = { ...row };
    if (out.icon_image) out.icon_image = toPublicUploadUrl(out.icon_image);
    return out;
}

module.exports = {
    DEFAULT_UPLOADS_PUBLIC_BASE,
    getUploadsPublicBase,
    migrateLegacyUploadUrl,
    isPublicUploadUrl,
    buildOriginUploadUrl,
    toPublicUploadUrl,
    applyPublicUploadUrlsToRestaurant,
    applyPublicUploadUrlsToCategory,
};
