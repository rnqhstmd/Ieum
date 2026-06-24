// AC-C1: 두 클라이언트가 동일 페이지에 입력 후 CRDT relay를 통해 수렴하는지 검증.
// 실행 전 요건: DB 기동 + pageId 시드 + ws-relay 기동 + Next.js dev 기동 + storageState 준비.
// (e2e/README.md 참조)

import { test, expect } from '@playwright/test';

const PAGE_ID = process.env.E2E_PAGE_ID ?? 'REPLACE_WITH_VALID_PAGE_UUID';

test('AC-C1: 두 클라이언트 입력이 양쪽에 수렴한다', async ({ browser }) => {
  // 두 BrowserContext — 각각 별도 세션(storageState)
  const stateA = process.env.E2E_STORAGE_STATE_A ?? './e2e/.auth/state.json';
  const stateB = process.env.E2E_STORAGE_STATE_B ?? './e2e/.auth/state.json';

  const ctxA = await browser.newContext({ storageState: stateA });
  const ctxB = await browser.newContext({ storageState: stateB });

  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.goto(`/page/${PAGE_ID}`);
  await pageB.goto(`/page/${PAGE_ID}`);

  // A가 첫 번째 블록에 텍스트 입력
  const blockA = pageA.locator('[data-block-id]').first();
  await blockA.click();
  await blockA.type('hello from A');

  // B가 첫 번째 블록에 텍스트 입력
  const blockB = pageB.locator('[data-block-id]').first();
  await blockB.click();
  await blockB.type(' and B');

  // relay 교환 대기 후 양쪽이 동일 텍스트를 가지는지 단언.
  // false-positive 방지: A와 B의 입력이 양쪽 page 모두에 수렴했는지 확인한 후 동일성 비교.
  await expect
    .poll(async () => pageA.locator('[data-block-id]').first().textContent(), {
      timeout: 10_000,
    })
    .toContain('hello from A');

  await expect
    .poll(async () => pageA.locator('[data-block-id]').first().textContent(), {
      timeout: 10_000,
    })
    .toContain(' and B');

  await expect
    .poll(async () => pageB.locator('[data-block-id]').first().textContent(), {
      timeout: 10_000,
    })
    .toContain('hello from A');

  await expect
    .poll(async () => pageB.locator('[data-block-id]').first().textContent(), {
      timeout: 10_000,
    })
    .toContain(' and B');

  const textA = await pageA.locator('[data-block-id]').first().textContent();
  const textB = await pageB.locator('[data-block-id]').first().textContent();

  expect(textA).toBe(textB);

  await ctxA.close();
  await ctxB.close();
});
