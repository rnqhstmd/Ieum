import { defineConfig, configDefaults } from 'vitest/config';

// 기본 단위 테스트 설정. 통합테스트(*.int.test.ts)는 testcontainers(Docker + Node 22+ undici의
// markAsUncloneable)가 필요하므로 기본 `pnpm test`에서 제외한다 — 프론트 CI(Node 20·Docker 비전제,
// 단위 전용)가 깨지지 않도록 분리. 통합테스트는 `pnpm test:int`(로컬/Docker 환경)로 실행한다.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.int.test.ts'],
  },
});
