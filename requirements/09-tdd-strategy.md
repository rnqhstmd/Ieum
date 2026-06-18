# 09 · TDD 전략

> **관련 문서**: [제품 개요](01-product-overview.md) · [MVP/로드맵](03-mvp-and-roadmap.md) · [CRDT 협업](07-collaboration-crdt.md) · [인증/권한](08-auth-and-permissions.md)

---

## 1. TDD 철학 — Red → Green → Refactor

```
RED    실패하는 테스트를 먼저 작성한다.
         → 테스트가 명세다. 구현 전에 "무엇이 되어야 하는가"를 코드로 표현한다.

GREEN  테스트를 통과시키는 최소한의 코드만 작성한다.
         → 과잉 구현 금지(YAGNI). 지금 실패하는 테스트 하나만 통과시킨다.

REFACTOR 테스트가 모두 초록인 상태에서 중복 제거·네이밍·구조 정리를 수행한다.
         → 동작을 바꾸지 않는다. 매 단계 테스트를 돌려 회귀를 확인한다.
```

**이 프로젝트에서 TDD가 필수인 이유**: Ieum의 핵심 가치 제안은 "외부 라이브러리 없이 자체 RGA CRDT로 협업 엔진 구현"이다. CRDT는 수학적 속성(수렴성·멱등성·교환법칙)이 정확히 유지되어야만 협업이 신뢰할 수 있다. 이를 수동으로 검증하는 것은 불가능에 가깝다 — 테스트가 유일한 안전망이다.

---

## 2. TDD가 빛나는 지점 vs 얇게 갈 곳

### 2-A. TDD를 두껍게 — 코어 로직

| 영역 | 이유 | 테스트 종류 |
|------|------|------------|
| **RGA CRDT 코어** (insert/delete/tie-break/인과 버퍼) | 버그 하나가 모든 사용자에게 영구 불일치 유발 | 단위 + property-based |
| **권한 검사** (OWNER/MEMBER, 워크스페이스 상속) | 권한 누락은 보안 취약점 | 단위 (순수 함수) |
| **초대 토큰** (생성·수락·만료·폐기) | 상태 전이 오류 = 접근 제어 홀 | 단위 + 통합 |
| **페이지 트리 이동/정렬** (order 재계산, 순환 참조 방지) | 트리 불변식 위반 시 UI 무한루프 | 단위 |
| **diff → op 계산** (텍스트 변경분 → Insert/Delete op 변환) | 잘못된 op = CRDT 불일치 트리거 | 단위 (입출력 쌍) |
| **ws 메시지 직렬화/역직렬화** | op 손실/타입 오류 = 동기화 실패 | 단위 |

### 2-B. TDD를 얇게 — UI/네트워크 Glue

| 영역 | 이유 | 대안 |
|------|------|------|
| React 컴포넌트 스타일/레이아웃 | 자주 바뀌고 비결정적, ROI 낮음 | Playwright e2e로 핵심 플로만 커버 |
| Next.js Route Handler 보일러플레이트 | 프레임워크가 검증, 단순 전달 코드 | 통합 테스트로 응답 코드/형식만 확인 |
| ws 연결 이벤트 핸들러 (연결/해제) | 네트워크 글루 코드 | e2e로 presence 표시 결과 확인 |
| 사이드바 트리 렌더링 순서 | DOM 세부 사항 | Playwright 스냅샷 또는 visual 확인 |

---

## 3. 테스트 레이어 구조

```
┌─────────────────────────────────────────────────────┐
│  E2E (Playwright)                                    │
│  실제 브라우저 2개 컨텍스트 → 협업 시나리오 전체 검증  │
│  느림 · 적게 · 중요한 경로만                          │
├─────────────────────────────────────────────────────┤
│  통합 (Vitest + in-memory transport/store)           │
│  서버 없이 여러 컴포넌트 조합 검증                     │
│  중간 속도 · 중간 수량 · Phase 경계 검증               │
├─────────────────────────────────────────────────────┤
│  단위 (Vitest)                                       │
│  순수 함수 · 독립 모듈 · 빠른 피드백                   │
│  빠름 · 많음 · CRDT/권한/토큰 코어 집중               │
└─────────────────────────────────────────────────────┘
```

