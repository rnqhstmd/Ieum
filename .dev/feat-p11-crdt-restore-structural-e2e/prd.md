# PRD: P11 — CRDT 재접속 복원 · 구조편집 수렴 · e2e Playwright

> 슬라이스: US-CRDT-02(재접속 복원) + page US-EDIT(구조편집 수렴) + e2e Playwright. 단일 슬라이스(PR 1개). base=main(cd1661e).
> 범위 결정(사용자 확정): ① 재접속 복원=순수 op replay만(Snapshot 연동 제외, backend 무변경) ② e2e=로컬 수동 구동(자동 verify 게이트 비포함) ③ 3그룹 단일 슬라이스.

## 배경

**현재 제품 상태:**
- 인라인 타이핑(문자 삽입/삭제)은 2탭 간 라이브 수렴이 동작한다 (P5, PR #10).
- op는 crdt_ops 테이블에 append-only로 영속화된다 (P5b, PR #14).
- `packages/crdt`에 블록 op 생성자(`splitBlock`/`mergeBlockWithPrev`), `applyDocOp`, `serializeRga`/`deserializeRga`가 모두 구현되어 있다 (P4b, PR #9).
- backend에 `Snapshot` 엔티티와 serverSeq 기준 op 조회 메서드가 존재하나, 이를 호출하는 API/엔드포인트가 없다.

**남은 3가지 공백:**
1. **재접속 복원 (US-CRDT-02)**: 신규/재접속 클라이언트가 join 시 과거 op를 받지 못한다. relay `join` 핸들러에 op 재생 경로가 없고, protocol에 `op-batch` 메시지 타입이 없다.
2. **구조편집 수렴 (US-EDIT CRDT)**: `Editor.tsx`의 Enter/Backspace 핸들러가 `preventDefault`만 수행한다. 블록 분할/병합/타입 변경을 블록 op로 전송하는 배선이 없어, 구조편집이 다중 클라 간에 수렴되지 않는다.
3. **e2e Playwright**: Playwright가 미설치이고 풀스택 환경 검증이 없다. 수렴 검증이 vitest in-memory 통합테스트로만 커버되어 있다.

## 목표
- 재접속 또는 신규 접속한 사용자가 기존 편집 내용을 유실 없이 즉시 받아 기존 접속자와 동일한 텍스트를 본다.
- Enter/Backspace 등 구조편집이 모든 접속자 화면에 수렴된다.
- 브라우저 2개로 동시 편집 후 양쪽 텍스트가 동일함을 자동화된 풀스택 테스트로 증명한다.

## 요구사항

### 기능 요구사항

**그룹 A — 재접속 복원 (US-CRDT-02)**
- [Must] FR-A1: join 시 relay가 해당 pageId의 crdt_ops에서 serverSeq 오름차순으로 전체 op를 조회하여 신규 접속자에게 전송하며, 접속자가 기존 접속자와 동일한 DocState로 초기화된다.
- [Must] FR-A2: relay는 join 응답으로 `type: 'op-batch'` 메시지(serverSeq 오름차순 정렬된 op 배열)를 전송한다. 클라이언트는 수신 즉시 `applyDocOp`를 순서대로 replay한다.
- [Must] FR-A3: replay 중 수신된 실시간 op는 replay 완료 후 인과 버퍼를 통해 적용된다(replay 기간 중 유실 방지).
- [Must] FR-A4: 빈 문서(op 0건) 접속 시 빈 DocState(genesis 블록 1개)로 초기화된다.

**그룹 B — 구조편집 수렴 (US-EDIT CRDT)**
- [Must] FR-B1: 커서가 블록 내 임의 위치에 있을 때 Enter를 누르면 `splitBlock`으로 블록 op 시퀀스를 생성하여 relay로 전송하고, 모든 접속자가 동일한 블록 분할 결과로 수렴한다.
- [Must] FR-B2: 커서가 블록 맨 앞(index 0)에 있을 때 Backspace를 누르면 `mergeBlockWithPrev`로 블록 op 시퀀스를 생성하여 relay로 전송하고, 모든 접속자가 동일한 블록 병합 결과로 수렴한다. 첫 번째 블록에서는 동작하지 않는다.
- [Must] FR-B3: 에디터 내 블록 타입 변경(마크다운 단축키 `# ## ### -`)이 `block-set-type` op로 전송되어 수렴한다. 동시 타입 변경은 `(clock DESC, siteId DESC)` LWW로 해소된다.
- [Must] FR-B4: 에디터 렌더링의 진실 원천이 DocState(`docToBlocks`)에서 파생된다. 구조편집 후 로컬 즉시 반영 및 원격 수신 후 자동 반영된다.
- [Should] FR-B5: Enter 시 heading 블록은 paragraph로 전환되고, paragraph/bullet은 동일 타입을 유지한다 (`inheritType` 규칙).
- [Should] FR-B6: 빈 paragraph 블록에서 Backspace(index 0)를 눌러 직전 블록과 병합 시, 빈 블록이 삭제되고 커서가 직전 블록 끝으로 이동한다.

**그룹 C — e2e Playwright**
- [Must] FR-C1: Playwright 환경을 설정하고, 실제 브라우저 2개를 띄워 동시 편집 후 양쪽 텍스트가 동일함을 검증하는 e2e 테스트 1개 이상을 작성한다.
- [Must] FR-C2: e2e 테스트는 개발자가 로컬에서 DB/relay/web을 직접 구동한 상태에서 `pnpm --filter web e2e` 등 별도 명령으로 실행한다. 자동 verify 게이트(`./gradlew test` + `ws-relay pnpm test`)에는 포함되지 않는다.
- [Should] FR-C3: e2e에서 재접속 복원 시나리오(클라이언트 A가 편집 → 클라이언트 B가 새로 접속 → B가 A의 편집 내용을 봄)를 추가로 검증한다.
- [Could] FR-C4: 페이지 초기 로드 타이밍을 Playwright로 측정하여 2초 미만임을 확인한다.

### 비즈니스 규칙
- [Must] BR-1: 재접속 복원은 relay의 `PgOpStore`에서 pageId 기준으로 serverSeq 오름차순 조회한 op를 그대로 재전송한다. op 순서가 serverSeq 기준으로 보장되어야 한다. backend 변경 없음.
- [Must] BR-2: relay가 join 후 op-batch를 전송하는 시점과 이후 실시간 op 브로드캐스트 사이에 op가 유실되지 않아야 한다. op-batch 전송 완료 전에 수신된 실시간 op는 클라이언트 인과 버퍼로 처리된다.
- [Must] BR-3: `splitBlock`이 생성하는 op 시퀀스(block-insert + 인라인 delete 복수 + 인라인 insert 복수)는 개별 op로 전송되며, 각 op가 독립적으로 멱등 처리된다.
- [Must] BR-4: 첫 번째 블록(genesis 블록)에서 Backspace(블록 맨 앞)를 눌러도 블록 병합이 발생하지 않는다.
- [Must] BR-5: `packages/crdt`의 외부 의존성 0을 유지한다. 재접속 복원 관련 직렬화 로직은 기존 `serializeRga`/`deserializeRga` API를 사용한다.

### 품질 기대
- [Should] QE-1: 재접속 복원 후 기존 접속자와 신규 접속자의 `toText()` 결과가 100% 일치한다 (vitest 통합 + e2e 양방 검증).
- [Should] QE-2: e2e 환경에서 50개 op가 적용된 문서에 신규 접속 시, 접속부터 텍스트 표시까지 체감 지연이 없다.
- [Should] QE-3: 동시 블록 분할(두 사용자가 같은 블록에 동시 Enter)이 결정론적 순서로 수렴된다 (siteId tie-break).

## 사용자 시나리오

**정상 흐름 — 재접속 복원**
1. 사용자 A가 페이지에서 10개 단락을 작성한다.
2. 사용자 B가 같은 페이지에 새로 접속한다.
3. relay가 join 직후 crdt_ops에서 pageId 기준 전체 op를 serverSeq 오름차순으로 조회해 `op-batch`로 B에게 전송한다.
4. B의 클라이언트가 op를 순서대로 replay하여 A와 동일한 텍스트를 표시한다.
5. 이후 A가 추가 편집하면 B에게 실시간으로 반영된다.

**정상 흐름 — 구조편집 수렴**
1. 사용자 A가 "Hello World"가 있는 단락에서 "Hello" 뒤에 커서를 두고 Enter를 누른다.
2. `splitBlock`이 실행되어 block-insert + 인라인 op 시퀀스가 생성되고 relay로 전송된다.
3. 사용자 B는 "Hello"와 "World"가 각각 별도 단락으로 분리된 화면을 본다.
4. 두 사용자의 `docToBlocks()` 결과가 동일하다.

**엣지 케이스**
- **빈 문서 접속**: op 0건인 페이지에 접속 시 빈 DocState(genesis 블록)로 초기화. relay는 `ops: []`인 op-batch를 전송한다.
- **재접속 중 op 도착**: op-batch 수신 중 실시간 op가 브로드캐스트될 경우, 클라이언트 인과 버퍼에 보류되어 replay 완료 후 자동 적용.
- **동시 블록 분할**: 사용자 A와 B가 동시에 같은 블록 Enter → 외부 블록 RGA tie-break(siteId 역순)로 결정론적 순서 확정, 양쪽 수렴.
- **genesis 블록 Backspace**: 첫 번째 블록 맨 앞에서 Backspace → 무동작(직전 블록 없음).
- **네트워크 단절 재연결**: Transport 재연결 후 join을 재전송하여 op-batch를 다시 수신, 멱등성으로 중복 op 무시.
- **op-batch 내 중복 op**: 멱등성(`nodeMap.has(idKey(op.id))`) 보장으로 재적용 시 상태 불변.

## 영향 범위
- **ws-relay**: `protocol.ts`에 `op-batch` 메시지 타입 추가. `room.ts` join 핸들러에 op 조회·전송 로직 추가. `OpStore` 포트에 pageId 기준 serverSeq 오름차순 op 조회 메서드 추가.
- **apps/web**: `relayClient.ts`에 `op-batch` 수신 핸들러 추가. `useCrdtDocument.ts`에 replay 로직 추가. `Editor.tsx` Enter/Backspace 핸들러에 블록 op 생성·전송 배선. `crdtDocument.ts`에 블록 diff 로직 추가.
- **packages/crdt**: 신규 코드 추가 없음. 기존 `serializeRga`/`deserializeRga`/`applyDocOp`/블록 op 생성자 활용.
- **backend**: 변경 없음. PgOpStore가 Node 레이어에서 crdt_ops를 직접 조회하므로 backend REST API 불필요.
- **기존 인라인 타이핑 수렴**: 변경 없음. 구조편집은 기존 인라인 op 경로와 독립적으로 추가된다.
- **기존 테스트**: ws-relay 61개, web 135개 기존 테스트에 영향 없어야 한다.

## 수용 기준

**그룹 A — 재접속 복원**

AC-A1: op-batch 전송
  Given: pageId P에 50개 op가 crdt_ops에 저장되어 있고, 신규 클라이언트 C가 join 메시지를 전송한다
  When: relay의 join 핸들러가 처리된다
  Then: C의 소켓으로 `type: 'op-batch'`이고 `ops` 배열 길이가 50이며 `serverSeq` 오름차순으로 정렬된 메시지가 전송된다
  — [FR-A1, FR-A2] / 검증 레이어: ws-relay vitest 통합 (testcontainers)

AC-A2: 신규 접속자 수렴
  Given: 클라이언트 A가 pageId P에서 인라인 op 3개를 전송하여 텍스트 "abc"가 crdt_ops에 저장된 상태이다
  When: 클라이언트 B가 같은 페이지에 join한다
  Then: B의 DocState에서 `toText()` 결과가 "abc"와 동일하다
  — [FR-A1, FR-A2] / 검증 레이어: ws-relay vitest 통합

AC-A3: replay 중 실시간 op 유실 없음
  Given: op-batch replay 진행 중(클라이언트 B가 op를 순서대로 적용 중)에 클라이언트 A가 새 op를 전송한다
  When: B가 op-batch 적용을 완료한 후 인과 버퍼를 drain한다
  Then: B의 `toText()`가 A의 최신 DocState `toText()`와 동일하다
  — [FR-A3] / 검증 레이어: ws-relay vitest 통합

AC-A4: 빈 문서 접속
  Given: crdt_ops에 pageId P에 대한 op가 0건이다
  When: 클라이언트가 pageId P에 join한다
  Then: relay가 `type: 'op-batch'`이고 `ops: []`인 메시지를 전송하고, 클라이언트의 DocState가 genesis 블록 1개인 초기 상태를 유지한다
  — [FR-A4] / 검증 레이어: ws-relay vitest 단위

AC-A5: 멱등 replay
  Given: relay가 동일한 50개 op를 포함한 op-batch를 클라이언트에 2회 전송한다
  When: 클라이언트가 두 번째 op-batch를 재적용한다
  Then: `toText()` 결과가 첫 번째 적용과 동일하고, DocState 내 노드 수가 증가하지 않는다
  — [FR-A2, BR-5] / 검증 레이어: packages/crdt vitest 단위

**그룹 B — 구조편집 수렴**

AC-B1: Enter 블록 분할 수렴
  Given: 클라이언트 A와 B가 같은 pageId에 접속해 있고, 첫 번째 블록 텍스트가 "HelloWorld"이며 커서가 index 5("Hello"와 "World" 사이)에 있다
  When: 클라이언트 A가 Enter를 누른다
  Then: relay로 `block-insert` 1개 + 인라인 op 시퀀스(기존 블록에서 delete + 새 블록에 insert)가 전송되고, A와 B 양쪽에서 `docToBlocks()`가 블록 2개를 반환하며 첫 블록 텍스트가 "Hello", 두 번째 블록 텍스트가 "World"이다
  — [FR-B1, FR-B4] / 검증 레이어: web vitest 통합 (FakeTransport in-memory relay)

AC-B2: Backspace 블록 병합 수렴
  Given: 클라이언트 A와 B가 같은 pageId에 접속해 있고, 블록 2개가 존재하며(첫째 "Hello", 둘째 "World") 커서가 두 번째 블록 맨 앞(index 0)에 있다
  When: 클라이언트 A가 Backspace를 누른다
  Then: relay로 `block-delete` 1개 + 인라인 insert op 시퀀스가 전송되고, A와 B 양쪽에서 블록이 1개로 줄고 텍스트가 "HelloWorld"이다
  — [FR-B2, FR-B4] / 검증 레이어: web vitest 통합 (FakeTransport)

AC-B3: genesis 블록 Backspace 무동작
  Given: DocState에 블록이 1개(genesis 블록)만 존재하고 커서가 index 0이다
  When: Backspace를 누른다
  Then: relay로 아무 op도 전송되지 않고 DocState가 변경되지 않는다
  — [FR-B2, BR-4] / 검증 레이어: web vitest 단위

AC-B4: 블록 타입 변경 수렴
  Given: 클라이언트 A와 B가 같은 pageId에 접속해 있고, 첫 번째 블록 타입이 "paragraph"이다
  When: 클라이언트 A가 마크다운 단축키 `# `을 입력하여 타입을 "heading1"으로 변경한다
  Then: relay로 `block-set-type` op가 전송되고, A와 B 양쪽에서 해당 블록 타입이 "heading1"로 렌더된다
  — [FR-B3] / 검증 레이어: web vitest 통합 (FakeTransport)

AC-B5: Enter 후 heading → paragraph 전환
  Given: 블록 타입이 "heading1"인 블록에 커서가 있다
  When: Enter를 누른다
  Then: 새로 생성된 블록의 타입이 "paragraph"이다(`inheritType` 규칙 적용)
  — [FR-B5] / 검증 레이어: packages/crdt vitest 단위

AC-B6: 동시 블록 분할 수렴
  Given: 클라이언트 A와 B가 같은 블록에 동시에 Enter를 눌러 각각 block-insert op를 생성한다 (counter 동일, siteId 다름)
  When: 양쪽이 서로의 op를 수신하여 적용한다
  Then: A와 B 양쪽의 `docToBlocks()` 블록 배열이 동일하고, 블록 순서가 siteId 역순 tie-break로 결정된다
  — [FR-B1, QE-3] / 검증 레이어: packages/crdt vitest 단위

**그룹 C — e2e Playwright**

AC-C1: 동시 편집 수렴 e2e
  Given: 개발자가 로컬에서 DB/relay/web을 직접 구동한 상태이고, 브라우저 A와 브라우저 B가 각각 별도 컨텍스트로 같은 pageId에 접속되어 있다
  When: 브라우저 A에서 인라인 텍스트 "Hello"를 입력하고, 브라우저 B에서 "World"를 동시에 입력한 뒤 각자의 op가 relay를 통해 교환된다
  Then: 브라우저 A와 B 양쪽 에디터에 표시된 텍스트가 동일하다(순서는 tie-break에 따르며, 양쪽이 일치해야 함)
  — [FR-C1, FR-C2] / 검증 레이어: Playwright e2e (별도 명령 실행)

AC-C2: 재접속 복원 e2e
  Given: 개발자가 로컬에서 DB/relay/web을 직접 구동한 상태이고, 브라우저 A가 pageId에서 "Hello"를 입력하여 crdt_ops에 저장된 상태이다
  When: 브라우저 B가 같은 pageId에 새로 접속한다
  Then: 브라우저 B의 에디터에 "Hello"가 표시된다
  — [FR-C1, FR-C2, FR-C3] / 검증 레이어: Playwright e2e (별도 명령 실행)

## 제외 범위
- **Snapshot + delta 재접속 복원 (FR-A5 제외)**: relay가 backend Snapshot API를 호출하여 Snapshot + delta 조합으로 응답하는 방식은 이 슬라이스에서 제외. relay의 PgOpStore를 통한 전체 op replay가 유일 경로. backend 변경 없음.
- **Snapshot 자동 생성 트리거 (FR-A6 제외)**: 1,000 op / 24시간 임계값 기반 서버 사이드 Snapshot 생성은 제외. BR-6/BR-7은 이 슬라이스에 적용되지 않음.
- **e2e globalSetup 자동 구동 및 CI 통합**: Playwright globalSetup에서 DB/relay/web을 자동 시작하는 방식, CI 파이프라인 통합은 후속 과제. 이 슬라이스의 e2e는 로컬 수동 구동 전제.
- **WS-AUTH-01 (신원 위조 방지)**: trust-relay userId 한계 보완(서명/세션 검증)은 P11 항목이나 이 슬라이스에서는 제외. 별도 슬라이스.
- **Viewer 역할 (PERM-06)**: post-MVP.
- **페이지 순서 드래그앤드롭 (US-PAGE-05 position)**: post-MVP.
- **키보드 탐색 (블록 간 화살표)**: 이 슬라이스에서는 제외. 별도.
- **페이지 초기 로드 2초 측정 (FR-C4, Could)**: e2e 기반 구성 완료 후 별도 추가.
- **Snapshot tombstone GC**: MVP에서는 tombstone을 포함한 전체 노드를 직렬화. GC는 post-MVP.
- **블록 op 원자 전송**: splitBlock/mergeBlockWithPrev의 op 묶음은 개별 op로 전송되며, 부분 적용 가능성은 인과 버퍼와 멱등성으로 처리한다. 원자성 보장은 이 슬라이스 범위 밖.

## 확인이 필요한 사항
추가 확인 사항 없음. PRD가 확정되었습니다.
