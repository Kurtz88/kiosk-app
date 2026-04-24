/**
 * 키오스크 프론트 (index.html 홈 / list.html 목록·상세 / map.html 지도)
 * - API: /api/restaurants, /api/categories, /api/subcategories, /api/qrcode
 * - 홈: 종류 카드 그리드 → list.html 로 이동
 * - 목록: 필터·검색(결과 전체 한 번에 표시), 행 클릭 시 상세 모달
 * - UI 문구·모달 SVG: js/kiosk/kiosk-i18n.js (window.KIOSK_I18N) — 반드시 이 파일보다 먼저 로드
 */

// =============================================================================
// 설정 · 비밀 제스처
// =============================================================================

/** 제목/우하단 등 연타 시 관리자·종료로 인정할 횟수 */
const SECRET_TAP_TIMES = 10;
/** 제목 연타 후 관리자(/admin.html) 진입 비밀번호 */
const ADMIN_KIOSK_PASSWORD = 'iknowi0701';
/** QR → 네이버지도앱 nmap: 길찾기에 필요한 appname(문서 권장) */
const NAVER_MAP_QR_APPNAME = 'kiosk-naver-route';

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

function buildNaverMapWalkFromHereUrl(item) {
    const dlat = Number(item.dest_lat);
    const dlng = Number(item.dest_lng);
    const dname = encodeURIComponent((item.name || '목적지').trim() || '목적지');
    // 서버 리다이렉트 페이지: iOS/Android 분기 → 앱 딥링크 시도 → 웹 폴백
    // QR 스캔 시 절대 URL 필요
    return window.location.origin + '/naver-route?lat=' + dlat + '&lng=' + dlng + '&name=' + dname;
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

/** 목록 순서 매번 다르게(Fisher–Yates) */
function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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
    if (currentSubcategory !== 'all') p.set('sub', currentSubcategory);
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

function countRestaurantsInCategory(value) {
    return allRestaurants.filter((r) => r.category === value).length;
}

/** 쉼표 구분 문자열 → 트림된 항목 배열 */
function parseCommaSeparatedList(raw) {
    if (!raw || !String(raw).trim()) return [];
    return String(raw)
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
}

/** 식당 category 값으로 목록 우측 cat-badge 색상 클래스 결정 */
function badgeClassForCategory(catValue) {
    const keys = ['bd01', 'bd02', 'bd03', 'bd04', 'bd05'];
    const s = String(catValue || '');
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
        if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
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
    setupCategoryTabsDelegation();
    setupSubcategoryTabsDelegation();
    setupScreensaver();
    setupExitTapZone();
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
    const row = categoriesCache.find((c) => c.value === item.category);
    if (!row) return item.category;
    return row.label_ko || item.category;
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
    if (currentCategory === 'all') {
        el.hidden = true;
        el.innerHTML = '';
        currentSubcategory = 'all';
        return;
    }
    const subs = subcategoriesCache
        .filter((s) => s.category_value === currentCategory)
        .slice()
        .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    if (subs.length === 0) {
        el.hidden = true;
        el.innerHTML = '';
        currentSubcategory = 'all';
        return;
    }
    if (currentSubcategory !== 'all' && !subs.some((s) => s.value === currentSubcategory)) {
        currentSubcategory = 'all';
    }
    el.hidden = false;
    el.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'chip' + (currentSubcategory === 'all' ? ' on' : '');
    allBtn.setAttribute('data-sub', 'all');
    allBtn.textContent = dict.allSubCat;
    el.appendChild(allBtn);
    subs.forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (currentSubcategory === s.value ? ' on' : '');
        b.setAttribute('data-sub', s.value);
        const text = s.label_ko || s.value;
        b.textContent = text;
        el.appendChild(b);
    });
}

// =============================================================================
// 식당·카테고리 데이터 로드
// =============================================================================

