const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbFile = path.join(__dirname, '..', 'data', 'kiosk.sqlite');
const db = new sqlite3.Database(dbFile);

db.all(
    "SELECT type, name, sql FROM sqlite_master WHERE tbl_name='info_reports'",
    [],
    (e, meta) => {
        console.log('schema/index:', meta);
        db.all(
            'SELECT id, restaurant_id, restaurant_name, message, status, created_at FROM info_reports ORDER BY id',
            [],
            (e2, rows) => {
                console.log('rows:', rows?.length, rows);
                db.close();
            }
        );
    }
);
