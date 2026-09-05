# SheetPage

**Spreadsheet를 Page처럼.**

복잡한 Excel과 Google Sheets를 웹페이지처럼 편하게 탐색하는 서비스입니다.
탭이 수십 개인 Workbook을 스프레드시트 프로그램이 아니라 작은 웹사이트처럼
열어보고, 고치고, 다시 `.xlsx`로 내려받고, 링크로 공유합니다.

---

## 무엇을 하는가

| 흐름 | 내용 |
| --- | --- |
| **Excel 열기** | `.xlsx` / `.xlsm` / `.xls` / `.csv` / `.tsv` 업로드 → 시트 목록 → 열람 · 편집 → `.xlsx` 다운로드 |
| **Google Sheets 열기** | 공개(링크 공유) 문서 URL 붙여넣기 → 동일한 화면으로 열람 · 편집 · 다운로드 |
| **공유** | 현재 Workbook의 Snapshot을 저장하고 `/s/<id>` 링크 생성 → 받은 사람은 읽기 전용으로 탐색 · 다운로드 |

## 화면 구성

- **왼쪽 사이드바** — 맨 위 `전체 시트`(목차)와 그 아래 모든 시트를 페이지 목록처럼
  표시. 검색, 현재 시트 강조, 접기/펼치기. 검색 중에는 결과만 남습니다. 모바일에서는
  Drawer로 전환됩니다.
- **전체 시트** — Workbook의 목차 페이지. 시트마다 이름 · 크기 · 첫 몇 행 미리보기를
  카드로 보여줍니다. 탭이 많은 문서의 전체 구조를 한 화면에서 파악하기 위한 화면이며,
  파일을 열면 곧바로 첫 시트가 열리므로 데이터까지 가는 경로가 늘어나지는 않습니다.
- **가운데** — 선택한 시트. 상단에 `전체 시트 › 시트명` 위치 표시와 이전/다음 시트
  이동(`Ctrl`/`Cmd` + `PageUp`/`PageDown`)이 있습니다. 두 가지 읽기 방식을 오갈 수
  있습니다.
  - **표 보기** — 편집용 그리드. 셀 선택 · 수정 · 수식 입력 · 병합 셀 표시.
  - **읽기 보기** — 읽기용 레이아웃. 줄바꿈되는 텍스트, 자동 행 높이. 열이 많은
    시트는 행마다 `라벨 · 값` 블록으로 펼쳐 보여줍니다.
- **상단 Toolbar** — 로고, Workbook 제목과 출처, 초기화, 실행 취소, 공유, 다운로드.
  로고나 초기화 버튼을 누르면 현재 파일을 닫고 처음 화면으로 돌아갑니다. 수정 여부와
  관계없이 항상 확인을 거칩니다.

---

## 기술 구성

```
src/
  lib/workbook/
    model.ts               공통 Workbook 데이터 모델 (모든 입력이 여기로 수렴)
    grid-geometry.ts       그리드 픽셀 계산
    import/registry.ts     지원 파일 형식과 파일 → Workbook 진입점
    import/sheetjs.ts      SheetJS → Workbook 변환
    export/xlsx.ts         Workbook → .xlsx
    worker-client.ts       파싱/내보내기 워커 호출 래퍼
  lib/google/              Google Sheets URL 해석과 불러오기
  lib/share/               공유 Snapshot 생성 · 조회
  workers/                 SheetJS를 실행하는 Web Worker
  hooks/                   Workbook 상태(편집 · 실행 취소), 다운로드, 토스트
  components/              Toolbar · 사이드바 · 그리드 · 리더 · 공유 · 상태 화면
  pages/                   HomePage(Flow A·B), SharePage(Flow C)
netlify/functions/
  gsheets.ts               Google Sheets → .xlsx 프록시
  share.ts                 공유 Snapshot 저장소 (Netlify Blobs)
```

**Stack** — Vite · React 19 · TypeScript · Tailwind CSS · wouter · SheetJS ·
Netlify Functions + Netlify Blobs.

### 왜 Web Worker인가

스프레드시트 파싱과 `.xlsx` 생성은 전부 Worker 안에서 일어납니다. 큰 파일을 읽는
동안 화면이 멈추지 않고, 신뢰할 수 없는 파일이 앱과 분리된 realm에서 해석되며,
작업이 끝나면 Worker를 종료해 다음 파일에 영향을 주지 않습니다.

### 왜 서버 함수가 필요한가