function loadKioskData() {
    if (IS_MAP) return;
    const restP = fetchJson('/api/restaurants');
    const catP = fetchJson('/api/categories').catch(() => ({ data: [] }));
    const subP = fetchJson('/api/subcategories').catch(() => ({ data: [] }));
    Promise.all([restP, catP, subP])
        .then(([restData, catData, subData]) => {
            categoriesCache = catData.data || [];
            subcategoriesCache = subData.data || [];
            const rawList = Array.isArray(restData.data) ? restData.data : [];
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

function appendMapFloorShopRows(sectionEl, items) {
    const sorted = items.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
    sorted.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'map-building-floor-row';
        const cat = escapeHtml(categoryDisplayLabel(item));
        const nm = escapeHtml(item.name || '');
        const telRaw = item.phone && String(item.phone).trim();
        const tel = telRaw ? `📱${escapeHtml(telRaw)}` : `📱${escapeHtml(dict.listPlaceholder)}`;
        btn.innerHTML = `
                <span class="map-building-floor-cat">${cat}</span>
                <span class="map-building-floor-name">${nm}</span>
                <span class="map-building-floor-tel">${tel}</span>
            `;
        btn.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            openModal(item, { nested: true });
        });
        sectionEl.appendChild(btn);
    });
}

function openBuildingFloorModal(slotKey, restaurants) {
    const el = document.getElementById('modal-building-floors');
    const titleEl = document.getElementById('building-floor-title');
    const hintEl = document.getElementById('building-floor-hint');
    const bodyEl = document.getElementById('building-floor-body');
    if (!el || !titleEl || !bodyEl) return;

    titleEl.textContent = dict.mapBuildingFloorTitle(slotKey);
    if (hintEl) hintEl.textContent = dict.mapBuildingFloorHint;

    bodyEl.innerHTML = '';
    if (!restaurants || restaurants.length === 0) {
        const div = document.createElement('div');
        div.className = 'empty-state map-building-empty';
        div.textContent = dict.mapEmptySlot;
        bodyEl.appendChild(div);
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

        const root = document.createElement('div');
        root.className = 'map-building-by-floor';

        const levelKeys = [...byLevel.keys()];
        const maxLevel = levelKeys.length > 0 ? Math.max(1, ...levelKeys) : 0;

        if (maxLevel === 0) {
            const section = document.createElement('section');
            section.className = 'map-building-floor-section';
            const h = document.createElement('h3');
            h.className = 'map-building-floor-head';
            h.textContent = dict.mapFloorOther;
            section.appendChild(h);
            appendMapFloorShopRows(section, orphans);
            root.appendChild(section);
        } else {
            for (let level = maxLevel; level >= 1; level--) {
                const section = document.createElement('section');
                section.className = 'map-building-floor-section';
                const h = document.createElement('h3');
                h.className = 'map-building-floor-head';
                h.textContent = mapFloorHeadingFromLevel(level);
                section.appendChild(h);
                const list = byLevel.get(level) || [];
                if (list.length === 0) {
                    const empty = document.createElement('p');
                    empty.className = 'map-building-floor-empty';
                    empty.textContent = dict.mapFloorEmpty;
                    section.appendChild(empty);
                } else {
                    appendMapFloorShopRows(section, list);
                }
                root.appendChild(section);
            }
            if (orphans.length > 0) {
                const section = document.createElement('section');
                section.className = 'map-building-floor-section';
                const h = document.createElement('h3');
                h.className = 'map-building-floor-head';
                h.textContent = dict.mapFloorOther;
                section.appendChild(h);
                appendMapFloorShopRows(section, orphans);
                root.appendChild(section);
            }
        }

        bodyEl.appendChild(root);
    }

    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');
}