### 3-A. 단위 테스트 (Vitest)

**검증 대상**: 외부 의존성이 없는 순수 함수와 독립 모듈

- `localInsert(rga, index, value)` → op 봉투 `{siteId, seq, opType:"INSERT", payload:{id, originId, value}}` 생성 및 배열 위치 확인
- `localDelete(rga, targetId)` → op 봉투 `{siteId, seq, opType:"DELETE", payload:{targetId}}` 생성, tombstone 마킹, 렌더 텍스트 제외
- `tieBreak(idA, idB)` — counter/siteId 비교 결정적 순서
- `applyOp(doc, op)` — 멱등 보장 (같은 op 2회 = 1회와 동일)
- `causalBuffer.enqueue(op)` / `causalBuffer.drain(doc)` — 의존성 해소 루프
- `diffToOps(before, after)` — 텍스트 변경분 → op 배열 변환
- `checkPermission(membership, action)` — OWNER/MEMBER 역할별 허용/거부
- `validateInvitationToken(token, now)` — 만료/폐기/유효 상태 분기
- `reorderPages(pages, movedId, newParentId, newIndex)` — order 재계산, 순환 방지

**원칙**: 각 함수는 입력 → 출력만 검증. 부작용 없음. 모든 엣지 케이스(빈 doc, 동일 id 중복 등) 명시.

### 3-B. 통합 테스트 (Vitest + in-memory)

**검증 대상**: 여러 모듈이 조합될 때의 동작 — 실제 네트워크/DB 없이

- **in-memory CRDT 동기화**: 두 `RGADocument` 인스턴스가 in-memory 채널로 op 교환 → 최종 상태 비교
- **인과 버퍼 + 동기화**: op를 의도적으로 역순 전달 → 버퍼에서 올바른 순서로 처리 확인
- **Invitation 플로**: `createInvitation` → `acceptInvitation` → `getMembership` 상태 전이
- **권한 미들웨어**: 요청 컨텍스트(userId, workspaceId) 주입 → OWNER 허용/MEMBER 거부/비멤버 차단
- **페이지 트리 API**: Route Handler 직접 호출(supertest 또는 Vitest fetch mock) → 응답 상태코드 + 트리 구조

**도구**: Prisma `@prisma/client` mock 또는 in-memory SQLite(`prisma-client-js` + `DATABASE_URL=file:./test.db`), ws 대신 in-memory EventEmitter 채널

### 3-C. E2E 테스트 (Playwright — 2 브라우저 컨텍스트)

**검증 대상**: 실제 브라우저 2개가 협업하는 전체 플로

```
시나리오 예시:
  context A: 페이지 열기 → 커서 위치 이동 → 텍스트 입력
  context B: 같은 페이지 열기 → A의 입력이 실시간 반영되는지 확인
  → expect(pageB.content).toBe(pageA.content)
```

**핵심 e2e 시나리오**:

1. **기본 협업 수렴**: 탭 A + 탭 B 동시 타이핑 → 양쪽 동일 결과
2. **재접속 동기화**: 탭 B 네트워크 차단 → 탭 A 타이핑 → 탭 B 재연결 → 수렴
3. **Presence**: 탭 A 접속 → 탭 B에서 A 아바타 표시 → 탭 A 닫기 → 아바타 사라짐
4. **초대 플로**: 사용자 A 초대 → 사용자 B 수락 → 공유 워크스페이스 접근
5. **권한 차단**: MEMBER가 초대 API 호출 → 403 응답 확인

**성능 기준**: e2e 스위트 전체 5분 이내. CI에서 headless 모드.

---

## 4. CRDT Property-Based 테스트 (fast-check)

RGA의 수학적 속성을 "랜덤 op 순서 = 동일 결과"로 표현한다. fast-check가 수백 가지 입력 조합을 자동 생성해 반례를 찾는다.

### 4-A. 수렴성 (Convergence)

**속성**: 두 사이트가 동일한 op 집합을 다른 순서로 적용해도 최종 상태가 같다.

