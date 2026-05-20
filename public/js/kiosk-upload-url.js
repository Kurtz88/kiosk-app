/**
 * /uploads/… → https://dgbukfood.co.kr/uploads/… (app.js · admin.html 공통)
 */
(function (global) {
    const KIOSK_UPLOADS_PUBLIC_BASE = 'https://dgbukfood.co.kr/uploads';
    const LEGACY_INIINI_UPLOAD_PREFIX_RE = /^https?:\/\/(?:www\.)?iniini\.co\.kr\/kiosk\/uploads\/?/i;

    function migrateLegacyUploadUrl(urlStr) {
        return String(urlStr || '').replace(
            LEGACY_INIINI_UPLOAD_PREFIX_RE,
            KIOSK_UPLOADS_PUBLIC_BASE.replace(/\/+$/, '') + '/'
        );
    }

    function isPublicUploadUrl(urlStr) {
        try {
            const u = new URL(String(urlStr).trim());
            if (/(^|\.)dgbukfood\.co\.kr$/i.test(u.hostname) && /\/uploads(\/|$)/i.test(u.pathname)) {
                return true;
            }
            return LEGACY_INIINI_UPLOAD_PREFIX_RE.test(u.href);
        } catch {
            return false;
        }
    }

    function encodeKioskUploadPathSegment(seg) {
        if (!seg) return seg;
        try {
            return encodeURIComponent(decodeURIComponent(String(seg)));
        } catch {
            return encodeURIComponent(String(seg));
        }
    }

    function kioskUploadRelToPublicUrl(relPath) {
        const encoded = String(relPath || '')
            .split('/')
            .filter((seg) => seg.length > 0)
            .map((seg) => encodeKioskUploadPathSegment(seg))
            .join('/');
        if (!encoded) return '';
        return KIOSK_UPLOADS_PUBLIC_BASE.replace(/\/+$/, '') + '/' + encoded;
    }

    function resolveKioskImageUrl(raw) {
        let s = raw != null ? String(raw).trim() : '';
        if (!s || s.startsWith('data:')) return s;
        s = migrateLegacyUploadUrl(s);
        if (s.startsWith('/api/uploads-proxy/')) {
            return kioskUploadRelToPublicUrl(s.slice('/api/uploads-proxy/'.length));
        }
        if (s.startsWith('/uploads/')) {
            return kioskUploadRelToPublicUrl(s.slice('/uploads/'.length));
        }
        if (!/^https?:\/\//i.test(s)) return s;
        if (isPublicUploadUrl(s)) {
            try {
                const u = new URL(s);
                const basePath = '/uploads';
                let rel = u.pathname;
                if (rel.startsWith(basePath)) rel = rel.slice(basePath.length);
                rel = rel.replace(/^\//, '');
                if (rel) return kioskUploadRelToPublicUrl(rel);
                return u.href;
            } catch {
                return migrateLegacyUploadUrl(s);
            }
        }
        try {
            const u = new URL(s);
            u.pathname = u.pathname
                .split('/')
                .map((seg) => {
                    if (!seg) return seg;
                    try {
                        return encodeURIComponent(decodeURIComponent(seg));
                    } catch {
                        return encodeURIComponent(seg);
                    }
                })
                .join('/');
            return u.href;
        } catch {
            return encodeURI(s);
        }
    }

    function normalizeRestaurantMediaUrls(item) {
        if (!item || typeof item !== 'object') return item;
        const out = { ...item };
        if (out.image_url) out.image_url = resolveKioskImageUrl(out.image_url);
        if (out.menu_url) out.menu_url = resolveKioskImageUrl(out.menu_url);
        if (out.map_url && String(out.map_url).trim().startsWith('/uploads/')) {
            out.map_url = resolveKioskImageUrl(out.map_url);
        }
        if (out.image_gallery) {
            try {
                const arr = JSON.parse(out.image_gallery);
                if (Array.isArray(arr)) {
                    out.image_gallery = JSON.stringify(
                        arr.map((u) => (u != null ? resolveKioskImageUrl(String(u)) : u))
                    );
                }
            } catch (_) {}
        }
        return out;
    }

    global.KIOSK_UPLOAD_URL = {
        KIOSK_UPLOADS_PUBLIC_BASE,
        resolveKioskImageUrl,
        normalizeRestaurantMediaUrls,
        migrateLegacyUploadUrl,
    };
    global.resolveKioskImageUrl = resolveKioskImageUrl;
    global.normalizeRestaurantMediaUrls = normalizeRestaurantMediaUrls;
})(typeof window !== 'undefined' ? window : global);
