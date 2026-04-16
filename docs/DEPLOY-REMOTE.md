# 원격 서버(예: https://210.91.154.186/test/)에 올려서 동작시키기

## 1. 먼저 확인: 이 서버에 Node.js를 돌릴 수 있나요?

이 프로젝트는 **PHP만 되는 일반 웹호스팅**이 아니라, **Node.js가 계속 실행**되어야 합니다.

| 가능한 경우 | 방법 |
|------------|------|
| VPS, 클라우드 VM, 자체 서버 | SSH로 접속해 `node backend/server.js` 또는 PM2로 실행 |
| cPanel/Plesk에 “Node 앱” 메뉴가 있음 | 호스팅 안내에 따라 앱 루트·시작 명령 등록 |
| FTP만 되고 PHP만 됨 | **이 앱은 그대로는 동작하지 않습니다.** (정적 사이트 호스팅과 다름) |

`210.91.154.186` 이 **본인/업체 서버**이고 SSH 또는 Node 실행 권한이 있어야 합니다.

---

## 2. 서버에 올리는 절차 (대표 흐름)

1. **파일 업로드**  
   SFTP/FTP/SCP 등으로 프로젝트 폴더 전체를 서버에 복사합니다.  
   예: `/var/www/kiosk-restaurant-app` 또는 `test` 폴더 아래에 통째로.

2. **서버에서 한 번 실행** (SSH)
   ```bash
   cd /경로/kiosk-restaurant-app
   npm install --omit=dev
   node backend/server.js
   ```
   기본 포트는 **3000**입니다. 방화벽에서 3000을 열거나, 아래처럼 **Nginx로 443/80만 열고** 내부 3000으로 넘기는 방식이 일반적입니다.

3. **DB·업로드 권한**  
   `data/kiosk.sqlite`에 DB가 생기고, `public/uploads/`에 이미지가 쌓입니다.  
   해당 디렉터리에 **쓰기 권한**이 있어야 합니다.

4. **상시 실행**  
   터미널을 닫으면 서버가 꺼지므로 **PM2**, **systemd**, 호스팅의 “Node 앱” 자동 시작 등을 쓰는 것이 좋습니다.

---

## 3. 주소를 `https://210.91.154.186/` 처럼 **루트**에 두는 경우 (가장 단순)

Nginx 예시 (HTTPS는 인증서 경로는 서버에 맞게 수정):

```nginx
server {
    listen 443 ssl;
    server_name 210.91.154.186;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

브라우저에서는 `https://210.91.154.186/` 로 접속하면 됩니다.  
이때 앱의 `/api/...`, `/uploads/...` 같은 **절대 경로**가 그대로 맞습니다.

---

## 4. 꼭 `https://210.91.154.186/test/` **하위 폴더**에 두고 싶을 때

프론트는 `fetch('/api/restaurants')`, 이미지는 `/uploads/...` 처럼 **도메인 루트**를 기준으로 요청합니다.  
그래서 `/test/`만 프록시하고 나머지는 안 넘기면 **API·이미지가 404**가 납니다.

### 방법 A: Nginx에서 `/test/` 접두사를 떼어 Node로 넘기기

사용자 요청: `https://210.91.154.186/test/xxx` → Node에는 `http://127.0.0.1:3000/xxx` 로 전달:

```nginx
location /test/ {
    rewrite ^/test/(.*) /$1 break;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

그런데 **이미지·파일 URL**은 DB에 `/uploads/파일명` 형태로 저장되므로, 브라우저는  
`https://210.91.154.186/uploads/파일명` 으로 요청합니다 (`/test` 없음).  
그래서 **업로드 이미지까지 쓰려면** 루트에 업로드 경로도 프록시해야 합니다:

```nginx
location /uploads/ {
    proxy_pass http://127.0.0.1:3000/uploads/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
```

관리자 화면의 「키오스크 뷰어 열기」는 `href='/'` 로 **사이트 루트**로 가므로, `/test/`만 쓰는 구조에서는 **수동으로 `/test/` 로 들어가야** 할 수 있습니다. (원하면 나중에 링크를 `/test/`로 바꾸는 수정을 하면 됩니다.)

### 방법 B: 아예 **서브도메인** 사용

예: `https://kiosk.도메인.com/` → Node로만 프록시.  
절대 경로 `/api`, `/uploads`와 잘 맞아서 **설정이 가장 덜 꼬입니다.**

---

## 5. “업로드만 하고 된다”가 아닌 이유

- **Node 프로세스**가 떠 있어야 하고,  
- (대부분의 경우) **Nginx/Apache 리버스 프록시**로 80/443과 연결하고,  
- **SQLite 파일·uploads 폴더 쓰기 권한**이 필요합니다.

FTP로 파일만 넣고 끝나는 방식은 **정적 HTML 호스팅**일 때만 가능하고, 이 키오스크 앱은 해당하지 않습니다.

---

## 6. 빠르게 “동작만 확인”하고 싶을 때

서버에서 방화벽으로 **3000 포트를 잠깐 열어도 된다면**:

```bash
node backend/server.js
```

PC 브라우저에서 `http://210.91.154.186:3000/` 접속해 동작 확인 후,  
운영 시에는 포트를 닫고 Nginx로 443만 쓰는 편이 안전합니다.

---

## 요약

| 목표 | 추천 |
|------|------|
| 설정 최소 | `https://IP/` 또는 서브도메인으로 **루트 프록시** |
| 반드시 `/test/` | Nginx `rewrite` + **`/uploads/` 별도 `proxy_pass`** + 관리자의 `/` 링크 한계 인지 |

서버 OS(Nginx 유무, Node 설치 여부)를 알려주면 그에 맞춘 설정 문장만 따로 적어줄 수 있습니다.
