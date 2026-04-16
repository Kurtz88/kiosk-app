# 키오스크 프론트 유지보수 맵

번들러 없이 정적 HTML + JS로 동작합니다. 스크립트 **로드 순서**가 깨지면 런타임 오류가 납니다.

## 페이지별 스크립트

| 페이지 | `data-kiosk-page` | 스크립트 순서 |
|--------|-------------------|---------------|
| `index.html` | `home` | `hangul.js` → **`kiosk/kiosk-i18n.js`** → `app.js` |
| `list.html` | `list` | 동일 |
| `map.html` | `map` | **`kiosk/kiosk-i18n.js`** → `app.js` (Hangul 미사용) |

- **UI 문구·모달 아이콘 SVG**: `public/js/kiosk/kiosk-i18n.js` → `window.KIOSK_I18N = { dict, MODAL_SVG }`
- **로직 본체**: `public/js/app.js` — `kiosk-i18n.js`보다 **반드시 뒤**에 로드
- **한글 조합**: `public/js/hangul.js` — 홈·목록만 필요
- **자판 마크업**: `public/partials/keyboard-modal.html` — `app.js`의 `KEYBOARD_PARTIAL_URL`과 버전 쿼리 맞추기

캐시 무력화를 위해 `?v=`를 바꿀 때는 **같이 묶인 스크립트**(특히 `kiosk-i18n.js` + `app.js`)를 같은 버전으로 올리는 것이 안전합니다.

## CSS (공통)

대부분의 키오스크 페이지:

1. `css/moon-layout.css`
2. `css/kiosk-moon-overrides.css` (실제 레이아웃·테마 오버라이드가 큼)

## `app.js` 섹션 목차 (파일 내 `// ===` 주석과 대응)

1. 설정 · 비밀 제스처  
2. 페이지 구분 · 전역 상태 (`IS_HOME` / `IS_LIST` / `IS_MAP`, 지도 슬롯 유틸, 한글 버퍼)  
3. 네트워크 · 문자열 유틸 (`fetchJson`, `escapeHtml`, 셔플)  
4. `list.html` URL ↔ 필터 (`cat` / `sub` / `q`)  
5. 자주 쓰는 DOM 참조  
6. 카테고리 카드 · 뱃지 · 아이콘 경로  
7. i18n 연결 (`KIOSK_I18N`에서 `dict`, `MODAL_SVG` 할당)  
8. 터치 자판 주입 (`injectKioskKeyboardModal`)  
9. `DOMContentLoaded` 진입점  
10. 카테고리 표시명 · `updateListHero`  
11. 종류 탭(1차) · 2차 칩 렌더/위임  
12. `loadKioskData` — 이어서 **지도 전용**: `fitMapStage`, `loadMapPage`, `setupMapGrid`, 층별 모달 등  
13. 목록 행 영업 뱃지 · `renderList` · `renderFilteredRestaurantList` (필터 결과 전체)  
14. `updateUILanguage`  
15. 필터 · `applyFilters`  
16. 우하단 연타 종료  
17. 제목 연타 관리자 · 검색/자판  
18. 상세 모달 · 지도/메뉴 오버레이  
19. 유휴 타이머 · 스크린세이버  
20. 헤더 시계 · 헤더 네비 · 푸터 탭  

## 관련 파일 (빠른 참조)

- `public/admin.html` — 관리자 UI (`app.js`와 별도)
- `backend/` — `/api/*` 제공
