const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const outDir = path.join(__dirname, '..', 'public', 'templates');
const outPath = path.join(outDir, 'restaurant-import-template.xlsx');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const headers = [
    '상호명', '상호명(영문)', '카테고리', '2차분류', '주소', '키오스크숨김', '전화', '홈페이지',
    '오픈시간', '마감시간', '휴무일', '도보(분)', '태그', '소개(한)', '소개(영)',
    '이미지URL', '약도URL', '메뉴URL'
];
const example = [
    '예시맛집', 'Sample Restaurant', 'korean', '', '지하1층 푸드코트', 0, '02-123-4567', '',
    '11:00', '21:00', '매주 월요일', 5, '주차,룸', '한식 전문점입니다.', 'Korean restaurant.',
    '', '', ''
];

const ws = XLSX.utils.aoa_to_sheet([headers, example]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '식당목록');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync(outPath, buf);
console.log('작성 완료:', outPath, '(' + buf.length + ' bytes)');
