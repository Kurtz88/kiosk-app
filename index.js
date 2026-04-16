/**
 * Vercel 대체 진입점(index.js). express를 여기서 한 번 로드해 감지되게 함.
 */
require('express');
module.exports = require('./backend/server');
