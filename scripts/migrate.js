const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'kiosk.sqlite');
const legacyDb = path.join(__dirname, '..', 'kiosk.sqlite');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dbFile) && fs.existsSync(legacyDb)) {
    fs.copyFileSync(legacyDb, dbFile);
}

const db = new sqlite3.Database(dbFile);

console.log("Migrating Database...");

db.serialize(() => {
    db.run("ALTER TABLE restaurants ADD COLUMN tags TEXT;", (err) => {
        if(err) console.log("Column 'tags' already exists or skipped: " + err.message);
        else console.log("Success: Added 'tags' column.");
    });
    db.run("ALTER TABLE restaurants ADD COLUMN walk_time INTEGER;", (err) => {
        if(err) console.log("Column 'walk_time' already exists or skipped: " + err.message);
        else console.log("Success: Added 'walk_time' column.");
    });
});

setTimeout(() => {
    db.close();
    console.log("Migration finished.");
}, 1500);
