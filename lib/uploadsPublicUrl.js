/**
 * DB의 /uploads/… → http://iniini.co.kr/kiosk/uploads/… 직접 URL (기본)
 * 끄기(로컬 public/uploads만): KIOSK_UPLOADS_BASE_URL=0
 * HTTPS(Vercel)에서 http 이미지가 막히면: KIOSK_UPLOADS_USE_PROXY=1 → /api/uploads-proxy/…
 */
function getUploadsPublicBase() {
    const raw = process.env.KIOSK_UPLOADS_BASE_URL;
    if (raw === '0' || raw === 'false' || raw === 'off') return '';
    const base = (raw != null && String(raw).trim() !== ''
        ? String(raw).trim()
        : 'http://iniini.co.kr/kiosk/uploads'
    ).replace(/\/+$/, '');
    return base;
}

/** true 일 때만 /api/uploads-proxy (기본은 iniini URL 직접) */
function shouldUseUploadsProxy() {
    return process.env.KIOSK_UPLOADS_USE_PROXY === '1';
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

/** 브라우저에 줄 URL (프록시 또는 https 직접) */
function toClientUploadUrl(encodedRel) {
    if (!encodedRel) return '';
    if (shouldUseUploadsProxy()) return '/api/uploads-proxy/' + encodedRel;
    const base = getUploadsPublicBase();
    return base ? base + '/' + encodedRel : '/' + encodedRel;
}

/** 서버가 iniini에서 가져올 절대 URL */
function buildOriginUploadUrl(encodedRel) {
    const base = getUploadsPublicBase();
    if (!base || !encodedRel) return '';
    return base.replace(/\/+$/, '') + '/' + encodedRel;
}

/** 절대 https URL pathname 정규화 (외부 https용) */
function normalizeAbsoluteUploadUrl(urlStr) {
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

/** /uploads/foo.jpg → 클라이언트용 URL (프록시 또는 http(s) 직접) */
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
    getUploadsPublicBase,
    shouldUseUploadsProxy,
    buildOriginUploadUrl,
    toPublicUploadUrl,
    applyPublicUploadUrlsToRestaurant,
    applyPublicUploadUrlsToCategory,
};