Google Sheets의 export 엔드포인트는 CORS 헤더를 주지 않고, 권한이 없는 문서는
로그인 페이지로 리다이렉트합니다. 브라우저에서는 해결할 수 없으므로
`/api/gsheets`가 서버에서 받아 `.xlsx` 바이트만 돌려줍니다. 비공개 문서 지원을
추가한다면 OAuth 토큰이 붙는 곳은 이 함수 하나이고, 프런트엔드는 그대로입니다.

---

## 개발

```bash
npm install
npm run dev              # 프런트엔드만 (:5173)
npx netlify dev          # 프런트엔드 + /api/* 함수까지 (:8888)
```

`/api/gsheets`, `/api/share`를 쓰려면 `netlify dev`로 실행해야 합니다.
`npm run dev`는 `/api`를 `localhost:8888`로 프록시합니다.

```bash
npm run lint             # ESLint
npm run typecheck        # TypeScript
npm run check:workbook   # xlsx 왕복 · CSV 인코딩 · Google 링크 해석 검증
npm run build            # 타입 검사 + 프로덕션 빌드
```

## 배포

Netlify가 GitHub 저장소에 연결되어 있어, production 브랜치에 push하면 자동으로
빌드·배포합니다. 빌드 설정은 `netlify.toml`에서 읽습니다.

사이트와 `netlify/functions`가 함께 올라가야 하므로, 정적 호스팅만으로는
공유 · Google Sheets 기능이 동작하지 않습니다. Excel 업로드 · 편집 · 다운로드는
전부 브라우저 안에서 처리되므로 정적 환경에서도 동작합니다.

공유 Snapshot은 **Netlify Blobs**에 저장됩니다. 별도 데이터베이스나 키 설정이
없고, 배포된 사이트에서 자동으로 활성화됩니다.

`.github/workflows/ci.yml`은 배포와 무관하게 lint · 검증 · 빌드를 확인합니다.

### 요청 본문 인코딩

공유 Snapshot POST 본문은 항상 **텍스트**입니다 — 작으면 JSON 그대로, 크면
gzip을 base64로 인코딩해 보냅니다. 서버는 헤더가 아니라 첫 글자로 형태를
판별합니다. 원시 gzip 바이트를 보내면 호스팅 계층이 본문을 UTF-8 텍스트로
디코딩하는 순간 깨지기 때문이고, 실제로 그 문제로 공유 링크 생성이 실패한 적이
있습니다.

---

## 알려진 한계

- **서식은 보존하지 않습니다.** 값 · 타입 · 표시 형식(`0%` 등) · 수식 · 병합 ·
  시트 이름과 순서 · 열 너비는 그대로 왕복하지만, 글꼴 · 색 · 테두리 · 조건부
  서식 · 차트 · 이미지 · 피벗 테이블 · 매크로는 모델에 담지 않으므로 다시
  내려받은 파일에는 포함되지 않습니다. **내용과 구조 보존 > 서식 재현**이
  의도된 우선순위입니다.
- **수식은 다시 계산하지 않습니다.** 원본 수식과 캐시된 결과값을 그대로 두고,
  사용자가 새로 입력한 수식은 캐시값 없이 저장합니다. Excel에서 열면 그때
  계산됩니다. SheetPage 화면에서는 새 수식의 결과가 비어 있습니다.
- **수정한 셀의 표시 형식** — 원본 셀은 파일에 기록된 표시 문자열(`40%` 등)을 그대로
  보여주지만, 사용자가 값을 고친 셀은 입력한 그대로(`0.4`) 표시됩니다. 표시 형식
  자체는 보존되므로 Excel에서 열면 다시 `40%`로 보입니다.
- **파일 크기 상한** — 업로드 25MB, 시트당 40만 셀, 공유 Snapshot 5MB.
- **Google Sheets** — 공개 또는 링크 공유 문서만 지원합니다. 비공개 문서는 Google
  로그인이 필요해 이번 버전에서 제외했습니다.
- **공유 링크** — 읽기 전용이고 90일간 유효합니다. 편집 가능 링크, 계정, 공동
  편집, 권한 관리는 구현하지 않았습니다.
- **읽기 보기의 병합 셀** — 읽기 전용 레이아웃에서는 병합 범위를 재현하지 않고
  대표 셀의 값만 보여줍니다. 원본 구조 그대로 보려면 표 보기를 사용하세요.

---

Created by. 교육뮤지컬 꿈꾸는 치수쌤 · [litt.ly/chichiboo](https://litt.ly/chichiboo)
