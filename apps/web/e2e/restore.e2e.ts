// AC-C2/C3: 클라이언트 A가 입력한 내용을 새로 접속한 B가 복원해서 보는지 검증.
// 실행 전 요건: DB 기동 + pageId 시드 + ws-relay 기동 + Next.js dev 기동 + storageState 준비.
// (e2e/README.md 참조)

import { test, expect } from '@playwright/test';

const PAGE_ID = process.env.E2E_PAGE_ID ?? 'REPLACE_WITH_VALID_PAGE_UUID';

test('AC-C2: A가 입력한 내용을 새로 접속한 B가 볼 수 있다', async ({ browser }) => {
  const stateA = process.env.E2E_STORAGE_STATE_A ?? './e2e/.auth/state.json';
  const stateB = process.env.E2E_STORAGE_STATE_B ?? './e2e/.auth/state.json';

  // A 접속 후 입력
  const ctxA = await browser.newContext({ storageState: stateA });
  const pageA = await ctxA.newPage();
  await pageA.goto(`/page/${PAGE_ID}`);

  const blockA = pageA.locator('[data-block-id]').first();
  await blockA.click();
  await blockA.type('persisted content from A');

  // relay 전파 대기 — networkidle로 영속화 요청 완료 후 닫는다.
  // 로컬 DB 속도에 따라 조정 필요.
  await pageA.waitForLoadState('networkidle');
  await ctxA.close();

  // B 신규 접속 — A의 내용이 표시되어야 함
  const ctxB = await browser.newContext({ storageState: stateB });
  const pageB = await ctxB.newPage();
  await pageB.goto(`/page/${PAGE_ID}`);

  await expect(pageB.locator('[data-block-id]').first()).toHaveText(
    'persisted content from A',
    { timeout: 10_000 }
  );

  await ctxB.close();
});

test('AC-C3: 재접속 후에도 이전 편집 내용이 유지된다', async ({ browser }) => {
  const state = process.env.E2E_STORAGE_STATE_A ?? './e2e/.auth/state.json';

  // 1차 접속 + 입력
  const ctx1 = await browser.newContext({ storageState: state });
  const page1 = await ctx1.newPage();
  await page1.goto(`/page/${PAGE_ID}`);

  const block1 = page1.locator('[data-block-id]').first();
  await block1.click();
  await block1.type('content before reconnect');

  // 로컬 DB 속도에 따라 조정 필요.
  await page1.waitForLoadState('networkidle');
  await ctx1.close();

  // 재접속
  const ctx2 = await browser.newContext({ storageState: state });
  const page2 = await ctx2.newPage();
  await page2.goto(`/page/${PAGE_ID}`);

  await expect(page2.locator('[data-block-id]').first()).toHaveText(
    'content before reconnect',
    { timeout: 10_000 }
  );

  await ctx2.close();
});
