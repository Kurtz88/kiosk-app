# 맛집 정보 키오스크 (kiosk-app)

매장 안내 화면(키오스크)과 **관리자 페이지**에서 식당·카테고리·이미지를 관리하는 로컬 웹 앱입니다. **Node.js**가 설치된 Windows PC에서 동작합니다.

---

## 준비물

- [Node.js](https://nodejs.org/) **LTS** 버전 설치
- (선택) Google Chrome — 키오스크 전체 화면 실행에 사용

---

## 처음 시작하기 (순서대로)

1. **이 폴더**(`kiosk-app`)를 원하는 위치에 둡니다. (경로에 한글·공백이 있어도 됩니다.)

2. **터미널**을 열고 이 폴더로 이동한 뒤 의존성을 설치합니다.
   ```bash
   npm install
   ```

3. **서버 실행**
   ```bash
   npm start
   ```
   - 처음 실행 시 엑셀 양식 파일이 `public/templates/` 아래에 자동 생성될 수 있습니다.

4. **브라우저**로 접속합니다.
   | 주소 | 설명 |
   |------|------|
   | http://localhost:3000/ | 손님용 키오스크 화면 |
   | http://localhost:3000/admin.html | 관리자 (식당·카테고리 등록) |

5. **관리자**는 키오스크 화면 **제목을 5번 연속으로 누르면** 비밀번호 입력 창이 뜹니다. 비밀번호를 바꾸려면 `public/js/app.js` 상단의 `ADMIN_KIOSK_PASSWORD` 값을 수정합니다.

6. 관리자에서 식당·카테고리·사진을 등록하면 키오스크에 반영됩니다.

---

## Windows에서 쉽게 쓰기 (`bat` 폴더)

| 파일 | 용도 |
|------|------|
| `bat\start_kiosk.bat` | `npm install` 후 서버를 띄우고 Chrome 키오스크 모드로 전체 화면 실행 |
| `bat\open_admin.bat` | 브라우저로 관리자 페이지만 열기 (서버가 떠 있어야 함) |
| `bat\install-windows-autostart.bat` | 로그인할 때마다 `start_kiosk.bat`이 자동 실행되도록 등록 |
| `bat\allow-firewall-port-3000.bat` | 같은 Wi‑Fi의 다른 기기에서 접속하려면 **관리자 권한**으로 실행 |

자동 시작이 안 되면 `docs\WINDOWS-AUTOSTART.md`를 참고하세요.

---

## 데이터가 저장되는 위치

| 경로 | 내용 |
|------|------|
| `data\kiosk.sqlite` | 식당·카테고리 등 DB (기존에 루트에만 있던 DB는 첫 실행 시 여기로 복사될 수 있음) |
| `public\uploads\` | 업로드한 사진·약도·메뉴판 |

백업할 때는 위 두 가지를 함께 복사하면 됩니다.

---

## USB·엑셀로 한 번에 넣기

`usb-update\` 폴더의 `UPDATE.bat`과 `README.txt`를 읽고, 엑셀·이미지를 맞춰 넣으면 됩니다.

---

## 자세한 문서

- `docs\WORKFLOW-DEVELOP-AND-TEST.md` — 개발·테스트·Wi‑Fi 접속
- `docs\DEPLOY-REMOTE.md` — 원격 서버에 올릴 때
- `docs\WINDOWS-AUTOSTART.md` — Windows 시작 시 자동 실행

---

## 폴더 구조 (요약)

```
kiosk-app/
  backend/          # 서버 (Node.js)
  data/             # SQLite DB
  public/           # 웹 화면·CSS·JS·업로드 파일
  bat/              # Windows 실행용 배치
  scripts/          # 유틸 (엑셀 업로드·템플릿 등)
  lib/              # 공용 모듈
  usb-update/       # USB 업데이트용
  docs/             # 추가 설명
```

---

## 자주 쓰는 명령

```bash
npm install          # 처음 또는 패키지 변경 후
npm start            # 서버 실행
npm run template     # 엑셀 양식만 다시 만들 때
```

엑셀·이미지를 명령줄로 넣을 때는 `node scripts/usb-update.js <엑셀경로> [이미지폴더]` (보통은 `usb-update\UPDATE.bat` 사용).

서버를 끄려면 터미널에서 **Ctrl+C** 입니다.
