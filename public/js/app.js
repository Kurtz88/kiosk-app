/**
 * 키오스크 프론트 (index.html 홈 / list.html 목록·상세 / map.html 지도)
 * - API: /api/restaurants, /api/categories, /api/qrcode
 * - 홈: 종류 카드 그리드 → list.html 로 이동
 * - 목록: 필터·검색(결과 전체 한 번에 표시), 행 클릭 시 상세 모달
 * - UI 문구·모달 SVG: js/kiosk/kiosk-i18n.js (window.KIOSK_I18N) — 반드시 이 파일보다 먼저 로드
 */

// =============================================================================
// 설정
// =============================================================================

/** QR → 네이버지도앱 nmap: 길찾기에 필요한 appname(문서 권장) */
const NAVER_MAP_QR_APPNAME = 'kiosk-naver-route';
/** 손님 화면(index·목록·지도): 입력 없을 때 이 시간 후 index.html 로 이동 */
const KIOSK_IDLE_MS_TO_HOME = 60 * 1000;

// =============================================================================
// 터치 민감도 조절 (스크롤 중 실수 클릭 방지)
// =============================================================================
/** 터치 이동 거리가 이 픽셀 이상이면 클릭으로 인식하지 않음 (스크롤로 간주) */
const TOUCH_MOVE_THRESHOLD = 15;
/** 터치 시작 후 이 시간(ms) 이상 지나야 클릭으로 인식 (0이면 비활성화) */
const TOUCH_HOLD_MIN_MS = 0;

let _touchStartX = 0;
let _touchStartY = 0;
let _touchStartTime = 0;
let _touchMoved = false;

function initTouchSensitivity() {
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            _touchStartX = e.touches[0].clientX;
            _touchStartY = e.touches[0].clientY;
            _touchStartTime = Date.now();
            _touchMoved = false;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            const dx = Math.abs(e.touches[0].clientX - _touchStartX);
            const dy = Math.abs(e.touches[0].clientY - _touchStartY);
            if (dx > TOUCH_MOVE_THRESHOLD || dy > TOUCH_MOVE_THRESHOLD) {
                _touchMoved = true;
            }
        }
    }, { passive: true });
}

/** 클릭/탭 이벤트가 스크롤 동작이었는지 확인 (true면 무시해야 함) */
function wasTouchScroll() {
    if (_touchMoved) return true;
    if (TOUCH_HOLD_MIN_MS > 0 && (Date.now() - _touchStartTime) < TOUCH_HOLD_MIN_MS) return true;
    return false;
}

// 페이지 로드 시 터치 민감도 초기화
if ('ontouchstart' in window) {
    initTouchSensitivity();
}

// =============================================================================
// 네이버지도앱: 내 위치(출발 기본) → 식당 목적지(도보)
// - 식당에 dest_lat, dest_lng(WGS84)가 있을 때만 nmap:// 사용, 없으면 모바일 웹 검색 URL
// =============================================================================

function hasDestCoordsForNaver(item) {
    if (!item) return false;
    if (item.dest_lat == null || item.dest_lng == null) return false;
    const la = Number(item.dest_lat);
    const ln = Number(item.dest_lng);
    return Number.isFinite(la) && Number.isFinite(ln);
}

function hasNaverPlaceId(item) {
    if (!item) return false;
    const pid = (item.naver_place_id || '').replace(/\D/g, '');
    return pid.length > 0;
}

function normalizeCustomNaverRouteUrl(raw) {
    let s = raw != null ? String(raw).trim() : '';
    if (!s) return '';
    if (s.startsWith('//')) return 'https:' + s;
    if (/^www\./i.test(s)) return 'https://' + s;
    if (
        !/^[a-z][a-z0-9+.-]*:\/\//i.test(s) &&
        /^(?:m\.)?(?:map\.naver\.com|n\.map\.naver\.com|m\.place\.naver\.com)\//i.test(s)
    ) {
        return 'https://' + s;
    }
    if (/^\/naver-route(\?|$)/i.test(s)) return window.location.origin + s;
    if (/^(https?:\/\/|nmap:\/\/|intent:\/\/)/i.test(s)) return s;
    return s;
}

function hasCustomNaverRouteUrl(item) {
    if (!item) return false;
    return normalizeCustomNaverRouteUrl(item.naver_place_url).length > 0;
}

function buildNaverRouteUrl(item) {
    const dname = encodeURIComponent((item.name || '목적지').trim() || '목적지');

    // 0순위: 관리자에 직접 입력한 길찾기 링크
    if (hasCustomNaverRouteUrl(item)) {
        return normalizeCustomNaverRouteUrl(item.naver_place_url);
    }

    // 1순위: 네이버 장소 ID(did)가 있으면 플레이스로 바로 연결
    if (hasNaverPlaceId(item)) {
        const did = (item.naver_place_id || '').replace(/\D/g, '');
        return window.location.origin + '/naver-route?did=' + did + '&name=' + dname;
    }

    // 2순위: 좌표가 있으면 좌표 기반 길찾기
    if (hasDestCoordsForNaver(item)) {
        const dlat = Number(item.dest_lat);
        const dlng = Number(item.dest_lng);
        return window.location.origin + '/naver-route?lat=' + dlat + '&lng=' + dlng + '&name=' + dname;
    }

    // 3순위: 이름만으로 검색
    return window.location.origin + '/naver-route?name=' + dname;
}

// =============================================================================
// 페이지 구분 · 전역 상태
// =============================================================================

/** true = index.html(홈), false = list.html(목록) — data-kiosk-page 로 판별 */
const IS_HOME = document.documentElement.dataset.kioskPage === 'home';
/** public/list.html — 목록·검색 */
const IS_LIST = document.documentElement.dataset.kioskPage === 'list';
/** public/map.html — 지도 슬롯 → 식당 목록 */
const IS_MAP = document.documentElement.dataset.kioskPage === 'map';

/** GET /api/map-slot-assignments 결과 캐시 */
let mapSlotAssignments = {};
let mapSelectedSlot = null;

/** 슬롯 항목: 레거시 숫자 또는 { id, floor?, unit? } */
function normalizeMapSlotEntry(e) {
    if (e == null) return null;
    if (typeof e === 'number' && Number.isFinite(e)) return { id: e, floor: '', unit: '' };
    if (typeof e === 'string' && e.trim() !== '') {
        const n = parseInt(e, 10);
        return Number.isNaN(n) ? null : { id: n, floor: '', unit: '' };
    }
    if (typeof e === 'object' && e.id != null) {
        const id = parseInt(e.id, 10);
        if (Number.isNaN(id)) return null;
        return {
            id,
            floor: e.floor != null ? String(e.floor).trim() : '',
            unit: e.unit != null ? String(e.unit).trim() : ''
        };
    }
    return null;
}

function mapSlotRestaurantIds(arr) {
    if (!Array.isArray(arr)) return [];
    const ids = [];
    for (const e of arr) {
        const o = normalizeMapSlotEntry(e);
        if (o) ids.push(o.id);
    }
    return ids;
}

function mapSlotMetaById(arr) {
    const map = {};
    if (!Array.isArray(arr)) return map;
    for (const e of arr) {
        const o = normalizeMapSlotEntry(e);
        if (o) map[o.id] = { floor: o.floor, unit: o.unit };
    }
    return map;
}

/** 홈 터치 자판: 자모 누적 버퍼 → Hangul.js assemble 로 완성형 표시 */
let homeKeyboardBuffer = '';

function hangulAssembleFromBuffer(raw) {
    if (!raw) return '';
    if (typeof Hangul !== 'undefined' && typeof Hangul.assemble === 'function') {
        try {
            return Hangul.assemble(raw);
        } catch (_) {
            return raw;
        }
    }
    return raw;
}

function syncHomeKeyboardBufferFromInput(inputEl) {
    if (!inputEl) return;
    const v = inputEl.value;
    if (!v) {
        homeKeyboardBuffer = '';
        return;
    }
    if (typeof Hangul !== 'undefined' && typeof Hangul.disassemble === 'function') {
        try {
            const arr = Hangul.disassemble(v);
            homeKeyboardBuffer = Array.isArray(arr) ? arr.join('') : '';
        } catch (_) {
            homeKeyboardBuffer = v;
        }
    } else {
        homeKeyboardBuffer = v;
    }
    inputEl.value = hangulAssembleFromBuffer(homeKeyboardBuffer);
}

function resetHomeKeyboardBuffer(inputEl) {
    homeKeyboardBuffer = '';
    if (inputEl) inputEl.value = '';
}

/** list.html: 터치 자판 버퍼 → #searchInput 반영 + 필터 */
function syncListSearchFromKeyboardBuffer() {
    const si = document.getElementById('searchInput');
    if (!si) return;
    const composed = hangulAssembleFromBuffer(homeKeyboardBuffer);
    si.value = composed;
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.classList.toggle('active', composed.length > 0);
    applyFilters();
}

let allRestaurants = [];
/** list.html 에 검색 input 이 없을 때 URL ?q= 로 넘어온 검색어 */
let searchQueryFromUrl = '';
let categoriesCache = [];
let subcategoriesCache = [];
/** normalizeKey(alias) → categories.value (한글·영문 표기와 DB 저장값 통일) */
let categoryAliasToValue = new Map();
let currentCategory = 'all';
let currentSubcategory = 'all';
/** applyFilters 이후 목록에 쓸 식당 배열(순서 셔플됨) */
let currentFilteredList = [];

