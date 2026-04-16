/**
 * 1차 categories.value 와 매칭되는 2차 분류 기본값.
 * restaurants.subcategory 저장값은 value 와 일치해야 합니다.
 */
module.exports = [
    // 카페&디저트 (cafe_dessert)
    { category_value: 'cafe_dessert', value: 'coffee_shop', label_ko: '커피전문점', label_en: 'Coffee shop', sort_order: 10 },
    { category_value: 'cafe_dessert', value: 'bakery', label_ko: '베이커리', label_en: 'Bakery', sort_order: 20 },
    { category_value: 'cafe_dessert', value: 'bagel', label_ko: '베이글', label_en: 'Bagel', sort_order: 30 },
    { category_value: 'cafe_dessert', value: 'bingsu', label_ko: '빙수', label_en: 'Bingsu', sort_order: 40 },
    { category_value: 'cafe_dessert', value: 'tteok', label_ko: '떡', label_en: 'Rice cake', sort_order: 50 },
    { category_value: 'cafe_dessert', value: 'vegan_bread', label_ko: '비건빵', label_en: 'Vegan bakery', sort_order: 60 },
    { category_value: 'cafe_dessert', value: 'brunch', label_ko: '브런치', label_en: 'Brunch', sort_order: 70 },
    { category_value: 'cafe_dessert', value: 'ice_cream', label_ko: '아이스크림', label_en: 'Ice cream', sort_order: 80 },

    // 고기구이 (meat_bbq)
    { category_value: 'meat_bbq', value: 'pork', label_ko: '돼지', label_en: 'Pork', sort_order: 10 },
    { category_value: 'meat_bbq', value: 'beef', label_ko: '소', label_en: 'Beef', sort_order: 20 },
    { category_value: 'meat_bbq', value: 'lamb', label_ko: '양', label_en: 'Lamb', sort_order: 30 },
    { category_value: 'meat_bbq', value: 'eel', label_ko: '장어', label_en: 'Eel', sort_order: 40 },
    { category_value: 'meat_bbq', value: 'etc_charcoal', label_ko: '기타(숯불구이)', label_en: 'Other charcoal grill', sort_order: 50 },
    { category_value: 'meat_bbq', value: 'beef_pork_dup', label_ko: '중복(소&돼지)', label_en: 'Beef & pork', sort_order: 60 },

    // 술집 (pub)
    { category_value: 'pub', value: 'pocha', label_ko: '포차', label_en: 'Pocha', sort_order: 10 },
    { category_value: 'pub', value: 'bar', label_ko: '바', label_en: 'Bar', sort_order: 20 },
    { category_value: 'pub', value: 'beer', label_ko: '맥주', label_en: 'Beer pub', sort_order: 30 },
    { category_value: 'pub', value: 'izakaya', label_ko: '이자카야', label_en: 'Izakaya', sort_order: 40 },
    { category_value: 'pub', value: 'pub_etc', label_ko: '기타', label_en: 'Other', sort_order: 50 },

    // 다국적음식 (intl_food)
    { category_value: 'intl_food', value: 'chinese', label_ko: '중국', label_en: 'Chinese', sort_order: 10 },
    { category_value: 'intl_food', value: 'japanese', label_ko: '일본', label_en: 'Japanese', sort_order: 20 },
    { category_value: 'intl_food', value: 'vietnamese', label_ko: '베트남음식', label_en: 'Vietnamese', sort_order: 30 },
    { category_value: 'intl_food', value: 'fusion', label_ko: '퓨전', label_en: 'Fusion', sort_order: 40 },
    { category_value: 'intl_food', value: 'buffet', label_ko: '뷔페', label_en: 'Buffet', sort_order: 50 },
    { category_value: 'intl_food', value: 'italian', label_ko: '이탈리아', label_en: 'Italian', sort_order: 60 },
    { category_value: 'intl_food', value: 'indian', label_ko: '인도', label_en: 'Indian', sort_order: 70 },

    // 분식&패스트푸드&샐러드 (fast_snack)
    { category_value: 'fast_snack', value: 'tteokbokki', label_ko: '떡볶이', label_en: 'Tteokbokki', sort_order: 10 },
    { category_value: 'fast_snack', value: 'gimbap', label_ko: '김밥', label_en: 'Gimbap', sort_order: 20 },
    { category_value: 'fast_snack', value: 'salad', label_ko: '샐러드', label_en: 'Salad', sort_order: 30 },
    { category_value: 'fast_snack', value: 'pizza', label_ko: '피자', label_en: 'Pizza', sort_order: 40 },
    { category_value: 'fast_snack', value: 'burger', label_ko: '햄버거', label_en: 'Burger', sort_order: 50 },
    { category_value: 'fast_snack', value: 'toast', label_ko: '토스트', label_en: 'Toast', sort_order: 60 },
    { category_value: 'fast_snack', value: 'lunch_box', label_ko: '도시락전문점', label_en: 'Lunch box', sort_order: 70 },

    // 치킨&찜닭 (chicken)
    { category_value: 'chicken', value: 'fried_chicken', label_ko: '치킨', label_en: 'Fried chicken', sort_order: 10 },
    { category_value: 'chicken', value: 'jjimdak', label_ko: '찜닭', label_en: 'Jjimdak', sort_order: 20 },
    { category_value: 'chicken', value: 'dakgangjeong', label_ko: '닭강정', label_en: 'Sweet crispy chicken', sort_order: 30 },
    { category_value: 'chicken', value: 'dakgalbi', label_ko: '닭갈비', label_en: 'Dakgalbi', sort_order: 40 },

    // 한식 (korean)
    { category_value: 'korean', value: 'bokkeum', label_ko: '볶음', label_en: 'Stir-fry', sort_order: 10 },
    { category_value: 'korean', value: 'jjigae', label_ko: '찌개', label_en: 'Stew', sort_order: 20 },
    { category_value: 'korean', value: 'sundae', label_ko: '순대', label_en: 'Sundae', sort_order: 30 },
    { category_value: 'korean', value: 'gejang', label_ko: '게장', label_en: 'Gejang', sort_order: 40 },
    { category_value: 'korean', value: 'kimchi_jjim', label_ko: '김치찜', label_en: 'Kimchi jjim', sort_order: 50 },
    { category_value: 'korean', value: 'chueotang', label_ko: '추어탕', label_en: 'Chueo tang', sort_order: 60 },

    // 국밥 (gukbap)
    { category_value: 'gukbap', value: 'kongnamul_gukbap', label_ko: '콩나물국밥', label_en: 'Bean sprout gukbap', sort_order: 10 },
    { category_value: 'gukbap', value: 'pork_gukbap', label_ko: '돼지국밥', label_en: 'Pork gukbap', sort_order: 20 },
    { category_value: 'gukbap', value: 'sumeori_gukbap', label_ko: '소머리국밥', label_en: 'Ox head gukbap', sort_order: 30 },
    { category_value: 'gukbap', value: 'gamjatang', label_ko: '감자탕', label_en: 'Gamjatang', sort_order: 40 },

    // 회&해산물 (seafood)
    { category_value: 'seafood', value: 'squid', label_ko: '오징어', label_en: 'Squid', sort_order: 10 },
    { category_value: 'seafood', value: 'monkfish', label_ko: '아구', label_en: 'Monkfish', sort_order: 20 },
    { category_value: 'seafood', value: 'sora_squid', label_ko: '소라오징어', label_en: 'Whelk & squid', sort_order: 30 },
    { category_value: 'seafood', value: 'king_crab', label_ko: '대게', label_en: 'King crab', sort_order: 40 },
    { category_value: 'seafood', value: 'clam', label_ko: '조개', label_en: 'Clam', sort_order: 50 },
    { category_value: 'seafood', value: 'tuna_sashimi', label_ko: '참치회', label_en: 'Tuna sashimi', sort_order: 60 },
    { category_value: 'seafood', value: 'seafood_mix', label_ko: '해산물', label_en: 'Seafood', sort_order: 70 },

    // 카페&디저트 추가
    { category_value: 'cafe_dessert', value: 'croffle', label_ko: '크로플', label_en: 'Croffle', sort_order: 90 },
    { category_value: 'cafe_dessert', value: 'donut', label_ko: '도넛', label_en: 'Donut', sort_order: 100 },
    { category_value: 'cafe_dessert', value: 'hotteok', label_ko: '호떡', label_en: 'Hotteok', sort_order: 110 },
    { category_value: 'cafe_dessert', value: 'peanut_bread', label_ko: '땅콩빵', label_en: 'Peanut bread', sort_order: 120 },
    { category_value: 'cafe_dessert', value: 'kong_guk', label_ko: '콩국', label_en: 'Kongguksu', sort_order: 130 },

    // 술집 추가
    { category_value: 'pub', value: 'korean_pub', label_ko: '한식술집', label_en: 'Korean pub', sort_order: 60 },
    { category_value: 'pub', value: 'sangogi_pub', label_ko: '생고기전문점', label_en: 'Raw meat specialty', sort_order: 70 },
    { category_value: 'pub', value: 'anago_pub', label_ko: '아나고전문점', label_en: 'Conger eel', sort_order: 80 },
    { category_value: 'pub', value: 'odeng_pub', label_ko: '오뎅전문점', label_en: 'Fish cake bar', sort_order: 90 },
    { category_value: 'pub', value: 'skewer_pub', label_ko: '꼬치전문점', label_en: 'Skewer bar', sort_order: 100 },
    { category_value: 'pub', value: 'jeon_pub', label_ko: '전집', label_en: 'Jeon house', sort_order: 110 },
    { category_value: 'pub', value: 'seafood_pub', label_ko: '해산물(술집)', label_en: 'Seafood pub', sort_order: 120 },
    { category_value: 'pub', value: 'typo_i_pub', label_ko: '이(입력오류)', label_en: 'Typo', sort_order: 130 },

    // 족발&보쌈
    { category_value: 'jokbal', value: 'jokbal', label_ko: '족발', label_en: 'Jokbal', sort_order: 10 },
    { category_value: 'jokbal', value: 'bossam', label_ko: '보쌈', label_en: 'Bossam', sort_order: 20 },

    // 한식 추가
    { category_value: 'korean', value: 'korean_misc', label_ko: '여러가지', label_en: 'Various', sort_order: 70 }
];
