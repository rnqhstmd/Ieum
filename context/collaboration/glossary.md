# 실시간 협업 용어 사전

| 용어 | 정의 |
|------|------|
| **CRDT** (Conflict-free Replicated Data Type) | 수학적으로 수렴이 보장된 분산 자료구조. 같은 op 집합을 다른 순서로 적용해도 최종 상태가 동일하다. |
| **RGA** (Replicated Growable Array) | Ieum이 채택한 CRDT 알고리즘. 각 요소가 고유 id(`RgaId`)를 가지며, 삽입 위치는 선행 요소의 id(`originId`)로 명시하고 삭제는 tombstone으로 처리한다. MVP부터 2-level 블록 RGA 구조로 구현된다. |
| **블록 RGA** | 2-level 블록 RGA의 외부 레벨. 블록(paragraph, heading1~3, bullet list 등)을 RGA 요소로 관리하는 리스트. 블록 단위 삽입·삭제·순서 변경을 수렴 보장하에 처리한다. |
| **인라인 텍스트 RGA** | 2-level 블록 RGA의 내부 레벨. 각 블록 안에 포함된 문자 시퀀스를 RGA로 관리한다. 블록별로 독립적인 RGA 인스턴스를 가진다. |
| **RgaId** | RGA 요소의 고유 식별자. `{ counter: number, siteId: string }` 쌍으로 구성. `counter`는 사이트 내 단조 증가 논리 클락, `siteId`는 편집 세션/탭마다 생성되는 UUID. |
| **RgaNode** | RGA의 요소(노드). `id`, `originId`, `value`, `deleted(tombstone)` 필드를 가진다. 외부 블록 RGA에서는 `value`가 블록 타입(BlockNode), 내부 인라인 텍스트 RGA에서는 `value`가 문자(string). |
| **originId** | INSERT op에서 "이 요소가 삽입된 직전 요소의 id". `null`이면 문서 시작(sentinel 직후). |
| **tombstone** | 논리적으로 삭제된 RGA 노드. `deleted = true`로 표시되며 순서 유지를 위해 링크드 리스트 구조에 남아 있지만 `toText()`에서 제외된다. |
| **op** (operation) | RGA 연산 단위. `INSERT`(새 요소 삽입)와 `DELETE`(요소 tombstone 처리) 두 종류. |
| **수렴성** (Convergence) | 같은 op 집합을 다른 순서로 적용해도 최종 상태가 동일한 성질. 위반 시 사용자마다 다른 텍스트를 보게 된다. |
| **멱등성** (Idempotency) | 같은 op를 여러 번 적용해도 한 번 적용한 것과 결과가 동일한 성질. 네트워크 재전송·재접속 replay를 안전하게 처리한다. |
| **교환법칙** (Commutativity) | op 적용 순서를 바꿔도 최종 상태가 동일한 성질. 네트워크 순서와 무관하게 동일한 결과를 보장한다. |
| **인과 버퍼링** (Causal Buffering) | op의 `originId`가 아직 로컬에 없으면 `pendingBuffer`에 보관하고, `originId`가 도착한 후 자동으로 적용하는 메커니즘. |
| **tie-break** | 같은 `originId`에 여러 노드가 동시 삽입될 때 결정론적 순서를 정하는 규칙. `counter` 내림차순, counter가 같으면 `siteId` 사전 역순으로 비교한다. |
| **presence / awareness** | 현재 페이지에 접속 중인 다른 사용자의 상태 정보(커서 위치, 이름, 색상, 아바타). 서버에 영속 저장하지 않고 WebSocket 브로드캐스트로만 전파된다. |
| **커서 앵커** (anchorId) | presence 커서 위치를 RGA 문자 id로 표현한 것. DOM 인덱스 기반이 아니라 id 기반이므로 다른 사용자의 편집 후에도 커서가 올바른 문자를 가리킨다. |
| **Snapshot** | 특정 시점의 완전한 RGA 상태를 직렬화한 레코드. `pageId`, `state(JSON)`, `version(최대 seq)` 필드를 가진다. 재접속 시 전체 op replay 비용을 줄이는 데 사용된다. |
| **relay 서버** | CRDT op를 클라이언트 간에 중계하고, op를 DB에 영속화하며, presence 정보를 브로드캐스트하는 별도 Node.js + ws 서버. room은 pageId 단위로 관리된다. |
| **siteId** | 편집 세션/탭마다 새로 생성되는 UUID. CRDT 수렴 정확성을 위한 replica 식별자이며, 사용자 신원(`userId`)과 별개다. `(counter, siteId)` 쌍이 전역 유일 식별자 역할을 한다. 사용자 식별은 WebSocket 연결 시 JWT 인증으로 별도 처리하며, 서버는 클라이언트 siteId를 신뢰해 신원을 판단하지 않는다. |
| **seq** | 특정 `siteId` 내에서 op가 발생한 순서를 나타내는 단조 증가 번호. `(siteId, seq)` 쌍은 op의 벡터 클럭 역할이며 전체 시스템 내 전역 유일하다. |
| **pendingBuffer** | `originId`가 아직 도착하지 않아 적용할 수 없는 op를 임시 보관하는 버퍼. 새 op 적용 후 `drainBuffer()`로 재검사된다. |
| **toText()** | RGA 링크드 리스트를 순회하며 `deleted = false`인 노드의 value만 이어붙여 현재 문서 텍스트를 반환하는 함수. |
| **packages/crdt** | 순수 TypeScript로 구현된 RGA CRDT 모듈. 외부 의존성 0, 네트워크·DOM·파일시스템 접근 없음. Node.js·브라우저·Vitest 환경 모두에서 동일하게 동작한다. |
