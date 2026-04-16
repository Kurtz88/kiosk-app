/**
 * data/data.txt (탭 구분: 순번, 업소명, 주소, 메뉴카테고리, 하위 분류) 파싱·매핑
 */
const SUBCATEGORY_DEFAULTS = require('./subcategoryDefaults');

const CATEGORY_KO_TO_VALUE = {
    고기구이: 'meat_bbq',
    '분식&패스트푸드&샐러드': 'fast_snack',
    회해산물: 'seafood',
    술집: 'pub',
    확인필요: 'pending_review',
    한식: 'korean',
    국수: 'noodles',
    다국적음식: 'intl_food',
    '카페&디저트': 'cafe_dessert',
    국밥: 'gukbap',
    '막창&곱창': 'gopchang',
    '치킨&찜닭': 'chicken',
    '족발&보쌈': 'jokbal'
};

/** @type {Record<string, Record<string, string>>} */
const SUB_BY_CATEGORY = {
    meat_bbq: {
        돼지: 'pork',
        '돼지, 소': 'beef_pork_dup',
        '돼지,소': 'beef_pork_dup',
        소: 'beef',
        양: 'lamb',
        장어: 'eel',
        '기타(숯불)': 'etc_charcoal',
        '기타(숯불구이)': 'etc_charcoal'
    },
    fast_snack: {
        피자: 'pizza',
        햄버거: 'burger',
        토스트: 'toast',
        도시락: 'lunch_box',
        떡볶이: 'tteokbokki'
    },
    seafood: {
        오징어: 'squid',
        아구: 'monkfish',
        소라오징어: 'sora_squid',
        대게: 'king_crab',
        조개: 'clam',
        참치회: 'tuna_sashimi',
        해산물: 'seafood_mix'
    },
    pub: {
        포차: 'pocha',
        바: 'bar',
        맥주: 'beer',
        이자카야: 'izakaya',
        한식술집: 'korean_pub',
        생고기전문점: 'sangogi_pub',
        아나고전문점: 'anago_pub',
        오뎅전문점: 'odeng_pub',
        꼬치전문점: 'skewer_pub',
        전집: 'jeon_pub',
        해산물: 'seafood_pub',
        이: 'typo_i_pub'
    },
    intl_food: {
        일본음식: 'japanese',
        일본: 'japanese',
        인도음식: 'indian',
        인도: 'indian',
        베트남음식: 'vietnamese',
        퓨전음식: 'fusion',
        퓨전: 'fusion',
        중국음식: 'chinese',
        중국: 'chinese',
        이탈리아음식: 'italian',
        이탈리아: 'italian',
        뷔페: 'buffet'
    },
    cafe_dessert: {
        브런치: 'brunch',
        비건빵: 'vegan_bread',
        아이스크림: 'ice_cream',
        크로플: 'croffle',
        도넛: 'donut',
        호떡: 'hotteok',
        땅콩빵: 'peanut_bread',
        떡: 'tteok',
        빙수: 'bingsu',
        베이글: 'bagel',
        콩국: 'kong_guk',
        커피전문점: 'coffee_shop',
        베이커리: 'bakery'
    },
    gukbap: {
        소머리국밥: 'sumeori_gukbap',
        돼지국밥: 'pork_gukbap',
        감자탕: 'gamjatang',
        콩나물국밥: 'kongnamul_gukbap'
    },
    chicken: {
        치킨: 'fried_chicken',
        찜닭: 'jjimdak',
        닭강정: 'dakgangjeong',
        닭갈비: 'dakgalbi'
    },
    korean: {
        볶음: 'bokkeum',
        찌개: 'jjigae',
        순대: 'sundae',
        게장: 'gejang',
        김치찜: 'kimchi_jjim',
        추어탕: 'chueotang',
        여러가지: 'korean_misc'
    },
    jokbal: {
        족발: 'jokbal',
        보쌈: 'bossam'
    }
};

const labelToSubValue = new Map();
for (const s of SUBCATEGORY_DEFAULTS) {
    labelToSubValue.set(`${s.category_value}\t${s.label_ko}`, s.value);
}

/**
 * @param {string} line
 * @returns {{ name: string, address: string, categoryKo: string, subKo: string } | null}
 */
function parseDataLine(line) {
    const raw = line.replace(/\r$/, '');
    if (!raw.trim()) return null;
    const p = raw.split('\t');
    if (p.length < 4) return null;
    const name = (p[1] || '').trim();
    let address;
    let categoryKo;
    let subKo;
    if (p.length === 4) {
        address = (p[2] || '').trim();
        categoryKo = (p[3] || '').trim();
        subKo = '';
    } else {
        categoryKo = (p[p.length - 2] || '').trim();
        subKo = (p[p.length - 1] || '').trim();
        address = p.slice(2, p.length - 2).join('\t').trim();
    }
    if (!name || !categoryKo) return null;
    return { name, address, categoryKo, subKo };
}

/**
 * @param {string} categoryValue
 * @param {string} subKo
 * @returns {string | null}
 */
function mapSubcategory(categoryValue, subKo) {
    const s = subKo.trim();
    if (!s) return null;

    const direct = SUB_BY_CATEGORY[categoryValue]?.[s];
    if (direct) return direct;

    const byLabel = labelToSubValue.get(`${categoryValue}\t${s}`);
    if (byLabel) return byLabel;

    const noFood = s.replace(/음식$/, '').trim();
    if (noFood !== s && SUB_BY_CATEGORY[categoryValue]?.[noFood]) {
        return SUB_BY_CATEGORY[categoryValue][noFood];
    }
    if (noFood !== s) {
        const byLabel2 = labelToSubValue.get(`${categoryValue}\t${noFood}`);
        if (byLabel2) return byLabel2;
    }

    return null;
}

/**
 * @param {string} text full file utf-8
 */
function parseDataTxt(text) {
    const normalized = text.replace(/^\uFEFF/, '');
    const lines = normalized.split(/\r?\n/);
    const header = lines[0] || '';
    if (!header.includes('업소명') || !header.includes('메뉴')) {
        throw new Error('첫 줄이 헤더(업소명/메뉴카테고리)가 아닙니다.');
    }
    const rows = [];
    const unmappedSubs = [];
    for (let i = 1; i < lines.length; i++) {
        const parsed = parseDataLine(lines[i]);
        if (!parsed) continue;
        const catVal = CATEGORY_KO_TO_VALUE[parsed.categoryKo];
        if (!catVal) {
            unmappedSubs.push({ line: i + 1, reason: 'unknown_category', categoryKo: parsed.categoryKo, name: parsed.name });
            continue;
        }
        let subVal = mapSubcategory(catVal, parsed.subKo);
        if (parsed.subKo && !subVal) {
            unmappedSubs.push({
                line: i + 1,
                reason: 'unknown_sub',
                categoryKo: parsed.categoryKo,
                subKo: parsed.subKo,
                name: parsed.name
            });
        }
        rows.push({
            name: parsed.name,
            address: parsed.address || '',
            category: catVal,
            subcategory: subVal
        });
    }
    return { rows, unmappedSubs };
}

module.exports = {
    CATEGORY_KO_TO_VALUE,
    parseDataTxt,
    mapSubcategory,
    parseDataLine
};
