# EcoSense

실외·실내·수면 환경을 한곳에서 확인하는 **클라이언트 중심 PWA 환경 모니터링 대시보드**입니다.

| 항목 | 내용 |
|------|------|
| **팀** | 국립창원대학교 17조 (정우진, 이승호, 선지수, 정원제) |
| **과목** | 소프트웨어공학 팀 프로젝트 |
| **라이브 데모** | [ecosense-sooty.vercel.app](https://ecosense-sooty.vercel.app) |
| **문서** | [최종 보고서.md](./최종%20보고서.md) |

---

## 주요 기능

| 기능 | 설명 | 로그인 필요 |
|------|------|:-----------:|
| 실외 환경 | 기상청·에어코리아 기반 날씨·대기질 | ✗ |
| 실내 환경 | BLE 온습도 센서 연동 | ✗ |
| 수면/소음 | 마이크 기반 소음 측정·스파이크 녹음 | ✗ (동기화는 ✓) |
| PDF 보고서 | 주간/월간 환경 리포트 다운로드 | ✓ |
| 회원/동기화 | 이메일 인증, 클라우드 데이터 동기화 | ✓ |

---

## 사용 방법 (기능별)

### 1. 시작 화면

앱에 접속하면 **로그인 · 회원가입 · 게스트 모드** 중 선택합니다.

- **게스트 모드**: 회원가입 없이 실외/실내/수면 기능을 바로 사용할 수 있습니다.
- **회원가입**: 이메일 인증 후 설문 → PDF 보고서·서버 동기화를 이용할 수 있습니다.

### 2. 실외 환경 (`/outdoor`)

기상청(KMA)과 에어코리아 API로 **현재 날씨·대기질**을 조회합니다.

**사용 순서**

1. 메인 화면에서 **실외** 메뉴 선택
2. 지역 조회 방법 중 하나 선택
   - **GPS**: 현재 위치 기준 자동 조회
   - **지역 검색**: 지역명 입력 후 검색 결과 선택
3. **새로고침**으로 캐시를 무시하고 최신 데이터 조회 (`force_refresh`)

**표시 정보**: 기온, 습도, 체감온도, UV, PM2.5/PM10, AQI 등급, 날씨 코멘트, 기온/습도 차트

> 데이터는 서버에서 **기본 10분 TTL** 캐시됩니다.

### 3. 실내 환경 (`/indoor`)

**LYWSD03MMC** BLE 온습도 센서와 Web Bluetooth로 연동합니다.

**사용 순서**

1. 센서 전원 ON, 스마트폰/PC **블루투스 활성화**
2. **Chrome 브라우저** 사용 (Web Bluetooth는 Chrome/Edge 등에서만 지원)
3. **센서 연결** 버튼 → 기기 선택 → 연결
4. 실시간 **온도·습도·배터리** 확인
5. 실외 데이터가 있으면 **실내 vs 실외** 비교 표시

**연결 해제**: 화면의 연결 해제 버튼으로 BLE 세션 종료

### 4. 수면 / 소음 측정 (`/sleep`)

Web Audio API로 주변 소음을 측정하고, 임계값을 넘는 **스파이크 구간을 자동 녹음**합니다.

**사용 순서**

1. **측정** 탭에서 모드 선택
   - **일반 소음 측정**: 실시간 소음 모니터링
   - **수면 소음 측정**: 수면 세션 + 종료 후 단계별 분석
2. **측정 시작** → 브라우저 **마이크 권한 허용**
3. 측정 중 배경 소음 대비 급격한 소음(스파이크) 발생 시 **자동 녹음**
4. **측정 종료** → 수면 모드면 분석 결과 표시, 로그인 상태면 서버 동기화 시도
5. **기록** 탭에서 과거 세션·스파이크 목록 확인

**동작 요약**

- 시작 후 **3초 캘리브레이션**으로 배경 소음 학습
- 배경 +15dB 초과 → 스파이크 녹음 시작
- 배경 +8dB 이하가 1초 지속 → 녹음 종료 (히스테리시스)
- 오디오 파일(Blob)은 **브라우저 IndexedDB**에만 저장 (서버 미업로드)

**데이터 정책**

- 스파이크 녹음은 **30일 후 자동 만료**
- **이상 소음 기록 초기화**는 이 기기의 로컬 IndexedDB만 삭제
- 로그아웃해도 로컬 수면 기록은 유지됨

### 5. PDF 보고서 (`/reports`)

로그인한 사용자의 측정·설문 데이터를 바탕으로 **주간/월간 PDF**를 생성합니다.

**사용 순서**

1. 로그인 (미로그인 시 로그인 화면으로 이동)
2. **주간 PDF** 또는 **월간 PDF** 다운로드
3. 생성 이력에서 과거 보고서 목록 확인

> 회원가입 직후 **설문(Survey)** 을 완료하면 PDF 맞춤 코멘트 품질이 높아집니다.

### 6. 회원가입 · 로그인

**회원가입 흐름**

1. 이름, 이메일, 비밀번호(8자 이상), 전화번호(선택) 입력
2. 이메일로 **인증코드** 수신 (Brevo)
3. 인증코드 입력 → 인증 완료
4. 로그인 → (최초 1회) **설문** 작성

**로그인**

- 인증되지 않은 계정은 로그인 시 **403** → 인증 화면으로 이동
- 인증코드 **10분 유효**, 만료 시 재발송 가능

### 7. 설정 · 동기화 (`/settings`)

- **데이터 동기화**: IndexedDB의 세션·스파이크 메타데이터를 서버에 업로드/다운로드
- **로그아웃**: 계정 세션만 종료, **로컬 수면 데이터는 유지**
- 현재 선택된 **실외 지역** 확인

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18, Vite, Tailwind CSS, Zustand, Chart.js, IndexedDB |
| Backend | FastAPI, SQLAlchemy, PostgreSQL |
| 외부 API | 기상청(KMA), 에어코리아, Nominatim, Brevo(이메일) |
| 배포 | Vercel (Frontend), Render (Backend + PostgreSQL) |
| 브라우저 API | Web Audio, Web Bluetooth, Geolocation |

---

## 프로젝트 구조

```
Ecosense/
├── frontend/          # React PWA (Vite)
├── backend/           # FastAPI API 서버
├── docs/              # (선택) 설계 문서
├── 최종 보고서.md      # 프로젝트 최종 보고서
├── API Endpoint.txt   # API 명세
├── db_schema.txt      # DB 스키마
└── Diagram PlantUML.txt
```

---

## 로컬 실행

### 사전 요구

- Node.js 18+
- Python 3.10+
- (선택) PostgreSQL — 로컬에서는 SQLite도 가능

### Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env   # API 키 등 설정
uvicorn app.main:app --reload --port 8000
```

`.env` 최소 설정 예시:

```env
DATABASE_URL=sqlite:///./ecosense.db
SECRET_KEY=your-32-byte-or-longer-secret-key
CORS_ORIGINS=http://localhost:5173
KMA_API_KEY=...
AIRKOREA_API_KEY=...
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=noreply@yourdomain.com
```

API 문서: [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

기본 API 주소는 `http://localhost:8000/api`입니다.  
Render 등 다른 백엔드를 쓰려면 `frontend/.env`에 설정:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

브라우저: [http://localhost:5173](http://localhost:5173)

---

## 브라우저·환경 주의사항

| 기능 | 권장 환경 |
|------|-----------|
| 실내 BLE | **Chrome/Edge** (데스크톱·Android), HTTPS 또는 localhost |
| 수면/소음 | 마이크 권한 허용, 조용한 환경에서 캘리브레이션 |
| 실외 GPS | HTTPS 배포 URL 또는 localhost |
| PDF 보고서 | 로그인 + 설문 완료 권장 |

---

## 관련 문서

- [최종 보고서.md](./최종%20보고서.md) — 요구사항·설계·테스트·AI 활용·팀 기여
- [API Endpoint.txt](./API%20Endpoint.txt) — REST API 27개 엔드포인트
- [db_schema.txt](./db_schema.txt) — PostgreSQL 7테이블 스키마
- [Frontend Structure.txt](./Frontend%20Structure.txt) — 프론트엔드 디렉터리 구조

---

## 라이선스

국립창원대학교 소프트웨어공학 과목 팀 프로젝트 산출물입니다.
