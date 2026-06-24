// AC-11/FR-C4: 페이지 초기 로드가 2초 미만에 본문(첫 블록)을 표시하는지 측정.
// 실행 전 요건: DB 기동 + pageId 시드 + ws-relay 기동 + Next.js dev 기동 + storageState + E2E_PAGE_ID.
// (e2e/README.md 참조 — 로컬 수동 구동 전용, 자동 verify 게이트 미포함)

import { test, expect } from '@playwright/test';

const PAGE_ID = process.env.E2E_PAGE_ID ?? 'REPLACE_WITH_VALID_PAGE_UUID';

test('AC-11: 페이지 초기 로드가 2초 미만에 본문을 표시한다', async ({ page }) => {
  // 유효한 E2E_PAGE_ID 없이 실행하면 로그인 리다이렉트로 10초 timeout 실패하므로 명시적으로 skip(gemini).
  test.skip(PAGE_ID === 'REPLACE_WITH_VALID_PAGE_UUID', '유효한 E2E_PAGE_ID 환경 변수가 필요합니다.');

  // goto 시작 ~ 첫 블록 visible까지의 wall-clock(네트워크·SSR·하이드레이션 포함, 사용자 체감 로드).
  const start = Date.now();
  await page.goto(`/page/${PAGE_ID}`);
  await page.locator('[data-block-id]').first().waitFor({ state: 'visible', timeout: 10_000 });
  const elapsed = Date.now() - start;

  // 측정 산출물 기록 — 느린 경우에도 실제 경과를 남겨 회귀를 진단할 수 있게 한다.
  console.log(`[load-time] 초기 로드 경과: ${elapsed}ms`);

  expect(elapsed).toBeLessThan(2000);
});
