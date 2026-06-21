# PRD: P4b — 2-level 블록 RGA (`@ieum/crdt`)

## 배경

P4(PR #6, 머지됨)에서 인라인 문자 RGA 코어(`createRga/applyOp/localInsert/localDelete/toText/serialize·deserialize`)와 4가지 수학적 속성(수렴·멱등·교환·인과버퍼)을 구현·검증했다. 그러나 Ieum 에디터 문서는 단일 텍스트가 아니라 **블록(paragraph/heading1~3/bullet)의 시퀀스**이므로, CRDT로 모델링하려면 **2-level 블록 RGA**(외부 블록 리스트 RGA + 블록별 내부 인라인 RGA)가 필요하다.

현재 `packages/crdt/src/types.ts`에는 블록 레벨 타입(`BlockMeta`, `BlockInsertOp`, `BlockDeleteOp`, `BlockSetTypeOp`, `InlineInsertOp`, `InlineDeleteOp`, `AnyOp`)이 **정의만 되어 있고 적용 로직이 없다**. `op.ts`의 `make*Op` 헬퍼는 객체만 생성하는 스텁(TODO 주석)이다. 이 단계(P4b)는 그 잔여 구현을 채워 CRDT 코어를 완성한다.

P4b는 P5(WebSocket relay·op 영속화)의 직접 선행 조건이다: P5의 wire 봉투·블록 op broadcast·2탭 수렴이 P4b의 op 구조와 적용 로직에 의존한다.

- **레포**: rnqhstmd/Ieum (monorepo, `packages/crdt`)
- **관련 도메인**: collaboration (`context/collaboration/`)
- **권위 규격**: `requirements/07-collaboration-crdt.md` §4-M(블록 연산), §8(모듈 경계)
- **status 매핑**: `context/collaboration/status.md` — US-CRDT-03 블록 op payload, "P4b 잔여" 항목

## 안 하면 어떻게 되는가

- P5(실시간 협업)를 시작할 수 없다 — 블록 op 적용/수렴 로직과 op↔wire 직렬화 계약이 없으면 relay가 broadcast할 대상이 정의되지 않는다.
- US-CRDT-03(op 로그 편집 이력)의 블록 op payload(⬜ 5건)가 미충족 상태로 남는다.
- US-EDIT(CRDT)("에디터 내용은 RGA CRDT 상태로 관리, 렌더링은 CRDT 상태에서 파생")가 블록 단위에서 불가능하다.

## 사용자와 규모

- **직접 사용자**: `@ieum/crdt`를 소비하는 개발자(P5 relay·클라이언트 통합 작성자) + CI.
- **간접 사용자**: 실시간 공동편집을 사용하는 Ieum 최종 사용자(2인 이상 동시 편집 수렴).
- **규모**: MVP — 페이지당 수백~수천 블록, 블록당 수천 문자. 동시 편집자 2~10명.

## 범위

### In Scope (P4b)
- 2-level 문서 상태(`DocState`): 외부 블록 RGA(`RgaState<BlockMeta>`) + 블록별 내부 인라인 RGA(`Map<idKey, RgaState<string>>`).
- 블록 op 적용: `block-insert`(tie-break 정렬), `block-delete`(tombstone·멱등), `block-set-type`(LWW).
- 인라인 op의 `blockId` 스코프 라우팅: `inline-insert`/`inline-delete`가 해당 블록 내부 RGA에만 적용.
- 로컬 편집 헬퍼: `splitBlock`(Enter), `mergeBlockWithPrev`(Backspace), 블록 스코프 인라인 삽입/삭제, 블록 타입 변경.
- CRDT 4속성을 **2-level 문서 전체**에서 보장(특히 인라인 op가 블록 도착 전에 도착 시 인과 버퍼링).
- 문서 도출: `docToBlocks(doc) → { id, type, text }[]`(tombstone 제외, 외부 RGA 순서 보존).
- op↔wire 봉투 codec: `toWire(op, seq)` / `fromWire(envelope)` — `{ siteId, seq, opType, payload }`(P5 전송 계약 기반).

### Out of Scope (P4b 제외, 후속 phase)
- 문서 전체 Snapshot 직렬화(`serializeDoc`/`deserializeDoc`) → **P8**(재접속 replay).
- 블록 이동/reorder → §4M-6 최소 전략(BlockDelete+BlockInsert)으로 예약, **P5+**.
- WebSocket relay·`CrdtOp`/`Snapshot` 영속화 → **P5**.
- 인라인 서식(bold/italic)·추가 블록 타입(이미지/코드) → **v2**.
- 프론트 에디터(`apps/web`)와의 배선 → P5(에디터 CRDT 연결).

## 요구사항

### 기능 요구사항

| ID | 우선순위 | 설명 |
|----|---------|------|
| FR-1 | Must | `DocState` 2-level 구조 + `createDocument(siteId)`: 빈 paragraph 블록 1개로 초기화 |
| FR-2 | Must | `block-insert` 적용: 외부 RGA에 tie-break(`counter` DESC, `siteId` 역순) 정렬 삽입 + 해당 블록의 빈 내부 인라인 RGA 생성 |
| FR-3 | Must | `block-delete` 적용: 외부 RGA tombstone, 멱등(재적용 무변화) |
| FR-4 | Must | `block-set-type` 적용: LWW — `(clock DESC, siteId DESC)` 승자만 타입 채택, 패자 무시 |
| FR-5 | Must | 인라인 op `blockId` 스코프 라우팅: `inline-insert`/`inline-delete`가 지정 블록 내부 RGA에만 적용(다른 블록 불변) |
| FR-6 | Must | `splitBlock(doc, blockId, cursorIndex)`: `[BlockInsertOp, ...InlineDeleteOp(원본 tail), ...InlineInsertOp(새 블록)]` 반환 + 로컬 적용 |
| FR-7 | Must | `mergeBlockWithPrev(doc, blockId)`: 이전 가시 블록 끝에 인라인 재삽입 + `BlockDeleteOp` 반환; 첫 블록이면 `null` |
| FR-8 | Must | `docToBlocks(doc) → { id, type, text }[]`: 외부 RGA 가시 순서대로, 각 블록 `toText` 텍스트, tombstone 제외 |
| FR-9 | Must | 통합 적용 진입점 `applyDocOp(doc, op: AnyOp)`: op 종류로 분기(block-*/inline-*) + 멱등·인과버퍼 |
| FR-10 | Must | 인과 버퍼링: 블록 미도착 상태에서 도착한 인라인 op는 보류 → 블록 도착 시 자동 적용 |
| FR-11 | Should | op↔wire codec: `toWire(op, seq)` / `fromWire(env)` — `{ siteId, seq, opType, payload }` 왕복 항등 |
| FR-12 | Should | `inheritType` 규칙(split 시 새 블록 타입) — Q1 확정값 적용 |
| FR-13 | Could | 로컬 헬퍼 `setBlockType(doc, blockId, type)`: `localClock` 증가시켜 `BlockSetTypeOp` 생성·적용 |

### 비기능 요구사항
- **순수성**: `packages/crdt` 의존성 0 유지, 네트워크/파일/DOM 접근 없음(순수 함수).
- **타입 안전**: `tsconfig.base` `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` 준수.
- **기존 회귀 0**: P4 인라인 RGA 테스트·동작 불변(인라인 코어 재사용/확장 시).
- **CI**: `pnpm --filter @ieum/crdt test` + `typecheck` 0 실패.

## 수용 기준 (Given-When-Then)

> 표기: `siteA`/`siteB`는 서로 다른 siteId. `idKey`는 `"{counter}@{siteId}"`. "수렴"은 두 replica의 `docToBlocks()` 결과(블록 순서·각 블록 type·text)가 동일함을 뜻한다.

### 문서 구조 & 도출

**AC-1: createDocument는 빈 paragraph 블록 1개로 시작한다**
- Given: `createDocument("siteA")`를 호출한다
- When: `docToBlocks(doc)`를 호출한다
- Then: 길이 1 배열이 반환되고 `[0].type === 'paragraph'`, `[0].text === ''`, `[0].id`는 정의된 `RgaId`이다

**AC-2: docToBlocks는 외부 RGA 가시 순서와 각 블록 텍스트를 도출한다**
- Given: `siteA` 문서에서 첫 블록에 "ab"를 삽입하고, 그 뒤에 heading1 블록을 추가해 "Hi"를 삽입했다
- When: `docToBlocks(doc)`를 호출한다
- Then: `[{type:'paragraph', text:'ab'}, {type:'heading1', text:'Hi'}]` 순서·타입·텍스트가 정확히 도출된다

### 블록 op 적용

**AC-3: block-insert는 외부 RGA에 삽입되고 빈 내부 인라인 RGA를 갖는다**
- Given: `createDocument("siteA")` 문서와 첫 블록 id `b0`가 있다
- When: `applyDocOp(doc, makeBlockInsertOp({counter:5,siteId:'siteB'}, b0, 'bullet'))`를 적용한다
- Then: `docToBlocks(doc)`가 `b0` 다음에 `type:'bullet', text:''` 블록을 포함하고, 그 블록에 인라인 삽입이 가능하다(내부 RGA 존재)

**AC-4: block-delete는 블록을 tombstone 처리하며 멱등이다**
- Given: 블록 `b1`이 포함된 문서가 있다
- When: `applyDocOp(doc, makeBlockDeleteOp(b1))`를 2회 적용한다
- Then: `docToBlocks(doc)`에 `b1`이 나타나지 않고, 1회 적용과 2회 적용 결과가 동일하다(멱등)

**AC-5: block-set-type은 (clock, siteId) LWW로 승자 타입을 채택한다**
- Given: 블록 `b1`(type paragraph)이 있고, `setType(b1, 'heading1', clock=1, 'siteA')`와 `setType(b1, 'heading2', clock=2, 'siteB')` 두 op가 있다
- When: 두 op를 **임의 순서**로 적용한다
- Then: 적용 순서와 무관하게 `b1`의 type은 `heading2`이다(clock 2 > 1 승자)

**AC-6: block-set-type 동일 clock은 siteId 역순으로 tie-break한다**
- Given: 블록 `b1`에 대해 `setType(b1,'heading1',clock=3,'siteA')`와 `setType(b1,'heading3',clock=3,'siteB')`가 있다
- When: 두 op를 임의 순서로 적용한다
- Then: `b1`의 type은 `heading3`이다(clock 동일 → `siteId "siteB" > "siteA"` 승자)

### 인라인 스코프

**AC-7: 인라인 op는 지정 blockId의 내부 RGA에만 적용된다**
- Given: 블록 `b1`("a")과 `b2`("z")가 있는 문서가 있다
- When: `b1`에 스코프된 inline-insert("X", b1)를 적용한다
- Then: `b1`의 text만 변하고(`"aX"` 등) `b2`의 text는 `"z"`로 불변이다

### 분할 / 병합

**AC-8: splitBlock은 커서 이후 텍스트를 새 블록으로 옮긴다**
- Given: `siteA` 문서의 단일 paragraph 블록 `b0`에 "Hello"가 있다(가시 인덱스 0~5)
- When: `splitBlock(doc, b0, 3)`을 호출하고 반환 op를 로컬 적용한다
- Then: `docToBlocks(doc)`가 `[{text:'Hel'}, {text:'lo'}]` 2블록이 되고, 반환값은 `block-insert` 1건 + 원본 tail `inline-delete` + 새 블록 `inline-insert` 시퀀스를 포함한다

**AC-9: splitBlock 결과는 원격 replica에서 동일하게 수렴한다**
- Given: `siteA`가 "Hello" 블록을 `splitBlock(_, b0, 3)`한 op 시퀀스를 발행했다
- When: 빈 초기 상태에서 출발한 `siteB` replica가 (선행 block-insert·inline-insert 포함) 전체 op를 **임의 순서**로 수신·적용한다
- Then: `siteB`의 `docToBlocks()`가 `siteA`와 동일한 `[{text:'Hel'}, {text:'lo'}]`로 수렴한다

**AC-10: mergeBlockWithPrev는 이전 블록 끝에 텍스트를 붙이고 현재 블록을 삭제한다**
- Given: paragraph 블록 `b0`("foo")과 `b1`("bar")가 있는 문서가 있다
- When: `mergeBlockWithPrev(doc, b1)` 반환 op를 로컬 적용한다
- Then: `docToBlocks(doc)`가 `[{text:'foobar'}]` 1블록이 되고, 반환값은 `inline-insert` 시퀀스 + `block-delete(b1)`를 포함한다

**AC-11: 첫 블록 병합은 null을 반환한다**
- Given: 가시 블록이 `b0` 하나뿐인 문서가 있다
- When: `mergeBlockWithPrev(doc, b0)`를 호출한다
- Then: `null`이 반환되고 문서는 불변이다

### CRDT 4속성 (2-level)

**AC-12: 동시 분할이 결정론적으로 수렴한다(수렴성)**
- Given: 블록 `b0`를 `siteA`와 `siteB`가 각각 동시에 분할하여 각자 `block-insert{originId:b0}`(counter 동일)를 발행했다
- When: 두 op 집합을 두 replica에 **서로 다른 순서**로 모두 적용한다
- Then: 양쪽 `docToBlocks()`가 동일 순서로 수렴하고, 외부 tie-break 규칙(`siteId "siteB" > "siteA"` → B의 블록이 앞)을 따른다

**AC-13: 인라인 op가 블록보다 먼저 도착하면 버퍼링 후 적용된다(인과 버퍼링)**
- Given: 블록 `bX`(block-insert)와 그 블록에 스코프된 inline-insert op가 있다
- When: replica가 **inline-insert를 먼저** 수신·적용한 뒤 block-insert(bX)를 수신한다
- Then: inline-insert는 즉시 반영되지 않고 보류되었다가, block-insert(bX) 적용 직후 자동 반영되어 `bX`의 text가 올바르게 나타난다

**AC-14: 같은 op 집합을 임의 순서로 적용해도 수렴한다(교환·멱등 일반화)**
- Given: 블록·인라인 op가 섞인 임의 op 시퀀스(시드 PRNG, ≥100회)가 있다
- When: 두 replica에 op를 임의 순서로 배분 적용하고, 일부 op는 중복 적용한다
- Then: 모든 op 도달 후 두 replica의 `docToBlocks()`가 항상 동일하다(중복 적용에도 불변 — 멱등)

### Wire 봉투

**AC-15: op는 wire 봉투로 왕복 직렬화된다(항등)**
- Given: 임의의 `AnyOp`(block-insert/block-delete/block-set-type/inline-insert/inline-delete 각각)가 있다
- When: `fromWire(toWire(op, seq))`를 수행한다
- Then: 결과 op가 원본과 구조적으로 동일하고, 봉투는 `{ siteId, seq, opType, payload }` 형태이며 `JSON.parse(JSON.stringify(env))`로도 손실 없이 왕복된다

## 확인이 필요한 사항 (해소됨)

**Q1 — Enter 분할 시 새 블록의 타입 규칙(`inheritType`) → 확정: A. CRDT 규격(§4M-3)**

`splitBlock`이 발행하는 `BlockInsertOp.blockType`은 **CRDT 권위 규격(§4M-3)** 을 따른다:
- heading1 / heading2 / heading3 → **항상 paragraph**
- paragraph / bullet → 유지
- **커서 위치 무관**(결정론적)

근거: P4b는 CRDT 코어이고 §4M-3이 권위 규격이며, 커서 무관 규칙이 수렴 추론에 단순·안전하다. P5에서 P3 에디터를 CRDT에 배선할 때 P3 프론트의 기존 규칙(`document.ts`)이 이 규칙으로 정렬된다(후속 정리 대상으로 기록).

→ FR-12 확정: `inheritType(t) = (t in {heading1,heading2,heading3}) ? 'paragraph' : t`.
