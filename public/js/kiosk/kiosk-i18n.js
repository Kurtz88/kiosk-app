/**
 * 키오스크 UI 문구(dict) · 상세 모달 SVG(MODAL_SVG)
 * - 수정 후: index / list / map 의 kiosk-i18n.js?v= 쿼리 갱신 권장
 * - app.js 는 window.KIOSK_I18N 을 읽습니다 (이 파일을 먼저 로드)
 */
(function () {
    const dict = {
        titleEm: '달빛거리 먹자골목',
        titleSub: '음식점 안내도',
        titleSubList: '등록 음식점',
        subtitle:
            '달빛거리에서 맛있는 음식을 찾으시나요? 원하는 종류를 선택하고 업소 위치를 확인해 보세요.',
        subtitleHome:
            '달빛거리먹자골목에서 맛있는 음식을 찾으시나요?\n원하는 음식 종류를 선택하시고\n업소 위치를 확인 후 바로 GO GO!',
        searchPlaceholder: '업소명·종류(한글)·영문으로 검색...',
        mapBtn: '가시는 길 지도 보기',
        menuBtn: '메뉴판 크게 보기',
        empty: '검색 결과가 없습니다.<br>상단 종류 카드를 눌러보세요.',
        location: '상세위치',
        phone: '매장번호',
        homepage: '웹사이트',
        hours: '영업시간',
        ssTitle: '달빛거리 먹자골목',
        ssSubtitle: '화면을 터치해서 맛집을 찾아보세요!',
        allCat: '전체 보기',
        listCategoryAllChip: '전체',
        allSubCat: '세부 전체',
        qrTitle: '업소까지 경로 안내',
        qrSubHtml: 'QR을 스캔하면 업소까지<br>가시는 길을 안내해 드립니다.',
        modalAddrLabel: '주소 · 위치',
        modalPhoneLabel: '연락처',
        modalMenuLabel: '주요메뉴',
        listLabelMainMenu: '주요메뉴',
        listLabelFacilities: '시설 및 서비스',
        closedDays: '휴무일',
        listLabelName: '업소명',
        listLabelAddr: '주소',
        listLabelTel: '전화',
        listLabelClosed: '휴무일',
        listPlaceholder: '—',
        exitConfirm: '브라우저 창을 종료할까요?',
        exitManual: '자동으로 닫히지 않으면 Alt+F4 로 종료해 주세요.',
        mapEmptySlot: '이 구역에 연결된 음식점이 없습니다.',
        mapResultCount: (n) => `총 ${n}곳의 음식점이 있어요`,
        mapPromptTitle: '건물을 선택하세요',
        mapSlotTitle: (slot) => `건물 ${slot}번`,
        mapBuildingFloorTitle: (slot) => `${slot}번 건물 층별 안내`,
        mapBuildingFloorHint: '음식점을 클릭하시면 자세히 보실 수 있습니다.',
        mapFloorEmpty: '새로운 매장이 들어올 예정입니다.',
        mapFloorOther: '기타',
        mapBuildingLocSep: ' · '
    };

    const MODAL_SVG = {
        close:
            '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6 modal-close-svg" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>',
        loc: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#5470e0" class="size-6" aria-hidden="true"><path fill-rule="evenodd" d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 0 0-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.145.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd"/></svg>',
        tel: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2dbe8a" class="size-6" aria-hidden="true"><path d="M7 2H18C18.5523 2 19 2.44772 19 3V21C19 21.5523 18.5523 22 18 22H6C5.44772 22 5 21.5523 5 21V0H7V2ZM7 4V9H17V4H7Z"/></svg>',
        time: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#f5a623" class="size-6" aria-hidden="true"><path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clip-rule="evenodd"/></svg>',
        web: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#5470e0" class="size-6" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
        menu: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#5470e0" class="size-6" aria-hidden="true"><path d="M4.22235 3.80753L10.9399 10.525L8.11144 13.3535L4.22235 9.46438C2.66026 7.90229 2.66026 5.36963 4.22235 3.80753ZM14.2683 12.1464L13.4147 12.9999L20.4858 20.071L19.0716 21.4852L12.0005 14.4141L4.92946 21.4852L3.51525 20.071L12.854 10.7322C12.2664 9.27525 12.8738 7.1769 14.4754 5.5753C16.428 3.62268 19.119 3.1478 20.4858 4.51464C21.8526 5.88147 21.3778 8.57242 19.4251 10.525C17.8235 12.1267 15.7252 12.7341 14.2683 12.1464Z"/></svg>',
        day: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#d985c4" class="size-6" aria-hidden="true"><path d="M7 1V3H3C2.44772 3 2 3.44772 2 4V20C2 20.5523 2.44772 21 3 21H10.7546C9.65672 19.6304 9 17.8919 9 16C9 11.5817 12.5817 8 17 8C18.8919 8 20.6304 8.65672 22 9.75463V4C22 3.44772 21.5523 3 21 3H17V1H15V3H9V1H7ZM23 16C23 19.3137 20.3137 22 17 22C13.6863 22 11 19.3137 11 16C11 12.6863 13.6863 10 17 10C20.3137 10 23 12.6863 23 16ZM16 12V16.4142L18.2929 18.7071L19.7071 17.2929L18 15.5858V12H16Z"/></svg>',
        qrChevron:
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    };

    window.KIOSK_I18N = { dict, MODAL_SVG };
})();
