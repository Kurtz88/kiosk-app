/**
 * 틀린정보 신고 → data/info-reports/{업체명}.txt (같은 업체는 파일에 이어 붙임)
 */
const fs = require('fs');
const path = require('path');

const REPORTS_SUBDIR = 'info-reports';

function sanitizeReportFileBase(name) {
    let s = String(name || '')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .replace(/\.+$/g, '')
        .slice(0, 120);
    if (!s) s = 'unknown';
    return s;
}

/**
 * @returns {Promise<{ ok: boolean, path?: string, error?: string }>}
 */
function appendInfoReportTxt(dataDir, payload) {
    const { reportId, restaurantId, restaurantName, message, createdAt } = payload;
    const dir = path.join(dataDir, REPORTS_SUBDIR);
    const base = sanitizeReportFileBase(restaurantName);
    const filePath = path.join(dir, `${base}.txt`);
    const header = [
        `--- ${createdAt || new Date().toISOString()}${reportId != null ? ` · 신고 #${reportId}` : ''} ---`,
        restaurantId != null ? `식당 ID: ${restaurantId}` : null,
        `업체명: ${restaurantName}`,
    ]
        .filter(Boolean)
        .join('\n');
    const block = `${header}\n\n${message}\n`;
    const prefix = fs.existsSync(filePath) ? '\n' : '';

    return new Promise((resolve) => {
        fs.mkdir(dir, { recursive: true }, (mkdirErr) => {
            if (mkdirErr) {
                console.warn('[kiosk] 틀린정보 txt 폴더 생성 실패:', mkdirErr.message);
                return resolve({ ok: false, error: mkdirErr.message });
            }
            fs.appendFile(filePath, prefix + block, 'utf8', (err) => {
                if (err) {
                    console.warn('[kiosk] 틀린정보 txt 저장 실패:', filePath, err.message);
                    return resolve({ ok: false, error: err.message });
                }
                console.log('[kiosk] 틀린정보 txt 저장:', filePath);
                resolve({ ok: true, path: filePath });
            });
        });
    });
}

module.exports = {
    REPORTS_SUBDIR,
    sanitizeReportFileBase,
    appendInfoReportTxt,
};
