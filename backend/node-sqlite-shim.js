'use strict';

/**
 * sqlite3 패키지 대신 node:sqlite(DatabaseSync)를 쓰되,
 * 기존 코드가 기대하는 run/get/all/prepare/serialize + 콜백(this.lastID 등)을 맞춤.
 * 콜백은 sqlite3 serialize와 유사하게 동기 호출(순서 보장).
 */

function parseArgs(args) {
    const last = args[args.length - 1];
    let cb;
    let bind = args.slice();
    if (bind.length >= 1 && typeof last === 'function') {
        cb = bind.pop();
    }
    if (bind.length === 1 && Array.isArray(bind[0])) {
        bind = bind[0];
    }
    return { bind, cb };
}

function wrapDb(database) {
    function serialize(fn) {
        try {
            fn();
        } catch (e) {
            console.error('[sqlite-shim] serialize:', e);
            throw e;
        }
    }

    function run(sql, ...args) {
        const { bind, cb } = parseArgs(args);
        try {
            const stmt = database.prepare(sql);
            const result = stmt.run(...bind);
            const ctx = {
                lastID: Number(result?.lastInsertRowid ?? 0),
                changes: Number(result?.changes ?? 0),
            };
            if (cb) cb.call(ctx, null);
        } catch (err) {
            if (cb) cb.call(undefined, err);
            else throw err;
        }
    }

    function get(sql, ...args) {
        const { bind, cb } = parseArgs(args);
        try {
            const stmt = database.prepare(sql);
            const row = stmt.get(...bind);
            if (cb) cb(null, row);
        } catch (err) {
            if (cb) cb(err);
            else throw err;
        }
    }

    function all(sql, ...args) {
        const { bind, cb } = parseArgs(args);
        try {
            const stmt = database.prepare(sql);
            const rows = stmt.all(...bind);
            if (cb) cb(null, rows);
        } catch (err) {
            if (cb) cb(err);
            else throw err;
        }
    }

    function prepare(sql) {
        const stmt = database.prepare(sql);
        return {
            run(...rargs) {
                return stmt.run(...rargs);
            },
            finalize(cb) {
                if (typeof cb === 'function') cb();
            },
        };
    }

    return { serialize, run, get, all, prepare };
}

module.exports = { wrapDb };
