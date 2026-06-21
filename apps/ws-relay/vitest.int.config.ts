import { defineConfig } from 'vitest/config';

// 통합테스트 전용 — testcontainers 기반 실 DB 검증(*.int.test.ts). Docker + Node 22+ 필요.
// `pnpm test:int`로 실행. 기본 `pnpm test`(vitest.config.ts)에서는 제외된다.
export default defineConfig({
  test: {
    include: ['**/*.int.test.ts'],
  },
});
