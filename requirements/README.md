# 이음 (Ieum) — 기획 문서 인덱스

> **제품 한 줄 소개**: Google 로그인 기반 협업 문서 서비스. 개인 워크스페이스와 공유 워크스페이스에서 자체 구현 CRDT(RGA)로 실시간 공동편집을 지원한다.
>
> **서비스명**: 이음 (Ieum)
> **상태**: 기획 단계 (2026-06-18 기준)

---

## 문서 목록

| 파일 | 제목 | 설명 |
|------|------|------|
| [01-product-overview.md](./01-product-overview.md) | 제품 개요 | 비전, 해결 문제, 타겟 사용자, 차별점, 성공 기준, 비범위 |
| [02-prd.md](./02-prd.md) | 제품 요구사항 명세(PRD) | 기능별 사용자 스토리 + 수용 기준, MVP in/out-scope, 비기능 요구사항 |
| [03-mvp-and-roadmap.md](./03-mvp-and-roadmap.md) | MVP 범위 및 로드맵 | P0~P5 단계별 목표, 마일스톤, 우선순위 기준 |
| [04-architecture.md](./04-architecture.md) | 시스템 아키텍처 | 전체 구성도, 컴포넌트 책임, 데이터 흐름, 기술 스택 선택 근거 |
| [05-data-model.md](./05-data-model.md) | 데이터 모델 | 엔티티 정의, ERD, 관계, 인덱스 전략, CRDT op 저장 방식 |
| [06-api-and-realtime.md](./06-api-and-realtime.md) | API 및 실시간 프로토콜 | REST Route Handlers 명세, WebSocket 메시지 프로토콜 |
| [07-collaboration-crdt.md](./07-collaboration-crdt.md) | 협업 엔진 — 자체 RGA CRDT | RGA 알고리즘 설계, op 구조, 충돌 해소, relay 서버 역할 |
| [08-auth-and-permissions.md](./08-auth-and-permissions.md) | 인증 및 권한 모델 | Google OAuth 흐름, 세션 관리, 워크스페이스 역할, 페이지 접근 정책 |
| [09-tdd-strategy.md](./09-tdd-strategy.md) | TDD 전략 | Vitest 단위·통합 전략, CRDT TDD 접근, Playwright e2e 시나리오 |
| [10-differentiation.md](./10-differentiation.md) | 차별화 전략 | 노션 대비 차별점, 아키텍처 우위 기능, 포지셔닝 |

---

## 결정사항 요약

| 항목 | 결정 |
|------|------|
| **프론트엔드** | Next.js App Router + React + TailwindCSS |
| **인증** | Auth.js (NextAuth v5) — Google OAuth provider |
| **API** | Next.js Route Handlers (REST) |
| **실시간** | 별도 Node.js + ws 서버 (CRDT relay + presence) |
| **DB** | PostgreSQL + Prisma ORM |
| **협업 엔진** | 자체 RGA CRDT (외부 라이브러리 미사용, Yjs 없음) |
| **에디터** | in-house contenteditable 블록 에디터 |
| **테스트** | Vitest (단위·통합·CRDT TDD) + Playwright (e2e, 2-브라우저 협업) |
| **배포 (후순위)** | Vercel + Railway/Fly + Neon |
| **권한 모델** | 개인=소유자 전용 / 공유=OWNER·MEMBER (Viewer는 post-MVP) |
| **페이지 권한** | 워크스페이스 멤버십 상속 (페이지별 공유는 post-MVP) |
| **MVP 범위** | P0(기반) ~ P4(공유 워크스페이스) |

---

## 읽는 순서 가이드

1. **처음 온보딩** → 이 README → [01-product-overview.md](./01-product-overview.md) → [02-prd.md](./02-prd.md)
2. **개발 착수 전** → [03-mvp-and-roadmap.md](./03-mvp-and-roadmap.md) → [10-differentiation.md](./10-differentiation.md) → [04-architecture.md](./04-architecture.md) → [05-data-model.md](./05-data-model.md)
3. **API/실시간 구현** → [06-api-and-realtime.md](./06-api-and-realtime.md) → [07-collaboration-crdt.md](./07-collaboration-crdt.md)
4. **인증·보안 구현** → [08-auth-and-permissions.md](./08-auth-and-permissions.md)
5. **테스트 전략 수립** → [09-tdd-strategy.md](./09-tdd-strategy.md)

---

## 용어집

| 용어 | 정의 |
|------|------|
| **워크스페이스(Workspace)** | 페이지들을 담는 최상위 컨테이너. `PERSONAL`(개인 전용)과 `SHARED`(협업) 두 가지 타입이 있다. |
| **멤버십(Membership)** | 사용자와 공유 워크스페이스 간 관계. 역할(OWNER/MEMBER)을 포함한다. |
| **페이지 트리(Page Tree)** | 페이지가 다른 페이지를 자식으로 가질 수 있는 중첩 계층 구조. `parentPageId` 자기참조로 구현한다. |
| **블록(Block)** | 에디터에서 콘텐츠의 최소 단위. 텍스트 단락, 제목, 목록 항목 등을 블록으로 표현한다. |
| **CRDT** | Conflict-free Replicated Data Type. 네트워크 분리 상황에서도 여러 클라이언트의 편집이 충돌 없이 수렴하도록 설계된 데이터 구조. |
| **RGA** | Replicated Growable Array. 이 프로젝트에서 채택한 CRDT 알고리즘. 각 문자에 고유 ID를 부여하고 삽입 순서를 결정론적으로 해소한다. |
| **op (operation)** | CRDT에서 편집 행위 하나를 나타내는 원자 단위. INSERT 또는 DELETE 타입을 가진다. |
| **tombstone** | 삭제된 문자를 실제로 제거하지 않고 "삭제됨" 표시로 남기는 방식. 인과 관계 추적을 위해 RGA에서 사용한다. |
| **presence** | 현재 페이지에 접속 중인 사용자 정보(아바타, 라이브 커서 위치, 뷰어 표시). 실시간으로 broadcast된다. |
| **커서 앵커(Cursor Anchor)** | 라이브 커서 위치를 텍스트 인덱스가 아닌 RGA 노드 ID에 묶어 표현하는 방식. op가 적용돼도 커서 위치가 올바르게 유지된다. |
| **snapshot** | 특정 시점의 페이지 전체 상태를 직렬화한 저장본. op 재생 비용을 줄이기 위해 선택적으로 생성한다. |
