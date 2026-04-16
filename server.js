/**
 * Vercel이 찾는 루트 진입점(Express 앱 export).
 * 로컬은 `npm start` → backend/server.js 가 직접 listen 합니다.
 */
module.exports = require('./backend/server');