// =============================================================================
// 네트워크 · 문자열 유틸
// =============================================================================

/** JSON API용 fetch — HTML이 오면(파일 직접 열기 등) 안내 메시지 */
function fetchJson(url, init) {
    return fetch(url, init).then(async (res) => {
        const text = await res.text();
        let data;
        try {
            data = text.length ? JSON.parse(text) : {};
        } catch (parseErr) {
            const looksHtml = /^\s*<(!DOCTYPE|html)/i.test(text || '');
            throw new Error(
                looksHtml
                    ? 'API 대신 HTML이 왔습니다. npm start 실행 후 http://localhost:3000/ 로 접속해 주세요.'
                    : 'JSON 파싱 오류: ' + (parseErr.message || '')
            );
        }
        return data;
    });
}

/** HTML 삽입 시 XSS 방지 */
function escapeHtml(s) {
    if (s == null || s === '') return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** img src 등 속성용 — URL은 escapeHtml 대신 사용 (& 깨짐 방지) */
function escapeAttr(s) {
    if (s == null || s === '') return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** resolveKioskImageUrl · normalizeRestaurantMediaUrls → js/kiosk-upload-url.js */

function normalizeRestaurantsFromApi(list) {
    if (!Array.isArray(list)) return [];
    return list.map((r) => normalizeRestaurantMediaUrls(r));
}

/** 오늘 날짜(로컬) 기준 키: 같은 날에는 동일 */
function dailySeedKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** 문자열 -> 32bit 해시(FNV-1a) */
function hash32FNV1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** 하루 기준 고정 랜덤 순서 (날짜 바뀌면 재배치) */
function dailyStableShuffle(list) {
    const seed = dailySeedKey();
    return [...list].sort((a, b) => {
        const aId = a && a.id != null ? String(a.id) : String(a && a.name ? a.name : '');
        const bId = b && b.id != null ? String(b.id) : String(b && b.name ? b.name : '');
        const ah = hash32FNV1a(seed + '|' + aId);
        const bh = hash32FNV1a(seed + '|' + bId);
        if (ah !== bh) return ah - bh;
        return String(a && a.name ? a.name : '').localeCompare(String(b && b.name ? b.name : ''), 'ko');
    });
}

// =============================================================================
// list.html URL ↔ 필터 상태 (cat / sub / q)
// =============================================================================

/** 진입 시 URL 쿼리를 읽어 currentCategory 등과 검색창에 반영 */
function readListUrlState() {
    const p = new URLSearchParams(location.search);
    let cat = p.get('cat') || 'all';
    let sub = p.get('sub') || 'all';
    const q = p.get('q') || '';
    searchQueryFromUrl = q;
    if (cat !== 'all' && !categoriesCache.some((c) => c.value === cat)) cat = 'all';
    if (cat === 'all') sub = 'all';
    currentCategory = cat;
    const subs = subcategoriesCache.filter((s) => s.category_value === currentCategory);
    if (sub !== 'all' && !subs.some((s) => s.value === sub)) sub = 'all';
    currentSubcategory = sub;
    const si = document.getElementById('searchInput');
    if (si) si.value = q;
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.classList.toggle('active', q.length > 0);
}

/** 필터·검색 변경 시 주소창을 /list.html?cat=…&sub=…&q=… 로 맞춤 */
function syncUrlToState() {
    if (IS_HOME || IS_MAP) return;
    const p = new URLSearchParams();
    if (currentCategory !== 'all') p.set('cat', currentCategory);
    const qEl = document.getElementById('searchInput');
    const q = qEl ? qEl.value.trim() : searchQueryFromUrl;
    if (q) p.set('q', q);
    const qs = p.toString();
    const url = qs ? '/list.html?' + qs : '/list.html';
    history.replaceState({}, '', url);
}

// =============================================================================
// 자주 쓰는 DOM 참조
// =============================================================================

const overlay = document.getElementById('modal-overlay');
const restaurantListEl = document.getElementById('restaurant-list');

// =============================================================================
// 카테고리 카드 · 목록 뱃지 · 아이콘 경로
// =============================================================================

function normalizeCategoryAliasKey(s) {
    return String(s ?? '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/_/g, '')
        .toLowerCase();
}

function rebuildCategoryAliasMap(categories) {
    const m = new Map();
    for (const c of categories || []) {
        const value = c && c.value != null ? String(c.value).trim() : '';
        if (!value) continue;
        m.set(normalizeCategoryAliasKey(value), value);
        const lk = c.label_ko != null ? String(c.label_ko).trim() : '';
        if (lk) m.set(normalizeCategoryAliasKey(lk), value);
        const le = c.label_en != null ? String(c.label_en).trim() : '';
        if (le) m.set(normalizeCategoryAliasKey(le), value);
        const lsk = c.label_sub_ko != null ? String(c.label_sub_ko).trim() : '';
        if (lsk) m.set(normalizeCategoryAliasKey(lsk), value);
    }
    categoryAliasToValue = m;
}

function resolveCategoryTokenToValue(token) {
    const raw = String(token || '').trim();
    if (!raw) return '';
    const hit = categoryAliasToValue.get(normalizeCategoryAliasKey(raw));
    return hit != null ? hit : raw;
}

/** 식당 category 컬럼 — 쉼표로 저장된 다중 1차 분류. 한글·영문 표기는 API categories와 매칭해 저장값으로 통일 */
function restaurantCategoryValues(item) {
    const parts = parseCommaSeparatedList(item && item.category);
    const seen = new Set();
    const out = [];
    for (const p of parts) {
        const canon = resolveCategoryTokenToValue(p);
        if (!canon) continue;
        if (!seen.has(canon)) {
            seen.add(canon);
            out.push(canon);
        }
    }
    return out;
}

function restaurantHasPrimaryCategory(item, catValue) {
    if (!catValue || catValue === 'all') return true;
    return restaurantCategoryValues(item).includes(catValue);
}

function countRestaurantsInCategory(value) {
    return allRestaurants.filter((r) => restaurantHasPrimaryCategory(r, value)).length;
}

/** 쉼표 구분 문자열 → 트림된 항목 배열 */
function parseCommaSeparatedList(raw) {
    if (!raw || !String(raw).trim()) return [];
    return String(raw)
        .split(/[,，]/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
}

function primaryCategorySlug(raw) {
    const list = parseCommaSeparatedList(raw);
    if (list.length) return resolveCategoryTokenToValue(list[0]) || list[0];
    return String(raw || '');
}

/** 뱃지 색 등 — 첫 1차 카테고리 저장값 */
function primaryCanonicalCategoryForItem(item) {
    const vals = restaurantCategoryValues(item);
    if (vals.length) return vals[0];
    return primaryCategorySlug(item && item.category);
}

/** 식당 category 값으로 목록 우측 cat-badge 색상 클래스 결정 */
function badgeClassForCategory(catValue) {
    const keys = ['bd01', 'bd02', 'bd03', 'bd04', 'bd05'];
    const s = String(primaryCategorySlug(catValue) || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h += s.charCodeAt(i);
    return keys[h % keys.length];
}

/** 종류 카드 배경 bg01~bg12 순환 */
function bgClassForTabIndex(i) {
    const n = (i % 12) + 1;
    return 'bg' + String(n).padStart(2, '0');
}

/** 정적 경로: public/img → URL 은 /img/… (절대 /public/ 붙이지 않음) */
function iniconSrcFromTabIndex(i) {
    const n = (i % 12) + 1;
    return '/img/inicon' + String(n).padStart(2, '0') + '.png';
}

/** 관리자 등록 icon_image 가 있으면 사용, 없으면 inicon 슬롯 */
function categoryCardIconSrc(cat, idx) {
    const raw = cat.icon_image != null ? String(cat.icon_image).trim() : '';
    if (raw) {
        if (raw.startsWith('http://') || raw.startsWith('https://')) return resolveKioskImageUrl(raw);
        if (raw.startsWith('/')) return raw;
        return '/' + raw.replace(/^\//, '');
    }
    return iniconSrcFromTabIndex(idx + 1);
}

/** 홈에서 종류 카드 클릭 시 이동할 목록 URL (?cat=) */
function listUrlForCat(cat) {
    return '/list.html?cat=' + encodeURIComponent(cat);
}

// =============================================================================
// 화면 문구 · 모달 SVG — js/kiosk/kiosk-i18n.js (window.KIOSK_I18N)
// =============================================================================

const _kioskI18n = window.KIOSK_I18N;
if (!_kioskI18n || !_kioskI18n.dict || !_kioskI18n.MODAL_SVG) {
    throw new Error('kiosk-i18n.js를 app.js보다 먼저 로드하세요. (window.KIOSK_I18N)');
}
const { dict, MODAL_SVG } = _kioskI18n;

/** 목록 행: MODAL_SVG는 class="size-6"(Tailwind)인데 키오스크에는 Tailwind 없음 → 고정 크기 클래스로 치환 */
function svgForListRow(svgHtml) {
    return svgHtml.replace('class="size-6"', 'class="list-inline-inicon"');
}

// =============================================================================
// 터치 자판 마크업 (public/partials/keyboard-modal.html 단일 유지)
// =============================================================================

const KEYBOARD_PARTIAL_URL = '/partials/keyboard-modal.html?v=202604105000';

async function injectKioskKeyboardModal() {
    const mount = document.getElementById('keyboard-modal-mount');
    if (document.getElementById('keyboardModal')) {
        if (mount) mount.remove();
        return;
    }
    if (!mount) return;
    const aria = mount.getAttribute('data-kiosk-input-aria-label') || '검색어';
    try {
        const res = await fetch(KEYBOARD_PARTIAL_URL);
        if (!res.ok) throw new Error(res.statusText);
        const html = (await res.text()).trim();
        mount.outerHTML = html;
        const ki = document.getElementById('kioskInput');
        if (ki) ki.setAttribute('aria-label', aria);
    } catch (err) {
        console.error('keyboard-modal partial:', err);
        mount.remove();
    }
}

// =============================================================================
// 진입 시 공통 초기화
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    if (IS_MAP) {
        loadMapPage();
        return;
    }
    await injectKioskKeyboardModal();
    loadKioskData();
    setupSearch();
    if (IS_HOME || IS_LIST) setupKioskKeyboardModal();
    if (IS_LIST) setupInfoReportModal();
    setupCategoryTabsDelegation();
    setupSubcategoryTabsDelegation();
    setupIdleTimer();
    setupKioskClock();
    setupHeaderNav();
    setupFooterTabs();
});

// =============================================================================
// 카테고리 표시명 (API label_ko)
// =============================================================================

function tabLabelFor(cat) {
    return cat.label_ko || '';
}

function categoryDisplayLabel(item) {
    const vals = restaurantCategoryValues(item);
    if (vals.length === 0) return item.category || '';
    const labels = vals.map((v) => {
        const row = categoriesCache.find((c) => c.value === v);
        return row ? row.label_ko || v : v;
    });
    return labels.join(', ');
}

/** list.html 상단 히어로(moon_st): 카테고리 대표 아이콘 + 「OOO 음식점 안내」 */
function updateListHero() {
    if (IS_HOME) return;
    const iconEl = document.getElementById('listHeroIcon');
    const titleEl = document.getElementById('listHeroTitle');
    if (!iconEl || !titleEl) return;
    let label = '전체';
    let src = iniconSrcFromTabIndex(3);
    if (currentCategory !== 'all') {
        const idx = categoriesCache.findIndex((c) => c.value === currentCategory);
        const row = idx >= 0 ? categoriesCache[idx] : null;
        if (row) {
            label = row.label_ko || row.value || currentCategory;
            src = categoryCardIconSrc(row, idx);
        }
    }
    iconEl.src = src;
    titleEl.innerHTML = `<em>${escapeHtml(label)}</em> 음식점 안내`;
}

// =============================================================================
// 종류 탭(1차) · 2차 칩 — 홈은 링크, 목록은 버튼+필터
// =============================================================================

/** index.html 홈 그리드에서만 제외 — 전체 보기 카드는 렌더하지 않음 + 확인필요(pending_review 등) */
function categoryHiddenOnHome(cat) {
    if (!cat) return true;
    const v = String(cat.value || '').toLowerCase();
    const l = String(cat.label_ko || '').trim();
    if (v === 'pending_review') return true;
    if (l === '확인필요' || l.includes('확인필요')) return true;
    return false;
}

function renderCategoryTabs() {
    const el = document.getElementById('categoryTabs');
    if (!el) return;
    const saved = currentCategory || 'all';
    el.innerHTML = '';
    const total = allRestaurants.length;

    if (IS_HOME) {
        const homeCats = categoriesCache.filter((c) => !categoryHiddenOnHome(c));
        homeCats.forEach((cat, idx) => {
            const a = document.createElement('a');
            a.href = listUrlForCat(cat.value);
            a.className = 'k-food-card ' + bgClassForTabIndex(idx + 1);
            a.setAttribute('data-cat', cat.value);
            const label = cat.label_ko || cat.value || '';
            const n = countRestaurantsInCategory(cat.value);
            const iconHtml = `<img src="${categoryCardIconSrc(cat, idx)}" alt="" class="k-food-inicon">`;
            a.innerHTML = `<div class="k-food-icon">${iconHtml}</div><div class="k-food-name">${escapeHtml(label)}</div><div class="k-food-pill">${n}곳</div>`;
            el.appendChild(a);
        });
        return;
    }

    if (IS_LIST) {
        const allChip = document.createElement('button');
        allChip.type = 'button';
        allChip.className = 'chip' + (saved === 'all' ? ' on' : '');
        allChip.setAttribute('data-cat', 'all');
        allChip.innerHTML = `${escapeHtml(dict.listCategoryAllChip)} <span class="n">${total}</span>`;
        el.appendChild(allChip);
        categoriesCache.forEach((cat, idx) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'chip' + (saved === cat.value ? ' on' : '');
            b.setAttribute('data-cat', cat.value);
            const label = cat.label_ko || cat.value || '';
            const n = countRestaurantsInCategory(cat.value);
            b.innerHTML = `${escapeHtml(label)} <span class="n">${n}</span>`;
            el.appendChild(b);
        });
        return;
    }

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className =
        'k-food-card k-food-card-all ' +
        bgClassForTabIndex(0) +
        (saved === 'all' ? ' active' : '');
    allBtn.setAttribute('data-cat', 'all');
    allBtn.innerHTML = `<div class="k-food-icon"></div><div class="k-food-name">${escapeHtml(dict.allCat)}</div><div class="k-food-pill">${total}곳</div>`;
    el.appendChild(allBtn);
    categoriesCache.forEach((cat, idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className =
            'k-food-card ' +
            bgClassForTabIndex(idx + 1) +
            (saved === cat.value ? ' active' : '');
        b.setAttribute('data-cat', cat.value);
        const label = cat.label_ko || cat.value || '';
        const n = countRestaurantsInCategory(cat.value);
        const iconHtml = `<img src="${categoryCardIconSrc(cat, idx)}" alt="" class="k-food-inicon">`;
        b.innerHTML = `<div class="k-food-icon">${iconHtml}</div><div class="k-food-name">${escapeHtml(label)}</div><div class="k-food-pill">${n}곳</div>`;
        el.appendChild(b);
    });
}

function renderSubcategoryTabs() {
    const el = document.getElementById('subcategoryTabs');
    if (!el) return;
    el.hidden = true;
    el.innerHTML = '';
    currentSubcategory = 'all';
}

// =============================================================================
// 식당·카테고리 데이터 로드
// =============================================================================

function loadKioskData() {
    if (IS_MAP) return;
    const restP = fetchJson('/api/restaurants');
    const catP = fetchJson('/api/categories').catch(() => ({ data: [] }));
    Promise.all([restP, catP])
        .then(([restData, catData]) => {
            categoriesCache = catData.data || [];
            rebuildCategoryAliasMap(categoriesCache);
            subcategoriesCache = [];
            const rawList = normalizeRestaurantsFromApi(
                Array.isArray(restData.data) ? restData.data : []
            );
            allRestaurants = rawList.filter((r) => !Number(r.kiosk_hidden));
            if (!IS_HOME) readListUrlState();
            updateUILanguage();
            if (IS_HOME) return;
            if (!restaurantListEl) return;
            if (allRestaurants.length === 0) {
                restaurantListEl.innerHTML = `<div class="empty-state">${dict.empty}</div>`;
            } else {
                applyFilters();
            }
        })
        .catch((err) => {
            if (restaurantListEl) {
                restaurantListEl.innerHTML =
                    '<div class="empty-state" style="color:red;">' + (err.message || '서버 통신 실패') + '</div>';
            }
        });
}

function fitMapStage() {
    const designW = 604;
    const designH = 920;
    const stage = document.getElementById('map-stage');
    const app = document.getElementById('map-app2');
    if (!stage || !app) return;
    const sw = Math.max(1, stage.clientWidth);
    const sh = Math.max(1, stage.clientHeight);
    const scale = Math.min(sw / designW, sh / designH);
    /** 설계 크기(604×920)를 스테이지에 맞게 축소·중앙 배치 */
    app.style.transformOrigin = 'top left';
    app.style.transform = 'scale(' + scale + ')';
    const offX = Math.max(0, (sw - designW * scale) / 2);
    const offY = Math.max(0, (sh - designH * scale) / 2);
    app.style.left = offX + 'px';
    app.style.top = offY + 'px';
}

function clearMapSelection() {
    mapSelectedSlot = null;
    closeBuildingFloorModal();
    document.querySelectorAll('#map-wrap2 .bldg.sel').forEach((el) => el.classList.remove('sel'));
    const errEl = document.getElementById('map-load-error');
    if (errEl) {
        errEl.hidden = true;
        errEl.textContent = '';
    }
}

function closeBuildingFloorModal() {
    const el = document.getElementById('modal-building-floors');
    if (el) {
        el.classList.remove('active');
        el.setAttribute('aria-hidden', 'true');
    }
}

/** map_floor 값에서 1~99층 번호 추출 (3F, 3, 3층 등) — 없으면 null */
function mapFloorLevelFromRaw(raw) {
    const s = raw != null ? String(raw).trim() : '';
    if (!s) return null;
    const m = s.match(/^(\d+)/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n) || n < 1) return null;
    return Math.min(99, n);
}

function mapFloorHeadingFromLevel(level) {
    return `${level}F`;
}

/** 주소 문자열에서 층 추출: 지하1층/B1F/2층/2F/101호/1000호 등 */
function extractFloorFromAddressText(addr) {
    const s = String(addr || '').trim();
    if (!s) return '';
    let m = s.match(/지하\s*([0-9]{1,2})\s*층/i);
    if (m) return 'B' + m[1] + 'F';
    m = s.match(/\bB\s*([0-9]{1,2})\s*F\b/i);
    if (m) return 'B' + m[1] + 'F';
    m = s.match(/([0-9]{1,2})\s*층/);
    if (m) return m[1] + 'F';
    m = s.match(/\b([0-9]{1,2})\s*F\b/i);
    if (m) return m[1] + 'F';
    m = s.match(/([1-9][0-9]*)000\s*호\b/);
    if (m) {
        const floorFromThousand = parseInt(m[1], 10);
        if (!Number.isNaN(floorFromThousand) && floorFromThousand >= 1 && floorFromThousand <= 99) {
            return String(floorFromThousand) + 'F';
        }
    }
    m = s.match(/(?:제\s*)?([1-9][0-9]{2,3})\s*호\b/);
    if (m) {
        const unitNum = parseInt(m[1], 10);
        if (!Number.isNaN(unitNum)) {
            const floor = Math.floor(unitNum / 100);
            if (floor >= 1 && floor <= 99) return String(floor) + 'F';
        }
    }
    return '';
}

/** 건물 층별 모달 안내 줄 — moon_st/map.html 과 동일 SVG */
function buildMapBuildingHelperEl() {
    const div = document.createElement('div');
    div.className = 'helper-text';
    div.innerHTML =
        '<svg class="helper-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>' +
        '<path d="M12 8V12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>' +
        '<path d="M12 16H12.01" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    div.appendChild(document.createTextNode(' ' + dict.mapBuildingFloorHint));
    return div;
}

function appendMapFloorShopUnits(shopGrid, items) {
    const sorted = items.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
    sorted.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shop-unit';
        const cat = escapeHtml(categoryDisplayLabel(item));
        const nm = escapeHtml(item.name || '');
        const telRaw = item.phone && String(item.phone).trim();
        const tel = telRaw ? `📱${escapeHtml(telRaw)}` : `📱${escapeHtml(dict.listPlaceholder)}`;
        btn.innerHTML =
            '<span class="icon" aria-hidden="true"><img src="img/inicon06.png" alt=""></span>' +
            `<span class="shop-category">${cat}</span>` +
            `<div class="shop-inner"><span class="name">${nm}</span>` +
            `<p class="tel">${tel}</p></div>`;

        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openModal(item, { nested: true });
        });
        shopGrid.appendChild(btn);
    });
}