```
// 의사코드
property("convergence", () => {
  // 임의의 op 시퀀스 생성
  const ops = fc.array(arbOp(), { minLength: 1, maxLength: 20 })

  fc.assert(fc.property(ops, (ops) => {
    const shuffled = shuffle(ops)  // 순서 섞기

    const docA = ops.reduce(applyOp, emptyDoc())
    const docB = shuffled.reduce(applyOp, emptyDoc())

    // 렌더 텍스트(tombstone 제외)가 동일해야 한다
    return renderText(docA) === renderText(docB)
  }))
})
```

### 4-B. 멱등성 (Idempotency)

**속성**: 같은 op를 두 번 적용해도 한 번 적용한 것과 동일하다.

```
// 의사코드
property("idempotency", () => {
  fc.assert(fc.property(arbDoc(), arbOp(), (doc, op) => {
    const once = applyOp(doc, op)
    const twice = applyOp(once, op)  // 동일 op 재적용

    return renderText(once) === renderText(twice)
  }))
})
```

### 4-C. 교환법칙 (Commutativity — concurrent ops)

**속성**: 인과 관계가 없는(concurrent) 두 op는 적용 순서에 무관하게 같은 결과를 낸다.

```
// 의사코드
property("commutativity of concurrent ops", () => {
  fc.assert(fc.property(arbDoc(), arbConcurrentOpPair(), (doc, [opA, opB]) => {
    // opA, opB는 서로 다른 originId를 갖는 concurrent 쌍
    const applyAB = applyOp(applyOp(doc, opA), opB)
    const applyBA = applyOp(applyOp(doc, opB), opA)

    return renderText(applyAB) === renderText(applyBA)
  }))
})
```

### 4-D. 인과 버퍼링 (Causal Ordering)

**속성**: op를 역순으로 넣어도 버퍼가 올바른 순서로 처리하면 수렴한다.

```
// 의사코드
property("causal buffer ordering", () => {
  fc.assert(fc.property(arbCausalChain(), (ops) => {
    // ops = [op1, op2(depends on op1), op3(depends on op2)]
    const reversed = [...ops].reverse()

    const buffer = new CausalBuffer()
    reversed.forEach(op => buffer.enqueue(op))
    const doc = buffer.drain(emptyDoc())

    const direct = ops.reduce(applyOp, emptyDoc())

    return renderText(doc) === renderText(direct)
  }))
})
```

**arbOp() 생성기 핵심**: 봉투 `{siteId, seq, opType, payload}` 구조를 생성; INSERT payload `{id, originId, value}`는 기존 doc 내 유효한 originId 참조; DELETE payload `{targetId}`는 기존 문자 id 참조.

---

## 5. Phase별 "먼저 짤 RED 테스트" 목록

### P0 · Foundation

- [ ] `POST /api/auth/...` — 구글 OAuth 콜백 후 User DB에 생성됨
- [ ] `GET /api/workspaces` — 로그인 사용자의 개인 워크스페이스 1개 반환
- [ ] 미인증 요청 → 401/리다이렉트

### P1 · Pages

- [ ] `POST /api/pages` — 페이지 생성, id 반환
- [ ] `GET /api/pages/:id` — 생성된 페이지 조회
- [ ] `PATCH /api/pages/:id` — 제목/내용 업데이트
- [ ] `DELETE /api/pages/:id` — 소프트 삭제
- [ ] 하위 페이지 생성 → parentPageId 설정 → 트리 조회
- [ ] 순환 참조 시도 → 400 에러
- [ ] 다른 사용자의 페이지 접근 → 403

### P2 · CRDT 협업코어 (TDD 집중 구간)

순서를 지킨다 — 각 단계가 다음 단계의 기반이 된다.

1. **id 비교 함수**: `compareIds(a, b)` — counter desc, siteId 사전순 결정적
2. **단일 Insert**: `applyOp(empty, insertOp)` → 문자 1개 포함된 doc
3. **단일 Delete**: `applyOp(docWith1Char, deleteOp)` → tombstone, renderText = ""
4. **순서 보장 Insert**: op2(after op1)를 순서대로 → 올바른 위치
5. **2-site 수렴**: 사이트 A와 B가 다른 순서로 op 적용 → renderText 동일
6. **동시 삽입 tie-break**: 같은 originId에 두 Insert → id 비교로 결정적 순서
7. **멱등성**: 같은 op 2회 적용 = 1회와 동일
8. **인과 버퍼 — 역순 도착**: op2가 op1보다 먼저 도착 → 버퍼에서 대기 → op1 도착 후 처리
9. **property-based 수렴**: fast-check 랜덤 시퀀스 100회+ 수렴 확인
10. **property-based 멱등**: fast-check 멱등 속성 확인
11. **diffToOps**: 텍스트 before/after → 최소 op 배열 변환
12. **ws 직렬화**: op JSON 왕복 (serialize → deserialize → 동일 구조)

