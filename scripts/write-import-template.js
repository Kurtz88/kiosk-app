const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const outDir = path.join(__dirname, '..', 'public', 'templates');
const outPath = path.join(outDir, 'restaurant-import-template.xlsx');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

/** 기본 업로드 열: 순서·상호명·주소·전화·영업시간·휴무·카테고리·주요메뉴·한줄설명 (서버는 업로드 시 restaurants 전체 교체) */
const headers = [
    '순서',
    '상호명',
    '주소',
    '전화번호',
    '영업시간',
    '휴무일',
    '카테고리',
    '주요메뉴',
    '한줄설명'
];
const example = [
    1,
    '예시맛집',
    '지하1층 푸드코트',
    '02-123-4567',
    '11:00-21:00',
    '매주 월요일',
    'korean',
    '비빔밥·갈비',
    '한식 전문점입니다.'
];

const ws = XLSX.utils.aoa_to_sheet([headers, example]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '식당목록');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync(outPath, buf);
console.log('작성 완료:', outPath, '(' + buf.length + ' bytes)');
