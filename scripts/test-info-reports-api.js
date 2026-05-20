/** 같은 업체 2건 POST 후 GET 개수 확인 (서버 실행 중이면 fetch 사용) */
const http = require('http');

function post(body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port: 3000,
                path: '/api/info-reports',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
            },
            (res) => {
                let buf = '';
                res.on('data', (c) => (buf += c));
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') });
                    } catch {
                        resolve({ status: res.statusCode, body: buf });
                    }
                });
            }
        );
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function get() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:3000/api/info-reports', (res) => {
            let buf = '';
            res.on('data', (c) => (buf += c));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(buf || '{}'));
                } catch {
                    resolve({});
                }
            });
        }).on('error', reject);
    });
}

(async () => {
    const a = await post({
        restaurant_id: 1,
        restaurant_name: '테스트식당',
        message: '첫 신고 ' + Date.now(),
    });
    const b = await post({
        restaurant_id: 1,
        restaurant_name: '테스트식당',
        message: '둘째 신고 ' + Date.now(),
    });
    console.log('POST1', a.status, a.body);
    console.log('POST2', b.status, b.body);
    const list = await get();
    const same = (list.data || []).filter((r) => r.restaurant_id === 1);
    console.log('GET same store count:', same.length);
    if (a.status !== 201 || b.status !== 201 || same.length < 2) {
        process.exit(1);
    }
    console.log('OK');
})().catch((e) => {
    console.error('서버가 켜져 있어야 합니다 (npm start):', e.message);
    process.exit(1);
});