/** moon_st building-stack / floor-row 구조 */
function appendMapBuildingFloorRow(stack, floorLabelText, restaurants, emptyMessage) {
    const row = document.createElement('div');
    row.className = 'floor-row';
    const floorNum = document.createElement('div');
    floorNum.className = 'floor-number';
    floorNum.textContent = floorLabelText;
    const shopGrid = document.createElement('div');
    shopGrid.className = 'shop-grid';
    if (!restaurants || restaurants.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-unit';
        empty.textContent = emptyMessage != null ? emptyMessage : dict.mapFloorEmpty;
        shopGrid.appendChild(empty);
    } else {
        appendMapFloorShopUnits(shopGrid, restaurants);
    }
    row.appendChild(floorNum);
    row.appendChild(shopGrid);
    stack.appendChild(row);
}

/** 지도 건물 제목용: 도로명 뒤 ", N층", ", N층 M호" 등 상세(층·호) 접미사 제거 */
function stripAddressFloorDetailSuffixForLabel(raw) {
    let t = String(raw || '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!t) return '';
    const reFloorHo =
        /(?:[,，]|\s)+(?:지하\s*)?\d{1,2}\s*층(?:\s*\d{1,5}\s*호)?\s*$/i;
    let prev;
    do {
        prev = t;
        t = t.replace(reFloorHo, '').replace(/[,，]\s*$/g, '').trim();
    } while (t !== prev);
    t = t.replace(/(?:[,，]|\s)+(?:제\s*)?\d{1,5}\s*호\s*$/i, '').replace(/[,，]\s*$/g, '').trim();
    return t;
}

/** 지도 건물 층별 모달 제목용: 행정구역 제외, 마지막 도로명+번지만 표시 */
function trimToKoreanRoadNameNumberForLabel(raw) {
    const t = String(raw || '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!t) return '';

    // 예: "대구광역시 달성군 유가읍 테크노상업로4길 17-5" → "테크노상업로4길 17-5"
    // 주소 안에 여러 개의 "로/길/대로 + 번지" 패턴이 있을 수 있으므로 마지막 패턴을 사용
    const re = /([^\s,，]+(?:대로|길|로))\s+(\d+(?:-\d+)?)/g;
    let m;
    let last = null;

    while ((m = re.exec(t)) !== null) {
        last = m;
    }

    return last ? (last[1] + ' ' + last[2]).trim() : '';
}

function mapBuildingLabelFromAddress(rawAddress) {
    const roadBase = trimToKoreanRoadNameNumberForLabel(rawAddress);
    if (roadBase) {
        let label = roadBase;
        if (label.length > 48) label = label.slice(0, 48).trim();
        return label;
    }
    const src = stripAddressFloorDetailSuffixForLabel(rawAddress);
    if (!src) return '';
    let label = src;
    if (label.length > 40) label = label.slice(0, 40).trim();
    if (!/건물|빌딩/i.test(label)) label += ' 건물';
    return label;
}

function resolveMapBuildingTitle(slotKey, restaurants) {
    if (Array.isArray(restaurants)) {
        for (const item of restaurants) {
            const label = mapBuildingLabelFromAddress(item && item.address);
            if (label) return label + ' 층별 안내';
        }
    }
    return dict.mapBuildingFloorTitle(slotKey);
}

function openBuildingFloorModal(slotKey, restaurants) {
    const el = document.getElementById('modal-building-floors');
    const titleEl = document.getElementById('building-floor-title');
    const bodyEl = document.getElementById('building-floor-body');
    if (!el || !titleEl || !bodyEl) return;

    titleEl.textContent = resolveMapBuildingTitle(slotKey, restaurants);
    bodyEl.innerHTML = '';

    const wrapper = document.createElement('section');
    wrapper.className = 'building-wrapper';
    wrapper.appendChild(buildMapBuildingHelperEl());

    const stack = document.createElement('div');
    stack.className = 'building-stack';

    if (!restaurants || restaurants.length === 0) {
        appendMapBuildingFloorRow(stack, '—', [], dict.mapEmptySlot);
    } else {
        const byLevel = new Map();
        const orphans = [];
        restaurants.forEach((item) => {
            const lev = mapFloorLevelFromRaw(item.map_floor);
            if (lev == null) {
                orphans.push(item);
            } else {
                if (!byLevel.has(lev)) byLevel.set(lev, []);
                byLevel.get(lev).push(item);
            }
        });

        const levelKeys = [...byLevel.keys()];
        const maxLevel = levelKeys.length > 0 ? Math.max(1, ...levelKeys) : 0;

        if (maxLevel === 0) {
            appendMapBuildingFloorRow(stack, dict.mapFloorOther, orphans);
        } else {
            for (let level = maxLevel; level >= 1; level--) {
                const list = byLevel.get(level);
                if (!list || list.length === 0) continue;
                appendMapBuildingFloorRow(stack, mapFloorHeadingFromLevel(level), list);
            }
            if (orphans.length > 0) {
                appendMapBuildingFloorRow(stack, dict.mapFloorOther, orphans);
            }
        }
    }

    wrapper.appendChild(stack);
    bodyEl.appendChild(wrapper);

    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');
}

function setupMapGrid() {
    const wrap = document.getElementById('map-wrap2');
    if (!wrap || wrap.dataset.mapBound) return;
    wrap.dataset.mapBound = '1';
    wrap.addEventListener('click', (e) => {
        const slotEl = e.target.closest('.bldg[data-slot]');
        if (!slotEl || !wrap.contains(slotEl)) return;
        const slotKey = String(slotEl.getAttribute('data-slot') || '').trim();
        if (!slotKey) return;
        mapSelectedSlot = slotKey;
        wrap.querySelectorAll('.bldg.sel').forEach((el) => el.classList.remove('sel'));
        slotEl.classList.add('sel');

        const rawSlot = mapSlotAssignments[slotKey];
        const idSet = new Set(mapSlotRestaurantIds(rawSlot));
        const metaById = mapSlotMetaById(rawSlot);
        let matched = allRestaurants
            .filter((r) => idSet.has(Number(r.id)))
            .map((r) => {
                const m = metaById[Number(r.id)] || { floor: '', unit: '' };
                const autoFloor = extractFloorFromAddressText(r.address || '');
                return Object.assign({}, r, { map_floor: m.floor || autoFloor, map_unit: m.unit });
            });

        resetIdleTimer(e);
        if (matched.length === 1) {
            openModal(matched[0]);
        } else {
            openBuildingFloorModal(slotKey, matched);
        }
    });
}

function loadMapPage() {
    const bfo = document.getElementById('modal-building-floors');
    if (bfo && !bfo.dataset.bound) {
        bfo.dataset.bound = '1';
        bfo.addEventListener('pointerdown', (e) => {
            if (e.target === bfo) closeBuildingFloorModal();
        });
    }

    const restP = fetchJson('/api/restaurants');
    const catP = fetchJson('/api/categories').catch(() => ({ data: [] }));
    const mapP = fetchJson('/api/map-slot-assignments').catch(() => ({ assignments: {} }));

    Promise.all([restP, catP, mapP])
        .then(([restData, catData, mapData]) => {
            categoriesCache = catData.data || [];
            rebuildCategoryAliasMap(categoriesCache);
            subcategoriesCache = [];
            const rawList = normalizeRestaurantsFromApi(
                Array.isArray(restData.data) ? restData.data : []
            );
            allRestaurants = rawList.filter((r) => !Number(r.kiosk_hidden));
            const a = mapData.assignments;
            mapSlotAssignments = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
            updateUILanguage();
            clearMapSelection();
            setupMapGrid();
            fitMapStage();
            requestAnimationFrame(() => {
                fitMapStage();
            });
            if (!window.__mapStageResizeBound) {
                window.__mapStageResizeBound = true;
                window.addEventListener('resize', fitMapStage);
            }
            if (!window.__mapStageRoBound && typeof ResizeObserver !== 'undefined') {
                const st = document.getElementById('map-stage');
                if (st) {
                    window.__mapStageRoBound = true;
                    new ResizeObserver(() => fitMapStage()).observe(st);
                }
            }
        })
        .catch((err) => {
            const errEl = document.getElementById('map-load-error');
            if (errEl) {
                errEl.hidden = false;
                errEl.textContent = err.message || '서버 통신 실패';
            }
        });

    setupIdleTimer();
    setupKioskClock();
    setupHeaderNav();
    setupFooterTabs();
}

// =============================================================================
// 목록 행: 영업중/종료 뱃지 (썸네일 위)
// =============================================================================

/** HH:MM 두 조각으로 정규화 (영업중 판정용) */
function padHourMinParts(h, min) {
    const hh = String(h).padStart(2, '0');
    const mm = String(min).padStart(2, '0');
    return hh + ':' + mm;
}

/**
 * DB: 예전처럼 open_time·close_time 분리, 또는 open_time 한 칸에 "09:00-21:00"만 — 둘 다 지원
 * @returns {{ open: string, close: string }} 빈 문자열이면 판정 불가
 */
function extractOpenCloseForLogic(openTime, closeTime) {
    const cRaw = closeTime != null ? String(closeTime).trim() : '';
    const oRaw = openTime != null ? String(openTime).trim() : '';
    if (cRaw && oRaw) {
        return { open: oRaw, close: cRaw };
    }
    if (!oRaw) return { open: '', close: '' };
    const m = oRaw.match(/^(\d{1,2}):(\d{2})\s*[-~～〜至－—]\s*(\d{1,2}):(\d{2})/);
    if (m) {
        return {
            open: padHourMinParts(m[1], m[2]),
            close: padHourMinParts(m[3], m[4])
        };
    }
    return { open: '', close: '' };
}

function checkIsOpen(openTime, closeTime) {
    const { open: openStr, close: closeStr } = extractOpenCloseForLogic(openTime, closeTime);
    if (!openStr || !closeStr) return null;
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const [oH, oM] = openStr.split(':').map(Number);
    const openMins = oH * 60 + oM;
    const [cH, cM] = closeStr.split(':').map(Number);
    let closeMins = cH * 60 + cM;
    if (closeMins < openMins) closeMins += 24 * 60;
    let currentAdj = currentMins;
    if (currentMins < openMins && currentMins < closeMins - 24 * 60) currentAdj += 24 * 60;

    if (currentAdj >= openMins && currentAdj <= closeMins) return { isOpen: true, textKo: '영업중', textEn: 'Open Now' };
    return { isOpen: false, textKo: '영업준비중', textEn: 'Closed' };
}

/** DB의 open_time·close_time → 한 줄 표시 (예: 09:00-21:00) */
function formatBusinessHoursOneLine(openTime, closeTime) {
    const o = openTime != null ? String(openTime).trim() : '';
    const c = closeTime != null ? String(closeTime).trim() : '';
    if (o && c) return o + '-' + c;
    if (o) return o;
    if (c) return c;
    return '';
}

// =============================================================================
// 식당 목록 렌더링 (필터 결과 전체)
// =============================================================================

function renderList(list, containerOverride, emptyMessage) {
    const target = containerOverride || restaurantListEl;
    if (!target) return;
    const emptyHtml = emptyMessage != null ? emptyMessage : dict.empty;
    target.innerHTML = '';
    if (list.length === 0) {
        target.innerHTML = `<div class="empty-state">${emptyHtml}</div>`;
        return;
    }

    list.forEach((item) => {
        const row = document.createElement('article');
        row.className = 'store';
        row.setAttribute('role', 'listitem');
        row.addEventListener('click', () => openModal(item));

        const PLACEHOLDER_LIST_IMG =
            'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23e8e8e8%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-size%3D%2214%22%20font-family%3D%22sans-serif%22%20text-anchor%3D%22middle%22%20fill%3D%22%23999%22%20dy%3D%22.3em%22%3E%EC%9D%B4%EB%AF%B8%EC%A7%80%20%EC%97%86%EC%9D%8C%3C%2Ftext%3E%3C%2Fsvg%3E';
        const thumbList = restaurantHeroImageList(item);
        const imgSrc = thumbList[0]
            ? escapeAttr(resolveKioskImageUrl(thumbList[0]))
            : PLACEHOLDER_LIST_IMG;
        const displayName = escapeHtml(item.name);

        const status = checkIsOpen(item.open_time, item.close_time);
        let statusHtml = '';
        if (status) {
            const statusClass = status.isOpen ? 'status-open' : 'status-closed';
            statusHtml = `<div class="status-badge ${statusClass}">${escapeHtml(status.textKo)}</div>`;
        }

        const telText = item.phone && String(item.phone).trim() ? escapeHtml(String(item.phone).trim()) : dict.listPlaceholder;
        const telMuted = !item.phone || !String(item.phone).trim() ? ' list-row-muted' : '';

        const hoursText = formatBusinessHoursOneLine(item.open_time, item.close_time);
        const hoursRow =
            hoursText !== ''
                ? `<div class="list-tel-row tel"><span class="list-tel-num">🕐 ${escapeHtml(hoursText)}</span></div>`
                : '';

        const descRaw = item.description && String(item.description).trim();
        const descOneLine = descRaw
            ? escapeHtml(String(descRaw).split(/\n/)[0].trim())
            : escapeHtml(dict.listPlaceholder);
        const descMuted = !descRaw ? ' list-row-muted' : '';

        const mainMenuParts = parseCommaSeparatedList(item.main_menu);
        const menuText =
            mainMenuParts.length > 0 ? escapeHtml(mainMenuParts.join(', ')) : '';
        const menuRow = menuText
            ? `<div class="list-tel-row list-menu-row tel"><span class="list-menu-num">🍴 ${menuText}</span></div>`
            : '';

        row.innerHTML = `
            <div class="thumb" style="position:relative;">
                <img src="${imgSrc}" alt="${displayName}" loading="lazy">
            </div>
            <div class="info list-store-info-simple">
                <div class="name">${displayName}</div>
                <div class="desc desc-one-line${descMuted}">${descOneLine}</div>
                ${menuRow}
                <div class="list-tel-row${telMuted} tel"> <span class="list-tel-num"> 📱 ${telText}</span>
                </div>
                ${hoursRow}
			<div class="right">${statusHtml}</div>

            </div>
        `;
        target.appendChild(row);
    });
}

function renderFilteredRestaurantList() {
    renderList(currentFilteredList);
}

// =============================================================================
// 헤더 제목·부제 + 탭 다시 그리기
// =============================================================================

function updateUILanguage() {
    const t = dict;
    const kioskTitleNode = document.getElementById('kiosk-title');
    if (kioskTitleNode) {
        if (kioskTitleNode.classList.contains('visually-hidden')) {
            kioskTitleNode.textContent = `${t.titleEm} ${t.titleSubList}`;
        } else {
            const subLine = IS_HOME ? t.titleSub : t.titleSubList;
            kioskTitleNode.innerHTML = `<em>${escapeHtml(t.titleEm)}</em><br><span class="k-hero-title-sub">${escapeHtml(subLine)}</span>`;
        }
    }
    const subEl = document.getElementById('kiosk-subtitle');
    if (subEl) subEl.innerText = IS_HOME ? t.subtitleHome : t.subtitle;
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.placeholder = t.searchPlaceholder;
    const ssTitle = document.getElementById('ss-title');
    if (ssTitle) ssTitle.innerText = t.ssTitle;
    const ssSub = document.getElementById('ss-subtitle');
    if (ssSub) ssSub.innerText = t.ssSubtitle;

    renderCategoryTabs();
    renderSubcategoryTabs();
    if (!IS_HOME && !IS_MAP) updateListHero();
}

// =============================================================================
// 카테고리·2차·검색 필터 (목록만)
// =============================================================================

function setupCategoryTabsDelegation() {
    const el = document.getElementById('categoryTabs');
    if (!el || el.dataset.delegationBound) return;
    el.dataset.delegationBound = '1';
    if (IS_HOME) return;
    el.addEventListener('pointerdown', (e) => {
        const tab = IS_LIST
            ? e.target.closest('.chip[data-cat]')
            : e.target.closest('.k-food-card[data-cat]');
        if (!tab) return;
        const nextCat = tab.getAttribute('data-cat');
        if (nextCat !== currentCategory) currentSubcategory = 'all';
        if (IS_LIST) {
            el.querySelectorAll('.chip[data-cat]').forEach((t) => t.classList.remove('on'));
            tab.classList.add('on');
        } else {
            el.querySelectorAll('.k-food-card[data-cat]').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
        }
        currentCategory = nextCat;
        renderSubcategoryTabs();
        updateListHero();
        applyFilters();
        resetIdleTimer(e);
    });
}

function setupSubcategoryTabsDelegation() {
    const el = document.getElementById('subcategoryTabs');
    if (!el || el.dataset.delegationBound) return;
    el.dataset.delegationBound = '1';
    el.addEventListener('pointerdown', (e) => {
        const tab = e.target.closest('.chip[data-sub]');
        if (!tab) return;
        el.querySelectorAll('.chip[data-sub]').forEach((t) => t.classList.remove('on'));
        tab.classList.add('on');
        currentSubcategory = tab.getAttribute('data-sub') || 'all';
        applyFilters();
        resetIdleTimer(e);
    });
}

function applyFilters() {
    if (IS_MAP) return;
    const queryEl = document.getElementById('searchInput');
    const query = queryEl
        ? queryEl.value.toLowerCase().trim()
        : (searchQueryFromUrl || '').toLowerCase().trim();
    let filtered = allRestaurants;
    if (currentCategory !== 'all') filtered = filtered.filter((item) => restaurantHasPrimaryCategory(item, currentCategory));

    if (query.length > 0)
        filtered = filtered.filter((item) => {
            const nameKo = String(item.name || '').toLowerCase();
            const vals = restaurantCategoryValues(item);
            const catConcat = vals.join(' ').toLowerCase();
            return (
                nameKo.includes(query) ||
                catConcat.includes(query) ||
                vals.some((v) => {
                    const catRow = categoriesCache.find((c) => c.value === v);
                    const catLabelKo = catRow ? String(catRow.label_ko || '').toLowerCase() : '';
                    const vv = String(v || '').toLowerCase();
                    return catLabelKo.includes(query) || vv.includes(query);
                })
            );
        });
    currentFilteredList = dailyStableShuffle(filtered);
    renderFilteredRestaurantList();
    syncUrlToState();
}

// =============================================================================
// 검색창
// =============================================================================

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    if (!searchInput) return;
    if (IS_LIST && document.getElementById('keyboardModal')) {
        searchInput.readOnly = true;
        searchInput.setAttribute('inputmode', 'none');
        searchInput.setAttribute('aria-haspopup', 'dialog');
        searchInput.setAttribute('aria-controls', 'keyboardModal');
        searchInput.addEventListener(
            'pointerdown',
            (e) => {
                if (e.button !== 0) return;
                openListSearchKeyboard(e);
            },
            { passive: false }
        );
        searchInput.addEventListener('focus', (e) => {
            const km = document.getElementById('keyboardModal');
            if (km && !km.classList.contains('show')) openListSearchKeyboard(e);
        });
    }
    if (!clearBtn) {
        searchInput.addEventListener('input', () => applyFilters());
        return;
    }
    searchInput.addEventListener('input', (e) => {
        if (e.target.value.length > 0) clearBtn.classList.add('active'); else clearBtn.classList.remove('active');
        applyFilters();
    });
    clearBtn.addEventListener('click', (ev) => {
        resetIdleTimer(ev);
        searchInput.value = '';
        clearBtn.classList.remove('active');
        homeKeyboardBuffer = '';
        const kiClr = document.getElementById('kioskInput');
        if (kiClr) kiClr.value = '';
        applyFilters();
        if (IS_LIST && document.getElementById('keyboardModal')) {
            openListSearchKeyboard(null);
            searchInput.focus({ preventScroll: true });
        } else {
            searchInput.focus();
        }
    });
}

function resetKeyboardLayerToHangul() {
    const wrap = document.querySelector('#keyboardModal .keyboard-wrap');
    const btn = document.getElementById('keyboardLangBtn');
    const label = document.getElementById('keyboardToggleText');
    const hang = document.querySelector('#keyboardModal .k-layer-hangul');
    const alt = document.querySelector('#keyboardModal .k-layer-alt');
    if (wrap) wrap.classList.remove('keyboard-mode-alt');
    if (btn) {
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', '숫자·영문 키보드로 전환');
    }
    if (label) label.textContent = '영문';
    if (hang) hang.setAttribute('aria-hidden', 'false');
    if (alt) alt.setAttribute('aria-hidden', 'true');
}

function closeHomeKeyboardModal() {
    const keyboardModal = document.getElementById('keyboardModal');
    if (!keyboardModal) return;
    keyboardModal.classList.remove('show');
    keyboardModal.setAttribute('aria-hidden', 'true');
    resetKeyboardLayerToHangul();
}

/** list.html: 검색창·하단 검색 탭 → 동일 터치 자판 */
function openListSearchKeyboard(ev) {
    const keyboardModal = document.getElementById('keyboardModal');
    const si = document.getElementById('searchInput');
    if (!keyboardModal || !si) return false;
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    keyboardModal.classList.add('show');
    keyboardModal.setAttribute('aria-hidden', 'false');
    resetKeyboardLayerToHangul();
    syncHomeKeyboardBufferFromInput(si);
    if (ev) resetIdleTimer(ev);
    return true;
}

/**
 * 홈·목록 공통 터치 한글 자판 (#keyboardModal)
 * - 홈: 검색 → /list.html?q=
 * - 목록: #searchInput·필터와 동기화
 */
function setupKioskKeyboardModal() {
    const keyboardModal = document.getElementById('keyboardModal');
    const kioskInput = document.getElementById('kioskInput');
    if (!keyboardModal || !kioskInput || keyboardModal.dataset.keyboardBound) return;
    keyboardModal.dataset.keyboardBound = '1';

    const syncList = IS_LIST && document.getElementById('searchInput');

    const refreshDisplay = () => {
        const composed = hangulAssembleFromBuffer(homeKeyboardBuffer);
        kioskInput.value = composed;
        if (syncList) syncListSearchFromKeyboardBuffer();
    };

    const onKeypad = (e) => {
        resetIdleTimer(e);
    };

    keyboardModal.querySelector('.k-btn-close')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onKeypad(e);
        closeHomeKeyboardModal();
    });

    keyboardModal.querySelector('.k-btn-clear')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onKeypad(e);
        resetHomeKeyboardBuffer(kioskInput);
        if (syncList) syncListSearchFromKeyboardBuffer();
    });

    keyboardModal.addEventListener('pointerdown', (e) => {
        if (e.target === keyboardModal) {
            onKeypad(e);
            closeHomeKeyboardModal();
        }
    });

    keyboardModal.querySelectorAll('.keyboard-wrap .k-key').forEach((key) => {
        key.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            onKeypad(e);
            if (key.classList.contains('k-space')) {
                homeKeyboardBuffer += ' ';
                refreshDisplay();
            } else if (key.classList.contains('k-del')) {
                if (homeKeyboardBuffer.length > 0) {
                    homeKeyboardBuffer = homeKeyboardBuffer.slice(0, -1);
                    refreshDisplay();
                }
            } else {
                const ch = key.getAttribute('data-char') || (key.textContent || '').trim();
                if (!ch) return;
                homeKeyboardBuffer += ch;
                refreshDisplay();
            }
        });
    });

    const keyboardWrap = keyboardModal.querySelector('.keyboard-wrap');
    const langBtn = document.getElementById('keyboardLangBtn');
    const toggleLabel = document.getElementById('keyboardToggleText');
    if (langBtn && keyboardWrap) {
        const hangLayer = keyboardModal.querySelector('.k-layer-hangul');
        const altLayer = keyboardModal.querySelector('.k-layer-alt');
        langBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onKeypad(e);
            const on = keyboardWrap.classList.toggle('keyboard-mode-alt');
            langBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            langBtn.setAttribute(
                'aria-label',
                on ? '한글 키보드로 전환' : '숫자·영문 키보드로 전환'
            );
            if (toggleLabel) toggleLabel.textContent = on ? '한글' : '영문';
            if (hangLayer) hangLayer.setAttribute('aria-hidden', on ? 'true' : 'false');
            if (altLayer) altLayer.setAttribute('aria-hidden', on ? 'false' : 'true');
        });
    }

    keyboardModal.querySelector('.k-btn-submit')?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onKeypad(e);
        const keyword = hangulAssembleFromBuffer(homeKeyboardBuffer).trim();
        if (syncList) {
            const si = document.getElementById('searchInput');
            if (si) si.value = keyword;
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) clearBtn.classList.toggle('active', keyword.length > 0);
            applyFilters();
            syncUrlToState();
            closeHomeKeyboardModal();
            scrollKioskMainTo(0);
            return;
        }
        if (keyword !== '') window.location.assign('/list.html?q=' + encodeURIComponent(keyword));
    });
}