### P3 · Presence

- [ ] ws join → 연결된 다른 클라이언트에 아바타 추가 이벤트
- [ ] ws leave → 아바타 제거 이벤트
- [ ] 커서 위치 전송 → 수신 측 동일 문자 id 앵커
- [ ] tombstone 앵커 → 다음 살아있는 문자로 폴백

### P4 · 공유 워크스페이스

- [ ] `POST /api/workspaces` type=SHARED → 생성, OWNER 멤버십 자동 생성
- [ ] `POST /api/invitations` — OWNER만 가능, PENDING 토큰 생성
- [ ] `POST /api/invitations/:token/accept` — PENDING → ACCEPTED, Membership 생성
- [ ] 만료 토큰 수락 → 410 Gone
- [ ] 폐기 토큰 수락 → 403
- [ ] `DELETE /api/memberships/:id` — OWNER가 MEMBER 추방
- [ ] MEMBER가 초대 API 호출 → 403
- [ ] 추방된 MEMBER가 페이지 접근 → 403

---

## 6. 커버리지 및 CI 가이드

### 커버리지 목표

| 레이어 | 목표 커버리지 | 비고 |
|--------|--------------|------|
| CRDT 코어 (`src/crdt/`) | **≥ 95%** | property-based 포함 |
| 권한/초대 로직 | **≥ 90%** | 상태 전이 모든 분기 |
| Route Handlers | **≥ 70%** | 통합 테스트 중심 |
| React 컴포넌트 | **≥ 40%** | e2e로 보완 |

커버리지는 목표이지, 숫자 채우기가 목적이 아니다. **CRDT 속성 테스트 통과가 숫자보다 중요하다**.

### CI 파이프라인 권고

```
# GitHub Actions 예시 흐름

1. lint + typecheck          (빠름, 항상)
2. vitest run --reporter=dot (단위 + 통합, 병렬)
   ├── crdt 속성 테스트 (fast-check, seed 고정)
   ├── 권한/초대 단위
   └── 통합 (in-memory DB)
3. playwright test --workers=2 (e2e, PR 머지 전)
4. coverage report (lcov → PR 코멘트)
```

**PR 규칙 권고**:
- CRDT 코어 변경 시 property-based 테스트 반드시 통과
- 권한 로직 변경 시 권한 단위 테스트 스위트 통과
- e2e는 main 머지 전 1회 통과 확인

### fast-check seed 고정

property-based 테스트는 CI에서 seed를 고정해 재현 가능하게 유지한다.

```
// 의사코드
fc.assert(
  fc.property(...),
  { seed: 42, numRuns: 500 }
)
```

반례 발견 시 seed와 counterexample을 로그에 남겨 로컬 재현 가능하게 한다.

---

## 7. 테스트 파일 구조 권고

```
src/
  crdt/
    rga.ts
    rga.test.ts          ← 단위: insert/delete/tie-break/멱등
    rga.property.test.ts ← property-based: 수렴/멱등/교환
    causal-buffer.ts
    causal-buffer.test.ts
    diff-to-ops.ts
    diff-to-ops.test.ts
  auth/
    permissions.ts
    permissions.test.ts
  invitations/
    invitation.ts
    invitation.test.ts   ← 상태 전이 전체
  pages/
    page-tree.ts
    page-tree.test.ts    ← 순환 참조 방지, order 재계산

tests/
  integration/
    crdt-sync.test.ts    ← in-memory 2-site 동기화
    invitation-flow.test.ts
    page-api.test.ts
  e2e/
    collaboration.spec.ts  ← Playwright 2 컨텍스트
    presence.spec.ts
    invitation.spec.ts
```

---

*최종 수정: 2026-06-18 | 이전 문서: [08-auth-and-permissions.md](08-auth-and-permissions.md)*
