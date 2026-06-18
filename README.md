# 이음 (Ieum)

> 여러 사람의 편집이 충돌 없이 하나로 **이어지는** 실시간·로컬 우선 협업 문서 서비스.

자체 구현 CRDT(RGA)를 기반으로 Google 로그인, 개인·공유 워크스페이스, 중첩 페이지, 실시간 공동편집(라이브 커서·presence)을 제공한다. 노션과 유사하되, "충돌 없는 병합·로컬 우선·타임머신 히스토리"라는 아키텍처 우위로 차별화한다.

## 문서

기획·설계 문서는 [`requirements/`](./requirements/README.md)에 정리되어 있다.

- [제품 개요](./requirements/01-product-overview.md)
- [PRD](./requirements/02-prd.md)
- [MVP · 로드맵](./requirements/03-mvp-and-roadmap.md)
- [아키텍처](./requirements/04-architecture.md)
- [데이터 모델](./requirements/05-data-model.md)
- [API · 실시간 프로토콜](./requirements/06-api-and-realtime.md)
- [협업 엔진 (자체 RGA CRDT)](./requirements/07-collaboration-crdt.md)
- [인증 · 권한](./requirements/08-auth-and-permissions.md)
- [TDD 전략](./requirements/09-tdd-strategy.md)
- [차별화 전략](./requirements/10-differentiation.md)

## 상태

기획 단계. MVP 범위 = P0(Google 로그인) ~ P4(공유 워크스페이스 · 초대).

## 스택

TypeScript · Next.js(App Router) · PostgreSQL/Prisma · Auth.js(Google) · 자체 RGA CRDT · Node/ws · Vitest/Playwright