// =============================================================================
// 상세 모달 · 지도/메뉴 전체화면 오버레이
// =============================================================================

/** image_gallery JSON 배열(순서) 또는 image_url — 키오스크 상세 모달에는 1장만 사용 */
function restaurantHeroImageList(item) {
    const out = [];
    if (item && item.image_gallery) {
        try {
            const p = JSON.parse(item.image_gallery);
            if (Array.isArray(p)) {
                p.forEach((u) => {
                    const s = u != null ? String(u).trim() : '';
                    if (s) out.push(s);
                });
            }
        } catch (e) {}
    }
    if (!out.length && item && item.image_url) out.push(String(item.image_url).trim());
    return out.slice(0, 1);
}

/**
 * @param {object} item
 * @param {{ nested?: boolean }} [opts] — nested=true: 지도 건물 목록 모달을 닫지 않고 상세만 위에 표시(2중 모달)
 */
function openModal(item, opts) {
    const nested = opts && opts.nested === true;
    if (!nested) closeBuildingFloorModal();
    const t = dict;
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) return;

    const PLACEHOLDER_IMG =
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23e8e8e8%22%2F%3E%3C/svg%3E';
    const imgList = restaurantHeroImageList(item);
    const heroSrc = imgList[0] ? escapeAttr(resolveKioskImageUrl(imgList[0])) : PLACEHOLDER_IMG;
    const bd = badgeClassForCategory(primaryCanonicalCategoryForItem(item));
    const displayName = escapeHtml(item.name);
    const displayCategory = escapeHtml(categoryDisplayLabel(item));
    const displayDesc = item.description ? escapeHtml(item.description).replace(/\n/g, '<br>') : '';

    let menuBtnHtml = item.menu_url
        ? `<button type="button" class="map-btn menu-accent js-open-menu"><img src="${iniconSrcFromTabIndex(4)}" alt="" class="btn-inicon"><span>${escapeHtml(t.menuBtn)}</span></button>`
        : '';
    const actionsHtml =
        menuBtnHtml
            ? `<div class="modal-actions">${menuBtnHtml}</div>`
            : '';

    let mainMenuChipsHtml = '';
    const mainMenuParts = parseCommaSeparatedList(item.main_menu);
    if (mainMenuParts.length > 0) {
        mainMenuChipsHtml = mainMenuParts.map((x) => `<span class="menu-chip">${escapeHtml(x)}</span>`).join('');
    }

    let facilitiesChipsHtml = '';
    const facilityParts = parseCommaSeparatedList(item.tags);
    if (facilityParts.length > 0) {
        facilitiesChipsHtml = facilityParts.map((x) => `<span class="menu-chip">${escapeHtml(x)}</span>`).join('');
    }

    let infoBlocks = '';
    if (item.address) {
        infoBlocks += `<div class="info-row">
            <div class="info-icon ic-loc">${MODAL_SVG.loc}</div>
            <div class="info-content">
                <div class="info-label">${escapeHtml(t.modalAddrLabel)}</div>
                <div class="info-val">${escapeHtml(item.address)}</div>
            </div></div>`;
    }
    if (item.phone) {
        infoBlocks += `<div class="info-row">
            <div class="info-icon ic-tel">${MODAL_SVG.tel}</div>
            <div class="info-content">
                <div class="info-label">${escapeHtml(t.modalPhoneLabel)}</div>
                <div class="info-val point">${escapeHtml(item.phone)}</div>
            </div></div>`;
    }
    const hoursLine = formatBusinessHoursOneLine(item.open_time, item.close_time);
    if (hoursLine) {
        infoBlocks += `<div class="info-row">
            <div class="info-icon ic-time">${MODAL_SVG.time}</div>
            <div class="info-content">
                <div class="info-label">${escapeHtml(t.hours)}</div>
                <div class="info-val">${escapeHtml(hoursLine)}</div>
            </div></div>`;
    }
    if (item.closed_days && String(item.closed_days).trim()) {
        infoBlocks += `<div class="info-row">
            <div class="info-icon ic-day">${MODAL_SVG.day}</div>
            <div class="info-content">
                <div class="info-label">${escapeHtml(t.closedDays)}</div>
                <div class="info-val">${escapeHtml(String(item.closed_days).trim())}</div>
            </div></div>`;
    }
    if (item.homepage) {
        const url = item.homepage.startsWith('http') ? item.homepage : 'https://' + item.homepage;
        infoBlocks += `<div class="info-row">
            <div class="info-icon ic-web">${MODAL_SVG.web}</div>
            <div class="info-content">
                <div class="info-label">${escapeHtml(t.homepage)}</div>
                <div class="info-val"><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(item.homepage)}</a></div>
            </div></div>`;
    }
    if (mainMenuChipsHtml) {
        infoBlocks += `<div class="info-row">
            <div class="info-icon ic-menu">${MODAL_SVG.menu}</div>
            <div class="info-content">
                <div class="info-label">${escapeHtml(t.modalMenuLabel)}</div>
                <div class="menu-chips">${mainMenuChipsHtml}</div>
                ${IS_LIST ? `<div class="modal-report-wrap"><button type="button" class="modal-report-btn js-info-report">틀린정보 신고하기</button></div>` : ''}
            </div></div>`;
    } else if (IS_LIST) {
        infoBlocks += `<div class="info-row modal-report-row">
            <div class="info-content modal-report-content-only">
                <div class="modal-report-wrap"><button type="button" class="modal-report-btn js-info-report">틀린정보 신고하기</button></div>
            </div></div>`;
    }
    if (facilitiesChipsHtml) {
        infoBlocks += `<div class="info-row">
            <div class="info-icon ic-menu">${MODAL_SVG.menu}</div>
            <div class="info-content">
                <div class="info-label">${escapeHtml(dict.listLabelFacilities)}</div>
                <div class="menu-chips">${facilitiesChipsHtml}</div>
            </div></div>`;
    }

    /** 목록(list): 관리자에 네이버 길찾기 링크가 없으면 QR 영역 자체를 숨김 */
    const showQrBlock = !IS_LIST || hasCustomNaverRouteUrl(item);

    modalBody.innerHTML = `
    <article class="modal-header">
      <button type="button" class="modal-close" onclick="closeModal()" aria-label="닫기">${MODAL_SVG.close}</button>
    </article>
    <article class="modal-body">
      <section class="view-card">
        <article class="img-wrap">
          <div class="img-main">
            <img src="${heroSrc}" alt="${escapeHtml(item.name)}">
          </div>
        </article>
        <article class="view-detail-wrap">
          <article class="header-area">
            <div class="cat-row">
              <span class="cat-badge ${bd}">${displayCategory}</span>
            </div>
            <div class="store-name">${displayName}</div>
            ${displayDesc ? `<div class="store-desc">${displayDesc}</div>` : ''}
          </article>
          <div class="divider"></div>
          <div class="info-list">${infoBlocks}</div>
          ${actionsHtml}
          ${
              showQrBlock
                  ? `<div class="qr-section">
            <div class="qr-box" id="qr-container"><span class="qr-loading">QR…</span></div>
            <div class="qr-info">
              <div class="qr-title">${escapeHtml(t.qrTitle)}</div>
              <div class="qr-sub">${t.qrSubHtml}</div>
            </div>
            <div class="qr-btn" aria-hidden="true">${MODAL_SVG.qrChevron}</div>
          </div>`
                  : ''
          }
        </article>
      </section>
    </article>

    `;
    if (overlay) {
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        if (nested) overlay.classList.add('modal-overlay--stack-above-building');
        else overlay.classList.remove('modal-overlay--stack-above-building');
    }

    const menuEl = modalBody.querySelector('.js-open-menu');
    if (menuEl && item.menu_url) {
        const menuSrc = resolveKioskImageUrl(item.menu_url);
        menuEl.addEventListener('click', () => openMenuInfo(menuSrc));
    }

    const reportBtn = modalBody.querySelector('.js-info-report');
    if (reportBtn) {
        reportBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openInfoReportModal(item);
        });
    }

    if (showQrBlock) {
        const nMapUrl = buildNaverRouteUrl(item);
        fetchJson('/api/qrcode?text=' + encodeURIComponent(nMapUrl))
            .then((data) => {
                const container = document.getElementById('qr-container');
                if (container && data.dataUrl) {
                    container.textContent = '';
                    const im = document.createElement('img');
                    im.src = data.dataUrl;
                    im.alt = 'QR';
                    container.appendChild(im);
                }
            })
            .catch(() => {});
    }
}

