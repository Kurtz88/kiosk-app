'use strict';

/**
 * Vercel serverless 진입점 (@vercel/node → Express app export)
 */
require('express');
const app = require('./backend/server');

module.exports = app;
module.exports.default = app;
