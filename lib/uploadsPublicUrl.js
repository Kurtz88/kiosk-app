/**
 * 임시: DB의 /uploads/… 경로를 외부 호스팅 URL로 변환 (API 응답용, DB 저장값은 그대로)
 * 끄기: KIOSK_UPLOADS_BASE_URL=0
 * 변경: KIOSK_UPLOADS_BASE_URL=http://iniini.co.kr/kiosk/uploads
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

/** 경로 한 segment — 기본은 UTF-8 퍼센트 인코딩(공백·한글). iniini가 한글 파일명 그대로만 받으면 KIOSK_UPLOADS_RAW_UTF8=1 */
function encodeUploadPathSegment(seg) {
    const rawUtf8 = process.env.KIOSK_UPLOADS_RAW_UTF8 === '1' || process.env.KIOSK_UPLOADS_RAW_UTF8 === 'true';
    if (rawUtf8) return String(seg).replace(/ /g, '%20');
    try {
        return encodeURIComponent(decodeURIComponent(String(seg)));
    } catch {
        return encodeURIComponent(String(seg));
    }
}

/** 절대 URL pathname 재인코딩 (이미 한글이 들어온 URL 정규화) */
function normalizeAbsoluteUploadUrl(urlStr) {
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

/** /uploads/foo.jpg → http://…/kiosk/uploads/foo.jpg (이미 절대 URL이면 pathname만 정규화) */
function toPublicUploadUrl(stored) {
    if (stored == null) return stored;
    const s = String(stored).trim();
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return normalizeAbsoluteUploadUrl(s);
    const base = getUploadsPublicBase();
    if (!base) return s;
    let rel = s;
    if (rel.startsWith('/uploads/')) rel = rel.slice('/uploads/'.length);
    else if (rel.startsWith('uploads/')) rel = rel.slice('uploads/'.length);
    else return s;
    const encoded = rel
        .split('/')
        .filter((seg) => seg.length > 0)
        .map((seg) => encodeUploadPathSegment(seg))
        .join('/');
    return encoded ? base + '/' + encoded : base;
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
    toPublicUploadUrl,
    applyPublicUploadUrlsToRestaurant,
    applyPublicUploadUrlsToCategory,
};
