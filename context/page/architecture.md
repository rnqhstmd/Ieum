# 페이지·에디터 아키텍처

## 시스템 구조

### Page 자기참조 트리

Page 엔티티는 `parentPageId`(FK → Page.id, nullable)로 자신을 참조하는 트리 구조를 형성한다. `parentPageId = null`이면 워크스페이스 루트 페이지다. 트리 탐색 쿼리는 `(workspaceId, parentPageId, position)` 복합 인덱스를 사용한다.

```
Workspace
└── Page A  (parentPageId = null, position = 1000)
    ├── Page B  (parentPageId = A.id, position = 1000)
    │   └── Page D  (parentPageId = B.id, position = 1000)
    └── Page C  (parentPageId = A.id, position = 2000)
```

### gap-based position 정렬 전략

| 시나리오 | 처리 |
|----------|------|
| 초기 생성 | 1000 단위 증가 (1000, 2000, 3000…) |
| 두 페이지 사이 삽입 | 두 position 값의 평균 (예: 1000·2000 사이 → 1500) |
| 간격 소진 | 해당 부모의 자식 목록 전체를 1000 단위로 rebalance |

position은 정수(Int)를 사용해 CRDT 레이어의 부동소수점 문자 위치와 혼동을 방지한다.

> **드래그앤드롭 정렬 UI**: P5(post-MVP로 연기). MVP에서는 position 기반 기본 정렬만 제공하며 수동 재정렬 UI는 없다.

### soft delete (archivedAt) 재귀 아카이브

- 페이지 삭제 = `archivedAt = NOW()` 설정. 행은 유지.
- 하위 페이지도 재귀적으로 archivedAt 설정 (애플리케이션 레이어 또는 재귀 UPDATE).
- 기본 쿼리 필터: `WHERE archivedAt IS NULL`.
- 복구: `archivedAt = NULL`로 되돌림.
- 영구 삭제: 명시적 액션 시에만 실행, 연관 CrdtOp·Snapshot도 cascade 삭제.

### 블록 기반 contenteditable 에디터

- 에디터는 외부 라이브러리 없이 브라우저 contenteditable을 직접 활용한 블록 단위 구조로 구현.
- 블록 타입: paragraph, heading1~3, bullet list (MVP). 추가 타입은 post-MVP.
- Enter 키 → 새 블록 생성, Backspace → 빈 블록 삭제.
- 에디터 콘텐츠는 CRDT 상태(`packages/crdt`)에서 파생되어 렌더링됨. DOM이 진실 원천이 아니라 RGA 상태가 진실 원천.
- 페이지 콘텐츠는 collaboration 도메인의 **2-level 블록 RGA**로 실시간 동기화된다: 상위 RGA가 블록 순서를 관리하고, 각 블록 내부는 별도 하위 RGA가 문자 수준 편집을 관리한다.
- 이모지 피커 UI: P5(post-MVP로 연기). MVP에서는 `icon` 필드에 이모지를 직접 입력하는 방식만 지원한다.
- 에디터 모듈 위치: `apps/web/components/editor/`.

> **P11 구조편집 CRDT 배선 (PR #27)**: 인라인 타이핑(P5)에 더해 **구조편집이 블록 op로 수렴**한다. `Editor.tsx` `handleKeyDown`이 DOM caret offset(`getCaretOffset`, fallback=`block.text.length`로 미확정 시 비병합)을 계산해 콜백을 호출하고, `useCrdtDocument`가 `@ieum/crdt`를 직접 호출(래퍼 없음)해 op를 생성·전송한다:
> - Enter → `splitBlock(doc, blockId, offset)` (heading→paragraph `inheritType`).
> - 블록 맨앞 Backspace → `mergeBlockWithPrev(doc, blockId)` (첫 블록이면 null 반환=무동작; 커서 복원 best-effort).
> - 마크다운 단축키(`# ## ### -`) → `detectBlockTypeShortcut`(web 신규 순수함수)로 prefix 제거 + `setBlockType` (block-set-type, LWW).
> - 생성된 블록 op는 개별 `sendOp`(멱등). 진실원천은 DocState(`docToBlocks`) — 로컬 즉시 + 원격 자동 반영. 동시 split 텍스트 중복은 CRDT 본질 한계로 수용(범위 밖).

> **P11 키보드 블록 탐색 (PR #29)**: 구조편집과 별개로 `handleKeyDown`에 **화살표 키 블록 간 포커스 탐색**이 추가됐다. 방향 판정은 순수 함수 `resolveArrowDirection(key, offset, textLength)`(named export)로 분리 — caret 경계(`getCaretOffset===0` 또는 `===text.length`)에서 Up/Left→이전 블록 끝, Down/Right→다음 블록 처음. 대상 블록은 `blockSelector(idKey)` → `document.querySelector` → `focus()` + `placeCaret`(Selection API, jsdom try/catch 흡수), 이동 시에만 `preventDefault`. 중간 caret·첫/마지막 경계·IME 조합 중에는 미이동. **로컬 DOM 포커스만** — CRDT op·직접 onCursorMove 없음(BR-1). 단, `placeCaret`이 selection을 옮기면 기존 P6 `selectionchange→scheduleCursor` 경로로 새 블록의 커서 위치가 자연 브로드캐스트됨(정상 협업 동작). `getCaretOffset`은 `el.contains && nodeType===3` 결합 가드로 cross-block offset 오염 방지(P6) 보존.

### 자동저장 vs 협업 op 전송

| 모드 | 동작 |
|------|------|
| 단일 사용자 (협업 없음) | 편집 이벤트 debounce 500ms 후 자동저장 |
| 협업 모드 (WebSocket 연결) | 타이핑 즉시 RGA INSERT/DELETE op 생성 → WebSocket으로 실시간 서버에 전송 |

두 모드 모두 동일한 contenteditable 에디터 위에서 동작한다.

### 페이지 초기 로드 흐름

```
클라이언트
  → GET /api/pages/:pageId  (Next.js Route Handler)
    → Page 메타데이터 (title, icon, workspaceId 등) 반환
  → WebSocket sync-request (실시간 서버)
    → 최신 Snapshot + 이후 CrdtOp 목록 수신
    → RGA 초기화 → ops replay → 에디터 렌더링
```

> **P11 초기 로드 측정 (PR #29, FR-C4)**: 위 로드 흐름이 < 2초 안에 본문을 표시하는지 `e2e/load-time.e2e.ts`로 측정한다. `goto`부터 첫 `[data-block-id]` visible까지 `Date.now()` wall-clock(네트워크·SSR·하이드레이션 포함)을 재고 `expect(elapsed).toBeLessThan(2000)`. 전체 스택(DB·ws-relay·Next.js dev·storageState) 기동이 필요해 **수동 구동 전용**(restore/convergence e2e와 동일, 자동 게이트 비대상).

## 주제 문서

| 주제 | 설명 |
|------|------|
| [PRD §3·§4](../../requirements/02-prd.md) | 페이지·에디터 요구사항 (US-PAGE-01~05, US-EDIT-01~03) |
| [데이터 모델](../../requirements/05-data-model.md) | Page 스키마·트리·정렬·soft delete (§2.5, §3.2, §4.2, §4.3) |
| [아키텍처](../../requirements/04-architecture.md) | 전체 시스템 구조, 모노레포 폴더 구조, 에디터 컴포넌트 위치 |
| [협업 CRDT](../../requirements/07-collaboration-crdt.md) | 에디터 콘텐츠의 실시간 동기화 (collaboration 도메인 소관) |
