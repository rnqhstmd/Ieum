# E2E 테스트 (Playwright) — 로컬 수동 구동 전용

> **이 e2e 테스트는 자동 verify 게이트에 포함되지 않습니다.**
> CI/CD 파이프라인에서 실행되지 않으며, 로컬에서 수동으로 구동합니다.

## 구동 전 요건

### 1. DB 기동 + 마이그레이션 + 페이지 시드

```bash
# PostgreSQL 기동 (예: Docker)
docker compose up -d db

# Flyway 마이그레이션
./gradlew flywayMigrate   # 또는 프로젝트 마이그레이션 명령

# 유효한 pageId(UUID, FK 존재) 시드
# pages 테이블에 레코드가 있어야 합니다
# 예: INSERT INTO pages (id, ...) VALUES ('실제-uuid-값', ...);
```

### 2. ws-relay 서버 기동

```bash
pnpm --filter ws-relay start
```

### 3. Next.js dev 서버 기동

```bash
pnpm --filter web dev
```

### 4. storageState 준비 (로컬 1회 로그인)

브라우저에서 `http://localhost:3000`에 접속해 로그인한 후,
Playwright 스크립트로 세션을 저장합니다.

```bash
# 임시 스크립트로 storageState 저장 예시
node -e "
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000');
  // 로그인 완료 후 Enter 입력
  await page.pause();
  await ctx.storageState({ path: 'e2e/.auth/state.json' });
  await browser.close();
})();
"
```

> storageState는 세션 쿠키/토큰을 포함하므로 **커밋하지 마세요** (`.gitignore` 처리됨).
> UI 로그인 스텝 자동화나 인증 우회 코드는 사용하지 않습니다.

### 5. e2e 실행

```bash
E2E_PAGE_ID=실제-page-uuid pnpm --filter web e2e
```

환경 변수:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `E2E_BASE_URL` | `http://localhost:3000` | Next.js 서버 URL |
| `E2E_PAGE_ID` | (placeholder) | 테스트할 페이지 UUID |
| `E2E_STORAGE_STATE` | `./e2e/.auth/state.json` | storageState 경로 (기본) |
| `E2E_STORAGE_STATE_A` | `./e2e/.auth/state.json` | 클라이언트 A storageState |
| `E2E_STORAGE_STATE_B` | `./e2e/.auth/state.json` | 클라이언트 B storageState |

## 테스트 목록

| 파일 | AC | 설명 |
|------|----|------|
| `convergence.e2e.ts` | AC-C1 | 두 클라이언트 입력 → CRDT relay → 양쪽 수렴 |
| `restore.e2e.ts` | AC-C2 | A 입력 후 B 신규 접속 → B에 A 내용 표시 |
| `restore.e2e.ts` | AC-C3 | 재접속 후에도 이전 편집 내용 유지 |
| `load-time.e2e.ts` | AC-11 | 페이지 초기 로드 2초 미만 측정(FR-C4) |

> **`load-time.e2e.ts` 주의**: `e2e/.auth/state.json`(storageState)이 없으면 비인증 상태로 `/page/:id`가
> 로그인 페이지로 리다이렉트되어 `[data-block-id]`가 표시되지 않고 10초 timeout으로 실패한다.
> 이 실패는 "로드가 느려서"가 아니라 "인증 안 됨"이 원인이므로, 측정 전 storageState 준비(위 4단계)를 먼저 확인한다.

## 블록 Selector

에디터 블록은 `[data-block-id]` 속성으로 식별합니다.

```typescript
// 첫 번째 블록
page.locator('[data-block-id]').first()

// 특정 블록 ID
page.locator('[data-block-id="block-id-값"]')
```

## 브라우저 설치 (최초 1회)

```bash
pnpm --filter web e2e:install
```
