const fs = require('fs');
const path = require('path');

try {
    const appJsPath = path.join(__dirname, 'public', 'js', 'app.js');
    let app = fs.readFileSync(appJsPath, 'utf8');
    app = app.replace('closeMenuInfo(); resetAI();', 'closeMenuInfo();');
    app = app.replace(/function aiFlow[\s\S]*?let idleTimer;/m, 'let idleTimer;');
    fs.writeFileSync(appJsPath, app);
    console.log('Cleaned app.js');

    const cssPath = path.join(__dirname, 'public', 'css', 'style.css');
    let css = fs.readFileSync(cssPath, 'utf8');
    const idx = css.indexOf('/* AI Bot Sidebar */');
    if (idx !== -1) {
        css = css.substring(0, idx);
        fs.writeFileSync(cssPath, css);
        console.log('Cleaned style.css');
    }
} catch (e) {
    console.error(e);
}
