# 공통 용어 사전

> 도메인을 가리지 않고 프로젝트 전체에서 쓰이는 용어입니다.
> 도메인별 용어는 `context/{도메인}/glossary.md`를 참조하세요.

| 용어 | 설명 |
|------|------|
| **Ieum (이음)** | 본 프로젝트. Google 로그인 기반 노션 유사 실시간 협업 문서 서비스. "여러 편집을 이어 하나로"라는 의미. |
| **MVP** | 최소 출시 범위. Phase 0(로그인)부터 Phase 4(공유 워크스페이스)까지 포함. |
| **Phase (P0~P5)** | 로드맵 단계. P0 Foundation · P1 Pages · P2 CRDT 협업 코어 · P3 Presence · P4 공유 워크스페이스 · P5 post-MVP. |
| **워크스페이스 (Workspace)** | 페이지를 담는 최상위 컨테이너. `PERSONAL`(개인)·`SHARED`(공유) 두 종류. |
| **페이지 (Page)** | 문서 단위. `parentPageId`로 중첩 트리를 이룬다. |
| **블록 (Block)** | 에디터 콘텐츠의 최소 단위(단락·제목·목록 등). |
| **CRDT** | Conflict-free Replicated Data Type. 동시·오프라인 편집이 충돌 없이 수렴하는 자료구조. |
| **RGA** | Replicated Growable Array. 본 프로젝트가 채택한 CRDT 알고리즘(외부 라이브러리 없이 자체 구현). |
| **op** | CRDT 편집 연산 단위(`INSERT`/`DELETE`). |
| **presence (awareness)** | 접속자·라이브 커서 등 실시간 현황 정보. 영속 저장하지 않음. |
| **Membership / role** | 사용자–워크스페이스 관계 / 역할(`OWNER`(관리자)·`MEMBER`, Viewer는 post-MVP). 공유 워크스페이스에서 OWNER(관리자)만 초대·멤버 제거·역할 변경·워크스페이스 삭제를 수행할 수 있다. |
| **relay 서버** | op·presence를 중계하는 별도 Node + `ws` 실시간 서버. |
| **스택** | TypeScript · Next.js(App Router) · PostgreSQL/Prisma · Auth.js(Google) · 자체 RGA CRDT · Node/ws · Vitest/Playwright · Resend(이메일). |
| **Resend** | 워크스페이스 초대 이메일 발송용 트랜잭션 메일 서비스. Next.js Route Handler에서 Resend SDK를 호출하여 초대 메일을 발송한다. |
