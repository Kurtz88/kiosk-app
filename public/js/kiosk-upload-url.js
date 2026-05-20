/**
 * iniini /kiosk/uploads 이미지 URL — 항상 http (https는 SSL 미지원)
 * app.js · admin.html 공통
 */
(function (global) {
    const INIINI_UPLOADS_HTTP_BASE = 'http://iniini.co.kr/kiosk/uploads';

    function forceIniiniUploadHttp(urlStr) {
        return String(urlStr || '').replace(
            /^https:\/\/((?:www\.)?iniini\.co\.kr\/kiosk\/uploads)/gi,
            'http://$1'
        );
    }

    function isIniiniKioskUploadUrl(urlStr) {
        try {
            const u = new URL(String(urlStr).trim());
            return /(^|\.)iniini\.co\.kr$/i.test(u.hostname) && /\/kiosk\/uploads(\/|$)/i.test(u.pathname);
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

    function kioskUploadRelToIniiniUrl(relPath) {
        const encoded = String(relPath || '')
            .split('/')
            .filter((seg) => seg.length > 0)
            .map((seg) => encodeKioskUploadPathSegment(seg))
            .join('/');
        if (!encoded) return '';
        return INIINI_UPLOADS_HTTP_BASE.replace(/\/+$/, '') + '/' + encoded;
    }

    function resolveKioskImageUrl(raw) {
        let s = raw != null ? String(raw).trim() : '';
        if (!s || s.startsWith('data:')) return s;
        s = forceIniiniUploadHttp(s);
        if (s.startsWith('/api/uploads-proxy/')) {
            return kioskUploadRelToIniiniUrl(s.slice('/api/uploads-proxy/'.length));
        }
        if (s.startsWith('/uploads/')) {
            return kioskUploadRelToIniiniUrl(s.slice('/uploads/'.length));
        }
        if (!/^https?:\/\//i.test(s)) return s;
        if (isIniiniKioskUploadUrl(s)) {
            try {
                const u = new URL(s);
                const rel = u.pathname.replace(/^\/kiosk\/uploads\/?/i, '');
                if (rel) return kioskUploadRelToIniiniUrl(rel);
                u.protocol = 'http:';
                return u.href;
            } catch {
                return forceIniiniUploadHttp(s);
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
            return forceIniiniUploadHttp(u.href);
        } catch {
            return forceIniiniUploadHttp(encodeURI(s));
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
        INIINI_UPLOADS_HTTP_BASE,
        resolveKioskImageUrl,
        normalizeRestaurantMediaUrls,
        forceIniiniUploadHttp,
    };
    global.resolveKioskImageUrl = resolveKioskImageUrl;
    global.normalizeRestaurantMediaUrls = normalizeRestaurantMediaUrls;
})(typeof window !== 'undefined' ? window : global);
