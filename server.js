/**
 * Vercel 루트 진입점 — 이 파일에서 express 패키지를 로드해야 프레임워크 감지됨.
 * 로컬은 `npm start` → backend/server.js 가 직접 listen 합니다.
 */
require('express');
module.exports = require('./backend/server');
