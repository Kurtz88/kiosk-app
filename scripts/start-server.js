#!/usr/bin/env node
/**
 * 로컬 키오스크 서버 — DB는 항상 프로젝트 data/kiosk.sqlite (틀린정보 신고 포함).
 */
const path = require('path');

process.env.KIOSK_USE_TMP_DB = '0';
process.chdir(path.join(__dirname, '..'));

require('../lib/loadEnv').loadEnvFile();

const db = require('../backend/db');
const app = require('../backend/server');
const os = require('os');

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

function firstLanIPv4() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            const v4 = net.family === 'IPv4' || net.family === 4;
            if (v4 && !net.internal) return net.address;
        }
    }
    return null;
}

function printListenBanner() {
    const lan = firstLanIPv4();
    const line = '  ─────────────────────────────────────────────────────────────';
    const box = '  ═════════════════════════════════════════════════════════════';
    console.log('');
    console.log(box);
    console.log('   RESTAURANT KIOSK · 서버 준비됨');
    console.log(line);
    const reportsFile = (db.infoReports && db.infoReports.dbFile) || path.join(__dirname, '..', 'data', 'kiosk.sqlite');
    console.log('   DB(식당)    ' + (db.dbFile || '') + ' · 영구');
    console.log('   DB(신고)    ' + reportsFile + ' · 영구');
    console.log('   이 PC       http://localhost:' + port + '/');
    if (lan) {
        console.log('   같은 Wi-Fi  http://' + lan + ':' + port + '/   관리자 /admin.html');
    }
    console.log(line);
    console.log(box);
    console.log('');
}

db.ready
    .then(() => {
        app.listen(port, host, printListenBanner);
    })
    .catch((err) => {
        console.error('DB 초기화 실패 — 서버를 시작할 수 없습니다:', err);
        process.exit(1);
    });
