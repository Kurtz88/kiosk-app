# 내 PC에서 수정·테스트 / 어디에 올려서 작업할지

## A. 내 PC에서만 수정하고 바로 테스트 (가장 많이 쓰는 방법)

### 1) 준비
- [Node.js](https://nodejs.org/) 설치 (LTS 권장)
- 프로젝트 폴더를 그대로 두거나, 나중에 쓸 **Git** 저장소로 복사해 두기

### 2) 실행
프로젝트 루트( `package.json` 이 있는 폴더 )에서 터미널:

```bash
npm install
npm start
```

또는 Windows에서 **`bat\start_kiosk.bat`** 더블클릭 (Chrome 키오스크까지 띄움).

### 3) 브라우저로 확인
| 주소 | 용도 |
|------|------|
| http://localhost:3000/ | 키오스크 화면 |
| http://localhost:3000/admin.html | 관리자 (비번: `public/js/app.js` 의 `ADMIN_KIOSK_PASSWORD`) |

코드(HTML/CSS/JS)를 저장한 뒤 브라우저에서 **새로고침(F5)** 하면 반영됩니다.  
`backend/server.js` / `backend/db.js` 등을 바꿨다면 터미널에서 서버를 **한 번 끄고(Ctrl+C) 다시 `npm start`**.

### 4) 데이터(DB) 위치
- `data/kiosk.sqlite` — 식당 목록 (예전에 루트에만 있던 `kiosk.sqlite`는 첫 실행 시 자동으로 `data/`로 복사됩니다.)
- `public/uploads/` — 업로드한 사진

백업할 때 이 두 가지를 같이 복사하면 됩니다.

---

## B. 같은 집/사무실 Wi‑Fi에서 다른 기기로 테스트

1. **서버를 돌리는 PC**의 IP를 확인합니다.  
   Windows: `cmd` → `ipconfig` → IPv4 주소 (예: `192.168.0.15`)

2. 다른 폰/노트북 브라우저에서:
   - `http://192.168.0.15:3000/`
   - `http://192.168.0.15:3000/admin.html`

3. 안 열리면 **Windows 방화벽**이 포트 3000을 막는 경우가 많습니다.  
   - 프로젝트의 **`bat\allow-firewall-port-3000.bat`** 을 **우클릭 → 관리자 권한으로 실행** 하세요.  
   - 또는 `설정 → 개인 정보 보호 및 보안 → Windows 보안 → 방화벽 → 고급 설정` 에서 **인바운드 규칙**으로 TCP **3000** 허용을 추가합니다.

4. 서버를 켠 터미널에 **`Same Wi-Fi: http://192.168.x.x:3000`** 같은 줄이 나오면, 폰에서는 그 주소를 그대로 입력하면 됩니다.

5. 공유기 **게스트 Wi-Fi**는 기기끼리 통신을 막는 경우가 있어, 폰과 PC를 **같은 일반 Wi-Fi**에 두세요.

---

## C. “어디에 올려서” 수정·테스트할지 선택지

### 1) GitHub + 내 PC (팀/백업용)
- 코드만 GitHub 등에 올립니다. **DB는 보통 올리지 않습니다** (용량·보안).
- 흐름: PC에서 수정 → `git commit` / `push` → 다른 PC에서 `git pull` 후 `npm install` / `npm start`
- 각 PC마다 `data/kiosk.sqlite`는 따로 생기거나, USB/공유로 DB만 옮겨야 동일 데이터가 됩니다.

### 2) 클라우드 서버 (VPS 등) — “진짜로 인터넷 주소로 테스트”
- 서버에 SSH로 접속해 Git clone 또는 파일 업로드 → `npm install` → `node backend/server.js` 또는 PM2
- 브라우저로 `http://서버IP:3000` 또는 Nginx로 `https://도메인` 연결
- 수정 방법:
  - **SSH + nano/vim** 으로 직접 고치기 (초보에게는 불편)
  - **VS Code의 Remote - SSH** 확장으로 서버 폴더를 열어 로컬처럼 편집 (추천)
  - 또는 **내 PC에서만 개발**하고 `git push` → 서버에서 `git pull` 후 서버 재시작

### 3) PaaS (Render, Railway, Fly.io 등)
- GitHub 연동으로 배포하는 서비스가 많음
- **주의:** 무료/저가 플랜은 **디스크가 휘발**되거나 **SQLite가 매번 초기화**되는 경우가 많습니다. “데이터가 영구 저장”이 필요하면 VPS + SQLite 또는 **PostgreSQL** 연동을 검토해야 합니다.

---

## D. 현실적인 추천 흐름

| 단계 | 할 일 |
|------|--------|
| 평소 개발 | **내 PC**에서 Cursor/VS Code로 수정 → `npm start` → localhost로 테스트 |
| 다른 사람에게 보여주기 | 같은 Wi‑Fi면 **IP:3000**, 밖이면 **배포한 서버 URL** |
| 운영(키오스크 현장) | 현장 PC에서 `bat\start_kiosk.bat` 또는 PM2 등으로 상시 실행 |

---

## E. 자주 쓰는 명령 정리

```bash
npm install          # 처음 한 번 또는 package.json 바뀐 뒤
npm start            # 서버 실행 (backend/server.js)
npm run template     # 엑셀 양식 파일만 다시 만들 때
```

질문이 “로컬만”인지 “서버까지”인지에 따라 위 A~D 중 어디까지 쓰면 되는지 골라 쓰시면 됩니다.