function closeModal() {
    if (overlay) {
        overlay.classList.remove('active');
        overlay.classList.remove('modal-overlay--stack-above-building');
        overlay.setAttribute('aria-hidden', 'true');
    }
}

function closeMap() {
    document.getElementById('map-overlay')?.classList.remove('active');
}

// =============================================================================
// list.html — 틀린정보 신고
// =============================================================================

let infoReportPendingItem = null;
let infoReportSubmitting = false;

function openInfoReportModal(item) {
    infoReportPendingItem = item;
    const overlay = document.getElementById('info-report-overlay');
    const storeEl = document.getElementById('infoReportStoreName');
    const msgEl = document.getElementById('infoReportMessage');
    const statusEl = document.getElementById('infoReportStatus');
    if (!overlay) return;
    if (storeEl) storeEl.textContent = item && item.name ? String(item.name) : '';
    if (msgEl) {
        msgEl.value = '';
        msgEl.disabled = false;
    }
    if (statusEl) statusEl.textContent = '';
    const submitBtn = document.getElementById('infoReportSubmit');
    if (submitBtn) submitBtn.disabled = false;
    infoReportSubmitting = false;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    if (msgEl) msgEl.focus();
}

function closeInfoReportModal() {
    const overlay = document.getElementById('info-report-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }
    infoReportPendingItem = null;
    infoReportSubmitting = false;
}

async function submitInfoReport() {
    if (infoReportSubmitting) return;
    const item = infoReportPendingItem;
    const msgEl = document.getElementById('infoReportMessage');
    const statusEl = document.getElementById('infoReportStatus');
    const submitBtn = document.getElementById('infoReportSubmit');
    const message = msgEl ? String(msgEl.value || '').trim() : '';
    if (!item) {
        if (statusEl) statusEl.textContent = '식당 정보를 찾을 수 없습니다.';
        return;
    }
    if (message.length < 2) {
        if (statusEl) statusEl.textContent = '내용을 2자 이상 입력해 주세요.';
        return;
    }
    const ridParsed = item.id != null && item.id !== '' ? parseInt(item.id, 10) : NaN;
    const restaurantId = Number.isInteger(ridParsed) && ridParsed > 0 ? ridParsed : null;

    infoReportSubmitting = true;
    if (submitBtn) submitBtn.disabled = true;
    if (statusEl) statusEl.textContent = '보내는 중…';
    try {
        const res = await fetch('/api/info-reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurant_id: restaurantId,
                restaurant_name: item.name || '',
                message,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (statusEl) statusEl.textContent = (data && data.error) || '전송에 실패했습니다.';
            infoReportSubmitting = false;
            if (submitBtn) submitBtn.disabled = false;
            return;
        }
        const mail = data && data.mail;
        if (mail && mail.sent) {
            if (statusEl) {
                statusEl.textContent =
                    '접수되었습니다. 담당자 메일(' + (mail.to || '') + ')로 전달되었습니다.';
            }
        } else if (mail && mail.skipped) {
            if (statusEl) {
                statusEl.textContent =
                    '접수되었습니다. (메일 SMTP 미설정 — Vercel은 Production 환경 변수에도 넣어야 합니다)';
            }
        } else if (mail && mail.error) {
            if (statusEl) {
                statusEl.textContent =
                    '접수되었습니다. 메일 전송은 실패했지만 신고는 저장되었습니다.';
            }
        } else if (data && data.mailSent) {
            if (statusEl) statusEl.textContent = '접수되었습니다. 담당자에게 메일로 전달되었습니다.';
        } else {
            if (statusEl) statusEl.textContent = '접수되었습니다. 감사합니다.';
        }
        if (msgEl) {
            msgEl.value = '';
            msgEl.disabled = true;
        }
        infoReportSubmitting = false;
        setTimeout(() => closeInfoReportModal(), mail && mail.sent ? 2200 : 1400);
    } catch (_) {
        if (statusEl) statusEl.textContent = '네트워크 오류로 전송하지 못했습니다.';
        infoReportSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

function setupInfoReportModal() {
    const overlay = document.getElementById('info-report-overlay');
    const cancelBtn = document.getElementById('infoReportCancel');
    const submitBtn = document.getElementById('infoReportSubmit');
    if (cancelBtn) cancelBtn.addEventListener('click', closeInfoReportModal);
    if (submitBtn) submitBtn.addEventListener('click', () => submitInfoReport());
    if (overlay) {
        overlay.addEventListener('pointerdown', (e) => {
            if (e.target === overlay) closeInfoReportModal();
        });
    }
}

function openMenuInfo(menuUrl) {
    const img = document.getElementById('full-menu-img');
    const ov = document.getElementById('menu-overlay');
    if (img) img.src = resolveKioskImageUrl(menuUrl);
    if (ov) ov.classList.add('active');
}

function closeMenuInfo() {
    document.getElementById('menu-overlay')?.classList.remove('active');
}

if (overlay) overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) closeModal(); });
const mo = document.getElementById('map-overlay'); if(mo) mo.addEventListener('pointerdown', (e) => { if (e.target === mo) closeMap(); });
const meo = document.getElementById('menu-overlay'); if(meo) meo.addEventListener('pointerdown', (e) => { if (e.target === meo) closeMenuInfo(); });

