# 실시간 협업 아키텍처

## 시스템 구조

### 핵심 컴포넌트

| 컴포넌트 | 기술 | 역할 |
|----------|------|------|
| `packages/crdt` | 순수 TypeScript, 의존성 0 | RGA CRDT 상태 관리 · op 생성·적용 · 직렬화 |
| relay 서버 | Node.js + ws | op 수신 → DB 영속화 → room 브로드캐스트, presence 릴레이 |
| 클라이언트 에디터 | contenteditable | DOM 이벤트 → localInsert/localDelete → op 전송, CRDT 상태에서 렌더링 |
| DB (PostgreSQL) | Prisma | CrdtOp append-only 저장, Snapshot 압축 보관 |

### RGA CRDT 핵심 설계

- **2-level 블록 RGA (MVP)**: 외부 블록 리스트 RGA(paragraph/heading1~3/bullet 타입의 블록 단위 요소)와 블록별 내부 인라인 텍스트 RGA로 구성된다. 이후 인라인 서식·추가 블록 타입으로 확장한다.
- **요소 식별**: 각 노드는 `RgaId { counter, siteId }` 로 전역 유일하게 식별된다.
- **siteId / userId 분리**: `siteId`는 편집 세션/탭마다 생성되는 UUID로 CRDT 수렴 정확성을 위한 식별자다. 사용자 신원(`userId`)은 WebSocket 연결 시 JWT 인증으로 별도 확인하며, `siteId`와 동일시하지 않는다. 서버는 인증된 연결의 `userId`를 op에 태깅/기록하며, 클라이언트 `siteId`를 신뢰해 신원을 판단하지 않는다.
- **삽입 위치**: `originId`(선행 요소 id)로 명시. `null`이면 문서 시작.
- **삭제**: `deleted = true` tombstone 처리. 노드는 구조에 잔류해 순서를 보존한다.
- **수렴 보장**: 같은 `originId`에 여러 노드가 동시 삽입될 때 `counter` 내림차순 → `siteId` 사전 역순 tie-break로 결정론적 순서를 확정한다. op 수신 순서와 무관하게 모든 replica가 동일한 결과에 수렴한다.
- **인과 버퍼링**: `originId`가 아직 도착하지 않은 op는 `pendingBuffer`에 보관, `originId` 도착 후 `drainBuffer()`로 자동 적용된다.

### packages/crdt 공개 API

| 함수 | 설명 |
|------|------|
| `createRga(siteId)` | 새 RGA 상태 생성 |
| `localInsert(rga, index, value)` | 로컬 편집 → InsertOp 반환 |
| `localDelete(rga, index)` | 로컬 삭제 → DeleteOp 반환 |
| `applyOp(rga, op)` | 원격 op 적용 (인과 버퍼 포함) |
| `toText(rga)` | 현재 문서 텍스트 반환 |
| `serializeRga(rga)` | Snapshot 직렬화 |
| `deserializeRga(data)` | Snapshot 역직렬화 |

### 핵심 데이터 흐름

```
[클라이언트 A 편집]
  contenteditable 이벤트
    → localInsert/localDelete (packages/crdt)
    → InsertOp/DeleteOp 생성 + 로컬 즉시 적용
    → WebSocket op 메시지 전송 (C→S)

[relay 서버]
  op 수신
    → CrdtOp DB append-only 저장
    → op-ack 발신자에게 반환
    → 같은 pageId room의 다른 클라이언트에 브로드캐스트 (S→C)

[클라이언트 B 수신]
  op 메시지 수신
    → applyOp (packages/crdt) — 인과 버퍼 경유
    → toText()로 에디터 재렌더링
```

### Presence 흐름

```
[클라이언트 커서 이동]
  DOM selection 이벤트
    → 현재 오프셋을 RGA 노드 id(anchorId)로 변환
    → awareness 메시지 전송 (debounce 50ms)

[relay 서버]
  awareness 수신
    → 메모리 내 room presence 맵 업데이트 (DB 저장 없음)
    → presence-update 전체 브로드캐스트

[클라이언트 퇴장]
  WebSocket disconnect 감지
    → presence-leave 브로드캐스트
    → room 내 해당 userId presence 제거
```

### 재접속 흐름

```
클라이언트 재접속
  → sync-request { knownVersion: N } 전송
  → 서버: 최신 Snapshot(version ≤ N에 가장 가까운 것) 조회
  → 서버: Snapshot 이후 CrdtOp(seq > snapshot.version) 응답
  → 클라이언트: deserializeRga(snapshot.state) 후 delta ops replay
  → 클라이언트: awareness 재전송으로 presence 복원
```

### 영속화 모델 요약

| 테이블 | 특성 | 역할 |
|--------|------|------|
| `CrdtOp` | append-only, `(pageId, siteId, seq)` unique | 전체 편집 이력 보관, 감사 추적 |
| `Snapshot` | 주기적 생성, `(pageId, version DESC)` 인덱스 | 재접속 replay 비용 감소 |

op payload 구조:
- **INSERT (블록)**: `{ id: RgaId, originId: RgaId|null, value: BlockNode }` — 외부 블록 리스트 RGA
- **INSERT (인라인)**: `{ id: RgaId, originId: RgaId|null, value: string }` — 블록 내부 인라인 텍스트 RGA
- **DELETE**: `{ targetId: RgaId }`

## 주제 문서

| 주제 | 설명 |
|------|------|
| [협업 CRDT 상세](../../requirements/07-collaboration-crdt.md) | RGA 구조·연산·수렴·presence·TDD 속성 |
| [데이터 모델 §5](../../requirements/05-data-model.md) | CrdtOp/Snapshot 영속화 |
| [API & 실시간](../../requirements/06-api-and-realtime.md) | WebSocket 프로토콜 |
| [TDD 전략](../../requirements/09-tdd-strategy.md) | CRDT 속성 기반 테스트 |
