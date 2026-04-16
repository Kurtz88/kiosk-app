const path = require('path');
const fs = require('fs');
const db = require('../backend/db');
const { importRowsFromBuffer } = require('../lib/excelImport');

const excelPath = process.argv[2];
const uploadsSrc = process.argv[3];

function copyUploadsDir(srcDir, destDir) {
    if (!srcDir || !fs.existsSync(srcDir)) return 0;
    const st = fs.statSync(srcDir);
    if (!st.isDirectory()) return 0;
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    let n = 0;
    for (const name of fs.readdirSync(srcDir)) {
        const from = path.join(srcDir, name);
        if (!fs.statSync(from).isFile()) continue;
        const ext = path.extname(name).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) continue;
        fs.copyFileSync(from, path.join(destDir, name));
        n++;
    }
    return n;
}

async function main() {
    if (!excelPath) {
        console.error('사용법: node scripts/usb-update.js <엑셀경로> [USB\\uploads 폴더 경로]');
        process.exit(1);
    }
    const resolved = path.resolve(excelPath);
    if (!fs.existsSync(resolved)) {
        console.error('[오류] 엑셀 파일을 찾을 수 없습니다:', resolved);
        process.exit(1);
    }

    const destUploads = path.join(__dirname, '..', 'public', 'uploads');
    if (uploadsSrc) {
        const copied = copyUploadsDir(path.resolve(uploadsSrc), destUploads);
        if (copied > 0) console.log('[이미지] public/uploads 로 사진 ' + copied + '개 복사했습니다.');
    }

    const buffer = fs.readFileSync(resolved);
    const { imported, emptySkipped, errors } = await importRowsFromBuffer(db, buffer);

    console.log('[엑셀] 신규 ' + imported + '건 DB에 추가됨.');
    if (emptySkipped > 0) console.log('[엑셀] 빈 행 ' + emptySkipped + '건 생략.');
    if (errors.length) {
        console.log('[엑셀] 문제 행 ' + errors.length + '건:');
        errors.slice(0, 15).forEach((e) => console.log('  - ' + e.row + '행: ' + e.message));
        if (errors.length > 15) console.log('  … 외 ' + (errors.length - 15) + '건');
        process.exitCode = 1;
    }
}

main().catch((e) => {
    console.error('[오류]', e.message || e);
    process.exit(1);
});