// =============================================================================
// 유휴 1분 → 모달 닫기 후 index.html(홈)으로 — index·list·map 공통
// =============================================================================

let idleTimer;

function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        closeModal(); closeMap(); closeMenuInfo(); closeInfoReportModal(); closeBuildingFloorModal();
        window.location.assign('/index.html');
    }, KIOSK_IDLE_MS_TO_HOME);
}

function setupIdleTimer() {
    ['pointerdown', 'pointermove', 'keydown', 'touchstart'].forEach((evt) => document.addEventListener(evt, resetIdleTimer, false));
    resetIdleTimer();
}

// =============================================================================
// 헤더 시계
// =============================================================================

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(x) {
    return String(x).padStart(2, '0');
}

function setupKioskClock() {
    const elT = document.getElementById('cl-t');
    const elD = document.getElementById('cl-d');
    if (!elT || !elD) return;
    function tick() {
        const n = new Date();
        elT.innerHTML = `<strong>${pad2(n.getHours())}</strong>:${pad2(n.getMinutes())}`;
        elD.textContent = `${n.getFullYear()}.${pad2(n.getMonth() + 1)}.${pad2(n.getDate())} ${DAYS_KO[n.getDay()]}요일`;
    }
    tick();
    setInterval(tick, 1000);
}

