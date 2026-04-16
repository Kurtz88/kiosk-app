/**
 * 키오스크 12개 1차 카테고리 기본 정의.
 * restaurants.category 저장값은 value 와 일치해야 합니다.
 * 2차 분류 기본값은 lib/subcategoryDefaults.js (DB 시드)를 참고하세요.
 */
module.exports = [
    { value: 'cafe_dessert', label_ko: '카페&디저트', label_en: 'Cafe & Dessert', icon: '☕', sort_order: 10 },
    { value: 'meat_bbq', label_ko: '고기구이', label_en: 'BBQ & Grill', icon: '🥩', sort_order: 20 },
    { value: 'pub', label_ko: '술집', label_en: 'Pub & Bar', icon: '🍺', sort_order: 30 },
    { value: 'intl_food', label_ko: '다국적음식', label_en: 'International', icon: '🌏', sort_order: 40 },
    { value: 'fast_snack', label_ko: '분식&패스트푸드&샐러드', label_en: 'Fast food & Salad', icon: '🍔', sort_order: 50 },
    { value: 'chicken', label_ko: '치킨&찜닭', label_en: 'Chicken', icon: '🍗', sort_order: 60 },
    { value: 'seafood', label_ko: '회&해산물', label_en: 'Seafood', icon: '🐟', sort_order: 70 },
    { value: 'korean', label_ko: '한식', label_en: 'Korean', icon: '🍚', sort_order: 80 },
    { value: 'gopchang', label_ko: '막창&곱창', label_en: 'Offal BBQ', icon: '🔥', sort_order: 90 },
    { value: 'gukbap', label_ko: '국밥', label_en: 'Gukbap', icon: '🍲', sort_order: 100 },
    { value: 'jokbal', label_ko: '족발&보쌈', label_en: 'Jokbal & Bossam', icon: '🐷', sort_order: 110 },
    { value: 'noodles', label_ko: '국수', label_en: 'Noodles', icon: '🍜', sort_order: 120 },
    { value: 'pending_review', label_ko: '확인필요', label_en: 'Pending review', icon: '❓', sort_order: 200 }
];