function setupMapGrid() {
    const wrap = document.getElementById('map-wrap2');
    if (!wrap || wrap.dataset.mapBound) return;
    wrap.dataset.mapBound = '1';
    wrap.addEventListener('pointerdown', (e) => {
        const slotEl = e.target.closest('.bldg[data-slot]');
        if (!slotEl || !wrap.contains(slotEl)) return;
        const slotKey = String(slotEl.getAttribute('data-slot') || '').trim();
        if (!slotKey) return;
        e.preventDefault();
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
                return Object.assign({}, r, { map_floor: m.floor, map_unit: m.unit });
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
    const subP = fetchJson('/api/subcategories').catch(() => ({ data: [] }));
    const mapP = fetchJson('/api/map-slot-assignments').catch(() => ({ assignments: {} }));

    Promise.all([restP, catP, subP, mapP])
        .then(([restData, catData, subData, mapData]) => {
            categoriesCache = catData.data || [];
            subcategoriesCache = subData.data || [];
            const rawList = Array.isArray(restData.data) ? restData.data : [];
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

    setupScreensaver();
    setupExitTapZone();
    setupKioskClock();
    setupHeaderNav();
    setupFooterTabs();
}

// =============================================================================
// 목록 행: 영업중/종료 뱃지 (썸네일 위)
// =============================================================================

function checkIsOpen(openTime, closeTime) {
    if (!openTime || !closeTime) return null;
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const [oH, oM] = openTime.split(':').map(Number); const openMins = oH * 60 + oM;
    const [cH, cM] = closeTime.split(':').map(Number); let closeMins = cH * 60 + cM;
    if(closeMins < openMins) closeMins += 24 * 60;
    let currentAdj = currentMins;
    if(currentMins < openMins && currentMins < closeMins - 24*60) currentAdj += 24*60;

    if (currentAdj >= openMins && currentAdj <= closeMins) return { isOpen: true, textKo: '영업중', textEn: 'Open Now' };
    else return { isOpen: false, textKo: '영업종료', textEn: 'Closed' };
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
        row.addEventListener('pointerdown', () => openModal(item));

        const imgSrc = item.image_url
            ? item.image_url
            : 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23e8e8e8%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-size%3D%2214%22%20font-family%3D%22sans-serif%22%20text-anchor%3D%22middle%22%20fill%3D%22%23999%22%20dy%3D%22.3em%22%3E%EC%9D%B4%EB%AF%B8%EC%A7%80%20%EC%97%86%EC%9D%8C%3C%2Ftext%3E%3C%2Fsvg%3E';
        const displayName = escapeHtml(item.name);

        const status = checkIsOpen(item.open_time, item.close_time);
        let statusHtml = '';
        if (status) {
            const statusClass = status.isOpen ? 'status-open' : 'status-closed';
            statusHtml = `<div class="status-badge ${statusClass}">${escapeHtml(status.textKo)}</div>`;
        }

        const telText = item.phone && String(item.phone).trim() ? escapeHtml(String(item.phone).trim()) : dict.listPlaceholder;
        const telMuted = !item.phone || !String(item.phone).trim() ? ' list-row-muted' : '';

        const descRaw = item.description && String(item.description).trim();
        const descOneLine = descRaw
            ? escapeHtml(String(descRaw).split(/\n/)[0].trim())
            : escapeHtml(dict.listPlaceholder);
        const descMuted = !descRaw ? ' list-row-muted' : '';

        const mainMenuParts = parseCommaSeparatedList(item.main_menu);
        const menuMuted = mainMenuParts.length === 0 ? ' list-row-muted' : '';
        const menuInner =
            mainMenuParts.length > 0
                ? `<div class="list-chip-row list-menu-chips">${mainMenuParts.map((p) => `<span class="list-mini-chip">${escapeHtml(p)}</span>`).join('')}</div>`
                : `<span class="list-menu-empty">${escapeHtml(dict.listPlaceholder)}</span>`;

        row.innerHTML = `
            <div class="thumb" style="position:relative;">
                ${statusHtml}
                <img src="${imgSrc}" alt="${displayName}" loading="lazy">
            </div>
            <div class="info list-store-info-simple">
                <div class="name">${displayName}</div>
                <div class="desc desc-one-line${descMuted}">${descOneLine}</div>
                <div class="list-menu-block${menuMuted}">${menuInner}</div>
                <div class="list-tel-row${telMuted}">
                    ${svgForListRow(MODAL_SVG.tel)}
                    <span class="list-tel-num">${telText}</span>
                </div>
            </div>
        `;
        target.appendChild(row);
    });
}

function renderFilteredRestaurantList() {
    renderList(currentFilteredList);
}

// =============================================================================
// 헤더 제목·부제·스크린세이버 문구 + 탭 다시 그리기
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
    if (currentCategory !== 'all') filtered = filtered.filter((item) => item.category === currentCategory);
    if (currentCategory !== 'all' && currentSubcategory !== 'all') {
        filtered = filtered.filter((item) => (item.subcategory || '') === currentSubcategory);
    }

    if (query.length > 0)
        filtered = filtered.filter((item) => {
            const nameKo = String(item.name || '').toLowerCase();
            const catVal = String(item.category || '').toLowerCase();
            const catRow = categoriesCache.find((c) => c.value === item.category);
            const catLabelKo = catRow ? String(catRow.label_ko || '').toLowerCase() : '';
            return (
                nameKo.includes(query) ||
                catLabelKo.includes(query) ||
                catVal.includes(query)
            );
        });
    const shuffled = [...filtered];
    shuffleInPlace(shuffled);
    currentFilteredList = shuffled;
    renderFilteredRestaurantList();
    syncUrlToState();
}

// =============================================================================
// 비밀 제스처: 우하단 연타 → 브라우저 종료 시도
// =============================================================================

let exitTapCount = 0;
let exitTapTimer;

function setupExitTapZone() {
    const zone = document.getElementById('exit-tap-zone');
    if (!zone) return;
    zone.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        resetIdleTimer(e);
        exitTapCount++;
        clearTimeout(exitTapTimer);
        if (exitTapCount >= SECRET_TAP_TIMES) {
            exitTapCount = 0;
            const t = dict;
            if (confirm(t.exitConfirm)) {
                tryCloseKioskWindow();
            }
            return;
        }
        exitTapTimer = setTimeout(() => {
            exitTapCount = 0;
        }, 2000);
    });
}