function scrollKioskMainTo(top) {
    const body = document.querySelector('.k-body');
    if (body) body.scrollTo({ top, behavior: 'smooth' });
}

// =============================================================================
// 상단 헤더 — moon_st: 뒤로 / 홈 (홈 화면에서 홈은 맨 위로 스크롤)
// =============================================================================

function setupHeaderNav() {
    const back = document.getElementById('headerBack');
    const homeBtn = document.getElementById('headerHome');
    if (back) {
        back.addEventListener('pointerdown', (e) => {
            resetIdleTimer(e);
            if (window.history.length > 1) history.back();
        });
    }
    if (homeBtn) {
        homeBtn.addEventListener('pointerdown', (e) => {
            resetIdleTimer(e);
            if (IS_HOME) scrollKioskMainTo(0);
            else window.location.assign('/index.html');
        });
    }
}

// =============================================================================
// 하단 푸터 탭 (홈 / 검색·목록 / 맛집목록 / 종류별)
// =============================================================================

function setupFooterTabs() {
    const home = document.getElementById('footerHome');
    const search = document.getElementById('footerSearch');
    const map = document.getElementById('footerMap');
    const cat = document.getElementById('footerCategory');

    if (IS_MAP) {
        if (search) {
            search.addEventListener('pointerdown', (e) => {
                resetIdleTimer(e);
                window.location.assign('/list.html');
            });
        }
        if (map) {
            map.addEventListener('pointerdown', (e) => {
                resetIdleTimer(e);
                document.getElementById('map-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
        if (cat) {
            cat.addEventListener('pointerdown', (e) => {
                resetIdleTimer(e);
                window.location.assign('/index.html');
            });
        }
        return;
    }

    if (IS_HOME) {
        if (home) {
            home.addEventListener('pointerdown', (e) => {
                resetIdleTimer(e);
                scrollKioskMainTo(0);
            });
        }
        if (search) {
            search.addEventListener('pointerdown', (e) => {
                resetIdleTimer(e);
                const keyboardModal = document.getElementById('keyboardModal');
                if (keyboardModal) {
                    e.preventDefault();
                    keyboardModal.classList.add('show');
                    keyboardModal.setAttribute('aria-hidden', 'false');
                    resetKeyboardLayerToHangul();
                    const ki = document.getElementById('kioskInput');
                    const si = document.getElementById('searchInput');
                    if (si) syncHomeKeyboardBufferFromInput(si);
                    else if (ki) syncHomeKeyboardBufferFromInput(ki);
                } else {
                    window.location.assign('/list.html');
                }
            });
        }
        if (map) {
            map.addEventListener('pointerdown', (e) => {
                resetIdleTimer(e);
                window.location.assign('/map.html');
            });
        }
        if (cat) {
            cat.addEventListener('pointerdown', (e) => {
                resetIdleTimer(e);
                document.getElementById('categoryTabs')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
        return;
    }

    if (home) {
        home.addEventListener('pointerdown', (e) => {
            resetIdleTimer(e);
            window.location.assign('/index.html');
        });
    }
    if (search) {
        search.addEventListener('pointerdown', (e) => {
            resetIdleTimer(e);
            const keyboardModal = document.getElementById('keyboardModal');
            const si = document.getElementById('searchInput');
            if (keyboardModal && si) {
                openListSearchKeyboard(e);
            } else if (si) {
                si.focus();
                scrollKioskMainTo(0);
            } else {
                window.location.assign('/index.html');
            }
        });
    }
    if (map) {
        map.addEventListener('pointerdown', (e) => {
            resetIdleTimer(e);
            window.location.assign('/map.html');
        });
    }
    if (cat) {
        cat.addEventListener('pointerdown', (e) => {
            resetIdleTimer(e);
            const tabs = document.getElementById('categoryTabs');
            if (tabs) tabs.scrollIntoView({ behavior: 'smooth', block: 'center' });
            else window.location.assign('/index.html');
        });
    }
}
