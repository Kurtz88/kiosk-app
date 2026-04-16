const fs = require('fs');
const path = require('path');
const stylePath = path.join(__dirname, '../public/css/style.css');
const insert = fs.readFileSync(path.join(__dirname, '../tmp-map-stage.css'), 'utf8');
const scopedClick = `
html[data-kiosk-page="map"] .map-click-txt {
    text-align: center;
    line-height: 1.35;
    font-size: clamp(0.88rem, 2.8cqh, 1.05rem);
    padding: 0 8px clamp(16px, 5cqh, 40px);
    font-weight: 500;
    border-radius: 20vh;
    position: relative;
    z-index: 2;
    color: var(--text-700);
}
`;
const lines = fs.readFileSync(stylePath, 'utf8').split(/\r?\n/);
const head = lines.slice(0, 1819).join('\n');
const tail = lines.slice(2100).join('\n');
const out = head + '\n\n' + insert + '\n' + scopedClick + (tail ? '\n' + tail : '\n');
fs.writeFileSync(stylePath, out, 'utf8');
console.log('lines in:', lines.length, 'out bytes:', out.length);