function tryCloseKioskWindow() {
    const t = dict;
    window.close();
    setTimeout(() => {
        try {
            window.open('', '_self');
            window.close();
        } catch (_) {}
        setTimeout(() => {
            alert(t.exitManual);
        }, 200);
    }, 100);
}

// =============================================================================
// 검색창 + 제목 연타 → 관리자
// =============================================================================

let secretTapCount = 0;
let secretTapTimer;

function setupSearch() {
    const title = document.getElementById('kiosk-title');
    if(title) title.addEventListener('pointerdown', () => {
        secretTapCount++; clearTimeout(secretTapTimer);
        if (secretTapCount >= SECRET_TAP_TIMES) {
            secretTapCount = 0; const pwd = prompt('관리자 모드 비밀번호를 입력하세요');
            if (pwd === ADMIN_KIOSK_PASSWORD) window.location.href = '/admin.html'; else if (pwd !== null) alert('불일치');
        }
        secretTapTimer = setTimeout(() => { secretTapCount = 0; }, 2000);
    });

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

/** image_gallery JSON 배열(순서) 또는 image_url — 최대 4장 */
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
    return out.slice(0, 3);
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
    const heroSrc = imgList[0] ? escapeHtml(imgList[0]) : PLACEHOLDER_IMG;
    const subA = imgList[1] ? escapeHtml(imgList[1]) : heroSrc;
    const subB = imgList[2] ? escapeHtml(imgList[2]) : heroSrc;
    const bd = badgeClassForCategory(item.category);
    const displayName = escapeHtml(item.name);
    const displayCategory = escapeHtml(categoryDisplayLabel(item));
    const displayDesc = item.description ? escapeHtml(item.description).replace(/\n/g, '<br>') : '';

    let mapBtnHtml = item.map_url
        ? `<button type="button" class="map-btn js-open-map"><img src="${iniconSrcFromTabIndex(3)}" alt="" class="btn-inicon"><span>${escapeHtml(t.mapBtn)}</span></button>`
        : '';
    let menuBtnHtml = item.menu_url
        ? `<button type="button" class="map-btn menu-accent js-open-menu"><img src="${iniconSrcFromTabIndex(4)}" alt="" class="btn-inicon"><span>${escapeHtml(t.menuBtn)}</span></button>`
        : '';
    const actionsHtml =
        mapBtnHtml || menuBtnHtml
            ? `<div class="modal-actions">${mapBtnHtml}${menuBtnHtml}</div>`
            : '';

    let walkHtml = item.walk_time
        ? `<div class="walk-badge modal-walk"><img src="${iniconSrcFromTabIndex(11)}" alt="" class="walk-inicon"><span>도보 약 ${escapeHtml(String(item.walk_time))}분 소요</span></div>`
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
    if (item.open_time && item.close_time) {
        infoBlocks += `<div class="info-row">
            <div class="info-icon ic-time">${MODAL_SVG.time}</div>
            <div class="info-content">
                <div class="info-label">${escapeHtml(t.hours)}</div>
                <div class="info-val">${escapeHtml(item.open_time)} - ${escapeHtml(item.close_time)}</div>
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

    /* moon_st/list.html: 썸네일 3칸 */
    const imgSubThumbs = `
            <div class="img-sub">
              <div class="sub on"><img src="${heroSrc}" alt=""></div>
              <div class="sub"><img src="${subA}" alt=""></div>
              <div class="sub"><img src="${subB}" alt=""></div>
            </div>`;

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
          ${imgSubThumbs}
        </article>
        <article class="view-detail-wrap">
          <article class="header-area">
            <div class="cat-row">
              <span class="cat-badge ${bd}">${displayCategory}</span>
            </div>
            <div class="store-name">${displayName}</div>
            ${displayDesc ? `<div class="store-desc">${displayDesc}</div>` : ''}
            ${walkHtml}
          </article>
          <div class="divider"></div>
          <div class="info-list">${infoBlocks}</div>
          ${actionsHtml}
          <div class="qr-section">
            <div class="qr-box" id="qr-container"><span class="qr-loading">QR…</span></div>
            <div class="qr-info">
              <div class="qr-title">${escapeHtml(t.qrTitle)}</div>
              <div class="qr-sub">${t.qrSubHtml}</div>
            </div>
            <div class="qr-btn" aria-hidden="true">${MODAL_SVG.qrChevron}</div>
          </div>
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

    const mapEl = modalBody.querySelector('.js-open-map');
    if (mapEl && item.map_url) mapEl.addEventListener('click', () => openMap(item.map_url));
    const menuEl = modalBody.querySelector('.js-open-menu');
    if (menuEl && item.menu_url) menuEl.addEventListener('click', () => openMenuInfo(item.menu_url));

    const imgMainEl = modalBody.querySelector('.img-main img');
    const subThumbs = modalBody.querySelectorAll('.img-sub .sub');
    if (imgMainEl && subThumbs.length) {
        subThumbs.forEach((sub) => {
            sub.style.cursor = 'pointer';
            sub.setAttribute('role', 'button');
            sub.setAttribute('tabindex', '0');
            const activateSub = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const sm = sub.querySelector('img');
                if (!sm || !sm.src) return;
                imgMainEl.src = sm.src;
                subThumbs.forEach((s) => s.classList.toggle('on', s === sub));
            };
            sub.addEventListener('pointerdown', activateSub);
            sub.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateSub(e);
                }
            });
        });
    }

    const searchQuery = encodeURIComponent((item.name || '').trim());
    const nMapUrl = hasDestCoordsForNaver(item)
        ? buildNaverMapWalkFromHereUrl(item)
        : 'https://m.map.naver.com/search2/search.naver?query=' + searchQuery;
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

function closeModal() {
    if (overlay) {
        overlay.classList.remove('active');
        overlay.classList.remove('modal-overlay--stack-above-building');
        overlay.setAttribute('aria-hidden', 'true');
    }
}

function openMap(mapUrl) {
    const img = document.getElementById('full-map-img');
    const ov = document.getElementById('map-overlay');
    if (img) img.src = mapUrl;
    if (ov) ov.classList.add('active');
}

function closeMap() {
    document.getElementById('map-overlay')?.classList.remove('active');
}

function openMenuInfo(menuUrl) {
    const img = document.getElementById('full-menu-img');
    const ov = document.getElementById('menu-overlay');
    if (img) img.src = menuUrl;
    if (ov) ov.classList.add('active');
}

function closeMenuInfo() {
    document.getElementById('menu-overlay')?.classList.remove('active');
}

if (overlay) overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) closeModal(); });
const mo = document.getElementById('map-overlay'); if(mo) mo.addEventListener('pointerdown', (e) => { if (e.target === mo) closeMap(); });
const meo = document.getElementById('menu-overlay'); if(meo) meo.addEventListener('pointerdown', (e) => { if (e.target === meo) closeMenuInfo(); });

// =============================================================================
// 유휴 60초 → 모달 닫기 · 목록 필터 초기화 · 스크린세이버
// =============================================================================

let idleTimer;

function setScreensaverVideoPlaying(playing) {
    const v = document.getElementById('screensaverVideo');
    if (!v) return;
    if (playing) {
        v.play().catch(() => {});
    } else {
        v.pause();
    }
}

function resetIdleTimer(e) {
    const ss = document.getElementById('screensaver');
    if (ss && ss.classList.contains('active')) {
        ss.classList.remove('active');
        setScreensaverVideoPlaying(false);
    }

    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        closeModal(); closeMap(); closeMenuInfo(); closeBuildingFloorModal();
        if (IS_MAP) {
            clearMapSelection();
            updateUILanguage();
            if (ss) ss.classList.add('active');
            setScreensaverVideoPlaying(true);
            return;
        }
        if (!IS_HOME) {
            closeHomeKeyboardModal();
            homeKeyboardBuffer = '';
            const kiIdle = document.getElementById('kioskInput');
            if (kiIdle) kiIdle.value = '';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            searchQueryFromUrl = '';
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) clearBtn.classList.remove('active');
            currentCategory = 'all';
            currentSubcategory = 'all';
            document.querySelectorAll('.k-food-card[data-cat]').forEach((t) => {
                t.classList.toggle('active', t.getAttribute('data-cat') === 'all');
            });
            document.querySelectorAll('#categoryTabs .chip[data-cat]').forEach((t) => {
                t.classList.toggle('on', t.getAttribute('data-cat') === 'all');
            });
            const subEl = document.getElementById('subcategoryTabs');
            if (subEl) {
                subEl.hidden = true;
                subEl.innerHTML = '';
            }
            updateUILanguage();
            applyFilters();
            syncUrlToState();
        } else {
            closeHomeKeyboardModal();
            resetHomeKeyboardBuffer(document.getElementById('kioskInput'));
            updateUILanguage();
        }
        if (ss) ss.classList.add('active');
        setScreensaverVideoPlaying(true);
    }, 30 * 1000);
}

function setupScreensaver() {
    ['pointerdown', 'pointermove', 'keydown', 'touchstart'].forEach(evt => document.addEventListener(evt, resetIdleTimer, false));
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
            else window.location.assign('/');
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
                window.location.assign('/');
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
            window.location.assign('/');
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
                window.location.assign('/');
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
            else window.location.assign('/');
        });
    }
}
